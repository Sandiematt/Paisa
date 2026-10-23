package io.yestack.upidetector.service

import android.accessibilityservice.AccessibilityService
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import io.yestack.upidetector.AppStore
import io.yestack.upidetector.SupportedApps

/** Reads on-screen text of the supported UPI apps only. Never performs actions on any app. */
class UpiAccessibilityService : AccessibilityService() {

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var builder: SnapshotBuilder

    private var pendingPackage: String? = null
    private var pendingClass: String? = null
    private var pendingWindowId: Int = -1
    private var pendingSource: AccessibilityNodeInfo? = null
    private var loggedSensitiveSkip = false
    private var firstPendingAt = 0L
    private var emptyReads = 0
    private val snapshotRunnable = Runnable { takeSnapshot() }

    override fun onServiceConnected() {
        super.onServiceConnected()
        builder = SnapshotBuilder(this)
        AppStore.installedAtMillis = installTime()
        AppStore.log(
            "service connected; ignoring payments dated before install " +
                (AppStore.installedAtMillis?.let { java.util.Date(it).toString() } ?: "(install time unknown)"),
        )
    }

    private fun installTime(): Long? = try {
        // firstInstallTime survives `adb install -r` and app updates, so a reinstall doesn't hide earlier payments.
        @Suppress("DEPRECATION")
        packageManager.getPackageInfo(packageName, 0).firstInstallTime
    } catch (e: Exception) {
        null
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val pkg = event?.packageName?.toString()
        if (event == null || pkg == null || !SupportedApps.isSupported(pkg)) return
        val now = System.currentTimeMillis()
        // Captured the instant the event fires: by the time the debounced read runs, a short-lived payment
        // dialog can already be gone from rootInActiveWindow / getWindows(). See SnapshotBuilder.findRoot.
        val source = try {
            event.source
        } catch (e: RuntimeException) {
            null
        }
        when (event.eventType) {
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                val previous = AppStore.lastPackage
                if (previous != null && previous != pkg) AppStore.onAppBackground(previous, now)
                val screenClass = event.className?.toString()
                if (screenClass != null && previous == pkg && !isActivity(pkg, screenClass)) {
                    // Dialogs, bottom sheets, toasts and Flutter overlays report a View class (android.widget.FrameLayout):
                    // same screen, so the session continues and a payment isn't split across fake sessions.
                    schedule(pkg, pendingClass.takeIf { pendingPackage == pkg }, event.windowId, source)
                    return
                }
                AppStore.onScreenChanged(pkg, screenClass, event.windowId.takeIf { it >= 0 }, now)
                schedule(pkg, screenClass, event.windowId, source)
            }
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED ->
                schedule(pkg, pendingClass.takeIf { pendingPackage == pkg }, event.windowId, source)
            else -> releaseSource(source)
        }
    }

    private val activityCache = HashMap<String, Boolean>()

    /** Whether [cls] is a declared Activity of [pkg] (needs the package in the manifest's <queries>). */
    private fun isActivity(pkg: String, cls: String): Boolean = activityCache.getOrPut("$pkg/$cls") {
        try {
            @Suppress("DEPRECATION")
            packageManager.getActivityInfo(ComponentName(pkg, cls), 0)
            true
        } catch (e: PackageManager.NameNotFoundException) {
            false
        } catch (e: RuntimeException) {
            true // can't tell: fall back to treating it as a screen change
        }
    }

    /**
     * One pending snapshot at a time; later events push it back so a burst of redraws yields one read.
     * A screen that never stops redrawing (spinner, timer) is still read every [MAX_WAIT_MILLIS].
     */
    private fun schedule(pkg: String, screenClass: String?, windowId: Int, source: AccessibilityNodeInfo?) {
        // Only the most recent event's source is kept; an older pending one that got superseded is released here.
        if (pendingSource !== source) releaseSource(pendingSource)
        pendingPackage = pkg
        pendingClass = screenClass
        pendingWindowId = windowId
        pendingSource = source
        emptyReads = 0
        val now = SystemClock.uptimeMillis()
        if (firstPendingAt == 0L) firstPendingAt = now
        handler.removeCallbacks(snapshotRunnable)
        val delay = minOf(DEBOUNCE_MILLIS, firstPendingAt + MAX_WAIT_MILLIS - now).coerceAtLeast(0L)
        handler.postDelayed(snapshotRunnable, delay)
    }

    private fun takeSnapshot() {
        firstPendingAt = 0L
        val pkg = pendingPackage ?: return
        val source = pendingSource
        pendingSource = null // ownership passes to builder.build(), which releases it on every path
        val now = System.currentTimeMillis()
        val screenClass = pendingClass
        if (screenClass != null && SENSITIVE_SCREENS.any { screenClass.contains(it, ignoreCase = true) }) {
            // UPI PIN entry: never read it, not even its keypad labels.
            releaseSource(source)
            emptyReads = 0
            if (!loggedSensitiveSkip) AppStore.log("skipped PIN-entry screen (not read)", now)
            loggedSensitiveSkip = true
            return
        }
        loggedSensitiveSkip = false
        try {
            val result = builder.build(pkg, screenClass, pendingWindowId, source)
            val snapshot = result.snapshot
            val empty = snapshot == null || snapshot.nodes.isEmpty()
            if (empty && emptyReads < MAX_EMPTY_RETRIES) {
                // A static screen sends no further event, and Flutter can publish its semantics tree a moment after
                // the window appears: look again instead of waiting for an event that may never come.
                emptyReads++
                if (emptyReads == 1) AppStore.log("empty read of $screenClass; retrying", now)
                handler.postDelayed(snapshotRunnable, RETRY_MILLIS)
                return
            }
            if (!empty) emptyReads = 0
            if (snapshot != null) {
                AppStore.onSnapshot(snapshot, now)
                result.note?.let { AppStore.log("empty after $emptyReads retries: $it", now) }
            } else {
                AppStore.log("snapshot skipped: ${result.failure}", now)
            }
        } catch (e: Exception) {
            AppStore.log("snapshot failed: $e", now)
        }
    }

    @Suppress("DEPRECATION")
    private fun releaseSource(node: AccessibilityNodeInfo?) {
        if (node != null && Build.VERSION.SDK_INT < 33) {
            try {
                node.recycle()
            } catch (e: RuntimeException) {
                // already recycled
            }
        }
    }

    override fun onInterrupt() {
        AppStore.log("service interrupted")
    }

    override fun onUnbind(intent: Intent?): Boolean {
        handler.removeCallbacks(snapshotRunnable)
        firstPendingAt = 0L
        releaseSource(pendingSource)
        pendingSource = null
        AppStore.log("service unbound")
        AppStore.onLastAppBackground(System.currentTimeMillis())
        return super.onUnbind(intent)
    }

    private companion object {
        const val DEBOUNCE_MILLIS = 300L
        const val MAX_WAIT_MILLIS = 1_000L
        const val RETRY_MILLIS = 700L
        const val MAX_EMPTY_RETRIES = 8
        val SENSITIVE_SCREENS = listOf("pinactivitycomponent", "GetCredential")
    }
}
