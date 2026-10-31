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
 * PhonePe live screens from the owner's phone (24 Oct 2026, screenshots and live log), plus the GPay flow that already
 * works, as a regression guard. Screenshots show only what is visible; the accessibility tree can hold more. The live
 * log showed the ₹11 live success tree also held "Send Again", so a fixture adds it.
 */
class PhonePeLiveScreensTest {

    private val ist = ZoneId.of("Asia/Kolkata")
    private fun at(text: String): Long = LocalDateTime.parse(text).atZone(ist).toInstant().toEpochMilli()

    private val phonePePkg = "com.phonepe.app"
    private val gpayPkg = "com.google.android.apps.nbu.paisa.user"
    private val detailActivity = "com.phonepe.app.transaction.detail.ui.Navigator_TransactionDetailsActivity"

    private fun screen(pkg: String, vararg texts: String) =
        ScreenSnapshot(pkg, "Screen", 1, texts.map { TextNode(it, null, null) })

    // ---- live success (6.webp), and the same page with a detail control in its tree ----------

    private val liveSuccessVisible = arrayOf(
        "Payment Successful", "24 October 2026 at 03:43 PM", "Ravi (bro)", "ravi@okicici", "₹1",
        "Split Expense", "View Details", "Share Receipt", "Cricket Game 2026", "4.5", "Google Play", "Install", "Done",
    )
    private val liveSuccess = screen(phonePePkg, *liveSuccessVisible)
    private val liveSuccessWithHiddenSendAgain = screen(phonePePkg, *liveSuccessVisible, "Send Again")

    /** The ₹11 payment at 15:40 opened again from the chat at 15:41:13 (old-detail layout, as in 4.png). */
    private val oldDetail = screen(
        phonePePkg,
        "Transaction Successful", "03:40 pm on 24 Oct 2026", "Paid to", "Ravi (bro)", "ravi@okicici", "₹11",
        "Banking Name", ": Ravi Kumar", "Transfer Details", "PhonePe Transaction ID", "T2610241540001234567890",
        "Debited from", "XXXXXX4321", "₹11", "UTR: 012345678901",
        "Send Again", "View History", "Split Expense", "Share Receipt", "Contact PhonePe Support",
    )

    // ---- pay sheet over the chat cards, one window (7.webp) ------------------------------------

    private val chatCards = arrayOf(
        "Ravi (bro)", "+91 ••••• •1234",
        "₹1", "PAID", "1:58 AM",
        "₹1", "PAID", "12:43 PM",
        "Today",
        "₹1", "RECEIVED", "2:49 PM",
        "₹11", "PAID", "3:40 PM",
    )
    private val paySheet = arrayOf(
        "Transfer Money to", "Banking name: RAVI KUMAR", "• ravi@okicici", "POWERED BY",
        "You are paying instantly with your fingerprint", "₹", "11", "4321", "PAY",
    )
    private val sheetOverChat = screen(phonePePkg, *chatCards, *paySheet)

    private class Shown(val result: ParseResult, val prompt: Transaction?)

    /** The AppStore pipeline: parse, gate, detect, decide on the note prompt. */
    private fun show(d: DuplicateDetector, s: ScreenSnapshot, now: Long, cls: String = detailActivity): Shown {
        d.onScreenChanged(s.packageName, cls, 1, now)
        val result = HistoryScreen.gate(s, UpiTextParser.parse(s, null, ist, now), now)
        val decisions = d.onParseResult(s.packageName, result, now)
        return Shown(result, NotePrompt.paymentFor(s, result, decisions, now))
    }

    // ---- 1. live success is recorded and asks for a note ---------------------------------------

    @Test
    fun liveSuccessIsRecordedAndPrompts() {
        val d = DuplicateDetector()
        val shown = show(d, liveSuccess, at("2026-10-24T15:43:05"))
        assertEquals(1L, shown.prompt?.id)
        assertEquals(0, BigDecimal("1").compareTo(d.expenseTotal()))
    }

    @Test
    fun liveSuccessWithSendAgainInItsTreeIsStillLive() {
        // The live log rejected exactly this as HISTORY_SCREEN ("detail-page control 'Send Again'").
        assertNotNull(HistoryScreen.reasonOf(liveSuccessWithHiddenSendAgain))
        val d = DuplicateDetector()
        val shown = show(d, liveSuccessWithHiddenSendAgain, at("2026-10-24T15:43:05"))
        assertTrue(shown.result is ParseResult.Candidate)
        assertEquals(1L, shown.prompt?.id)
        assertEquals(1, d.transactions.size)
    }

    @Test
    fun liveSuccessLayoutSeenLongAfterThePaymentIsHistory() {
        val d = DuplicateDetector()
        val shown = show(d, liveSuccessWithHiddenSendAgain, at("2026-10-24T16:10:00"))
        assertEquals(RejectReason.HISTORY_SCREEN, (shown.result as ParseResult.Rejected).reason)
        assertNull(shown.prompt)
        assertTrue(d.transactions.isEmpty())
    }

