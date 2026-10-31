package io.yestack.upidetector.core

import java.math.BigDecimal
import java.time.ZoneId
import kotlin.math.abs

/** Turns one [ScreenSnapshot] into a [ParseResult.Candidate] or a [ParseResult.Rejected] with a reason. Never throws. */
object UpiTextParser {
    // ---- Tunable phrase lists (English only; lower-case, single-spaced, matched case/whitespace-insensitively) ----

    private val FAILURE_PHRASES = listOf(
        "payment failed",
        "transaction failed",
        "transaction declined",
        "payment declined",
        "payment unsuccessful",
        "transaction unsuccessful",
        "could not be completed",
        "payment could not be processed",
    )

    private val PENDING_PHRASES = listOf(
        "payment pending",
        "transaction pending",
        "payment processing",
        "processing payment",
        "payment is processing",
        "payment is pending",
        "awaiting confirmation",
        "payment in progress",
    )

    private val SUCCESS_PHRASES = listOf(
        "payment successful",
        "paid successfully",
        "transaction successful",
        "money sent successfully",
        "sent successfully",
        "payment completed",
        "transaction completed",
        "received successfully",
    )

    private val DEBIT_PHRASES = listOf("paid to", "sent to", "payment to", "debited")
    private val CREDIT_PHRASES = listOf("received from", "credited", "money received")

    /** Labels that introduce a UPI reference; app-specific IDs ("Transaction ID", "Order ID") are deliberately absent. */
    private val REF_LABELS = listOf(
        """upi\s+ref(?:erence)?\.?(?:\s*(?:no\.?|number))?""",
        """upi\s+(?:transaction|txn)\s+id""",
        """utr(?:\s*(?:no\.?|number))?""",
        """ref\.?\s*no\.?""",
    )

    // ---- Patterns ----

    private const val AMOUNT_CORE = """(?:₹|(?<![A-Za-z])(?:rs\.?|inr))\s?(\d+(?:,\d+)*)(?:\.(\d{1,2}))?(?!\d)"""
    private val AMOUNT = Regex(AMOUNT_CORE, RegexOption.IGNORE_CASE)

    /** "₹X paid to ..." is a success statement; a bare "Paid to Ravi ₹50" history row is not. */
    private const val AMOUNT_PAID_TO = AMOUNT_CORE + """\s+paid\s+to(?![A-Za-z])"""

    private val FAILURE = phraseRegex(FAILURE_PHRASES)
    private val PENDING = phraseRegex(PENDING_PHRASES)
    private val SUCCESS = phraseRegex(SUCCESS_PHRASES, extraAlternative = AMOUNT_PAID_TO)

    /**
     * Success phrases only, for a phrase split across two views. "₹X paid to" is not looked for that way: a history row
     * draws "₹50" and "Paid to Ravi" as separate views, and that is not a success statement.
     */
    private val SUCCESS_WORDS = phraseRegex(SUCCESS_PHRASES)

    private val DEBIT = phraseRegex(DEBIT_PHRASES)
    private val CREDIT = phraseRegex(CREDIT_PHRASES)

    private val REF_LABEL = Regex(
        REF_LABELS.joinToString("|") { "(?:$it)" }.let { "(?<![A-Za-z])(?:$it)(?![A-Za-z])" },
        RegexOption.IGNORE_CASE,
    )
    private val TWELVE_DIGITS = Regex("""\d{12}""")

    /** A 4-4-4 space-grouped UTR, else one alphanumeric run; trailing text like "12 Oct" is not part of the value. */
    private val REF_VALUE_TOKEN = Regex("""^(?:\d{4} \d{4} \d{4}(?![\d ]\d)|[A-Za-z0-9]+)""")
    private val REF_SEPARATORS = charArrayOf(':', '-', '#', '.', ' ')
    private const val REF_DIGITS = 12
    private const val MAX_ECHO = 30

    /** "Paid to X", "Sent to X", "Received from X" anywhere in a node, or a bare "To X" / "To: X" at its start. */
    private val MERCHANT_LEAD_IN = Regex(
        """(?<![A-Za-z])(?:paid\s+to|sent\s+to|received\s+from)(?![A-Za-z])\s*:?\s*|^to(?![A-Za-z])\s*:?\s*""",
        RegexOption.IGNORE_CASE,
    )

