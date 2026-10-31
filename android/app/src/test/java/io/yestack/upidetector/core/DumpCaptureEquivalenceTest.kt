package io.yestack.upidetector.core

import io.yestack.upidetector.core.DumpXml.Win
import java.math.BigDecimal
import java.time.LocalDateTime
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A dump must give the payment pipeline exactly the screens its rules were written against. Each flow is replayed
 * twice through a fresh [PaymentPipeline]: once with the screens as snapshots directly, once serialised the way
 * `uiautomator dump --windows` writes them and read back by [UiDumpParser] and [DumpRead]. The snapshots, and every
 * decision, must match.
 *
 * GPay and PhonePe screens are the owner's real captures (23-24 Oct 2026, also in UpiTextParserRealScreensTest and
 * PhonePeLiveScreensTest). No real Paytm capture exists yet; its screen is the synthetic one the parser tests use.
 */
/** Rupees as the parser scales them (in the Shizuku core tests this lives in UpiTextParserTest). */
private fun amt(s: String): BigDecimal = BigDecimal(s).setScale(2)

class DumpCaptureEquivalenceTest {

    private val ist = ZoneId.of("Asia/Kolkata")
    private fun at(text: String): Long = LocalDateTime.parse(text).atZone(ist).toInstant().toEpochMilli()

    private val gpayPkg = "com.google.android.apps.nbu.paisa.user"
    private val phonePePkg = "com.phonepe.app"
    private val paytmPkg = "net.one97.paytm"

    /** One window as the service would read it: [id] is its window ID, texts are its nodes in tree order. */
    private class W(val id: Int, val texts: List<String>, val active: Boolean = false)

    /** One read of [pkg] while [screenClass] is in front, [windows] top-most first. */
    private class Step(val pkg: String, val screenClass: String, val now: Long, val windows: List<W>)

    private fun snapshots(step: Step) = step.windows.map { w ->
        ScreenSnapshot(step.pkg, step.screenClass, w.id, w.texts.map { TextNode(it, null, null) })
    }

    /** The same screen through uiautomator: XML, with system UI over it and the launcher under it, read back. */
    private fun viaDump(step: Step): List<ScreenSnapshot> {
        val xml = DumpXml.windows(
            Win(3, "com.android.systemui", DumpXml.texts("10:01", "Battery 80 percent."), type = "TYPE_SYSTEM"),
            *step.windows.map { Win(it.id, step.pkg, DumpXml.texts(*it.texts.toTypedArray()), active = it.active) }.toTypedArray(),
            Win(2, "com.sec.android.app.launcher", DumpXml.texts("Phone", "Messages")),
        )
        return DumpRead.of(UiDumpParser.parse(xml), step.pkg, step.screenClass).windows.map { it.snapshot }
    }

    /** Replays [steps] like AppStore does, returning every decision's log line. */
    private fun replay(steps: List<Step>, read: (Step) -> List<ScreenSnapshot>): Pair<List<String>, List<Transaction>> {
        val pipeline = PaymentPipeline()
        val lines = ArrayList<String>()
        var lastClass: String? = null
        for (step in steps) {
            if (step.screenClass != lastClass) {
                pipeline.forgetLastRead()
                lines += pipeline.detector.onScreenChanged(step.pkg, step.screenClass, null, step.now).map { it.logLine }
                lastClass = step.screenClass
            }
            pipeline.onRead(read(step), notBeforeMillis = null, nowMillis = step.now, zone = ist)
                ?.let { o -> lines += o.decisions.map { it.logLine } }
        }
        return lines to pipeline.detector.transactions
    }

    private fun assertSameBothWays(steps: List<Step>): List<Transaction> {
        steps.forEach { assertEquals("snapshots of ${it.screenClass}", snapshots(it), viaDump(it)) }
        val (direct, directTxns) = replay(steps, ::snapshots)
        val (dumped, dumpedTxns) = replay(steps, ::viaDump)
        assertEquals(direct, dumped)
        assertEquals(directTxns, dumpedTxns)
        return dumpedTxns
    }

    // ---- GPay ----------------------------------------------------------------------------

    private val gpaySuccess = listOf(
        "₹1", "Paid to", "SANJAY MATHEW", "Banking name: SANJAY MATHEW", "23 October 2026, 1:24am",
        "POWERED BY", "Share screenshot", "See details", "Get 3.2% back", "On your everyday spends", "Apply for Flex", "Done",
    )

    @Test
    fun gpaySuccessRecordedOnceOverRepeatedDumps() {
        val now = at("2026-10-23T01:24:20")
        val cls = "com.google.android.apps.nbu.paisa.user.main.MainActivity"
        val steps = (0 until 4).map { Step(gpayPkg, cls, now + it * 1_500L, listOf(W(70, gpaySuccess, active = true))) }
        val txns = assertSameBothWays(steps)
        assertEquals(1, txns.size)
        assertEquals(amt("1"), txns.single().amount)
        assertEquals(TxnStatus.SUCCESS, txns.single().status)
        assertEquals("SANJAY MATHEW", txns.single().merchant)
    }

