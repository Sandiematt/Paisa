package io.yestack.upidetector.core

/**
 * Decides when to ask the user what a payment was for. The success screen has no transaction ID, so it keys on
 * decisions, and only a live success screen asks: never a history list or an old payment's detail page.
 */
object NotePrompt {

    /** A success screen showing a payment time older than this is an old payment being viewed, not one just made. */
    const val MAX_SHOWN_AGE_MILLIS = HistoryScreen.FRESH_MILLIS

    /**
     * The payment to ask about, or null. [result] is what reached the detector for [snapshot] (after
     * [HistoryScreen.gate]) and [decisions] what it decided.
     *
     * Asks for a newly inserted SUCCESS + DEBIT record without a flag, and for a record that just became SUCCESS
     * (PENDING -> SUCCESS is a real payment). Duplicates, flagged records and notification cross-checks never ask, so a
     * later UPI ref attached to the same record does not ask again.
     *
     * The screen must be live: a live result ([HistoryScreen.isLiveResult]), or a screen with no history markers, no
     * list of amounts, and no printed payment time more than [MAX_SHOWN_AGE_MILLIS] before [nowMillis].
     */
    fun paymentFor(snapshot: ScreenSnapshot, result: ParseResult, decisions: List<Decision>, nowMillis: Long): Transaction? {
        if (result !is ParseResult.Candidate) return null
        val shownAt = result.shownAtMillis
        val live = HistoryScreen.isLiveResult(snapshot, result, nowMillis) || (
            HistoryScreen.reasonOf(snapshot) == null &&
                HistoryScreen.amountRows(snapshot) < HistoryScreen.LIST_AMOUNT_ROWS &&
                (shownAt == null || nowMillis - shownAt <= MAX_SHOWN_AGE_MILLIS)
            )
        if (!live) return null
        return decisions.firstNotNullOfOrNull { d ->
            when (d) {
                is Decision.Inserted -> d.txn.takeIf { SpendLimit.isExpense(it) }
                is Decision.Updated -> d.txn.takeIf { d.previousStatus != TxnStatus.SUCCESS && SpendLimit.isExpense(it) }
                else -> null
            }
        }
    }
}
