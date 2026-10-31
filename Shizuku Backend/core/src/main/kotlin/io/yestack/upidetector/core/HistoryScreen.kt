package io.yestack.upidetector.core

/**
 * Tells a history list or an old-payment detail page from a live payment screen, by what is on it. Such a screen never
 * creates a record or asks for a note, and its own plain Pay button never triggers the daily-limit warning.
 *
 * Live success screens seen so far (GPay: "Share screenshot" / "See details" / "Done"; PhonePe: "Split Expense" /
 * "View Details" / "Share Receipt" / "Done") show none of the markers below, so those controls are not markers.
 * PhonePe draws its live result in the same activity as an old payment's details, and that tree can still hold the
 * detail controls ("Send Again") out of sight. So a live result ([isLiveResult]: a "Done" button and a payment time
 * printed within [FRESH_MILLIS] of now) is accepted whatever markers its tree carries.
 */
object HistoryScreen {
    // ---- Tunable lists (English only; lower-case, single-spaced, matched case/whitespace-insensitively) ----

    /** Controls that only an old payment's detail page offers (GPay "Pay again", PhonePe "Send Again" / "View History"). */
    private val DETAIL_CONTROLS = listOf(
        "pay again",
        "send again",
        "repeat payment",
        "view history",
        "payment started",
    )

    /** A whole node that is only a status word: a history card ("RECEIVED", "PAID") or a detail page's chip ("Completed"). */
    private val STATUS_WORD_NODE = Regex("""^(?:paid|sent|received|completed|refunded)$""", RegexOption.IGNORE_CASE)

    /** "Contact PhonePe Support", "Contact Google Pay support": only on detail pages. */
    private val CONTACT_SUPPORT = Regex("""(?<![A-Za-z])contact\s+(?:\S+\s+){0,2}support(?![A-Za-z])""", RegexOption.IGNORE_CASE)

    /** A dated status row: "Paid · 23 Oct", "Paid • 2:45pm". */
    private val DATED_STATUS_ROW = Regex(
        """(?<![A-Za-z])(?:paid|sent|received|failed|declined|pending|refunded)\s*[·•∙‧]\s*\S""",
        RegexOption.IGNORE_CASE,
    )

    /** A relative time row: "6 mins ago", "1 day ago". */
    private val TIME_AGO = Regex(
        """(?<![A-Za-z0-9])\d+\s*(?:min|mins|minute|minutes|hr|hrs|hour|hours|day|days|week|weeks|month|months)\s+ago(?![A-Za-z])""",
        RegexOption.IGNORE_CASE,
    )

    private val DETAIL = ScreenText.phraseRegex(DETAIL_CONTROLS)

    /** The live result screen's own button (GPay and PhonePe). Old detail pages seen so far have none. */
    private val DONE = Regex("""^done$""", RegexOption.IGNORE_CASE)

    /** This many nodes holding an amount make a list: a live screen shows the amount, a Pay button and maybe a balance. */
    const val LIST_AMOUNT_ROWS = 4

    /** A result screen printing a payment time older than this shows an old payment, not one just made. */
    const val FRESH_MILLIS = 10 * 60_000L

    /** Printed times are to the minute and the app's clock can differ a little from the phone's. */
    private const val FUTURE_SLACK_MILLIS = 2 * 60_000L

    /** Why [snapshot] is a history list or old-payment detail page, or null when nothing marks it as one. */
    fun reasonOf(snapshot: ScreenSnapshot): String? = detailReason(snapshot) ?: listReason(snapshot)

    /** A control only an old payment's detail page offers ("Pay again", "Contact PhonePe Support"), or null. */
    fun detailReason(snapshot: ScreenSnapshot): String? {
        for (text in ScreenText.texts(snapshot)) {
            DETAIL.find(text)?.let { return "detail-page control '${it.value}'" }
            CONTACT_SUPPORT.find(text)?.let { return "detail-page control '${it.value}'" }
        }
        return null
    }

    /** A sign of a list of past payments (history tab, chat cards), or null. */
    fun listReason(snapshot: ScreenSnapshot): String? =
        ScreenText.texts(snapshot).firstNotNullOfOrNull { listMarker(it) }

    /** Why the node text [text] belongs to a past payment in a list ("PAID", "Paid · 23 Oct", "6 mins ago"), or null. */
    internal fun listMarker(text: String): String? {
        if (STATUS_WORD_NODE.matches(text)) return "status-only label '$text'"
        DATED_STATUS_ROW.find(text)?.let { return "dated status row '$text'" }
        TIME_AGO.find(text)?.let { return "relative time '${it.value}'" }
        return null
    }

    /** Nodes that hold at least one amount. */
    fun amountRows(snapshot: ScreenSnapshot): Int =
        ScreenText.amounts(ScreenText.texts(snapshot)).map { it.nodeIndex }.distinct().size

    fun hasDoneButton(snapshot: ScreenSnapshot): Boolean = snapshot.nodes.any { node ->
        listOfNotNull(node.text, node.contentDescription).any { DONE.matches(ScreenText.normalise(it)) }
    }

    /** Whether a printed payment time [shownAtMillis] is within [FRESH_MILLIS] of [nowMillis]; false when none was read. */
    fun isFresh(shownAtMillis: Long?, nowMillis: Long): Boolean =
        shownAtMillis != null && nowMillis - shownAtMillis in -FUTURE_SLACK_MILLIS..FRESH_MILLIS

    /** [c] was read off the result screen of a payment just made: a "Done" button and a fresh printed time. */
    fun isLiveResult(snapshot: ScreenSnapshot, c: ParseResult.Candidate, nowMillis: Long): Boolean =
        hasDoneButton(snapshot) && isFresh(c.shownAtMillis, nowMillis)

    /**
     * [result] unchanged, unless it is a candidate read off a history or detail page that is not a live result: then
     * a [RejectReason.HISTORY_SCREEN] rejection, so no record is created or updated from it.
     *
     * [openAttempt]: a payment of this amount was just started in this app and has no finished record yet
     * ([DuplicateDetector.hasOpenAttempt]). The result is then that payment's live result even without a "Done" button
     * or a printed time, unless it prints a payment time that is not recent.
     */
    fun gate(snapshot: ScreenSnapshot, result: ParseResult, nowMillis: Long, openAttempt: Boolean = false): ParseResult {
        if (result !is ParseResult.Candidate) return result
        val reason = reasonOf(snapshot) ?: return result
        if (isLiveResult(snapshot, result, nowMillis)) return result
        val printedOld = result.shownAtMillis != null && !isFresh(result.shownAtMillis, nowMillis)
        if (openAttempt && !printedOld) return result
        val notLive = when {
            printedOld -> "printed time not within ${FRESH_MILLIS / 60_000} min"
            !hasDoneButton(snapshot) -> "no Done button"
            else -> "printed time not within ${FRESH_MILLIS / 60_000} min"
        } + if (!openAttempt) "; no payment of this amount started just before" else ""
        return ParseResult.Rejected(
            RejectReason.HISTORY_SCREEN,
            "${result.amount.toPlainString()} ${result.status} on a history or detail page ($reason; $notLive)",
            statusPhrasePresent = true,
        )
    }
}