    private val WHITESPACE =Regex("""[\s ​]+""")

    /** A node holding only a currency sign, and a node holding only a number: big amounts are often drawn as two views. */
    private val CURRENCY_ONLY = Regex("""^(?:₹|rs\.?|inr)$""", RegexOption.IGNORE_CASE)
    private val NUMBER_ONLY = Regex("""^\d+(?:,\d+)*(?:\.\d{1,2})?$""")

    /** Success phrases that only ever describe money going out; they make the direction DEBIT when nothing says otherwise. */
    private val OUTGOING_SUCCESS =
        phraseRegex(listOf("payment successful", "paid successfully", "money sent successfully", "sent successfully"))

    /**
     * GPay's success screen has no "successful" text: just "₹1" / "Paid to" / name. That shape only counts as success
     * when the screen also carries a success-screen control, so a history row "₹50" / "Paid to Ravi" does not.
     */
    private val PAID_TO_ANYWHERE = Regex("""(?<![A-Za-z])(?:paid|sent)\s+to(?![A-Za-z])""", RegexOption.IGNORE_CASE)
    private val AMOUNT_LEADS = Regex("^$AMOUNT_CORE", RegexOption.IGNORE_CASE)
    private const val PAID_TO_REACH = 3
    private val SUCCESS_SCREEN_MARKERS = phraseRegex(listOf("share screenshot", "see details", "banking name", "share receipt"))

    private fun phraseRegex(phrases: List<String>, extraAlternative: String? = null): Regex {
        val alternatives = phrases.map { phrase ->
            "(?<![A-Za-z])" + phrase.split(" ").joinToString("""\s+""") + "(?![A-Za-z])"
        } + listOfNotNull(extraAlternative)
        return Regex(alternatives.joinToString("|") { "(?:$it)" }, RegexOption.IGNORE_CASE)
    }

    // ---- Parsing ----

    private class StatusHit(val nodeIndex: Int, val phrase: String)

    private class AmountHit(val nodeIndex: Int, val value: BigDecimal)

    /**
     * @param notBeforeMillis when set, a payment whose on-screen date is earlier (the app's install time) is rejected
     *   as [RejectReason.BEFORE_INSTALL]: it is an old payment being viewed, not one just made.
     */
    fun parse(
        snapshot: ScreenSnapshot,
        notBeforeMillis: Long? = null,
        zone: ZoneId = ZoneId.systemDefault(),
        nowMillis: Long = System.currentTimeMillis(),
    ): ParseResult {
        val texts = mergeSplitAmounts(snapshot.nodes.map { searchableText(it) })
        if (texts.all { it.isEmpty() }) {
            return ParseResult.Rejected(RejectReason.EMPTY_SNAPSHOT, "no text on screen", false)
        }

        val failure = findStatus(texts, FAILURE)
        val pending = findStatus(texts, PENDING)
        val success = findStatus(texts, SUCCESS, SUCCESS_WORDS) ?: findPaidToSignature(texts)

        if (failure == null && pending == null && success == null) {
            return ParseResult.Rejected(RejectReason.NO_STATUS_PHRASE, "no recognised status phrase", false)
        }
        val present = listOfNotNull(failure, pending, success)
        if (present.size > 1) {
            val detail = listOfNotNull(
                failure?.let { "failure '${it.phrase}'" },
                pending?.let { "pending '${it.phrase}'" },
                success?.let { "success '${it.phrase}'" },
            ).joinToString(" + ")
            return ParseResult.Rejected(RejectReason.CONFLICTING_STATUS, detail, true)
        }
        val hit = present.single()
        val status = when {
            failure != null -> TxnStatus.FAILED
            pending != null -> TxnStatus.PENDING
            else -> TxnStatus.SUCCESS
        }

        val amount = when (val choice = chooseAmount(texts, hit.nodeIndex)) {
            is AmountChoice.Chosen -> choice.value
            is AmountChoice.Rejected -> return choice.result
        }

        val shownAt = ScreenDates.nearest(texts, hit.nodeIndex, zone, nowMillis)
        if (notBeforeMillis != null && shownAt != null && shownAt.endMillis < notBeforeMillis) {
            return ParseResult.Rejected(
                RejectReason.BEFORE_INSTALL,
                "${amount.toPlainString()} $status dated '${shownAt.text}', before the app was installed",
                true,
            )
        }

        val reference = referenceOf(texts)
        return ParseResult.Candidate(
            amount = amount,
            status = status,
            direction = directionOf(texts, hit.phrase),
            merchant = merchantOf(texts),
            upiRef = reference.ref,
            refExtractionFailure = reference.failure,
            statusPhrase = hit.phrase,
            statusNodeIndex = hit.nodeIndex,
            shownAtMillis = shownAt?.startMillis,
        )
    }

