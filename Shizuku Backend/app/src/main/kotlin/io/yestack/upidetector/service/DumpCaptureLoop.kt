package io.yestack.upidetector.service

import io.yestack.upidetector.SupportedApps
import io.yestack.upidetector.core.ConfirmRejectReason
import io.yestack.upidetector.core.ConfirmResult
import io.yestack.upidetector.core.ConfirmScreenParser
import io.yestack.upidetector.core.DumpRead
import io.yestack.upidetector.core.DumpScript
import io.yestack.upidetector.core.ForegroundActivity
import io.yestack.upidetector.core.ScreenSnapshot
import io.yestack.upidetector.core.UiDumpParser
import java.math.BigDecimal

/**
 * Reads the supported UPI apps' screens as the shell user: one [tick] asks which Activity is resumed and, while it
 * belongs to a supported app, dumps every window and hands the app's windows to the payment pipeline ([Sink.onRead]).
 * It takes no action on another app: nothing is ever pressed, tapped or typed in the UPI app.
 *
 * A dump is normally taken in process through a UiAutomation connection kept open ([Shell.dump]; tens of
 * milliseconds), and the caller runs the next tick as soon as the UPI app's screen changes. When that is not available
 * it is `uiautomator dump`, which waits for the screen to be idle for a second first (a dump takes a second or more,
 * and a screen that keeps animating for 10 s cannot be dumped at all), and the caller polls.
 *
 * - Screen sessions: a new resumed Activity is a new screen ([Sink.onScreenChanged]); another app in front ends it
 *   ([Sink.onAppBackground]). Dialogs and sheets keep their Activity, so they stay in its session.
 * - A UPI PIN Activity is never dumped; it counts as a payment attempt. A PIN window that shows up in a dump anyway is
 *   dropped by [DumpRead].
 * - A dump taken while the resumed Activity changed under it is thrown away: its windows could be from either screen.
 *
 * Plain Kotlin (no android.*), so it is tested on the JVM. Not thread-safe: one thread calls [tick] and [stop].
 */
