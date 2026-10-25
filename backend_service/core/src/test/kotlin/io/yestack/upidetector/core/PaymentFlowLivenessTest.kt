package io.yestack.upidetector.core

import java.math.BigDecimal
import java.time.LocalDateTime
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * GPay's result screen is trusted because nothing on it looks like history. PhonePe shows its live result in the chat,
 * with "PAID" cards around it, so it used to need a "Done" button and a printed time that are not always drawn yet.
 * Now the payment flow says it is live: a confirm screen (or PIN screen) for that amount just before, not yet used up.
 */
class PaymentFlowLivenessTest {

    private val ist = ZoneId.of("Asia/Kolkata")
    private fun at(text: String): Long = LocalDateTime.parse(text).atZone(ist).toInstant().toEpochMilli()
    private val t0 = at("2026-10-24T17:41:25")

    private val phonePe = "com.phonepe.app"
    private val gpay = "com.google.android.apps.nbu.paisa.user"
    private val chatActivity = "Navigator_ChatActivity"

    private val pipeline = PaymentPipeline()
    private val d get() = pipeline.detector

    private fun window(pkg: String, id: Int, vararg texts: String) =
        ScreenSnapshot(pkg, chatActivity, id, texts.map { TextNode(it, null, null) })

    /** PhonePe's chat right after paying: the success inline, chat cards around it, no "Done" drawn yet. */
    private fun chatWithResult(amount: String = "1") = window(
        phonePe, 10, "Ravi (bro)", "₹1", "PAID", "12:43 PM", "Payment Successful", "₹$amount", "Ravi (bro)",
    )

    private fun read(t: Long, vararg w: ScreenSnapshot): PaymentPipeline.Outcome? {
        pipeline.forgetLastRead()
        return pipeline.onRead(w.toList(), null, t, ist)
    }

    private fun session(t: Long, pkg: String = phonePe) = d.onScreenChanged(pkg, chatActivity, 1, t)

    @Test
    fun resultInTheChatRightAfterAPaySheetIsRecorded() {
        session(t0)
        d.onPaymentAttempt(phonePe, t0, BigDecimal("1"))
        val outcome = read(t0 + 15_000, chatWithResult())!!
        assertTrue(outcome.windows.single().liveByPaymentFlow)
        assertTrue(outcome.decisions.any { it is Decision.Inserted })
        // The note prompt follows any newly recorded expense (as the app does), so it is asked about.
        assertEquals(listOf(1L), NewExpenses().newlyRecorded(d.transactions).map { it.id })
        assertEquals(0, BigDecimal("1").compareTo(d.expenseTotal()))
    }

    @Test
    fun withoutAPaymentStartedTheSameScreenIsRejectedAsBefore() {
        session(t0)
        val outcome = read(t0 + 15_000, chatWithResult())!!
        val rejected = outcome.windows.single().result as ParseResult.Rejected
        assertEquals(RejectReason.HISTORY_SCREEN, rejected.reason)
        assertTrue(rejected.detail, rejected.detail.contains("no payment of this amount started just before"))
        assertTrue(d.transactions.isEmpty())
    }

    @Test
    fun onePaymentStartedConfirmsOneResultOnly() {
        session(t0)
        d.onPaymentAttempt(phonePe, t0, BigDecimal("1"))
        read(t0 + 15_000, chatWithResult())
        // The same chat read again later: the payment is recorded; nothing new, and no second record.
        val again = read(t0 + 120_000, chatWithResult())!!
        assertFalse(again.windows.single().liveByPaymentFlow)
        assertFalse(again.decisions.any { it is Decision.Inserted })
        assertEquals(1, d.transactions.size)
    }

    @Test
    fun aPaySheetForAnotherAmountDoesNotCount() {
        session(t0)
        d.onPaymentAttempt(phonePe, t0, BigDecimal("11"))
        read(t0 + 15_000, chatWithResult("1"))
        assertTrue(d.transactions.isEmpty())
    }

    @Test
    fun aPaymentStartedLongAgoDoesNotCount() {
        session(t0)
        d.onPaymentAttempt(phonePe, t0, BigDecimal("1"))
        read(t0 + DuplicateDetector.LIVE_ATTEMPT_MILLIS + 1_000, chatWithResult())
        assertTrue(d.transactions.isEmpty())
    }

