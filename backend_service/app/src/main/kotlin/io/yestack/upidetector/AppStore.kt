package io.yestack.upidetector

import android.os.Handler
import android.os.Looper
import io.yestack.upidetector.core.Decision
import io.yestack.upidetector.core.DuplicateDetector
import io.yestack.upidetector.core.NotificationParser
import io.yestack.upidetector.core.ParseResult
import io.yestack.upidetector.core.ScreenSnapshot
import io.yestack.upidetector.core.Transaction
import io.yestack.upidetector.core.UpiTextParser
import java.math.BigDecimal
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Process-wide, in-memory only state: nothing is written to disk. It lives as long as the process,
 * which the enabled accessibility service keeps alive.
 *
 * Main thread only. The service and the activity both run there; anything else must go through [post].
 */
object AppStore {
    const val MAX_LOG_LINES = 300
    const val MAX_RAW_CAPTURES = 30

    fun interface Listener {
        fun onStoreChanged()
    }

    class RawCapture(val snapshot: ScreenSnapshot, val timeMillis: Long, val verdict: String)

    private val mainHandler = Handler(Looper.getMainLooper())
    private val detector = DuplicateDetector()
    private val logLines = ArrayDeque<String>()
    private val captures = ArrayList<RawCapture>() // newest first
    private val listeners = ArrayList<Listener>()
    private val timeFormat = SimpleDateFormat("HH:mm:ss", Locale.US)

    /** When this app was first installed; payments dated earlier on screen are history and are ignored. */
    var installedAtMillis: Long? = null

    /** In-memory switch; resets to on when the process restarts. */
    var rawCaptureEnabled: Boolean = true

    /** Notifications from allowlisted apps that carried no amount + UPI ref. Shown in the report. */
    var ignoredNotificationCount: Int = 0
        private set

    /** Supported app last reported on screen and not yet reported as backgrounded. */
    var lastPackage: String? = null
        private set

    fun post(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) block() else mainHandler.post(block)
    }

    fun addListener(l: Listener) {
        if (l !in listeners) listeners.add(l)
    }

    fun removeListener(l: Listener) {
        listeners.remove(l)
    }

    val transactions: List<Transaction> get() = detector.transactions
    val logNewestFirst: List<String> get() = logLines.reversed()
    val rawCaptures: List<RawCapture> get() = captures.toList()

    fun log(message: String, now: Long = System.currentTimeMillis()) {
        appendLog(now, message)
        notifyChanged()
    }

    fun onScreenChanged(packageName: String, screenClass: String?, windowId: Int?, now: Long) {
        lastPackage = packageName
        decide("screen change", now) { detector.onScreenChanged(packageName, screenClass, windowId, now) }
    }

    fun onAppBackground(packageName: String, now: Long) {
        if (lastPackage == packageName) lastPackage = null
        decide("background", now) { detector.onAppBackground(packageName, now) }
    }

    /** Reports the last known supported app as backgrounded, if any. */
    fun onLastAppBackground(now: Long) {
        lastPackage?.let { onAppBackground(it, now) }
    }

    fun onSnapshot(snapshot: ScreenSnapshot, now: Long) {
        appendLog(
            now,
            "snapshot ${SupportedApps.displayName(snapshot.packageName)} ${snapshot.screenClass ?: "?"} " +
                "${snapshot.nodes.size} text nodes",
        )
        var verdict = "parser error"
        try {
            val result = UpiTextParser.parse(snapshot, notBeforeMillis = installedAtMillis, nowMillis = now)
            val decisions = detector.onParseResult(snapshot.packageName, result, now)
            decisions.forEach { appendLog(now, it.logLine) }
            verdict = verdictOf(result, decisions)
        } catch (t: Throwable) {
            appendLog(now, "ERROR in parse/detect: $t")
        }
        recordCapture(snapshot, now, verdict)
        notifyChanged()
    }

    /** Cross-verify only: never creates a transaction. Logs parsed fields, never the notification text. */
    fun onNotification(packageName: String, title: String?, text: String?, postedAt: Long) {
        val now = System.currentTimeMillis()
        try {
            val hit = NotificationParser.parse(packageName, title, text, postedAt)
            if (hit == null) {
                ignoredNotificationCount++
                if (!NotificationSources.isMessagingApp(packageName)) {
                    appendLog(
                        now,
                        "notification from ${NotificationSources.displayName(packageName)} ignored " +
                            "(no amount + UPI ref)",
                    )
                }
            } else {
                appendLog(
                    now,
                    "notification ${NotificationSources.displayName(packageName)}: ₹${hit.amount.toPlainString()} " +
                        "${hit.direction} ref ${hit.upiRef}",
                )
                detector.onNotification(hit, now).forEach { appendLog(now, it.logLine) }
            }
        } catch (t: Throwable) {
            appendLog(now, "ERROR in notification cross-check: $t")
        }
        notifyChanged()
    }

    fun keep(id: Long): Boolean = detector.keep(id).also { logAction("keep", id, it) }

    fun merge(id: Long): Boolean = detector.merge(id).also { logAction("merge", id, it) }

    fun expenseTotal(): BigDecimal = detector.expenseTotal()

    fun clear() {
        detector.clear()
        logLines.clear()
        captures.clear()
        lastPackage = null
        ignoredNotificationCount = 0
        notifyChanged()
    }

    private fun logAction(name: String, id: Long, ok: Boolean) {
        appendLog(System.currentTimeMillis(), "user $name #$id: ${if (ok) "done" else "no such flagged record"}")
        notifyChanged()
    }

    private fun decide(what: String, now: Long, block: () -> List<Decision>) {
        try {
            block().forEach { appendLog(now, it.logLine) }
        } catch (t: Throwable) {
            appendLog(now, "ERROR in $what: $t")
        }
        notifyChanged()
    }

    private fun verdictOf(result: ParseResult, decisions: List<Decision>): String {
        val parsed = when (result) {
            is ParseResult.Candidate ->
                "candidate ₹${result.amount.toPlainString()} ${result.status} ${result.direction}"
            is ParseResult.Rejected -> "rejected ${result.reason}"
        }
        val outcome = decisions.filter { it !is Decision.RefExtractionFailed }
            .joinToString { it::class.simpleName ?: "?" }
        return if (outcome.isEmpty()) parsed else "$parsed -> $outcome"
    }

    private fun recordCapture(snapshot: ScreenSnapshot, now: Long, verdict: String) {
        if (!rawCaptureEnabled) return
        // Apps redraw the same screen repeatedly; keep one copy.
        val previous = captures.firstOrNull { it.snapshot.packageName == snapshot.packageName }
        if (previous != null && previous.snapshot.nodes == snapshot.nodes) return
        captures.add(0, RawCapture(snapshot, now, verdict))
        while (captures.size > MAX_RAW_CAPTURES) captures.removeAt(captures.size - 1)
    }

    private fun appendLog(now: Long, message: String) {
        logLines.addLast("${timeFormat.format(Date(now))} $message")
        while (logLines.size > MAX_LOG_LINES) logLines.removeFirst()
    }

    private fun notifyChanged() {
        listeners.toList().forEach { it.onStoreChanged() }
    }
}