internal class DumpCaptureLoop(
    private val shell: Shell,
    private val sink: Sink,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    /** Runs a script as the shell user and returns what it printed; throws when it could not be run. */
    fun interface Shell {
        fun run(script: String, timeoutMillis: Long): String

        /** Dumps every window; prints what [DumpScript.DUMP] prints, however it was taken. */
        fun dump(timeoutMillis: Long): String = run(DumpScript.DUMP, timeoutMillis)
    }

    /** Where captures go; in the app, [io.yestack.upidetector.AppStore]. */
    interface Sink {
        fun log(message: String, now: Long)
        fun onScreenChanged(packageName: String, screenClass: String, now: Long)
        fun onAppBackground(packageName: String, now: Long)
        fun onPaymentAttempt(packageName: String, now: Long, amount: BigDecimal?)

        /** Every capture, the moment it is read and before it is decided: the daily-limit check on a confirm screen. */
        fun onCaptured(packageName: String, windows: List<ScreenSnapshot>, now: Long)
        fun onRead(packageName: String, windows: List<ScreenSnapshot>, infos: List<String>, now: Long)
        fun onReadMiss(packageName: String, screenClass: String?, logLine: String, now: Long)
    }

    /** Resumed Activity of the supported app being read, or null when none is in front. */
    var current: ForegroundActivity? = null
        private set

    private var pinOnScreen = false

    /** Whether the last dump was taken in process (fast) rather than by `uiautomator dump`; null before the first. */
    private var inProcess: Boolean? = null
    private var unknownForegroundLogged = false
    private val readRetry = ReadRetry(MAX_MISS_LOGS, MISS_RETRY_MILLIS, MISS_RETRY_MILLIS)

    /** One poll. Returns the delay before the next, in milliseconds. */
    fun tick(): Long {
        val now = clock()
        val fg = try {
            ForegroundActivity.parse(shell.run(DumpScript.FOREGROUND, FOREGROUND_TIMEOUT_MILLIS))
        } catch (e: Exception) {
            sink.log("foreground check failed: $e", now)
            return ERROR_DELAY_MILLIS
        }
        if (fg == null) {
            // Can't tell what is in front (a format this parser doesn't know, or a transition): change nothing.
            if (!unknownForegroundLogged) {
                unknownForegroundLogged = true
                sink.log("dump capture: no resumed Activity listed by dumpsys; waiting", now)
            }
            return IDLE_DELAY_MILLIS
        }
        unknownForegroundLogged = false
        val supported = SupportedApps.isSupported(fg.packageName)
        current?.let { if (it.packageName != fg.packageName) leave(it.packageName, now, "now in front: ${fg.packageName}") }
        if (!supported) return IDLE_DELAY_MILLIS
        if (fg != current) onScreen(fg, now)
        if (pinOnScreen) return PIN_DELAY_MILLIS
        return capture(fg)
    }

    /** Capture is stopping: the app being read, if any, is reported as left. */
    fun stop() {
        current?.let { leave(it.packageName, clock(), "dump capture stopped") }
    }

    private fun onScreen(fg: ForegroundActivity, now: Long) {
        current = fg
        readRetry.reset()
        sink.onScreenChanged(fg.packageName, fg.className, now)
        val pin = PinScreens.isPinScreen(fg.className)
        if (pin && !pinOnScreen) {
            sink.log("skipped PIN-entry screen (not dumped)", now)
            sink.onPaymentAttempt(fg.packageName, now, null)
        }
        pinOnScreen = pin
    }

    private fun capture(fg: ForegroundActivity): Long {
        val pkg = fg.packageName
        val output = try {
            DumpScript.parseDump(shell.dump(DUMP_TIMEOUT_MILLIS))
        } catch (e: Exception) {
            return miss(fg, "dump could not be run: $e")
        }
        val now = clock()
        val fast = output.log.startsWith(DumpScript.IN_PROCESS_LOG)
        if (fast != inProcess) {
            inProcess = fast
            sink.log(
                if (fast) "capture mode: in-process screen reading (${output.log})"
                else "capture mode: uiautomator dump, ~2 s per read (${output.log.lines().firstOrNull().orEmpty()})",
                now,
            )
        }
        val after = output.foregroundAfter
        if (after != null && after != fg) {
            sink.log(
                "${SupportedApps.displayName(pkg)} screen changed during the dump (${fg.className} -> " +
                    "${after.packageName}/${after.className}); dump discarded",
                now,
            )
            return 0L
        }
        val xml = output.xml ?: return miss(fg, "no dump: ${output.failure}")
        val dump = try {
            UiDumpParser.parse(xml)
        } catch (e: UiDumpParser.MalformedDumpException) {
            return miss(fg, "unreadable dump: ${e.message}")
        }
        val read = DumpRead.of(dump, pkg, fg.className)
        val withText = read.windows.count { it.snapshot.nodes.isNotEmpty() }
        return when (ReadOutcome.of(pkg, read.appOnScreen, read.activePackage, withText)) {
            ReadOutcome.CAPTURED -> {
                readRetry.reset()
                val snapshots = read.windows.map { it.snapshot }
                // A confirm screen is noted the moment it is read, before the read is decided.
                sink.onCaptured(pkg, snapshots, now)
                noteConfirmAttempt(pkg, snapshots, now)
                sink.onRead(pkg, snapshots, read.windows.map { it.info }, now)
                CAPTURE_GAP_MILLIS
            }
            ReadOutcome.NO_TEXT_YET -> miss(fg, "no text in its windows (${read.diagnostics})")
            // dumpsys still has the app's Activity resumed: a shade, dialog or keyboard of another app is over it.
            ReadOutcome.APP_LEFT, ReadOutcome.NOT_LISTED_YET ->
                miss(fg, "no window of ${SupportedApps.displayName(pkg)} in the dump (${read.diagnostics})")
        }
    }

    /**
     * A confirm screen with an amount on it means a payment of that amount is being started (see
     * [io.yestack.upidetector.core.DuplicateDetector.onPaymentAttempt]). Not while a result screen is showing: the
     * payment on it has already happened.
     */
    private fun noteConfirmAttempt(pkg: String, windows: List<ScreenSnapshot>, now: Long) {
        val results = windows.map { ConfirmScreenParser.parse(it) }
        if (results.any { it is ConfirmResult.Rejected && it.reason == ConfirmRejectReason.RESULT_SCREEN }) return
        val confirm = results.firstNotNullOfOrNull { it as? ConfirmResult.Candidate } ?: return
        sink.onPaymentAttempt(pkg, now, confirm.amount)
    }

    /** A dump that gave nothing usable: logged (a bounded number of times per screen), then polled again. */
    private fun miss(fg: ForegroundActivity, reason: String): Long {
        if (readRetry.gaveUp) return GAVE_UP_DELAY_MILLIS
        val m = readRetry.onMiss(fg.className, noWindow = false, reason = reason)
        sink.onReadMiss(fg.packageName, fg.className, m.logLine, clock())
        return if (m.retry) m.delayMillis else GAVE_UP_DELAY_MILLIS
    }

    private fun leave(pkg: String, now: Long, why: String) {
        sink.log("${SupportedApps.displayName(pkg)} no longer in front ($why); stopped dumping it", now)
        sink.onAppBackground(pkg, now)
        current = null
        pinOnScreen = false
        readRetry.reset()
    }

    companion object {
        const val FOREGROUND_TIMEOUT_MILLIS = 5_000L

        /** uiautomator waits up to 10 s for an idle screen, then dumps. */
        const val DUMP_TIMEOUT_MILLIS = 20_000L

        /** No supported app in front: how often to look again. */
        const val IDLE_DELAY_MILLIS = 1_000L
        const val PIN_DELAY_MILLIS = 500L

        /** Between dumps of a supported app; the dump itself takes a second or more. */
        const val CAPTURE_GAP_MILLIS = 200L
        const val ERROR_DELAY_MILLIS = 2_000L
        const val MISS_RETRY_MILLIS = 300L
        const val GAVE_UP_DELAY_MILLIS = 2_000L
        const val MAX_MISS_LOGS = 5
    }
}
