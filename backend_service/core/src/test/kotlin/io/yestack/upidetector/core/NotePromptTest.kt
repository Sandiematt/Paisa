package io.yestack.upidetector.core

import java.math.BigDecimal
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class NotePromptTest {

    private val pkg = "com.phonepe.app"
    private val d = DuplicateDetector()
    private val live = snap("Payment successful", "₹100", "Paid to Chai Shop", "Done")

    private fun cand(
        status: TxnStatus = TxnStatus.SUCCESS,
        direction: Direction = Direction.DEBIT,
        ref: String? = null,
        shownAt: Long? = null,
    ) = ParseResult.Candidate(BigDecimal("100"), status, direction, "Chai Shop", ref, null, "Payment successful", 0, shownAt)

    private fun prompt(c: ParseResult.Candidate, t: Long = 0, screen: ScreenSnapshot = live) =
        NotePrompt.paymentFor(screen, c, d.onParseResult(pkg, c, t), t)

    @Test
    fun newSuccessfulDebitPrompts() {
        d.onScreenChanged(pkg, "A", 1, 0)
        assertEquals(1L, prompt(cand())?.id)
    }

    @Test
    fun redrawOfTheSameSuccessDoesNotPromptAgain() {
        d.onScreenChanged(pkg, "A", 1, 0)
        prompt(cand())
        assertNull(prompt(cand(), 500))
    }

    @Test
    fun pendingThenSuccessPromptsOnceOnTheUpgrade() {
        d.onScreenChanged(pkg, "A", 1, 0)
        assertNull(prompt(cand(status = TxnStatus.PENDING)))
        assertEquals(1L, prompt(cand(), 1_000)?.id)
        assertNull(prompt(cand(), 2_000))
    }

    @Test
    fun failedPendingAndCreditDoNotPrompt() {
        // Spaced past the 60 s window so each one is inserted, not flagged.
        d.onScreenChanged(pkg, "A", 1, 0)
        assertNull(prompt(cand(status = TxnStatus.FAILED)))
        d.onScreenChanged(pkg, "B", 1, 100_000)
        assertNull(prompt(cand(direction = Direction.CREDIT), 100_000))
        d.onScreenChanged(pkg, "C", 1, 200_000)
        assertNull(prompt(cand(status = TxnStatus.PENDING), 200_000))
        assertEquals(3, d.transactions.count { it.flag == null })
    }

    @Test
    fun flaggedPossibleDuplicateDoesNotPrompt() {
        d.onScreenChanged(pkg, "A", 1, 0)
        prompt(cand())
        d.onScreenChanged(pkg, "B", 1, 10_000)
        val out = d.onParseResult(pkg, cand(), 10_000)
        assertEquals(true, out.any { it is Decision.FlaggedPossibleDuplicate })
        assertNull(NotePrompt.paymentFor(live, cand(), out, 10_000))
    }

    @Test
    fun notificationAttachingARefDoesNotPrompt() {
        d.onScreenChanged(pkg, "A", 1, 0)
        prompt(cand())
        val hit = NotificationHit(pkg, BigDecimal("100"), "412345678901", Direction.DEBIT, 5_000)
        val out = d.onNotification(hit, 5_000)
        assertEquals("412345678901", (out.single() as Decision.NotificationChecked).txn?.upiRef)
        assertNull(NotePrompt.paymentFor(live, cand(), out, 5_000))
    }

    @Test
    fun oldShownTimeDoesNotPrompt() {
        val now = 3_600_000L
        d.onScreenChanged(pkg, "A", 1, now)
        assertNull(prompt(cand(shownAt = now - NotePrompt.MAX_SHOWN_AGE_MILLIS - 1), now))
        d.onScreenChanged(pkg, "B", 1, now + 100_000)
        assertEquals(2L, prompt(cand(shownAt = now), now + 100_000)?.id)
    }

    @Test
    fun rejectedResultNeverPrompts() {
        d.onScreenChanged(pkg, "A", 1, 0)
        val r = ParseResult.Rejected(RejectReason.HISTORY_SCREEN, "x", true)
        assertNull(NotePrompt.paymentFor(live, r, d.onParseResult(pkg, r, 0), 0))
    }
}
