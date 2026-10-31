package io.yestack.upidetector.core

import java.math.BigDecimal
import org.junit.Assert.assertEquals
import org.junit.Test

/** Synthetic node lists only: no real confirm-screen captures exist yet. */
class ConfirmScreenParserTest {

    private fun parse(vararg texts: String?) = ConfirmScreenParser.parse(snap(*texts))

    private fun ConfirmResult.candidate(): ConfirmResult.Candidate =
        this as? ConfirmResult.Candidate ?: throw AssertionError("expected Candidate but was $this")

    private fun ConfirmResult.reason(): ConfirmRejectReason =
        (this as? ConfirmResult.Rejected)?.reason ?: throw AssertionError("expected Rejected but was $this")

    // ---- accepted -----------------------------------------------------------------------

    @Test
    fun payButtonCarryingTheAmount() {
        val c = parse("Paying Ravi Kumar", "ravi@okaxis", "Add a note", "Pay ₹500").candidate()
        assertEquals(BigDecimal("500.00"), c.amount)
        assertEquals("Pay ₹500", c.payButton)
    }

    @Test
    fun splitAmountAbovePlainPayButton() {
        val c = parse("Ravi Kumar", "₹", "1,250.50", "Add a note", "PAY").candidate()
        assertEquals(BigDecimal("1250.50"), c.amount)
    }

    @Test
    fun payButtonInContentDescription() {
        val s = ScreenSnapshot(
            "com.example.upi", null, 1,
            listOf(TextNode("₹99", null, null), TextNode(null, "Proceed to pay", null)),
        )
        assertEquals(BigDecimal("99.00"), ConfirmScreenParser.parse(s).candidate().amount)
    }

    @Test
    fun picksTheAmountNearestThePayButton() {
        val c = parse("Bank balance ₹10,000", "HDFC Bank", "Ravi Kumar", "₹250", "Pay now").candidate()
        assertEquals(BigDecimal("250.00"), c.amount)
    }

    @Test
    fun sameAmountTwiceIsNotATie() {
        assertEquals(BigDecimal("500.00"), parse("₹500", "Pay ₹500", "₹500").candidate().amount)
    }

    // ---- rejected -----------------------------------------------------------------------

    @Test
    fun successScreenIsRejected() {
        assertEquals(
            ConfirmRejectReason.RESULT_SCREEN,
            parse("₹500", "Paid to Ravi Kumar", "Payment successful", "Pay").reason(),
        )
    }

    @Test
    fun failureAndPendingScreensAreRejected() {
        assertEquals(ConfirmRejectReason.RESULT_SCREEN, parse("₹500", "Payment failed", "Pay").reason())
        assertEquals(ConfirmRejectReason.RESULT_SCREEN, parse("₹500", "Payment pending", "Pay").reason())
    }

    @Test
    fun pinEntryIsRejected() {
        assertEquals(ConfirmRejectReason.PIN_SCREEN, parse("Enter UPI PIN", "₹500", "Pay").reason())
        assertEquals(ConfirmRejectReason.PIN_SCREEN, parse("Enter 6-digit MPIN", "₹500", "Pay").reason())
    }

    @Test
    fun noAmountIsRejected() {
        assertEquals(ConfirmRejectReason.NO_AMOUNT, parse("Ravi Kumar", "500", "Pay").reason())
    }

    @Test
    fun tiedAmountsAreRejected() {
        assertEquals(ConfirmRejectReason.AMBIGUOUS_AMOUNT, parse("₹100", "Pay", "₹200").reason())
    }

    @Test
    fun payWordInsideOtherLabelsIsNotAPayButton() {
        assertEquals(
            ConfirmRejectReason.NO_PAY_BUTTON,
            parse("Pay anyone", "Scan & Pay", "Paid ₹50 to Ravi", "₹500").reason(),
        )
    }

    @Test
    fun emptyScreenIsRejected() {
        assertEquals(ConfirmRejectReason.EMPTY_SNAPSHOT, parse(null, "  ").reason())
    }
}
