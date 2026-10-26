package io.yestack.upidetector.core

import java.math.BigDecimal
import java.time.LocalDateTime
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The read pipeline end to end: every window of the app parsed on its own, one chosen, detector decisions, note prompt.
 * Window texts follow the owner's PhonePe screenshots (24 Oct 2026) with neutral names and numbers; PhonePe shows its
 * processing and result screens in a window above the chat, which the old single-window read never looked at.
 */
class PaymentPipelineTest {

    private val ist = ZoneId.of("Asia/Kolkata")
    private fun at(text: String): Long = LocalDateTime.parse(text).atZone(ist).toInstant().toEpochMilli()

    private val phonePe = "com.phonepe.app"
    private val gpay = "com.google.android.apps.nbu.paisa.user"
    private val chatActivity = "com.phonepe.app.chat.chatframework.ui.view.activity.Navigator_ChatActivity"
    private val bankSms = "com.google.android.apps.messaging"

    private fun window(pkg: String, id: Int, vararg texts: String) =
        ScreenSnapshot(pkg, chatActivity, id, texts.map { TextNode(it, null, null) })

    private val chat = window(
        phonePe, 10,
        "Ravi (bro)", "+91 ••••• •1234", "₹1", "PAID", "1:58 AM", "Today", "₹1", "RECEIVED", "2:49 PM",
        "₹11", "PAID", "3:40 PM", "Enter amount or chat",
    )
    private val processing = window(phonePe, 20, "Processing payment", "₹1", "Ravi (bro)")
    private val result = window(
        phonePe, 20,
        "Payment Successful", "24 October 2026 at 03:43 PM", "Ravi (bro)", "ravi@okicici", "₹1",
        "Split Expense", "View Details", "Share Receipt", "Install", "Done",
    )
    private val failed = window(
        phonePe, 20,
        "Payment Failed", "24 October 2026 at 03:43 PM", "Ravi (bro)", "₹1", "Retry", "Done",
    )

    private val pipeline = PaymentPipeline()
    private val d get() = pipeline.detector

    private fun read(now: Long, vararg windows: ScreenSnapshot) = pipeline.onRead(windows.toList(), null, now, ist)

    private fun session(now: Long, pkg: String = phonePe) {
        pipeline.forgetLastRead()
        d.onScreenChanged(pkg, chatActivity, 1, now)
    }

    // ---- windows ------------------------------------------------------------------------------

    @Test
    fun resultWindowAboveTheChatIsRecordedAndPrompts() {
        val now = at("2026-10-24T15:43:05")
        session(now)
        val outcome = read(now, result, chat)!!
        assertEquals(0, outcome.chosen)
        assertTrue(outcome.decisions.any { it is Decision.Inserted })
        assertEquals(1L, outcome.notePayment?.id)
        assertEquals(0, BigDecimal("1").compareTo(d.expenseTotal()))
        // The chat below was parsed too, on its own, and not merged into the result.
        assertTrue(outcome.windows[1].result is ParseResult.Rejected)
    }

    @Test
    fun chatAloneRecordsNothing() {
        val now = at("2026-10-24T15:40:00")
        session(now)
        val outcome = read(now, chat)!!
        assertEquals(RejectReason.NO_STATUS_PHRASE, (outcome.windows.single().result as ParseResult.Rejected).reason)
        assertTrue(d.transactions.isEmpty())
        assertNull(outcome.notePayment)
    }

    @Test
    fun windowOrderDoesNotHideTheResult() {
        // The window list can put the chat first (the active window); the result window still decides.
        val now = at("2026-10-24T15:43:05")
        session(now)
        val outcome = read(now, chat, result)!!
        assertEquals(1, outcome.chosen)
        assertEquals(1, d.transactions.size)
    }

