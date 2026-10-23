package io.yestack.upidetector.core

import java.math.BigDecimal

/**
 * Reads a UPI app or bank-SMS notification. Returns a [NotificationHit] only when it carries both a currency amount
 * and a labelled 12-digit UPI reference; anything else (OTPs, promos, chats) is null. Never throws.
 */
object NotificationParser {
    private const val NUMBER = """(\d+(?:,\d+)*)(?:\.(\d{1,2}))?(?!\d)"""
    private val CURRENCY_AMOUNT = Regex("""(?:₹|(?<![A-Za-z])(?:rs\.?|inr))\s?$NUMBER""", RegexOption.IGNORE_CASE)

    /** Bank phrasing without a currency sign: "debited by 1.0", "credited for 500". */
    private val BANK_AMOUNT = Regex("""(?<![A-Za-z])(?:debited|credited)\s+(?:by|for)\s+$NUMBER""", RegexOption.IGNORE_CASE)

    private val REF_LABELLED = Regex(
        """(?<![A-Za-z])(?:UPI\s*Ref(?:\s*No)?|Ref\s*No|Refno|Ref|UTR(?:\s*No)?|RRN|UPI\s*:)[\s:.#-]*(\d{12})(?!\d)""",
        RegexOption.IGNORE_CASE,
    )
    private val REF_PATH = Regex("""(?<![A-Za-z])UPI/[A-Za-z0-9]+/(\d{12})(?!\d)""", RegexOption.IGNORE_CASE)

    private val DEBIT_WORD = Regex("""(?<![A-Za-z])(?:debited|sent|paid|debit)(?![A-Za-z])""", RegexOption.IGNORE_CASE)
    private val CREDIT_WORD = Regex("""(?<![A-Za-z])(?:credited|received|credit)(?![A-Za-z])""", RegexOption.IGNORE_CASE)

    fun parse(sourcePackage: String, title: String?, text: String?, postedAtMillis: Long): NotificationHit? = try {
        val body = listOfNotNull(title, text).joinToString("\n")
        val amount = amountOf(body)
        val ref = refOf(body)
        if (amount == null || ref == null) null
        else NotificationHit(sourcePackage, amount, ref, directionOf(body), postedAtMillis)
    } catch (e: Exception) {
        null
    }

    private fun amountOf(body: String): BigDecimal? =
        firstNonZero(CURRENCY_AMOUNT, body) ?: firstNonZero(BANK_AMOUNT, body)

    private fun firstNonZero(regex: Regex, body: String): BigDecimal? = regex.findAll(body).map {
        val whole = it.groupValues[1].replace(",", "")
        val fraction = it.groupValues[2].ifEmpty { "0" }
        BigDecimal("$whole.$fraction").setScale(2)
    }.firstOrNull { it.signum() != 0 }

    private fun refOf(body: String): String? =
        (REF_LABELLED.find(body) ?: REF_PATH.find(body))?.groupValues?.get(1)

    private fun directionOf(body: String): Direction {
        val debit = DEBIT_WORD.find(body)?.range?.first
        val credit = CREDIT_WORD.find(body)?.range?.first
        return when {
            debit == null && credit == null -> Direction.UNKNOWN
            credit == null -> Direction.DEBIT
            debit == null -> Direction.CREDIT
            debit < credit -> Direction.DEBIT
            else -> Direction.CREDIT
        }
    }
}
