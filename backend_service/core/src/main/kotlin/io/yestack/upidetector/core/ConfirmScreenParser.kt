package io.yestack.upidetector.core

import java.math.BigDecimal
import kotlin.math.abs

/**
 * Reads a pre-payment confirm screen (amount entered, Pay button showing) into the amount about to be paid.
 * Separate from [UpiTextParser]: it only feeds the daily-limit check and never creates a record. Never throws.
 *
 * A Pay button that names the amount ("Pay ₹500", "PAY ₹1", "Send ₹1") decides the amount. A plain Pay button takes
 * the amount nearest to it. PIN screens and old-payment detail pages ([HistoryScreen.detailReason]) never count, nor
 * does a single result screen.
 *
 * PhonePe's pay sheet is found by text only it shows ([SHEET_ANCHORS]) and read on its own terms, whatever else the
 * window holds and in whatever order. Other screens with past payment cards: only the nodes after the last card are
 * read for a plain Pay button and its amount.
 */
object ConfirmScreenParser {
    // ---- Tunable phrase lists (English only; lower-case, single-spaced, matched case/whitespace-insensitively) ----

    /** A whole node equal to one of these is a Pay button; the amount is the one nearest it. */
    private val PAY_BUTTON_LABELS = listOf(
        "pay",
        "pay now",
        "pay securely",
        "proceed to pay",
        "proceed and pay",
        "confirm and pay",
        "confirm & pay",
        "confirm payment",
        "make payment",
    )

    /**
     * Labels that count only when the amount follows in the same node ("Send ₹1"). Plain "Send" is also a chat
     * message button, so it never counts on its own.
     */
    private val AMOUNT_BUTTON_LABELS = PAY_BUTTON_LABELS + listOf("send", "send now", "send money")

    /** UPI PIN entry wording: such a screen is never treated as a confirm screen. */
    private val PIN_PHRASES = listOf("upi pin", "enter pin", "enter your pin", "mpin")

    /**
     * Text only PhonePe's pay sheet shows (7.webp / 8.webp): never on a history list, a chat card or a result page.
     * "Banking name" is not one: the result and detail pages show it too.
     */
    private val SHEET_ANCHORS = listOf("transfer money to", "paying instantly with your fingerprint")

    // ---- Patterns ----

    private fun labels(list: List<String>) = list.joinToString("|") { it.split(" ").joinToString("""\s+""") }

    private val PAY_BUTTON = Regex("^(?:${labels(PAY_BUTTON_LABELS)})$", RegexOption.IGNORE_CASE)

    /** "Pay ₹500", "PAY ₹ 1", "Proceed to pay ₹1.00", "Pay ₹1 securely": the amount right after the label. */
    private val AMOUNT_BUTTON = Regex(
        """^(?:${labels(AMOUNT_BUTTON_LABELS)})\s*${ScreenText.AMOUNT_CORE}(?:\s+(?:now|securely))?$""",
        RegexOption.IGNORE_CASE,
    )

    private val PIN = ScreenText.phraseRegex(PIN_PHRASES)
    private val SHEET_ANCHOR = ScreenText.phraseRegex(SHEET_ANCHORS)
    private val EXACT_PAY = Regex("""^pay$""", RegexOption.IGNORE_CASE)

    /** Words on a past payment's card ("PAID", "RECEIVED", "Processing payment"). */
    private val CARD_STATUS = Regex(
        """(?<![A-Za-z])(?:paid|received|sent|pending|processing|failed|declined|refunded)(?![A-Za-z])""",
        RegexOption.IGNORE_CASE,
    )

    /** An amount field with no currency sign drawn as text, recognisable only by its view ID. */
    private val AMOUNT_VIEW_ID = Regex("""amount""", RegexOption.IGNORE_CASE)

    /** Whether [snapshot] shows UPI PIN entry wording. Such a screen is never kept in the raw captures. */
    fun isPinScreen(snapshot: ScreenSnapshot): Boolean = ScreenText.texts(snapshot).any { PIN.containsMatchIn(it) }

