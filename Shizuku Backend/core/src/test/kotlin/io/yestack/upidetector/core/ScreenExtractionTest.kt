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
 * Accessibility trees read while PhonePe is still drawing its result: "Done" or the status text missing at first,
 * text split across views, the same screen read again, and the result window appearing above the chat. The rules are
 * not loosened: an unfinished read is rejected as before and only marked worth reading again.
 */
class ScreenExtractionTest {

    private val ist = ZoneId.of("Asia/Kolkata")
    private fun at(text: String): Long = LocalDateTime.parse(text).atZone(ist).toInstant().toEpochMilli()
    private val now = at("2026-10-24T17:41:40")

    private val pkg = "com.phonepe.app"
    private fun window(id: Int, vararg texts: String) =
        ScreenSnapshot(pkg, "Navigator_ChatActivity", id, texts.map { TextNode(it, null, null) })

    private val pipeline = PaymentPipeline()
    private val d get() = pipeline.detector

    private fun read(t: Long, vararg windows: ScreenSnapshot) = pipeline.onRead(windows.toList(), null, t, ist)

    private fun parse(s: ScreenSnapshot, t: Long = now) =
        HistoryScreen.gate(s, UpiTextParser.parse(s, null, ist, t), t)

    private val complete = window(
        20, "Payment Successful", "24 October 2026 at 05:41 PM", "Ravi (bro)", "₹1", "View Details", "Share Receipt", "Done",
    )

    // ---- fragmented text ----------------------------------------------------------------------

    @Test
    fun aStatusPhraseSplitAcrossTwoViewsIsFound() {
        val split = window(20, "Payment", "Successful", "24 October 2026 at 05:41 PM", "₹1", "Done")
        val result = parse(split)
        assertTrue(result is ParseResult.Candidate)
        assertEquals(TxnStatus.SUCCESS, (result as ParseResult.Candidate).status)
        assertEquals(listOf("Payment Successful"), UpiTextParser.statusPhrases(split))
    }

    @Test
    fun wordsInViewsThatAreNotNeighboursAreNotJoined() {
        val apart = window(20, "Payment", "₹1", "Successful", "Done")
        assertEquals(RejectReason.NO_STATUS_PHRASE, (parse(apart) as ParseResult.Rejected).reason)
    }

    @Test
    fun aPhraseInOneViewIsFoundAsBefore() {
        assertEquals(listOf("Payment Successful"), UpiTextParser.statusPhrases(complete))
        assertTrue(parse(complete) is ParseResult.Candidate)
    }

    @Test
    fun aSplitFailureIsStillCheckedBeforeSuccess() {
        val both = window(20, "Payment", "Failed", "₹1", "Payment Successful", "Done")
        assertEquals(RejectReason.CONFLICTING_STATUS, (parse(both) as ParseResult.Rejected).reason)
    }

    // ---- missing or delayed keywords, re-reads ------------------------------------------------

    @Test
    fun resultWithoutDoneYetIsUnfinishedThenRecordedOnceWhenComplete() {
        // First read: the chat's "PAID" card is in the tree and "Done" has not been drawn yet (the 17:41:29 read).
        val partial = window(20, "₹1", "PAID", "Payment Successful", "24 October 2026 at 05:41 PM", "₹1")
        d.onScreenChanged(pkg, "Navigator_ChatActivity", 1, now - 11_000)
        val first = read(now - 11_000, partial)!!
        assertEquals(RejectReason.HISTORY_SCREEN, (first.windows.single().result as ParseResult.Rejected).reason)
        assertEquals("window 1: status shown but no Done button yet", ScreenCheck.unfinishedReason(first))
        assertTrue(d.transactions.isEmpty())

        // Re-read, nothing changed yet: the same read is not decided again.
        assertNull(read(now - 10_500, partial))

        // Re-read once "Done" is there: recorded, and the read is no longer unfinished.
        val done = read(now, complete)!!
        assertTrue(done.decisions.any { it is Decision.Inserted })
        assertNull(ScreenCheck.unfinishedReason(done))

        // Redraws of the finished screen: still one record.
        assertNull(read(now + 300, complete))
        assertEquals(1, d.transactions.size)
    }

    @Test
    fun statusNotDrawnYetIsUnfinished() {
        val noStatus = window(20, "Ravi (bro)", "₹1", "Done")
        assertEquals("Done and an amount shown but no status yet", ScreenCheck.unfinishedReason(noStatus, parse(noStatus)))
    }

