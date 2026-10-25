package io.yestack.upidetector.core

import java.math.BigDecimal

/** Text helpers shared by [ConfirmScreenParser] and [HistoryScreen]. Same normalisation as [UpiTextParser]. */
internal object ScreenText {
    const val AMOUNT_CORE = """(?:₹|(?<![A-Za-z])(?:rs\.?|inr))\s?(\d+(?:,\d+)*)(?:\.(\d{1,2}))?(?!\d)"""
    val AMOUNT = Regex(AMOUNT_CORE, RegexOption.IGNORE_CASE)

    private val WHITESPACE = Regex("""[\s ​]+""")
    private val CURRENCY_ONLY = Regex("""^(?:₹|rs\.?|inr)$""", RegexOption.IGNORE_CASE)
    val NUMBER_ONLY = Regex("""^\d+(?:,\d+)*(?:\.\d{1,2})?$""")

    class AmountHit(val nodeIndex: Int, val value: BigDecimal)

    /** One string per node: text plus content description (when different), whitespace-normalised, split amounts joined. */
    fun texts(snapshot: ScreenSnapshot): List<String> {
        val out = snapshot.nodes.map { node ->
            val text = node.text.orEmpty()
            val description = node.contentDescription.orEmpty()
            normalise(if (description.isEmpty() || description == text) text else "$text $description")
        }.toMutableList()
        // A currency-only node followed by a number-only node is one amount; the number's slot becomes blank.
        for (i in 0 until out.size - 1) {
            if (CURRENCY_ONLY.matches(out[i]) && NUMBER_ONLY.matches(out[i + 1])) {
                out[i] = "₹" + out[i + 1]
                out[i + 1] = ""
            }
        }
        return out
    }

    fun normalise(s: String): String = s.replace(WHITESPACE, " ").trim()

    /** "₹ 11" in one node: the sign set apart from the number, as an amount entry draws it. */
    private val SPACED_AMOUNT = Regex("""^(?:₹|rs\.?|inr)\s+(\d+(?:,\d+)*)(?:\.(\d{1,2}))?$""", RegexOption.IGNORE_CASE)

    /**
     * Amounts drawn the way an amount entry draws them: a currency-only node followed by a number-only node ("₹", "11"),
     * or the two in one node with a space ("₹ 11"). A past payment's card draws "₹11" in one node, so it is not one.
     * The hit is at the currency node.
     */
    fun entryAmounts(snapshot: ScreenSnapshot): List<AmountHit> {
        val raw = snapshot.nodes.map { normalise(it.text.orEmpty()) }
        val out = ArrayList<AmountHit>()
        for (i in raw.indices) {
            val next = raw.getOrNull(i + 1)
            if (CURRENCY_ONLY.matches(raw[i]) && next != null && NUMBER_ONLY.matches(next)) {
                val value = BigDecimal(next.replace(",", "")).setScale(2)
                if (value.signum() != 0) out += AmountHit(i, value)
            } else {
                SPACED_AMOUNT.matchEntire(raw[i])?.let { m -> valueOf(m)?.let { out += AmountHit(i, it) } }
            }
        }
        return out
    }

    /** Every non-zero currency-prefixed amount, with the node it is in. */
    fun amounts(texts: List<String>): List<AmountHit> = texts.flatMapIndexed { index, text ->
        AMOUNT.findAll(text).mapNotNull { match -> valueOf(match)?.let { AmountHit(index, it) } }.toList()
    }

    /** The value of an [AMOUNT] (or [AMOUNT_CORE]-based) match whose first two groups are the whole and fraction parts. */
    fun valueOf(match: MatchResult, firstGroup: Int = 1): BigDecimal? {
        val whole = match.groupValues[firstGroup].replace(",", "")
        val fraction = match.groupValues[firstGroup + 1].ifEmpty { "0" }
        val value = BigDecimal("$whole.$fraction").setScale(2)
        return if (value.signum() == 0) null else value
    }

    fun phraseRegex(phrases: List<String>): Regex = Regex(
        phrases.joinToString("|") { "(?:(?<![A-Za-z])" + it.split(" ").joinToString("""\s+""") + "(?![A-Za-z]))" },
        RegexOption.IGNORE_CASE,
    )
}