    fun parse(snapshot: ScreenSnapshot): ConfirmResult {
        val texts = ScreenText.texts(snapshot)
        if (texts.all { it.isEmpty() }) return rejected(ConfirmRejectReason.EMPTY_SNAPSHOT, "no text on screen")

        texts.firstNotNullOfOrNull { PIN.find(it)?.value }?.let {
            return rejected(ConfirmRejectReason.PIN_SCREEN, "PIN wording '$it'")
        }
        texts.firstNotNullOfOrNull { SHEET_ANCHOR.find(it)?.value }?.let { return parseSheet(snapshot, texts, it) }
        HistoryScreen.detailReason(snapshot)?.let { return rejected(ConfirmRejectReason.HISTORY_SCREEN, it) }

        // Past payment cards in the window: the last node that is one, or carries a status phrase of its own.
        val lastCard = texts.indices.lastOrNull { HistoryScreen.listMarker(texts[it]) != null }
        val from = if (lastCard == null) {
            // A single screen: a status phrase anywhere means the payment already happened (or is happening).
            val status = UpiTextParser.parse(snapshot)
            if (status.statusPhrasePresent) {
                val detail = when (status) {
                    is ParseResult.Candidate -> "status phrase '${status.statusPhrase}'"
                    is ParseResult.Rejected -> status.detail
                }
                return rejected(ConfirmRejectReason.RESULT_SCREEN, detail)
            }
            0
        } else {
            val lastStatus = snapshot.nodes.indices.lastOrNull { hasStatusPhrase(snapshot, it) } ?: -1
            maxOf(lastCard, lastStatus) + 1
        }

        // A button that names the amount decides it, wherever it is.
        val named = snapshot.nodes.mapNotNull { node ->
            labelsOf(node).firstNotNullOfOrNull { label ->
                AMOUNT_BUTTON.matchEntire(label)?.let { m -> ScreenText.valueOf(m)?.let { label to it } }
            }
        }
        if (named.isNotEmpty()) {
            val values = named.map { it.second }.distinct().sorted()
            if (values.size > 1) {
                return rejected(
                    ConfirmRejectReason.AMBIGUOUS_AMOUNT,
                    "Pay buttons name different amounts: " + values.joinToString(", ") { it.toPlainString() },
                )
            }
            return ConfirmResult.Candidate(values.single(), named.first().first)
        }

        val afterCards = if (lastCard == null) "" else " after the last past payment ('${texts[from - 1]}')"
        val payIndexes = (from until snapshot.nodes.size)
            .filter { i -> labelsOf(snapshot.nodes[i]).any { PAY_BUTTON.matches(it) } }
        if (payIndexes.isEmpty()) return rejected(ConfirmRejectReason.NO_PAY_BUTTON, "no Pay button text$afterCards")

        val amounts = (ScreenText.amounts(texts) + amountFields(snapshot)).filter { it.nodeIndex >= from }
        val rows = amounts.map { it.nodeIndex }.distinct().size
        if (rows >= HistoryScreen.LIST_AMOUNT_ROWS) {
            return rejected(ConfirmRejectReason.HISTORY_SCREEN, "$rows nodes with an amount$afterCards: a list")
        }
        if (amounts.isEmpty()) {
            // A chat's own Pay button below its old cards (GPay chat "Pay") has no amount of its own.
            return if (lastCard == null) {
                rejected(ConfirmRejectReason.NO_AMOUNT, "no amount with a currency prefix")
            } else {
                rejected(ConfirmRejectReason.HISTORY_SCREEN, "no amount$afterCards")
            }
        }
        val distanceByValue = amounts.groupBy(
            { it.value },
            { hit -> payIndexes.minOf { abs(hit.nodeIndex - it) } },
        ).mapValues { (_, distances) -> distances.min() }
        val nearest = distanceByValue.values.min()
        val tied = distanceByValue.filterValues { it == nearest }.keys.sorted()
        if (tied.size > 1) {
            val detail = "amounts tied at distance $nearest from the Pay button: " +
                tied.joinToString(", ") { it.toPlainString() }
            return rejected(ConfirmRejectReason.AMBIGUOUS_AMOUNT, detail)
        }
        val amount = tied.single()
        val button = payIndexes.minBy { index ->
            amounts.filter { it.value == amount }.minOf { abs(it.nodeIndex - index) }
        }
        return ConfirmResult.Candidate(amount, labelsOf(snapshot.nodes[button]).first { PAY_BUTTON.matches(it) })
    }

