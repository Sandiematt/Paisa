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
import io.yestack.upidetector.core.ConfirmRejectReason
import io.yestack.upidetector.core.ConfirmResult
import io.yestack.upidetector.core.ConfirmScreenParser

/**
 * Reads on-screen text of the supported UPI apps only. Its one action on another app: when the user taps Cancel on
 * the daily-limit warning, [SpendGuard] presses Back for them. Nothing is ever tapped or typed in the UPI app.
 *
 * Lifecycle of a read:
 * 1. Capture: on every event, every window of the app is read at once (at most every [READ_GAP_MILLIS], with one
 *    trailing read for the events in between), while the screen that caused the event is still there. The daily-limit
 *    check uses each capture straight away.
 * 2. Deliver: the latest capture goes to [AppStore.onRead] once the screen settles ([DEBOUNCE_MILLIS], at most
 *    [MAX_WAIT_MILLIS] apart), and at once when the app is left, so a result screen is decided from what was captured
 *    while it was readable, never from whatever is on screen later.
 * Empty reads are retried only while the app is still on screen. A read never holds another app's window.
 */
class UpiAccessibilityService : AccessibilityService() {

    private val handler = Handler(Looper.getMainLooper())
    private lateinit var builder: SnapshotBuilder
    private var guard: SpendGuard? = null
    private var noteOverlay: NoteOverlay? = null

    /** Supported app being read, and its current Activity (dialogs and sheets keep the Activity's class). */
    private var currentPackage: String? = null
    private var currentClass: String? = null

    /** A UPI PIN screen is up: nothing of the app is read until another Activity of it starts or the app is left. */
    private var pinOnScreen = false

    /** App last seen leaving the screen. Its content events alone do not bring it back: it may redraw while covered. */
    private var leftPackage: String? = null
    private var lastProbeAt = 0L

    private var lastReadAt = 0L
    private var readQueued = false
    private var queuedSource: AccessibilityNodeInfo? = null
    private val queuedRead = Runnable {
        readQueued = false
        val source = queuedSource
        queuedSource = null
        val pkg = currentPackage
        if (pkg != null) read(pkg, source) else releaseSource(source)
    }

    private val readRetry = ReadRetry(MAX_EMPTY_RETRIES, RETRY_MILLIS, NO_WINDOW_RETRY_MILLIS)
    private val retryRead = Runnable { currentPackage?.let { read(it, null) } }

    private var latest: SnapshotBuilder.AppRead? = null
    private var undelivered = false
    private var firstUndeliveredAt = 0L
    private val deliverRunnable = Runnable { deliver() }

    /** A read that looked like a result screen still being drawn is read again, a bounded number of times. */
    private val reRead = ReReadSchedule(RE_READ_DELAYS_MILLIS)

    /** Set when [latest] came from a re-read ("re-read 2 of 6"), for the live log. */
    private var latestScan: String? = null
    private var reReadPending: String? = null
    private var gaveUpLogged = false
    private val reReadRunnable = Runnable {
        val pkg = currentPackage ?: return@Runnable
        // The service's node cache can hold text from before the change: fetch the tree fresh.
        builder.clearCache()
        reReadPending = "re-read ${reRead.attempts} of ${reRead.max}"
        read(pkg, null)
    }

