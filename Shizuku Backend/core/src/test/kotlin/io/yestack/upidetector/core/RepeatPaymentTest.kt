package io.yestack.upidetector.core

import java.math.BigDecimal
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Paying the same merchant the same amount again. From PhonePe's chat with a fingerprint, the chat screen never
 * changes, so both payments fall in one screen session; with a PIN, the second often comes within 60 s of the first.
 * A payment started in between (a confirm screen with that amount, or a PIN screen) makes the second one new. Without
 * one, the duplicate rules are as before.
 */
class RepeatPaymentTest {

    private val pkg = "com.phonepe.app"
    private val chat = "Navigator_ChatActivity"
    private val pin = "org.npci.upi.security.pinactivitycomponent.GetCredential"
    private val d = DuplicateDetector()

    private fun success(amount: String = "1", status: TxnStatus = TxnStatus.SUCCESS) =
        ParseResult.Candidate(BigDecimal(amount), status, Direction.DEBIT, "Ravi", null, null, "Payment Successful", 0)

    private val noPhrase = ParseResult.Rejected(RejectReason.NO_STATUS_PHRASE, "chat", false)

    private fun parse(r: ParseResult, t: Long) = d.onParseResult(pkg, r, t)

    private fun expenses() = d.transactions.count { SpendLimit.isExpense(it) }

    @Test
    fun secondPaymentInTheSameChatAfterAConfirmScreenIsNew() {
        d.onScreenChanged(pkg, chat, 1, 0)
        assertTrue(parse(success(), 1_000).any { it is Decision.Inserted })
        parse(noPhrase, 3_000)
        assertTrue(d.onPaymentAttempt(pkg, 20_000, BigDecimal("1")))
        val second = parse(success(), 25_000)
        val inserted = second.filterIsInstance<Decision.Inserted>().single()
        assertTrue(inserted.logLine, inserted.logLine.contains("a new payment was started after it was last seen"))
        assertEquals(2, expenses())
        assertEquals(0, BigDecimal("2").compareTo(d.expenseTotal()))
    }

    @Test
    fun withoutAPaymentStartedTheSecondReadIsStillTreatedAsBefore() {
        d.onScreenChanged(pkg, chat, 1, 0)
        parse(success(), 1_000)
        parse(noPhrase, 3_000)
        val second = parse(success(), 25_000)
        assertFalse(second.any { it is Decision.Inserted })
        assertEquals(1, expenses())
    }

    @Test
    fun repeatedEventsForTheSamePaymentStayOneRecord() {
        d.onScreenChanged(pkg, chat, 1, 0)
        d.onPaymentAttempt(pkg, 500, BigDecimal("1"))
        parse(success(), 1_000)
        repeat(5) { i -> assertTrue(parse(success(), 1_200L + i * 100).all { it is Decision.IgnoredDuplicate }) }
        assertEquals(1, d.transactions.size)
    }

    /**
     * Device report 2026-10-25: one ₹1 PhonePe payment became 11 records. Each note prompt closing made the service
     * read the screen again; a ₹1 confirm-screen match came up while the success was still showing, re-armed the
     * payment attempt, and the next success read was inserted as a new payment (which asked for a note again).
     */
    @Test
    fun aConfirmMatchWhileTheResultIsStillShowingIsNotANewPayment() {
        d.onScreenChanged(pkg, chat, 1, 0)
        d.onPaymentAttempt(pkg, 500, BigDecimal("1"))
        assertTrue(parse(success(), 1_000).any { it is Decision.Inserted })
        repeat(10) { i ->
            val t = 2_000L + i * 1_200
            assertFalse(d.onPaymentAttempt(pkg, t, BigDecimal("1")))
            assertTrue(parse(success(), t + 300).all { it is Decision.IgnoredDuplicate })
        }
        assertEquals(1, d.transactions.size)
        assertEquals(0, BigDecimal("1").compareTo(d.expenseTotal()))
    }

    @Test
    fun aConfirmScreenForAnotherAmountDoesNotSplitAPayment() {
        d.onScreenChanged(pkg, chat, 1, 0)
        parse(success(), 1_000)
        d.onPaymentAttempt(pkg, 2_000, BigDecimal("11"))
        assertTrue(parse(success(), 3_000).all { it is Decision.IgnoredDuplicate })
        assertEquals(1, d.transactions.size)
    }

    @Test
    fun aPinScreenBetweenTwoPaymentsWithin60sMakesTheSecondNew() {
        d.onScreenChanged(pkg, chat, 1, 0)
        parse(success(), 1_000)
        d.onScreenChanged(pkg, pin, 1, 10_000)
        d.onPaymentAttempt(pkg, 10_000)
        d.onScreenChanged(pkg, chat, 1, 12_000)
        assertTrue(parse(success(), 14_000).any { it is Decision.Inserted })
        assertEquals(2, expenses())
        assertTrue(d.transactions.all { it.flag == null })
    }

    @Test
    fun withoutAPinScreenAPaymentWithin60sInAnotherSessionIsStillFlagged() {
        d.onScreenChanged(pkg, chat, 1, 0)
        parse(success(), 1_000)
        d.onScreenChanged(pkg, "OtherActivity", 1, 10_000)
        assertTrue(parse(success(), 14_000).any { it is Decision.FlaggedPossibleDuplicate })
        assertEquals(1, expenses())
    }

    @Test
    fun pendingThenSuccessOfTheNewPaymentIsOneRecord() {
        d.onScreenChanged(pkg, chat, 1, 0)
        parse(success(), 1_000)
        parse(noPhrase, 3_000)
        d.onPaymentAttempt(pkg, 20_000, BigDecimal("1"))
        assertTrue(parse(success(status = TxnStatus.PENDING), 22_000).any { it is Decision.Inserted })
        assertTrue(parse(success(), 24_000).any { it is Decision.Updated })
        assertEquals(2, d.transactions.size)
        assertEquals(2, expenses())
    }

    @Test
    fun theSameConfirmScreenReadAgainOnlyRefreshesTheAttempt() {
        assertTrue(d.onPaymentAttempt(pkg, 1_000, BigDecimal("1")))
        assertFalse(d.onPaymentAttempt(pkg, 1_100, BigDecimal("1.00")))
        assertTrue(d.onPaymentAttempt(pkg, 1_200, BigDecimal("11")))
        assertTrue(d.onPaymentAttempt(pkg, 1_300))
    }

    @Test
    fun eachDistinctPaymentIsAskedAboutExactlyOnce() {
        val asked = NewExpenses()
        val prompts = ArrayList<Long>()
        fun step(r: ParseResult, t: Long) {
            parse(r, t)
            prompts += asked.newlyRecorded(d.transactions).map { it.id }
        }
        d.onScreenChanged(pkg, chat, 1, 0)
        step(success(), 1_000)
        step(success(), 1_300) // redraw
        step(noPhrase, 3_000)
        d.onPaymentAttempt(pkg, 20_000, BigDecimal("1"))
        step(success(), 25_000)
        step(success(), 25_300) // redraw
        assertEquals(listOf(1L, 2L), prompts)
    }
}