    private fun rejected(reason: ConfirmRejectReason, detail: String) = ConfirmResult.Rejected(reason, detail)

    /**
     * PhonePe's pay sheet, found by [anchor]. It shares the chat's window with old payment cards ("₹11" "PAID",
     * "Processing payment"), in a tree order that is not known, so none of that rejects it. The amount is the entry's
     * ("₹" "11", or "₹ 11"); failing that, an amount that is not part of a card. The one nearest the exact PAY wins.
     */
    private fun parseSheet(snapshot: ScreenSnapshot, texts: List<String>, anchor: String): ConfirmResult {
        val named = snapshot.nodes.mapNotNull { node ->
            labelsOf(node).firstNotNullOfOrNull { label ->
                AMOUNT_BUTTON.matchEntire(label)?.let { m -> ScreenText.valueOf(m)?.let { label to it } }
            }
        }
        named.map { it.second }.distinct().singleOrNull()?.let { return ConfirmResult.Candidate(it, named.first().first) }

        val payIndexes = snapshot.nodes.indices.filter { i -> labelsOf(snapshot.nodes[i]).any { EXACT_PAY.matches(it) } }
        if (payIndexes.isEmpty()) {
            return rejected(ConfirmRejectReason.NO_PAY_BUTTON, "pay sheet ('$anchor') without an exact PAY button")
        }
        val entries = (ScreenText.entryAmounts(snapshot) + amountFields(snapshot)).filter { !isCardAmount(texts, it.nodeIndex) }
        val amounts = entries.ifEmpty {
            ScreenText.amounts(texts).filter { !isCardAmount(texts, it.nodeIndex) }
        }
        if (amounts.isEmpty()) {
            return rejected(ConfirmRejectReason.NO_AMOUNT, "pay sheet ('$anchor') without an entered amount")
        }
        val distanceByValue = amounts.groupBy(
            { it.value },
            { hit -> payIndexes.minOf { abs(hit.nodeIndex - it) } },
        ).mapValues { (_, distances) -> distances.min() }
        val nearest = distanceByValue.values.min()
        val tied = distanceByValue.filterValues { it == nearest }.keys.sorted()
        if (tied.size > 1) {
            return rejected(
                ConfirmRejectReason.AMBIGUOUS_AMOUNT,
                "pay sheet amounts tied at distance $nearest from PAY: " + tied.joinToString(", ") { it.toPlainString() },
            )
        }
        return ConfirmResult.Candidate(tied.single(), labelsOf(snapshot.nodes[payIndexes.first()]).first { EXACT_PAY.matches(it) })
    }

    /** An amount belonging to a past payment's card: a card status word in its node or within two nodes of it. */
    private fun isCardAmount(texts: List<String>, index: Int): Boolean =
        (index - 2..index + 2).any { i -> texts.getOrNull(i)?.let { CARD_STATUS.containsMatchIn(it) } == true }

    /** Whether node [index] on its own carries a success, failure or pending phrase ("Processing payment"). */
    private fun hasStatusPhrase(snapshot: ScreenSnapshot, index: Int): Boolean {
        val node = snapshot.nodes[index]
        if (node.text.isNullOrBlank() && node.contentDescription.isNullOrBlank()) return false
        return UpiTextParser.parse(snapshot.copy(nodes = listOf(node))).statusPhrasePresent
    }

    /** The node's text and content description, each normalised on its own. */
    private fun labelsOf(node: TextNode): List<String> =
        listOfNotNull(node.text, node.contentDescription).map { ScreenText.normalise(it) }.filter { it.isNotEmpty() }

    /** Number-only nodes whose view ID names an amount field. */
    private fun amountFields(snapshot: ScreenSnapshot): List<ScreenText.AmountHit> =
        snapshot.nodes.mapIndexedNotNull { index, node ->
            val text = ScreenText.normalise(node.text.orEmpty())
            if (node.viewId == null || !AMOUNT_VIEW_ID.containsMatchIn(node.viewId) || !ScreenText.NUMBER_ONLY.matches(text)) {
                return@mapIndexedNotNull null
            }
            val value = BigDecimal(text.replace(",", "")).setScale(2)
            if (value.signum() == 0) null else ScreenText.AmountHit(index, value)
        }
}
