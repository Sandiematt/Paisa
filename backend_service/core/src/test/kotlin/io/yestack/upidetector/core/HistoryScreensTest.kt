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
 * History lists and old-payment detail pages, transcribed from the owner's screenshots (24 Oct 2026), against live
 * screens. The live success screens are the real ones from [UpiTextParserRealScreensTest]. The live confirm screens are
 * synthetic: no real pre-payment screen has been captured yet, for either app.
 */
class HistoryScreensTest {

    private val ist = ZoneId.of("Asia/Kolkata")
    private fun at(text: String): Long = LocalDateTime.parse(text).atZone(ist).toInstant().toEpochMilli()

    private val gpayPkg = "com.google.android.apps.nbu.paisa.user"
    private val phonePePkg = "com.phonepe.app"

    private fun screen(pkg: String, vararg texts: String) =
        ScreenSnapshot(pkg, "Screen", 1, texts.map { TextNode(it, null, null) })

    // ---- fixtures: history and detail pages (screenshots) ------------------------------

    /** GPay: detail page of an old payment, opened from the chat. */
    private val gpayDetail = screen(
        gpayPkg,
        "To Sandeep Mathew", "+91 ••••• •9121", "₹11", "Pay again", "Completed", "24 Oct 2026, 2:45pm",
        "ICICI Bank 2896", "Payment started", "24 Oct 2026, 2:45pm", "₹11 was debited", "2:45pm",
        "₹11 sent to Sandeep Mathew", "2:45pm", "Payment completed", "2:45pm", "UPI transaction ID", "629760489216",
    )

    /** GPay: chat with a person, old payment cards and the chat's own Pay button. */
    private val gpayChat = screen(
        gpayPkg,
        "Sandeep Mathew", "+91 ••••• •9121", "Paid · 23 Oct",
        "Payment to you", "₹1", "Paid · 23 Oct",
        "Payment to you", "₹1", "Paid · 23 Oct",
        "Payment to you", "₹1", "Paid · 23 Oct",
        "2:45pm", "Payment to Sandeep", "₹11", "Paid · 2:45pm",
        "Pay", "Message...",
    )

    /** PhonePe: History tab. */
    private val phonePeHistory = screen(
        phonePePkg,
        "History", "My Statements", "Search", "October 2026", "+ ₹2,957",
        "Paid to", "Sandeep Mathew", "₹1", "6 mins ago", "Debited from",
        "Received from", "Sandeep Mathew", "+ ₹1", "1 day ago", "Credited to",
        "Received from", "Sandeep Mathew", "+ ₹1", "1 day ago", "Credited to",
        "Alerts", "History",
    )

    /** PhonePe: detail page of an old payment, opened from History. */
    private val phonePeDetail = screen(
        phonePePkg,
        "Transaction Successful", "02:49 pm on 24 Oct 2026", "Paid to", "Sandeep Mathew", "sandeep@oksbi", "₹1",
        "Banking Name", ": Sandeep Mathew", "Sent to", ": sandeep@oksbi", "Transfer Details",
        "PhonePe Transaction ID", "T2610241449001790003053", "Debited from", "XXXXXX1597", "₹1", "UTR: 017114352274",
        "Send Again", "View History", "Split Expense", "Share Receipt", "Contact PhonePe Support",
        "Pay securely with fingerprint", "Enjoy seamless and safer payments up to ₹10,000.", "Activate Now", "Powered by",
    )

    /** PhonePe: chat with a person, received-payment cards and the "Enter amount or chat" box. */
    private val phonePeChat = screen(
        phonePePkg,
        "Sandeep Mathew", "+91 ••••• •9121", "Hi", "9:49 AM", "Ok", "9:49 AM",
        "July 20, 2022", "₹1", "RECEIVED", "1:31 PM", "Thanks", "1:32 PM",
        "July 30, 2022", "₹500", "RECEIVED", "10:19 PM", "Thank you", "10:31 PM", "Yesterday",
        "Enter amount or chat",
    )

    // ---- fixtures: live screens ---------------------------------------------------------

    private val gpayLiveSuccess = screen(
        gpayPkg,
        "₹1", "Paid to", "SANJAY MATHEW", "Banking name: SANJAY MATHEW", "23 October 2026, 1:24am",
        "POWERED BY", "Share screenshot", "See details", "Get 3.2% back", "On your everyday spends", "Apply for Flex", "Done",
    )

    private val phonePeLiveSuccess = screen(
        phonePePkg,
        "Payment Successful", "23 October 2026 at 01:23 AM", "Mathen (bro)", "sanjay.mathewofficial2020-2@okicici",
        "₹1", "Split Expense", "View Details", "Share Receipt", "Slikk", "4.3", "Google Play", "Install", "Done",
    )

