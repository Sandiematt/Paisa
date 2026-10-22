package io.yestack.upidetector.core

import java.time.LocalDateTime
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Screens transcribed from the owner's phone (GPay and PhonePe success screens, 23 Oct 2026). */
class UpiTextParserRealScreensTest {

    private val ist = ZoneId.of("Asia/Kolkata")
    private fun at(text: String): Long = LocalDateTime.parse(text).atZone(ist).toInstant().toEpochMilli()
    private val now = at("2026-10-23T01:30:00")

    private fun parse(snapshot: ScreenSnapshot, notBefore: Long? = null) =
        UpiTextParser.parse(snapshot, notBefore, ist, now)

    private val gpay = arrayOf(
        "₹1", "Paid to", "SANJAY MATHEW", "Banking name: SANJAY MATHEW", "23 October 2026, 1:24am",
        "POWERED BY", "Share screenshot", "See details", "Get 3.2% back", "On your everyday spends", "Apply for Flex", "Done",
    )

    private val phonePe = arrayOf(
        "Payment Successful", "23 October 2026 at 01:23 AM", "Mathen (bro)", "sanjay.mathewofficial2020-2@okicici",
        "₹1", "Split Expense", "View Details", "Share Receipt", "Slikk", "4.3", "Google Play", "Install", "Done",
    )

    @Test
    fun gpaySuccessScreenWithoutAnySuccessfulText() {
        val c = parse(snap(*gpay)).candidate()
        assertEquals(amt("1"), c.amount)
        assertEquals(TxnStatus.SUCCESS, c.status)
        assertEquals(Direction.DEBIT, c.direction)
        assertEquals("SANJAY MATHEW", c.merchant)
        assertEquals(at("2026-10-23T01:24:00"), c.shownAtMillis)
    }

    @Test
    fun gpayAmountSplitIntoCurrencyAndNumberNodes() {
        val split = arrayOf("₹", "1") + gpay.drop(1)
        val c = parse(snap(*split)).candidate()
        assertEquals(amt("1"), c.amount)
        assertEquals(TxnStatus.SUCCESS, c.status)
    }

    @Test
    fun gpayTickNodeBetweenAmountAndPaidTo() {
        val withTick = arrayOf("₹1", "Success tick") + gpay.drop(1)
        val c = parse(snap(*withTick)).candidate()
        assertEquals(TxnStatus.SUCCESS, c.status)
        assertEquals("SANJAY MATHEW", c.merchant)
    }

    @Test
    fun gpayFlutterMergedCard() {
        // Flutter can merge the card into one semantics node.
        val merged = snap(
            "₹1 Paid to Sanjay Mathew Banking name: SANJAY MATHEW 23 October 2026, 1:24am",
            "Share screenshot", "See details", "Done",
        )
        val c = parse(merged).candidate()
        assertEquals(amt("1"), c.amount)
        assertEquals(TxnStatus.SUCCESS, c.status)
        assertEquals(Direction.DEBIT, c.direction)
        assertEquals(at("2026-10-23T01:24:00"), c.shownAtMillis)
    }

    @Test
    fun gpayPaidToTooFarFromAmountIsNotASuccess() {
        val far = snap("₹1", "a", "b", "c", "d", "Paid to", "Ravi", "See details")
        assertEquals(RejectReason.NO_STATUS_PHRASE, parse(far).rejected().reason)
    }

    @Test
    fun phonePeSuccessIsDebitAndDated() {
        val c = parse(snap(*phonePe)).candidate()
        assertEquals(amt("1"), c.amount)
        assertEquals(TxnStatus.SUCCESS, c.status)
        assertEquals(Direction.DEBIT, c.direction)
        assertEquals(at("2026-10-23T01:23:00"), c.shownAtMillis)
    }

    @Test
    fun paymentsShownAfterInstallAreKept() {
        val installed = at("2026-10-23T00:50:00")
        parse(snap(*gpay), installed).candidate()
        parse(snap(*phonePe), installed).candidate()
    }

    @Test
    fun paymentsShownBeforeInstallAreRejected() {
        val installed = at("2026-10-23T01:25:00")
        assertEquals(RejectReason.BEFORE_INSTALL, parse(snap(*gpay), installed).rejected().reason)
        assertEquals(RejectReason.BEFORE_INSTALL, parse(snap(*phonePe), installed).rejected().reason)
    }

    @Test
    fun paymentInTheInstallMinuteIsKept() {
        // Screen shows 1:24 with minute precision; installed at 1:24:30 -> can't tell, so keep it.
        parse(snap(*gpay), at("2026-10-23T01:24:30")).candidate()
    }

    @Test
    fun yearLessChatDateBeforeInstallIsRejected() {
        val chat = snap("₹500", "Payment Successful", "12 Oct, 9:15 PM")
        assertEquals(RejectReason.BEFORE_INSTALL, parse(chat, at("2026-10-23T00:50:00")).rejected().reason)
    }

    @Test
    fun yesterdayBeforeInstallIsRejected() {
        val chat = snap("₹3", "Payment Successful", "Yesterday, 10:15 PM")
        assertEquals(RejectReason.BEFORE_INSTALL, parse(chat, at("2026-10-23T00:50:00")).rejected().reason)
    }

    @Test
    fun undatedScreenIsKeptAndHasNoDate() {
        val c = parse(snap("₹1", "Payment Successful"), at("2026-10-23T01:25:00")).candidate()
        assertNull(c.shownAtMillis)
    }

    @Test
    fun gpayHistoryRowWithoutSuccessControlsIsNotASuccess() {
        val history = snap("Ravi Kumar", "₹50", "Paid to Ravi Kumar", "12 Oct")
        assertEquals(RejectReason.NO_STATUS_PHRASE, parse(history).rejected().reason)
    }

    @Test
    fun numericDateIsDayFirst() {
        val c = parse(snap("₹1", "Payment Successful", "23/10/2026 01:23 AM")).candidate()
        assertEquals(at("2026-10-23T01:23:00"), c.shownAtMillis)
    }
}