    @Test
    fun amountNotDrawnYetIsUnfinished() {
        val noAmount = window(20, "Payment Successful", "Done")
        assertEquals("status shown but no amount yet", ScreenCheck.unfinishedReason(noAmount, parse(noAmount)))
    }

    @Test
    fun processingIsUnfinished() {
        val processing = window(20, "Processing payment", "₹1")
        assertEquals("payment still processing", ScreenCheck.unfinishedReason(processing, parse(processing)))
    }

    @Test
    fun ordinaryScreensAreNotReReadForNothing() {
        val chat = window(10, "Ravi (bro)", "₹1", "PAID", "3:40 PM", "Enter amount or chat")
        assertNull(ScreenCheck.unfinishedReason(chat, parse(chat)))
        val home = window(10, "Scan & Pay", "To mobile", "Check balance")
        assertNull(ScreenCheck.unfinishedReason(home, parse(home)))
    }

    @Test
    fun anIncompleteTreeIsWorthAReReadOnlyWhenTheReadWasNotAccepted() {
        d.onScreenChanged(pkg, "Navigator_ChatActivity", 1, now)
        val accepted = read(now, complete)!!
        assertNull(ScreenCheck.unfinishedReason(accepted, listOf("2 node(s) went stale")))

        pipeline.forgetLastRead()
        val chat = window(10, "Ravi (bro)", "Enter amount or chat")
        val rejected = read(now + 1_000, chat)!!
        assertEquals(
            "window 1: tree incomplete (2 node(s) went stale)",
            ScreenCheck.unfinishedReason(rejected, listOf("2 node(s) went stale")),
        )
    }

    // ---- window transitions -------------------------------------------------------------------

    @Test
    fun resultWindowAppearingAboveTheChatIsRecordedOnce() {
        val chat = window(10, "Ravi (bro)", "₹1", "PAID", "3:40 PM")
        d.onScreenChanged(pkg, "Navigator_ChatActivity", 1, now - 2_000)
        read(now - 2_000, chat)
        val partial = window(20, "Payment Successful", "Ravi (bro)")
        val half = read(now - 1_000, partial, chat)!!
        assertNotNull(ScreenCheck.unfinishedReason(half))
        read(now, complete, chat)
        read(now + 500, complete, chat)
        assertEquals(1, d.transactions.size)
        assertEquals(0, BigDecimal("1").compareTo(d.expenseTotal()))
    }

    // ---- what must still be rejected ----------------------------------------------------------

    @Test
    fun fingerprintAuthenticationAloneIsNotASuccess() {
        val sheet = window(
            10, "Transfer Money to", "Banking name: RAVI KUMAR", "You are paying instantly with your fingerprint", "₹", "11", "PAY",
        )
        d.onScreenChanged(pkg, "Navigator_ChatActivity", 1, now)
        val outcome = read(now, sheet)!!
        assertEquals(RejectReason.NO_STATUS_PHRASE, (outcome.windows.single().result as ParseResult.Rejected).reason)
        assertNull(ScreenCheck.unfinishedReason(outcome))
        assertTrue(d.transactions.isEmpty())
    }

    @Test
    fun anOldDetailPageStaysRejectedHoweverOftenItIsRead() {
        val old = window(
            30, "Transaction Successful", "03:40 pm on 24 Oct 2026", "Paid to", "Ravi (bro)", "₹11", "UTR: 012345678901",
            "Send Again", "View History", "Share Receipt",
        )
        d.onScreenChanged(pkg, "Navigator_TransactionDetailsActivity", 1, now)
        repeat(4) { i ->
            pipeline.forgetLastRead()
            val outcome = read(now + i * 300L, old)!!
            assertEquals(RejectReason.HISTORY_SCREEN, (outcome.windows.single().result as ParseResult.Rejected).reason)
        }
        assertTrue(d.transactions.isEmpty())
    }

    // ---- what the log shows -------------------------------------------------------------------

    @Test
    fun keywordsNameWhatTheRulesLookAt() {
        val keys = ScreenCheck.keywords(complete, now, ist)
        assertTrue(keys, keys.contains("status 'Payment Successful'"))
        assertTrue(keys, keys.contains("Done yes"))
        assertTrue(keys, keys.contains("amounts ₹1"))
        assertTrue(keys, keys.contains("printed time '24 October 2026 at 05:41 PM'"))
        assertTrue(keys, keys.contains("history marker none"))

        val partial = ScreenCheck.keywords(window(20, "₹1", "PAID", "Payment Successful"), now, ist)
        assertTrue(partial, partial.contains("Done no"))
        assertTrue(partial, partial.contains("history marker status-only label 'PAID'"))
    }
}