    override fun onCreate() {
        super.onCreate()
        AppStore.init(applicationContext)
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        tornDown = false
        builder = SnapshotBuilder(this)
        guard = SpendGuard(this) { delay ->
            handler.postDelayed({ currentPackage?.let { read(it, null) } }, delay)
        }
        val overlay = NoteOverlay(this)
        noteOverlay = overlay
        AppStore.notePrompter = { id -> overlay.ask(id) }
        // Payments dated before the app was installed, or before tracking first started here, are history.
        AppStore.installedAtMillis = listOfNotNull(installTime(), AppStore.trackingStartedAt).maxOrNull()
        AppStore.noteQueueDropper = { overlay.dropQueued() }
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
        event ?: return
        // The user picked Shizuku and its capture is reading the UPI apps: stay idle so no screen is read twice.
        if (DumpCaptureService.running) return
        val type = event.eventType
        val eventPackage = event.packageName?.toString()
        // A window being added or removed (a result window over the chat, or the app being covered) may carry no
        // package, or another app's: it concerns the app being read, if any.
        val pkg = if (type == AccessibilityEvent.TYPE_WINDOWS_CHANGED) {
            eventPackage?.takeIf { SupportedApps.isSupported(it) } ?: currentPackage
        } else {
            eventPackage
        }
        if (pkg == null || !SupportedApps.isSupported(pkg)) return
        if (pkg == leftPackage) {
            if (type != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
                // Back only once one of its windows is actually on screen again (checked at most every PROBE_GAP).
                val nowUp = SystemClock.uptimeMillis()
                if (nowUp - lastProbeAt < PROBE_GAP_MILLIS) return
                lastProbeAt = nowUp
                if (!builder.isOnScreen(pkg)) return
            }
            leftPackage = null
        }
        val now = System.currentTimeMillis()
        when (type) {
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> onWindowState(pkg, event, now)
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> if (currentPackage != pkg) onWindowState(pkg, event, now)
            AccessibilityEvent.TYPE_WINDOWS_CHANGED -> Unit
            else -> return
        }
        if (pinOnScreen) return
        // Taken the instant the event fires: the window list can lag behind a window that just appeared.
        val source = if (type == AccessibilityEvent.TYPE_WINDOWS_CHANGED) {
            null
        } else {
            try {
                event.source
            } catch (e: RuntimeException) {
                null
            }
        }
        requestRead(pkg, source)
    }

    /** Screen sessions and the PIN-screen rule; content changes from an app not yet seen count as its screen too. */
    private fun onWindowState(pkg: String, event: AccessibilityEvent, now: Long) {
        val previous = currentPackage
        if (previous != null && previous != pkg) leaveApp(previous, now, "${SupportedApps.displayName(pkg)} came up")
        val cls = event.className?.toString()
        val sameApp = previous == pkg
        if (event.eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED && (cls == null || !sameApp || isActivity(pkg, cls))) {
            // A new Activity: decide what was captured of the previous screen before its session ends.
            deliver()
            resetReRead()
            currentClass = cls
            AppStore.onScreenChanged(pkg, cls, event.windowId.takeIf { it >= 0 }, now)
            readRetry.reset()
            val sensitive = isSensitive(cls)
            if (sensitive && !pinOnScreen) {
                AppStore.log("skipped PIN-entry screen (not read)", now)
                AppStore.onPaymentAttempt(pkg, now)
            }
            pinOnScreen = sensitive
        } else if (!sameApp) {
            // Dialogs, bottom sheets, toasts and Flutter overlays report a View class (android.widget.FrameLayout):
            // same screen, so the session continues and a payment isn't split across fake sessions.
            currentClass = null
            AppStore.onScreenChanged(pkg, null, event.windowId.takeIf { it >= 0 }, now)
        }
        currentPackage = pkg
    }

    private fun requestRead(pkg: String, source: AccessibilityNodeInfo?) {
        val nowUp = SystemClock.uptimeMillis()
        if (nowUp - lastReadAt >= READ_GAP_MILLIS && !readQueued) {
            read(pkg, source)
            return
        }
        // Inside the gap: one trailing read, from the newest event.
        if (queuedSource !== source) releaseSource(queuedSource)
        queuedSource = source
        if (!readQueued) {
            readQueued = true
            handler.postAtTime(queuedRead, lastReadAt + READ_GAP_MILLIS)
        }
    }