    @Test
    fun aPaymentInAnotherAppDoesNotCount() {
        session(t0)
        d.onPaymentAttempt(gpay, t0, BigDecimal("1"))
        read(t0 + 15_000, chatWithResult())
        assertTrue(d.transactions.isEmpty())
    }

    @Test
    fun anOldPaymentPrintedOnScreenIsRejectedEvenRightAfterAPaySheet() {
        session(t0)
        d.onPaymentAttempt(phonePe, t0, BigDecimal("11"))
        val oldDetail = window(
            phonePe, 30, "Transaction Successful", "03:40 pm on 24 Oct 2026", "Paid to", "Ravi (bro)", "₹11",
            "Send Again", "View History",
        )
        read(at("2026-10-24T17:41:40"), oldDetail)
        assertTrue(d.transactions.isEmpty())
    }

    @Test
    fun pinScreenOnlyFlowCountsForAnyAmount() {
        session(t0)
        d.onScreenChanged(phonePe, "org.npci.upi.security.pinactivitycomponent.GetCredential", 1, t0 + 1_000)
        d.onPaymentAttempt(phonePe, t0 + 1_000)
        session(t0 + 3_000)
        read(t0 + 10_000, chatWithResult("250"))
        assertEquals(0, BigDecimal("250").compareTo(d.expenseTotal()))
    }

    @Test
    fun processingThenSuccessInTheChatIsOnePayment() {
        session(t0)
        d.onPaymentAttempt(phonePe, t0, BigDecimal("1"))
        read(t0 + 5_000, window(phonePe, 10, "Ravi (bro)", "₹1", "PAID", "Processing payment", "₹1"))
        assertEquals(TxnStatus.PENDING, d.transactions.single().status)
        // Pending does not use the payment up, so the success that follows in the chat still counts.
        val done = read(t0 + 9_000, chatWithResult())!!
        assertTrue(done.decisions.any { it is Decision.Updated })
        assertEquals(1, d.transactions.size)
        assertEquals(TxnStatus.SUCCESS, d.transactions.single().status)
    }

    @Test
    fun theNextPaymentToTheSamePersonGetsItsOwnRecord() {
        session(t0)
        d.onPaymentAttempt(phonePe, t0, BigDecimal("1"))
        read(t0 + 15_000, chatWithResult())
        read(t0 + 17_000, window(phonePe, 10, "Ravi (bro)", "₹1", "PAID", "Enter amount or chat"))
        // Same chat, same amount, the pay sheet again: a new payment, not a refresh of the finished one.
        assertTrue(d.onPaymentAttempt(phonePe, t0 + 40_000, BigDecimal("1")))
        read(t0 + 50_000, chatWithResult())
        assertEquals(2, d.transactions.size)
        assertEquals(0, BigDecimal("2").compareTo(d.expenseTotal()))
    }

    @Test
    fun theResultReadAgainAfterAConfirmMatchStaysOneRecord() {
        session(t0)
        d.onPaymentAttempt(phonePe, t0, BigDecimal("1"))
        read(t0 + 15_000, chatWithResult())
        // The note prompt closes over the still-showing result: a ₹1 confirm match, then the same result again.
        repeat(10) { i ->
            val t = t0 + 16_000 + i * 1_200
            d.onPaymentAttempt(phonePe, t, BigDecimal("1"))
            val again = read(t + 300, chatWithResult())!!
            assertFalse(again.decisions.any { it is Decision.Inserted })
        }
        assertEquals(1, d.transactions.size)
        assertEquals(0, BigDecimal("1").compareTo(d.expenseTotal()))
    }

    @Test
    fun gpaySuccessIsAcceptedAsBeforeWithoutAnyPaymentFlow() {
        session(t0, gpay)
        val gpaySuccess = ScreenSnapshot(
            gpay, "MainActivity", 5,
            listOf("₹1", "Paid to", "Ravi Kumar", "Share screenshot", "See details").map { TextNode(it, null, null) },
        )
        val outcome = read(t0, gpaySuccess)!!
        assertFalse(outcome.windows.single().liveByPaymentFlow)
        assertTrue(outcome.decisions.any { it is Decision.Inserted })
    }
}
