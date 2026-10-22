package io.yestack.upidetector.service

import android.accessibilityservice.AccessibilityService
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.accessibility.AccessibilityEvent
import io.yestack.upidetector.AppStore
import io.yestack.upidetector.SupportedApps

/** Reads on-screen text of the supported UPI apps only. Never performs actions on any app. */
class UpiAccessibilityService : AccessibilityService() {

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var builder: SnapshotBuilder

    private var pendingPackage: String? = null
    private var pendingClass: String? = null
    private var pendingWindowId: Int = -1
    private var firstPendingAt = 0L
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
        when (event.eventType) {
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                val previous = AppStore.lastPackage
                if (previous != null && previous != pkg) AppStore.onAppBackground(previous, now)
                val screenClass = event.className?.toString()
                if (screenClass != null && previous == pkg && !isActivity(pkg, screenClass)) {
                    // Dialogs, bottom sheets, toasts and Flutter overlays report a View class (android.widget.FrameLayout):
                    // same screen, so the session continues and a payment isn't split across fake sessions.
                    schedule(pkg, pendingClass.takeIf { pendingPackage == pkg }, event.windowId)
                    return
                }
                AppStore.onScreenChanged(pkg, screenClass, event.windowId.takeIf { it >= 0 }, now)
                schedule(pkg, screenClass, event.windowId)
            }
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED ->
                schedule(pkg, pendingClass.takeIf { pendingPackage == pkg }, event.windowId)
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
    private fun schedule(pkg: String, screenClass: String?, windowId: Int) {
        pendingPackage = pkg
        pendingClass = screenClass
        pendingWindowId = windowId
        val now = SystemClock.uptimeMillis()
        if (firstPendingAt == 0L) firstPendingAt = now
        handler.removeCallbacks(snapshotRunnable)
        val delay = minOf(DEBOUNCE_MILLIS, firstPendingAt + MAX_WAIT_MILLIS - now).coerceAtLeast(0L)
        handler.postDelayed(snapshotRunnable, delay)
    }

    private fun takeSnapshot() {
        firstPendingAt = 0L
        val pkg = pendingPackage ?: return
        val now = System.currentTimeMillis()
        try {
            val result = builder.build(pkg, pendingClass, pendingWindowId)
            val snapshot = result.snapshot
            if (snapshot != null) AppStore.onSnapshot(snapshot, now)
            else AppStore.log("snapshot skipped: ${result.failure}", now)
        } catch (e: Exception) {
            AppStore.log("snapshot failed: $e", now)
        }
    }

    override fun onInterrupt() {
        AppStore.log("service interrupted")
    }

    override fun onUnbind(intent: Intent?): Boolean {
        handler.removeCallbacks(snapshotRunnable)
        firstPendingAt = 0L
        AppStore.log("service unbound")
        AppStore.onLastAppBackground(System.currentTimeMillis())
        return super.onUnbind(intent)
    }

    private companion object {
        const val DEBOUNCE_MILLIS = 300L
        const val MAX_WAIT_MILLIS = 1_000L
    }
}