    /** Captures every window of [pkg] now; see the class comment. Consumes [source]. */
    private fun read(pkg: String, source: AccessibilityNodeInfo?) {
        lastReadAt = SystemClock.uptimeMillis()
        handler.removeCallbacks(retryRead)
        if (pinOnScreen || pkg != currentPackage) {
            releaseSource(source)
            return
        }
        val now = System.currentTimeMillis()
        val read = try {
            builder.readApp(pkg, currentClass, source)
        } catch (e: Exception) {
            reReadPending = null
            AppStore.log("read of ${SupportedApps.displayName(pkg)} failed: $e", now)
            // readApp consumes the source on success; on a failure it may still be held.
            releaseSource(source)
            return
        }
        val withText = read.windows.count { it.snapshot.nodes.isNotEmpty() }
        when (ReadOutcome.of(pkg, read.appOnScreen, read.activePackage, withText)) {
            ReadOutcome.CAPTURED -> {
                readRetry.reset()
                latest = read
                latestScan = reReadPending
                undelivered = true
                scheduleDelivery()
                // Separate tries: a failure in the spend guard must never stop the payment-attempt dedupe.
                try {
                    guard?.check(read.windows.map { it.snapshot }, now)
                } catch (e: Exception) {
                    AppStore.log("confirm check failed: $e", now)
                }
                try {
                    noteConfirmAttempt(pkg, read, now)
                } catch (e: Exception) {
                    AppStore.log("payment attempt check failed: $e", now)
                }
            }
            ReadOutcome.APP_LEFT -> leaveApp(pkg, now, "active window: ${read.activePackage}")
            ReadOutcome.NO_TEXT_YET -> onMiss(pkg, read, noWindow = false, now)
            ReadOutcome.NOT_LISTED_YET -> onMiss(pkg, read, noWindow = true, now)
        }
        reReadPending = null
    }

    /**
     * A confirm screen with an amount on it means a payment of that amount is being started (see
     * [io.yestack.upidetector.core.DuplicateDetector.onPaymentAttempt]). Not while a result screen is showing: the
     * payment on it has already happened.
     */
    private fun noteConfirmAttempt(pkg: String, read: SnapshotBuilder.AppRead, now: Long) {
        val results = read.windows.map { ConfirmScreenParser.parse(it.snapshot) }
        if (results.any { it is ConfirmResult.Rejected && it.reason == ConfirmRejectReason.RESULT_SCREEN }) return
        val confirm = results.firstNotNullOfOrNull { it as? ConfirmResult.Candidate } ?: return
        AppStore.onPaymentAttempt(pkg, now, confirm.amount)
    }

    /**
     * A read with no text, while the app may still be on screen: logged and kept in the raw captures with what the
     * window list looked like, then retried. A static screen sends no further event, and Flutter can publish its text
     * a moment after its window appears.
     */
    private fun onMiss(pkg: String, read: SnapshotBuilder.AppRead, noWindow: Boolean, now: Long) {
        if (readRetry.gaveUp) return
        val reason = if (noWindow) "no window of ${SupportedApps.displayName(pkg)} listed" else "no text in its windows"
        val miss = readRetry.onMiss(currentClass, noWindow, "$reason (${read.diagnostics})")
        AppStore.onReadMiss(pkg, currentClass, miss.logLine, now)
        if (miss.retry) {
            handler.postDelayed(retryRead, miss.delayMillis)
        } else if (!noWindow) {
            // Gave up on a window that stays blank: the detector still learns that no status phrase is showing.
            latest = read
            undelivered = true
            deliver()
        }
    }

    private fun scheduleDelivery() {
        val nowUp = SystemClock.uptimeMillis()
        if (firstUndeliveredAt == 0L) firstUndeliveredAt = nowUp
        handler.removeCallbacks(deliverRunnable)
        val delay = minOf(DEBOUNCE_MILLIS, firstUndeliveredAt + MAX_WAIT_MILLIS - nowUp).coerceAtLeast(0L)
        handler.postDelayed(deliverRunnable, delay)
    }