    @Test
    fun ambiguousTopWindowIsNotOverriddenByAWindowBelow() {
        // Top window: a status phrase with two amounts at the same distance (rejected); below: a clean result.
        val ambiguous = window(phonePe, 30, "₹5", "Payment Successful", "₹7", "Done")
        val now = at("2026-10-24T15:43:05")
        session(now)
        val outcome = read(now, ambiguous, result)!!
        assertEquals(0, outcome.chosen)
        assertEquals(RejectReason.AMBIGUOUS_AMOUNT, (outcome.windows[0].result as ParseResult.Rejected).reason)
        assertTrue(d.transactions.isEmpty())
    }

    @Test
    fun choosePrefersTheTopMostWindowWithAStatusPhrase() {
        val none = ParseResult.Rejected(RejectReason.NO_STATUS_PHRASE, "", false)
        val phrase = ParseResult.Rejected(RejectReason.NO_AMOUNT, "", true)
        assertEquals(0, PaymentPipeline.choose(listOf(none, none)))
        assertEquals(1, PaymentPipeline.choose(listOf(none, phrase, phrase)))
    }

    @Test(expected = IllegalArgumentException::class)
    fun aReadIsOfOneAppOnly() {
        read(at("2026-10-24T15:43:05"), result, window("io.yestack.upidetector", 99, "Payment Successful", "₹1"))
    }

    // ---- statuses -----------------------------------------------------------------------------

    @Test
    fun processingThenSuccessIsOnePaymentUpgraded() {
        val t0 = at("2026-10-24T15:43:01")
        session(t0)
        read(t0, processing, chat)
        assertEquals(TxnStatus.PENDING, d.transactions.single().status)
        assertEquals(0, BigDecimal.ZERO.compareTo(d.expenseTotal()))

        val outcome = read(t0 + 2_000, result, chat)!!
        val updated = outcome.decisions.filterIsInstance<Decision.Updated>().single()
        assertEquals(TxnStatus.PENDING, updated.previousStatus)
        assertEquals(TxnStatus.SUCCESS, d.transactions.single().status)
        assertEquals(Direction.DEBIT, d.transactions.single().direction)
        assertEquals(1L, outcome.notePayment?.id)
        assertEquals(0, BigDecimal("1").compareTo(d.expenseTotal()))
    }

    @Test
    fun failedPaymentIsRecordedButNotAnExpense() {
        val now = at("2026-10-24T15:43:05")
        session(now)
        val outcome = read(now, failed, chat)!!
        assertEquals(TxnStatus.FAILED, d.transactions.single().status)
        assertNull(outcome.notePayment)
        assertEquals(0, BigDecimal.ZERO.compareTo(d.expenseTotal()))
    }

    @Test
    fun failureIsCheckedFirst() {
        // A screen showing both a failure and a success phrase is never saved as either.
        val both = window(phonePe, 20, "Payment Failed", "₹1", "Payment Successful", "Done")
        val now = at("2026-10-24T15:43:05")
        session(now)
        val outcome = read(now, both)!!
        assertEquals(RejectReason.CONFLICTING_STATUS, (outcome.windows.single().result as ParseResult.Rejected).reason)
        assertTrue(d.transactions.isEmpty())
    }

    // ---- redraws and background transitions ---------------------------------------------------

    @Test
    fun anIdenticalReadIsSkippedUntilTheScreenChanges() {
        val now = at("2026-10-24T15:43:05")
        session(now)
        assertNotNull(read(now, result, chat))
        assertNull(read(now + 100, result, chat))
        session(now + 200)
        assertNotNull(read(now + 300, result, chat))
        assertEquals(0, BigDecimal("1").compareTo(d.expenseTotal()))
    }

    @Test
    fun resultSeenAgainAfterBackgroundIsNotASecondExpense() {
        val t0 = at("2026-10-24T15:43:05")
        session(t0)
        read(t0, result, chat)
        d.onAppBackground(phonePe, t0 + 5_000)
        session(t0 + 10_000)
        val again = read(t0 + 10_500, result, chat)!!
        assertNull(again.notePayment)
        assertEquals(0, BigDecimal("1").compareTo(d.expenseTotal()))
    }