    /** Joins a currency-only node with the number-only node right after it; the number's slot becomes blank. */
    private fun mergeSplitAmounts(texts: List<String>): List<String> {
        val out = texts.toMutableList()
        for (i in 0 until out.size - 1) {
            if (CURRENCY_ONLY.matches(out[i]) && NUMBER_ONLY.matches(out[i + 1])) {
                out[i] = "₹" + out[i + 1]
                out[i + 1] = ""
            }
        }
        return out
    }

    /**
     * GPay (Flutter) draws the tick, amount and "Paid to <name>" as a few nodes whose grouping changes between redraws:
     * a node led by the amount, with "Paid to"/"Sent to" in it or in one of the next [PAID_TO_REACH] non-empty nodes.
     */
    private fun findPaidToSignature(texts: List<String>): StatusHit? {
        if (texts.none { SUCCESS_SCREEN_MARKERS.containsMatchIn(it) }) return null
        for ((index, text) in texts.withIndex()) {
            if (!AMOUNT_LEADS.containsMatchIn(text)) continue
            val window = (index until texts.size).filter { texts[it].isNotEmpty() }.take(PAID_TO_REACH + 1)
            val hit = window.firstOrNull { PAID_TO_ANYWHERE.containsMatchIn(texts[it]) } ?: continue
            return StatusHit(hit, if (hit == index) text else "$text + ${texts[hit]}")
        }
        return null
    }

    /** Text plus content description (when different), whitespace-normalised; empty when the node has neither. */
    private fun searchableText(node: TextNode): String {
        val text = node.text.orEmpty()
        val description = node.contentDescription.orEmpty()
        val joined = if (description.isEmpty() || description == text) text else "$text $description"
        return joined.replace(WHITESPACE, " ").trim()
    }

    /**
     * The first node holding a phrase of [regex]; failing that, the first two consecutive non-empty nodes that only
     * hold it together ("Payment" / "Successful" drawn as two views). The hit is placed at the first of the two.
     */
    private fun findStatus(texts: List<String>, regex: Regex, splitRegex: Regex = regex): StatusHit? {
        for ((index, text) in texts.withIndex()) {
            regex.find(text)?.let { return StatusHit(index, it.value) }
        }
        val nonEmpty = texts.indices.filter { texts[it].isNotEmpty() }
        for ((a, b) in nonEmpty.zipWithNext()) {
            val first = texts[a]
            val joined = "$first ${texts[b]}"
            val match = splitRegex.find(joined) ?: continue
            // Only a phrase that starts in the first node and ends in the second is a split phrase.
            if (match.range.first < first.length && match.range.last > first.length) return StatusHit(a, match.value)
        }
        return null
    }

    /** Status phrases on [snapshot] (failure, pending, success; split ones too), for the live log. */
    fun statusPhrases(snapshot: ScreenSnapshot): List<String> {
        val texts = mergeSplitAmounts(snapshot.nodes.map { searchableText(it) })
        return listOfNotNull(
            findStatus(texts, FAILURE)?.phrase,
            findStatus(texts, PENDING)?.phrase,
            (findStatus(texts, SUCCESS, SUCCESS_WORDS) ?: findPaidToSignature(texts))?.phrase,
        )
    }

    private fun directionOf(texts: List<String>, statusPhrase: String): Direction {
        val debit = texts.any { DEBIT.containsMatchIn(it) }
        val credit = texts.any { CREDIT.containsMatchIn(it) }
        return when {
            debit && !credit -> Direction.DEBIT
            credit && !debit -> Direction.CREDIT
            !debit && !credit && OUTGOING_SUCCESS.containsMatchIn(statusPhrase) -> Direction.DEBIT
            else -> Direction.UNKNOWN
        }
    }