    /** Gives the latest capture, if not yet given, to the payment pipeline. */
    private fun deliver() {
        handler.removeCallbacks(deliverRunnable)
        firstUndeliveredAt = 0L
        val read = latest ?: return
        if (!undelivered) return
        undelivered = false
        val windows = read.windows
        if (windows.isEmpty()) return
        val now = System.currentTimeMillis()
        val unfinished = AppStore.onRead(
            read.packageName, windows.map { it.snapshot }, windows.map { it.info }, now,
            treeIssues = windows.map { it.unfinished }, scan = latestScan,
        )
        latestScan = null
        scheduleReRead(read.packageName, unfinished, now)
    }

    /**
     * A read that looked like a result screen still being drawn is read again shortly (up to [RE_READ_DELAYS_MILLIS]
     * times), instead of being left at its rejection: the missing "Done" or status text can arrive without an event.
     */
    private fun scheduleReRead(pkg: String, unfinished: String?, now: Long) {
        handler.removeCallbacks(reReadRunnable)
        if (unfinished == null) gaveUpLogged = false
        if (pkg != currentPackage) return
        val delay = reRead.next(unfinished)
        if (delay != null) {
            AppStore.log("${SupportedApps.displayName(pkg)} screen looks unfinished ($unfinished); re-read ${reRead.attempts} of ${reRead.max} in $delay ms", now)
            handler.postDelayed(reReadRunnable, delay)
        } else if (unfinished != null && reRead.exhausted && !gaveUpLogged) {
            gaveUpLogged = true
            AppStore.log("${SupportedApps.displayName(pkg)} screen still unfinished after ${reRead.max} re-reads ($unfinished); left as rejected", now)
        }
    }

    private fun resetReRead() {
        handler.removeCallbacks(reReadRunnable)
        reRead.reset()
        reReadPending = null
        latestScan = null
        gaveUpLogged = false
    }

    /**
     * [pkg] is no longer on screen: decide its last capture, end its session and stop reading it until it sends a
     * window event again.
     */
    private fun leaveApp(pkg: String, now: Long, why: String) {
        deliver()
        resetReRead()
        handler.removeCallbacks(retryRead)
        readRetry.reset()
        guard?.reset()
        latest = null
        pinOnScreen = false
        leftPackage = pkg
        if (currentPackage == pkg) {
            AppStore.log("${SupportedApps.displayName(pkg)} no longer on screen ($why); stopped reading it", now)
            currentPackage = null
            currentClass = null
        }
        AppStore.onAppBackground(pkg, now)
    }

    private fun isSensitive(screenClass: String?) =
        screenClass != null && SENSITIVE_SCREENS.any { screenClass.contains(it, ignoreCase = true) }

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
        teardown("service unbound")
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        // Android can destroy the service without unbinding it first; this does the same clean-up (once).
        teardown("service destroyed")
        super.onDestroy()
    }

    /** Set once [teardown] ran, so onUnbind followed by onDestroy cleans up (and logs) only once. */
    private var tornDown = false

    private fun teardown(why: String) {
        if (tornDown) return
        tornDown = true
        deliver()
        handler.removeCallbacksAndMessages(null)
        readQueued = false
        releaseSource(queuedSource)
        queuedSource = null
        latest = null
        guard?.reset()
        guard = null
        AppStore.notePrompter = null
        AppStore.noteQueueDropper = null
        noteOverlay?.dismissAll()
        noteOverlay = null
        currentPackage = null
        currentClass = null
        pinOnScreen = false
        leftPackage = null
        AppStore.log(why)
        AppStore.onLastAppBackground(System.currentTimeMillis())
    }

    private companion object {
        const val READ_GAP_MILLIS = 100L
        const val PROBE_GAP_MILLIS = 500L
        const val DEBOUNCE_MILLIS = 300L
        const val MAX_WAIT_MILLIS = 1_000L
        const val RETRY_MILLIS = 700L
        const val NO_WINDOW_RETRY_MILLIS = 500L
        const val MAX_EMPTY_RETRIES = 8
        val RE_READ_DELAYS_MILLIS = listOf(250L, 500L, 750L, 1_000L, 1_250L, 1_500L)
        val SENSITIVE_SCREENS = listOf("pinactivitycomponent", "GetCredential")
    }
}