    // ---- the AppStore pipeline: parse, gate, detect, decide on the note prompt ---------

    private class Shown(val decisions: List<Decision>, val prompt: Transaction?)

    private fun show(d: DuplicateDetector, s: ScreenSnapshot, now: Long, cls: String = "Screen"): Shown {
        d.onScreenChanged(s.packageName, cls, 1, now)
        val result = HistoryScreen.gate(s, UpiTextParser.parse(s, null, ist, now), now)
        val decisions = d.onParseResult(s.packageName, result, now)
        return Shown(decisions, NotePrompt.paymentFor(s, result, decisions, now))
    }

    private fun assertNoRecordNoPrompt(s: ScreenSnapshot, now: Long) {
        val d = DuplicateDetector()
        val shown = show(d, s, now)
        assertNull(shown.prompt)
        assertTrue(d.transactions.isEmpty())
    }

    private fun assertNotConfirm(s: ScreenSnapshot) {
        val r = ConfirmScreenParser.parse(s)
        assertTrue("expected a rejection but was $r", r is ConfirmResult.Rejected)
    }

    // ---- history and detail pages never record, ask or warn -----------------------------

    @Test
    fun gpayOldDetailPageIsHistory() {
        assertNotNull(HistoryScreen.reasonOf(gpayDetail))
        assertNoRecordNoPrompt(gpayDetail, at("2026-10-24T14:58:00"))
        assertNotConfirm(gpayDetail)
    }

    @Test
    fun gpayOldDetailPageWasACandidateBeforeTheGate() {
        // Without the gate this page would have been recorded (and prompted) as a new ₹11 payment.
        val now = at("2026-10-24T14:58:00")
        val raw = UpiTextParser.parse(gpayDetail, null, ist, now).candidate()
        assertEquals(TxnStatus.SUCCESS, raw.status)
        assertEquals(RejectReason.HISTORY_SCREEN, (HistoryScreen.gate(gpayDetail, raw, now) as ParseResult.Rejected).reason)
    }

    @Test
    fun phonePeOldDetailPageIsHistory() {
        assertNotNull(HistoryScreen.reasonOf(phonePeDetail))
        assertNoRecordNoPrompt(phonePeDetail, at("2026-10-24T14:57:00"))
        assertNotConfirm(phonePeDetail)
    }

    @Test
    fun gpayChatWithPayButtonIsNotAConfirmScreen() {
        // The chat's own "Pay" button next to old ₹11 / ₹1 cards used to read as a ₹11 confirm screen.
        val r = ConfirmScreenParser.parse(gpayChat) as ConfirmResult.Rejected
        assertEquals(ConfirmRejectReason.HISTORY_SCREEN, r.reason)
        assertNoRecordNoPrompt(gpayChat, at("2026-10-24T14:58:00"))
    }

    @Test
    fun phonePeHistoryListIsRejected() {
        assertNotNull(HistoryScreen.reasonOf(phonePeHistory))
        assertNotConfirm(phonePeHistory)
        assertNoRecordNoPrompt(phonePeHistory, at("2026-10-24T14:57:00"))
    }

    @Test
    fun phonePeChatCardsAreRejected() {
        assertNotNull(HistoryScreen.reasonOf(phonePeChat))
        assertNotConfirm(phonePeChat)
        assertNoRecordNoPrompt(phonePeChat, at("2026-10-24T14:57:00"))
    }

    @Test
    fun detailPageAfterALivePaymentDoesNotAddASecondExpense() {
        val d = DuplicateDetector()
        val live = screen(gpayPkg, "₹11", "Paid to", "Sandeep Mathew", "24 October 2026, 2:45pm", "See details", "Done")
        assertNotNull(show(d, live, at("2026-10-24T14:45:20"), "Live").prompt)
        val later = show(d, gpayDetail, at("2026-10-24T14:58:00"), "Detail")
        assertNull(later.prompt)
        assertEquals(1, d.transactions.size)
        assertEquals(0, BigDecimal("11").compareTo(d.expenseTotal()))
    }

    // ---- live screens still work ---------------------------------------------------------

    @Test
    fun liveSuccessScreensAreNotHistory() {
        assertNull(HistoryScreen.reasonOf(gpayLiveSuccess))
        assertNull(HistoryScreen.reasonOf(phonePeLiveSuccess))
    }

    @Test
    fun gpayLiveSuccessStillPrompts() {
        val d = DuplicateDetector()
        val shown = show(d, gpayLiveSuccess, at("2026-10-23T01:24:30"))
        assertEquals(1L, shown.prompt?.id)
        assertEquals("SANJAY MATHEW", shown.prompt?.merchant)
    }

