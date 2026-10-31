package io.yestack.upidetector.ui

import io.yestack.upidetector.AppStore
import io.yestack.upidetector.SupportedApps
import io.yestack.upidetector.core.Transaction
import java.math.BigDecimal
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Builds the plain-text report shared via ACTION_SEND. */
object ReportBuilder {
    /** Intent extras travel through binder (~1 MB limit); stay well below it. */
    const val MAX_BYTES = 400 * 1024

    class Header(
        val appVersion: String,
        val device: String,
        val androidVersion: String,
        val timeMillis: Long,
        val serviceEnabled: Boolean,
        val installed: Map<String, Boolean>,
        val notificationAccess: Boolean,
        val notificationsIgnored: Int,
        /** Which [io.yestack.upidetector.TrackingMethod] the user picked (its key). */
        val trackingMethod: String = "accessibility",
        /** Shizuku capture was running. */
        val captureRunning: Boolean = false,
    )

    fun formatNodes(capture: AppStore.RawCapture): String = buildString {
        capture.snapshot.nodes.forEachIndexed { i, n ->
            append(i).append(": ").append(n.text.orEmpty().flat())
                .append(" | ").append(n.contentDescription.orEmpty().flat())
                .append(" | ").append(n.viewId.orEmpty()).append('\n')
        }
    }

    fun build(
        header: Header,
        transactions: List<Transaction>,
        expenseTotal: BigDecimal,
        logNewestFirst: List<String>,
        rawNewestFirst: List<AppStore.RawCapture>,
    ): String {
        var keep = rawNewestFirst.size
        while (true) {
            val text = render(header, transactions, expenseTotal, logNewestFirst, rawNewestFirst, keep)
            val bytes = text.toByteArray(Charsets.UTF_8)
            if (bytes.size <= MAX_BYTES) return text
            if (keep > 0) {
                keep-- // oldest capture goes first
                continue
            }
            // Too big even without raw captures: hard cut.
            return String(bytes.copyOf(MAX_BYTES - 64), Charsets.UTF_8) + "\n[report truncated]\n"
        }
    }

    private fun render(
        h: Header,
        txns: List<Transaction>,
        total: BigDecimal,
        log: List<String>,
        raw: List<AppStore.RawCapture>,
        rawKept: Int,
    ): String = buildString {
        val full = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
        append("UPI Detector report\n")
        append("App version: ").append(h.appVersion).append('\n')
        append("Device: ").append(h.device).append('\n')
        append("Android: ").append(h.androidVersion).append('\n')
        append("Time: ").append(full.format(Date(h.timeMillis))).append('\n')
        append("Tracking method: ").append(h.trackingMethod).append('\n')
        append("Service enabled: ").append(h.serviceEnabled).append('\n')
        append("Capture running (via Shizuku): ").append(h.captureRunning).append('\n')
        append("Notification access: ").append(h.notificationAccess).append('\n')
        append("Notifications ignored: ").append(h.notificationsIgnored).append('\n')
        append("Apps installed: ")
            .append(SupportedApps.all.joinToString { "${it.displayName}=${h.installed[it.packageName] == true}" })
            .append("\n\n")

        append("== Transactions (").append(txns.size).append(") ==\n")
        for (t in txns) {
            append('#').append(t.id).append(' ').append(SupportedApps.displayName(t.sourceApp))
                .append(" amount=").append(t.amount.toPlainString())
                .append(" status=").append(t.status)
                .append(" direction=").append(t.direction)
                .append(" merchant=").append(t.merchant ?: "-")
                .append(" ref=").append(t.upiRef ?: "-")
                .append(" detected=").append(full.format(Date(t.detectedAtMillis)))
                .append(" updated=").append(full.format(Date(t.updatedAtMillis)))
                .append(" session=").append(t.sessionId ?: "-")
                .append(" flag=").append(t.flag ?: "-")
            if (t.flagReason != null) append(" reason=").append(t.flagReason!!.flat())
            if (t.possibleDuplicateOfId != null) append(" duplicateOf=#").append(t.possibleDuplicateOfId)
            if (t.note != null) append(" note=").append(t.note!!.flat())
            append('\n')
        }
        append("Expense total (SUCCESS + DEBIT, not flagged): ").append(total.toPlainString()).append("\n\n")

        append("== Live log (newest first, ").append(log.size).append(") ==\n")
        log.forEach { append(it).append('\n') }
        append('\n')

        append("== Raw captures (newest first, ").append(rawKept).append(" of ").append(raw.size).append(") ==\n")
        if (rawKept < raw.size) {
            append('[').append(raw.size - rawKept)
                .append(" oldest capture(s) omitted to keep the report under ")
                .append(MAX_BYTES / 1024).append(" KB]\n")
        }
        for (c in raw.take(rawKept)) {
            append("-- ").append(SupportedApps.displayName(c.snapshot.packageName))
                .append(' ').append(c.snapshot.screenClass ?: "?")
                .append(" at ").append(full.format(Date(c.timeMillis)))
                .append(", ").append(c.snapshot.nodes.size).append(" nodes, verdict: ").append(c.verdict.flat()).append('\n')
            if (c.detail != null) append("   ").append(c.detail.flat()).append('\n')
            append(formatNodes(c)).append('\n')
        }
    }

    private fun String.flat() = replace('\n', ' ')
}