    @Test
    fun oldDetailPageWithSendAgainIsStillRejected() {
        val d = DuplicateDetector()
        val shown = show(d, oldDetail, at("2026-10-24T15:41:13"))
        assertEquals(RejectReason.HISTORY_SCREEN, (shown.result as ParseResult.Rejected).reason)
        assertNull(shown.prompt)
        assertTrue(d.transactions.isEmpty())
        assertTrue(ConfirmScreenParser.parse(oldDetail) is ConfirmResult.Rejected)
    }

    @Test
    fun oldDetailPageAfterTheLiveOneAddsNoSecondExpense() {
        val d = DuplicateDetector()
        val live11 = screen(
            phonePePkg, "Payment Successful", "24 October 2026 at 03:40 PM", "Ravi (bro)", "ravi@okicici", "₹11",
            "Split Expense", "View Details", "Share Receipt", "Done", "Send Again",
        )
        assertNotNull(show(d, live11, at("2026-10-24T15:40:20")).prompt)
        show(d, screen(phonePePkg, *chatCards), at("2026-10-24T15:40:50"), "ChatActivity")
        assertNull(show(d, oldDetail, at("2026-10-24T15:41:13")).prompt)
        assertEquals(1, d.transactions.size)
    }

    // ---- 2. pay sheet over chat cards warns before Pay ------------------------------------------

    @Test
    fun paySheetOverPaidChatCardsIsAConfirmScreen() {
        val c = ConfirmScreenParser.parse(sheetOverChat) as ConfirmResult.Candidate
        assertEquals(BigDecimal("11.00"), c.amount)
        assertEquals("PAY", c.payButton)
    }

    @Test
    fun paySheetBeforeTheChatCardsInTreeOrderIsAConfirmScreen() {
        // 15:54:39 on the phone: "no Pay button text after the last past payment ('PAID')", so order is not reliable.
        val sheetFirst = screen(phonePePkg, *paySheet, *chatCards)
        val c = ConfirmScreenParser.parse(sheetFirst) as ConfirmResult.Candidate
        assertEquals(BigDecimal("11.00"), c.amount)
        assertEquals("PAY", c.payButton)
    }

    @Test
    fun paySheetInItsOwnWindowIsAConfirmScreen() {
        assertEquals(BigDecimal("11.00"), (ConfirmScreenParser.parse(screen(phonePePkg, *paySheet)) as ConfirmResult.Candidate).amount)
    }

    @Test
    fun paySheetWithOnlyTheFingerprintBannerOrOnlyTheHeaderIsFound() {
        val noHeader = screen(phonePePkg, *chatCards, "You are paying instantly with your fingerprint", "₹", "11", "4321", "PAY")
        val noBanner = screen(phonePePkg, *chatCards, "Transfer Money to", "Banking name: RAVI KUMAR", "₹", "11", "4321", "PAY")
        assertEquals(BigDecimal("11.00"), (ConfirmScreenParser.parse(noHeader) as ConfirmResult.Candidate).amount)
        assertEquals(BigDecimal("11.00"), (ConfirmScreenParser.parse(noBanner) as ConfirmResult.Candidate).amount)
    }

    @Test
    fun cardAmountsSplitLikeTheEntryAreStillIgnored() {
        val splitCards = screen(
            phonePePkg, "₹", "1", "PAID", "1:58 AM", "₹", "500", "PAID", "3:40 PM",
            "Transfer Money to", "₹", "11", "4321", "PAY", "₹", "7", "RECEIVED",
        )
        assertEquals(BigDecimal("11.00"), (ConfirmScreenParser.parse(splitCards) as ConfirmResult.Candidate).amount)
    }

    @Test
    fun paySheetNamingTheAmountOnTheButtonIsRead() {
        val s = screen(phonePePkg, *chatCards, "Transfer Money to", "₹", "11", "PAY ₹11")
        assertEquals(BigDecimal("11.00"), (ConfirmScreenParser.parse(s) as ConfirmResult.Candidate).amount)
    }

    @Test
    fun paySheetWithoutAnyAmountIsRejected() {
        val s = screen(phonePePkg, "Transfer Money to", "Banking name: RAVI KUMAR", "PAY")
        assertEquals(ConfirmRejectReason.NO_AMOUNT, (ConfirmScreenParser.parse(s) as ConfirmResult.Rejected).reason)
    }

    @Test
    fun resultPagesAreNotPaySheets() {
        // "Banking name" is on the sheet, the success page and the detail page, so it is not a sheet anchor.
        assertTrue(ConfirmScreenParser.parse(liveSuccess) is ConfirmResult.Rejected)
        assertTrue(ConfirmScreenParser.parse(oldDetail) is ConfirmResult.Rejected)
        val gpayLive = screen(gpayPkg, "₹1", "Paid to", "SANJAY MATHEW", "Banking name: SANJAY MATHEW", "See details", "Done")
        assertEquals(ConfirmRejectReason.RESULT_SCREEN, (ConfirmScreenParser.parse(gpayLive) as ConfirmResult.Rejected).reason)
    }

