package io.yestack.upidetector.core

import java.time.ZoneId

/**
 * What a read found and whether it looks unfinished. A result screen is often read while it is still being drawn
 * (PhonePe animates it, and its "Done" button or status text can arrive without a further accessibility event), so a
 * read that looks like a half-drawn result is read again a few times rather than left at its rejection. The validation
 * rules themselves are not changed: an unfinished read is decided like any other, and so is the re-read.
 */
object ScreenCheck {

    /** The keywords on [snapshot] that the payment rules look at, for the live log. Plain words; no notes or names. */
    fun keywords(snapshot: ScreenSnapshot, nowMillis: Long, zone: ZoneId = ZoneId.systemDefault()): String {
        val texts = ScreenText.texts(snapshot)
        val status = UpiTextParser.statusPhrases(snapshot)
        val amounts = ScreenText.amounts(texts).map { it.value.toPlainString() }.distinct()
        val time = ScreenDates.nearest(texts, 0, zone, nowMillis)
        val history = HistoryScreen.reasonOf(snapshot)
        return listOf(
            "status " + if (status.isEmpty()) "none" else status.joinToString { "'$it'" },
            "Done " + if (HistoryScreen.hasDoneButton(snapshot)) "yes" else "no",
            "amounts " + if (amounts.isEmpty()) "none" else amounts.take(MAX_AMOUNTS).joinToString { "₹$it" } +
                if (amounts.size > MAX_AMOUNTS) " (+${amounts.size - MAX_AMOUNTS})" else "",
            "printed time " + (time?.let { "'${it.text}'" } ?: "none"),
            "history marker " + (history ?: "none"),
        ).joinToString("; ")
    }

    /**
     * Why [result] on [snapshot] looks like a result screen still being drawn, or null when it does not (a recorded
     * payment, or a screen that is plainly not a payment result). Such a read is worth reading again shortly.
     */
    fun unfinishedReason(snapshot: ScreenSnapshot, result: ParseResult): String? = when (result) {
        is ParseResult.Candidate ->
            if (result.status == TxnStatus.PENDING) "payment still processing" else null
        is ParseResult.Rejected -> when (result.reason) {
            RejectReason.HISTORY_SCREEN ->
                if (!HistoryScreen.hasDoneButton(snapshot)) "status shown but no Done button yet" else null
            RejectReason.NO_AMOUNT -> "status shown but no amount yet"
            RejectReason.NO_STATUS_PHRASE ->
                if (HistoryScreen.hasDoneButton(snapshot) && ScreenText.amounts(ScreenText.texts(snapshot)).isNotEmpty()) {
                    "Done and an amount shown but no status yet"
                } else {
                    null
                }
            else -> null
        }
    }

    /**
     * The first unfinished-looking window of [outcome], as "window N: reason", or null. [treeIssues] says, per window,
     * why its tree may be incomplete (nodes went stale, a walk limit was hit), or null. Null as soon as the deciding
     * window holds a final payment: a chat list below a recorded result is not worth re-reading.
     */
    fun unfinishedReason(outcome: PaymentPipeline.Outcome, treeIssues: List<String?> = emptyList()): String? {
        val decided = outcome.windows[outcome.chosen].result
        if (decided is ParseResult.Candidate && decided.status != TxnStatus.PENDING) return null
        outcome.windows.withIndex().firstNotNullOfOrNull { (i, w) ->
            unfinishedReason(w.snapshot, w.result)?.let { "window ${i + 1}: $it" }
        }?.let { return it }
        return treeIssues.withIndex().firstNotNullOfOrNull { (i, issue) ->
            issue?.let { "window ${i + 1}: tree incomplete ($it)" }
        }
    }

    private const val MAX_AMOUNTS = 3
}
