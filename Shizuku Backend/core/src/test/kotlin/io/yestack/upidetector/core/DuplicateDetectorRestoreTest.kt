package io.yestack.upidetector.core

import java.math.BigDecimal
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DuplicateDetectorRestoreTest {

    private val pkg = "com.phonepe.app"

    private fun cand(amount: String = "100", status: TxnStatus = TxnStatus.SUCCESS, ref: String? = null) =
        ParseResult.Candidate(BigDecimal(amount), status, Direction.DEBIT, "Chai Shop", ref, null, "Payment successful", 0)

    /** A detector with one SUCCESS record (#1, session #1) as a previous process would have left it. */
    private fun saved(ref: String? = null): List<Transaction> {
        val d = DuplicateDetector()
        d.onScreenChanged(pkg, "A", 1, 0)
        d.onParseResult(pkg, cand(ref = ref), 0)
        return d.transactions
    }

    @Test
    fun restoredIdsAndSessionsContinueAfterTheSavedOnes() {
        val d = DuplicateDetector()
        d.restore(saved())
        val started = d.onScreenChanged(pkg, "A", 1, 120_000).single() as Decision.SessionStarted
        assertEquals(2L, started.sessionId)
        // Without the session offset this would match record #1's session #1 and be ignored as a duplicate.
        val inserted = d.onParseResult(pkg, cand(), 120_000).single() as Decision.Inserted
        assertEquals(2L, inserted.txn.id)
        assertEquals(2, d.transactions.size)
    }

    @Test
    fun upiRefDedupStillWorksAfterRestore() {
        val d = DuplicateDetector()
        d.restore(saved(ref = "412345678901"))
        d.onScreenChanged(pkg, "B", 1, 900_000)
        val out = d.onParseResult(pkg, cand(ref = "412345678901"), 900_000).single()
        assertEquals(MatchRule.UPI_REF, (out as Decision.IgnoredDuplicate).rule)
        assertEquals(1, d.transactions.size)
    }

    @Test
    fun restoreKeepsNotesAndTotals() {
        val d = DuplicateDetector()
        d.restore(saved().map { it.copy(note = "lunch") })
        assertEquals("lunch", d.transactions.single().note)
        assertEquals(0, BigDecimal("100").compareTo(d.expenseTotal()))
    }

    @Test
    fun attachNoteSetsTrimsAndClears() {
        val d = DuplicateDetector()
        d.restore(saved())
        assertTrue(d.attachNote(1, "  groceries "))
        assertEquals("groceries", d.transactions.single().note)
        assertTrue(d.attachNote(1, "   "))
        assertNull(d.transactions.single().note)
        assertFalse(d.attachNote(99, "x"))
    }

    @Test
    fun noteSurvivesAStatusUpgrade() {
        val d = DuplicateDetector()
        d.onScreenChanged(pkg, "A", 1, 0)
        d.onParseResult(pkg, cand(status = TxnStatus.PENDING), 0)
        d.attachNote(1, "rent")
        val updated = d.onParseResult(pkg, cand(), 1_000).single() as Decision.Updated
        assertEquals("rent", updated.txn.note)
    }
}