    @Test
    fun pinScreenIsNeverAPaySheetAndIsNotCaptured() {
        val pin = screen(phonePePkg, "Transfer Money to", "₹", "11", "Enter your PIN", "1", "2", "3", "PAY")
        assertEquals(ConfirmRejectReason.PIN_SCREEN, (ConfirmScreenParser.parse(pin) as ConfirmResult.Rejected).reason)
        assertTrue(ConfirmScreenParser.isPinScreen(pin))
        assertTrue(!ConfirmScreenParser.isPinScreen(sheetOverChat))
    }

    @Test
    fun paySheetWarnsWhenOverTheLimit() {
        val c = ConfirmScreenParser.parse(sheetOverChat) as ConfirmResult.Candidate
        assertTrue(SpendLimit.exceeds(BigDecimal("1"), c.amount, BigDecimal("10")))
        assertTrue(!SpendLimit.exceeds(BigDecimal("1"), c.amount, BigDecimal("12")))
    }

    @Test
    fun processingPaymentInTheChatDoesNotHideTheSheet() {
        val withProcessing = screen(
            phonePePkg, *chatCards, "₹5", "Processing payment", "3:41 PM", *paySheet,
        )
        assertEquals(BigDecimal("11.00"), (ConfirmScreenParser.parse(withProcessing) as ConfirmResult.Candidate).amount)
    }

    @Test
    fun amountInOneNodeWithASpaceIsRead() {
        val oneNode = screen(phonePePkg, *chatCards, "Transfer Money to", "₹ 11", "4321", "PAY")
        assertEquals(BigDecimal("11.00"), (ConfirmScreenParser.parse(oneNode) as ConfirmResult.Candidate).amount)
    }

    @Test
    fun payeeAppLogoTextDoesNotChangeTheAmount() {
        // If the "G Pay" logo next to the payee's UPI ID is read as a "Pay" text node, the amount is still ₹11.
        val withLogo = screen(phonePePkg, *chatCards, "Transfer Money to", "Banking name: RAVI KUMAR", "Pay", "• ravi@okicici",
            "You are paying instantly with your fingerprint", "₹", "11", "4321", "PAY")
        assertEquals(BigDecimal("11.00"), (ConfirmScreenParser.parse(withLogo) as ConfirmResult.Candidate).amount)
    }

    @Test
    fun sheetBeforeItsPayButtonAppearsIsNotYetAConfirmScreen() {
        val loading = screen(phonePePkg, *chatCards, *paySheet.dropLast(1).toTypedArray())
        assertEquals(ConfirmRejectReason.NO_PAY_BUTTON, (ConfirmScreenParser.parse(loading) as ConfirmResult.Rejected).reason)
    }

    @Test
    fun chatWithoutTheSheetIsNotAConfirmScreen() {
        assertTrue(ConfirmScreenParser.parse(screen(phonePePkg, *chatCards, "Enter amount or chat")) is ConfirmResult.Rejected)
    }

    @Test
    fun sheetOverChatIsNeverRecorded() {
        val d = DuplicateDetector()
        val withProcessing = screen(phonePePkg, *chatCards, "₹11", "Processing payment", "3:40 PM", *paySheet)
        assertNull(show(d, withProcessing, at("2026-10-24T15:40:32"), "ChatActivity").prompt)
        assertTrue(d.transactions.isEmpty())
    }

    // ---- 3. GPay regression ----------------------------------------------------------------------

    @Test
    fun gpayFlowIsUnchanged() {
        val d = DuplicateDetector()
        val live = screen(
            gpayPkg,
            "₹1", "Paid to", "SANJAY MATHEW", "Banking name: SANJAY MATHEW", "23 October 2026, 1:24am",
            "POWERED BY", "Share screenshot", "See details", "Get 3.2% back", "On your everyday spends", "Apply for Flex", "Done",
        )
        val shown = show(d, live, at("2026-10-23T01:24:30"), "GPayActivity")
        val id = shown.prompt?.id ?: throw AssertionError("GPay live success did not prompt")
        assertTrue(d.attachNote(id, "Lunch"))
        assertEquals("Lunch", d.transactions.single().note)
        assertEquals(0, BigDecimal("1").compareTo(d.expenseTotal()))

        val amountScreen = screen(gpayPkg, "Paying Sandeep Mathew", "₹", "11", "Add a note", "ICICI Bank ••2896", "Pay")
        assertEquals(BigDecimal("11.00"), (ConfirmScreenParser.parse(amountScreen) as ConfirmResult.Candidate).amount)
        val chat = screen(gpayPkg, "Payment to Sandeep", "₹11", "Paid · 2:45pm", "Pay", "Message...")
        assertEquals(ConfirmRejectReason.HISTORY_SCREEN, (ConfirmScreenParser.parse(chat) as ConfirmResult.Rejected).reason)
    }
}