    // ---- PhonePe -------------------------------------------------------------------------

    private val phonePeChat = listOf(
        "Ravi (bro)", "+91 ••••• •1234", "₹1", "PAID", "1:58 AM", "₹1", "PAID", "12:43 PM", "Today",
        "₹1", "RECEIVED", "2:49 PM", "₹11", "PAID", "3:40 PM",
    )
    private val phonePePaySheet = listOf(
        "Transfer Money to", "Banking name: RAVI KUMAR", "• ravi@okicici", "POWERED BY",
        "You are paying instantly with your fingerprint", "₹", "1", "4321", "PAY",
    )
    private val phonePeSuccess = listOf(
        "Payment Successful", "24 October 2026 at 03:43 PM", "Ravi (bro)", "ravi@okicici", "₹1",
        "Split Expense", "View Details", "Share Receipt", "Cricket Game 2026", "4.5", "Google Play", "Install", "Done",
    )
    private val phonePeOldDetail = listOf(
        "Transaction Successful", "03:40 pm on 24 Oct 2026", "Paid to", "Ravi (bro)", "ravi@okicici", "₹11",
        "Banking name", ": Ravi Kumar", "Transfer Details", "PhonePe Transaction ID", "T2610241540001234567890",
        "Debited from", "XXXXXX4321", "₹11", "UTR: 012345678901",
        "Send Again", "View History", "Split Expense", "Share Receipt", "Contact PhonePe Support",
    )

    @Test
    fun phonePeResultWindowAboveTheChatIsDecidedOnItsOwn() {
        val chat = "com.phonepe.app.chat.ui.Navigator_ChatActivity"
        val t0 = at("2026-10-24T15:42:50")
        val steps = listOf(
            Step(phonePePkg, chat, t0, listOf(W(85, phonePeChat, active = true))),
            // Pay sheet over the chat, one window, as on the phone.
            Step(phonePePkg, chat, t0 + 3_000, listOf(W(85, phonePeChat + phonePePaySheet, active = true))),
            // Result in a window of its own above the chat (same Activity), redrawn by its ad.
            Step(phonePePkg, chat, at("2026-10-24T15:43:05"), listOf(W(87, phonePeSuccess, active = true), W(85, phonePeChat))),
            Step(phonePePkg, chat, at("2026-10-24T15:43:07"), listOf(W(87, phonePeSuccess, active = true), W(85, phonePeChat))),
        )
        val txns = assertSameBothWays(steps)
        assertEquals(1, txns.size)
        assertEquals(amt("1"), txns.single().amount)
        assertEquals(Direction.DEBIT, txns.single().direction)
    }

    @Test
    fun phonePeOldDetailPageIsRejectedBothWays() {
        val cls = "com.phonepe.app.transaction.detail.ui.Navigator_TransactionDetailsActivity"
        val steps = listOf(Step(phonePePkg, cls, at("2026-10-24T15:55:00"), listOf(W(90, phonePeOldDetail, active = true))))
        assertTrue(assertSameBothWays(steps).isEmpty())
    }

    // ---- Paytm (synthetic) ---------------------------------------------------------------

    @Test
    fun paytmSuccessWithUpiRefRecordedOnce() {
        val cls = "net.one97.paytm.wallet.newdesign.activity.PaymentSuccessActivity"
        val screen = listOf("Paid Successfully", "Rs.1", "To: Ravi", "UPI Ref No: 123456789012", "Order ID: 20231022123456789", "Done")
        val now = at("2026-10-24T16:00:00")
        val steps = listOf(
            Step(paytmPkg, cls, now, listOf(W(60, screen, active = true))),
            Step(paytmPkg, cls, now + 1_500, listOf(W(60, screen, active = true))),
        )
        val txns = assertSameBothWays(steps)
        assertEquals("123456789012", txns.single().upiRef)
        assertEquals("Ravi", txns.single().merchant)
    }

    @Test
    fun passwordAndPinTextNeverReachesThePipeline() {
        val xml = DumpXml.windows(
            Win(90, paytmPkg, DumpXml.texts("Enter 4-digit UPI PIN", "1", "2", "3"), active = true),
            Win(60, paytmPkg, listOf(DumpXml.Node(text = "secret", password = true), DumpXml.Node(text = "Paytm"))),
        )
        val read = DumpRead.of(UiDumpParser.parse(xml), paytmPkg, null)
        val texts = read.windows.flatMap { w -> w.snapshot.nodes.mapNotNull { it.text } }
        assertEquals(listOf("Paytm"), texts)
    }
}