    /** Conservative: the text after a lead-in in the same node, else the next node; null when that text is not plainly a name. */
    private fun merchantOf(texts: List<String>): String? {
        for ((index, text) in texts.withIndex()) {
            val leadIn = MERCHANT_LEAD_IN.find(text) ?: continue
            val rest = text.substring(leadIn.range.last + 1).trim()
            val candidate = rest.ifEmpty { texts.getOrNull(index + 1).orEmpty() }.trim()
            if (!isUnusableAsName(candidate)) return candidate
        }
        return null
    }

    private class RefResult(val ref: String?, val failure: String?)

    /**
     * A reference counts only when a recognised label is directly followed (same node, else next node) by exactly
     * 12 digits. The first valid one wins; otherwise the first labelled-but-invalid one is reported as a failure.
     */
    private fun referenceOf(texts: List<String>): RefResult {
        var firstFailure: String? = null
        for ((index, text) in texts.withIndex()) {
            for (label in REF_LABEL.findAll(text)) {
                val sameNode = text.substring(label.range.last + 1).trimStart(*REF_SEPARATORS).trim()
                val value = sameNode.ifEmpty { texts.getOrNull(index + 1).orEmpty().trimStart(*REF_SEPARATORS) }
                val name = label.value.trim()
                val token = REF_VALUE_TOKEN.find(value)?.value
                if (token == null) {
                    if (firstFailure == null) {
                        firstFailure = if (value.isEmpty()) {
                            "label '$name' not followed by a value"
                        } else {
                            "label '$name' followed by '${value.take(MAX_ECHO)}' (non-numeric)"
                        }
                    }
                    continue
                }
                val compact = token.replace(" ", "")
                if (compact.all { it.isDigit() }) {
                    if (compact.length == REF_DIGITS) return RefResult(compact, null)
                    if (firstFailure == null) firstFailure = "label '$name' followed by '$token' (${compact.length} digits)"
                } else if (firstFailure == null) {
                    firstFailure = "label '$name' followed by '$token' (non-numeric)"
                }
            }
        }
        return RefResult(null, firstFailure)
    }

    private fun isUnusableAsName(text: String): Boolean =
        text.isEmpty() ||
            AMOUNT.containsMatchIn(text) ||
            FAILURE.containsMatchIn(text) ||
            PENDING.containsMatchIn(text) ||
            SUCCESS.containsMatchIn(text) ||
            REF_LABEL.containsMatchIn(text) ||
            TWELVE_DIGITS.containsMatchIn(text)

    private sealed interface AmountChoice {
        class Chosen(val value: BigDecimal) : AmountChoice
        class Rejected(val result: ParseResult.Rejected) : AmountChoice
    }

    private fun findAmounts(texts: List<String>): List<AmountHit> = texts.flatMapIndexed { index, text ->
        AMOUNT.findAll(text).mapNotNull { match ->
            val whole = match.groupValues[1].replace(",", "")
            val fraction = match.groupValues[2].ifEmpty { "0" }
            val value = BigDecimal("$whole.$fraction").setScale(2)
            if (value.signum() == 0) null else AmountHit(index, value)
        }.toList()
    }

    private fun chooseAmount(texts: List<String>, statusIndex: Int): AmountChoice {
        val amounts = findAmounts(texts)
        if (amounts.isEmpty()) {
            return AmountChoice.Rejected(ParseResult.Rejected(RejectReason.NO_AMOUNT, "no amount with a currency prefix", true))
        }
        val distanceByValue = amounts.groupBy({ it.value }, { abs(it.nodeIndex - statusIndex) })
            .mapValues { (_, distances) -> distances.min() }
        val nearest = distanceByValue.values.min()
        val tied = distanceByValue.filterValues { it == nearest }.keys.sorted()
        if (tied.size > 1) {
            val detail = "amounts tied at distance $nearest from the status phrase: " +
                tied.joinToString(", ") { it.toPlainString() }
            return AmountChoice.Rejected(ParseResult.Rejected(RejectReason.AMBIGUOUS_AMOUNT, detail, true))
        }
        return AmountChoice.Chosen(tied.single())
    }
}