    @Test
    fun phonePeLiveSuccessStillPrompts() {
        val d = DuplicateDetector()
        assertEquals(1L, show(d, phonePeLiveSuccess, at("2026-10-23T01:23:40")).prompt?.id)
    }

    @Test
    fun liveSuccessSeenLongAfterItsTimeRecordsButDoesNotPrompt() {
        val d = DuplicateDetector()
        val shown = show(d, gpayLiveSuccess, at("2026-10-23T01:50:00"))
        assertNull(shown.prompt)
        assertEquals(1, d.transactions.size)
    }

    @Test
    fun phonePeStyleConfirmSheetIsAccepted() {
        val sheet = screen(
            phonePePkg,
            "Paying Sandeep Mathew", "sandeep@oksbi", "₹1", "Choose account", "State Bank of India", "XXXXXX1597", "PAY ₹1",
        )
        val c = ConfirmScreenParser.parse(sheet) as ConfirmResult.Candidate
        assertEquals(BigDecimal("1.00"), c.amount)
        assertEquals("PAY ₹1", c.payButton)
    }

    @Test
    fun phonePeStyleAmountFieldWithoutCurrencyTextIsAccepted() {
        val s = ScreenSnapshot(
            phonePePkg, "Screen", 1,
            listOf(
                TextNode("Sandeep Mathew", null, null),
                TextNode("250", null, "com.phonepe.app:id/et_amount"),
                TextNode("Add a message", null, null),
                TextNode("PROCEED TO PAY", null, null),
            ),
        )
        assertEquals(BigDecimal("250.00"), (ConfirmScreenParser.parse(s) as ConfirmResult.Candidate).amount)
    }

    @Test
    fun phonePeStyleSendButtonWithAmountIsAccepted() {
        val s = screen(phonePePkg, "Sandeep Mathew", "₹ 75", "Send ₹75")
        assertEquals(BigDecimal("75.00"), (ConfirmScreenParser.parse(s) as ConfirmResult.Candidate).amount)
    }

    @Test
    fun plainSendButtonIsNotAPayButton() {
        val s = screen(phonePePkg, "Sandeep Mathew", "₹75", "Send")
        assertEquals(ConfirmRejectReason.NO_PAY_BUTTON, (ConfirmScreenParser.parse(s) as ConfirmResult.Rejected).reason)
    }

    @Test
    fun gpayStyleAmountScreenIsAccepted() {
        val s = screen(gpayPkg, "Paying Sandeep Mathew", "+91 ••••• •9121", "₹", "11", "Add a note", "ICICI Bank ••2896", "Pay")
        assertEquals(BigDecimal("11.00"), (ConfirmScreenParser.parse(s) as ConfirmResult.Candidate).amount)
    }

    @Test
    fun gpayStylePaySheetIsAccepted() {
        val s = screen(gpayPkg, "Choose account to pay with", "ICICI Bank ••2896", "Pay ₹11")
        assertEquals(BigDecimal("11.00"), (ConfirmScreenParser.parse(s) as ConfirmResult.Candidate).amount)
    }

    @Test
    fun phonePeStyleConfirmSheetOverChatCardsInOneWindowIsAccepted() {
        // If PhonePe's sheet shares the chat's window, the old cards are read too; the named amount still decides.
        val sheetOverChat = ScreenSnapshot(
            phonePePkg, "Screen", 1,
            phonePeChat.nodes + listOf("Paying Sandeep Mathew", "₹1", "State Bank of India", "PAY ₹1").map { TextNode(it, null, null) },
        )
        assertEquals(BigDecimal("1.00"), (ConfirmScreenParser.parse(sheetOverChat) as ConfirmResult.Candidate).amount)
    }

    @Test
    fun plainPayOverChatCardsIsRejected() {
        val s = ScreenSnapshot(phonePePkg, "Screen", 1, phonePeChat.nodes + TextNode("PAY", null, null))
        assertEquals(ConfirmRejectReason.HISTORY_SCREEN, (ConfirmScreenParser.parse(s) as ConfirmResult.Rejected).reason)
    }

    @Test
    fun payAgainWithAnAmountIsNotAPayButton() {
        val s = screen(gpayPkg, "To Sandeep Mathew", "₹11", "Pay ₹11 again")
        assertEquals(ConfirmRejectReason.NO_PAY_BUTTON, (ConfirmScreenParser.parse(s) as ConfirmResult.Rejected).reason)
    }

    @Test
    fun differentAmountsOnPayButtonsAreAmbiguous() {
        val s = screen(gpayPkg, "Pay ₹11", "Pay ₹12")
        assertEquals(ConfirmRejectReason.AMBIGUOUS_AMOUNT, (ConfirmScreenParser.parse(s) as ConfirmResult.Rejected).reason)
    }
}