    // ---- UPI reference and notification cross-check -------------------------------------------

    private fun gpaySuccess(amount: String, ref: String? = null) = ScreenSnapshot(
        gpay, "MainActivity", 5,
        (listOf("Payment successful", "₹$amount", "Paid to Ravi") + listOfNotNull(ref?.let { "UPI transaction ID" }, ref))
            .map { TextNode(it, null, null) },
    )

    @Test
    fun sameUpiRefInAnotherSessionIsTheSamePayment() {
        val t0 = at("2026-10-24T15:00:00")
        session(t0, gpay)
        read(t0, gpaySuccess("50", "123456789012"))
        session(t0 + 120_000, gpay)
        read(t0 + 120_000, gpaySuccess("50", "123456789012"))
        assertEquals(1, d.transactions.size)
        assertEquals("123456789012", d.transactions.single().upiRef)
    }

    @Test
    fun differentUpiRefsAreDifferentPayments() {
        val t0 = at("2026-10-24T15:00:00")
        session(t0, gpay)
        read(t0, gpaySuccess("50", "123456789012"))
        session(t0 + 10_000, gpay)
        read(t0 + 10_000, gpaySuccess("50", "210987654321"))
        assertEquals(2, d.transactions.size)
        assertTrue(d.transactions.all { it.flag == null })
        assertEquals(0, BigDecimal("100").compareTo(d.expenseTotal()))
    }

    @Test
    fun bankSmsAttachesToTheOnlyMatchingRecord() {
        val t0 = at("2026-10-24T15:53:56")
        session(t0, gpay)
        read(t0, gpaySuccess("1"))
        val hit = NotificationHit(bankSms, BigDecimal("1.00"), "182767326152", Direction.DEBIT, t0 + 53_000)
        d.onNotification(hit, t0 + 53_000)
        assertEquals("182767326152", d.transactions.single().upiRef)
    }

    @Test
    fun bankSmsAfterAnotherAppsPaymentWaitsForThatAppsRecord() {
        // GPay ₹1 recorded; then a PhonePe PIN screen (a PhonePe payment starts); then the bank SMS for ₹1.
        val t0 = at("2026-10-24T15:53:56")
        session(t0, gpay)
        read(t0, gpaySuccess("1"))
        d.onPaymentAttempt(phonePe, t0 + 40_000)
        val hit = NotificationHit(bankSms, BigDecimal("1.00"), "182767326152", Direction.DEBIT, t0 + 53_000)
        val pending = d.onNotification(hit, t0 + 53_000).filterIsInstance<Decision.NotificationChecked>().single()
        assertNull(pending.txn)
        assertTrue(pending.logLine, pending.logLine.contains("PhonePe payment started after it"))
        assertNull(d.transactions.single().upiRef)

        // PhonePe's result is captured: the waiting SMS goes to it, not to the GPay record.
        val t1 = at("2026-10-24T15:54:55")
        session(t1)
        val outcome = read(t1, window(phonePe, 20, "Payment Successful", "24 October 2026 at 03:54 PM", "₹1", "Done"))!!
        val confirmed = outcome.decisions.filterIsInstance<Decision.NotificationChecked>().single().txn!!
        assertEquals(phonePe, confirmed.sourceApp)
        assertEquals("182767326152", confirmed.upiRef)
        assertNull(d.transactions.single { it.sourceApp == gpay }.upiRef)
    }

    @Test
    fun upiAppNotificationIsNotHeldBackByAnotherAppsAttempt() {
        // A PhonePe notification names its app, so a GPay attempt in between does not matter.
        val t0 = at("2026-10-24T15:43:05")
        session(t0)
        read(t0, result, chat)
        d.onPaymentAttempt(gpay, t0 + 10_000)
        d.onNotification(NotificationHit(phonePe, BigDecimal("1.00"), "017114352274", Direction.DEBIT, t0 + 20_000), t0 + 20_000)
        assertEquals("017114352274", d.transactions.single().upiRef)
    }
}
