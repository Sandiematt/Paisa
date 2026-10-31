package io.yestack.upidetector.core

import java.math.BigDecimal
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

internal fun snap(vararg texts: String?): ScreenSnapshot =
    ScreenSnapshot("com.example.upi", null, 1, texts.map { TextNode(it, null, null) })

internal fun ParseResult.candidate(): ParseResult.Candidate =
    this as? ParseResult.Candidate ?: throw AssertionError("expected Candidate but was $this")

internal fun ParseResult.rejected(): ParseResult.Rejected =
    this as? ParseResult.Rejected ?: throw AssertionError("expected Rejected but was $this")

internal fun amt(s: String): BigDecimal = BigDecimal(s).setScale(2)

class UpiTextParserTest {

    @Test
    fun gpayPaymentSuccessful() {
        val c = UpiTextParser.parse(
            snap("₹1.00", "Paid to Ravi Kumar", "Payment successful"),
        ).candidate()
        assertEquals(amt("1"), c.amount)
        assertEquals(TxnStatus.SUCCESS, c.status)
        assertEquals("Payment successful", c.statusPhrase)
        assertEquals(2, c.statusNodeIndex)
    }
}
