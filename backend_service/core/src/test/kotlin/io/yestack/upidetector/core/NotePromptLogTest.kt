package io.yestack.upidetector.core

import java.math.BigDecimal
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NotePromptLogTest {

    private fun txn(id: Long, status: TxnStatus = TxnStatus.SUCCESS, flag: Flag? = null) = Transaction(
        id = id, sourceApp = "com.phonepe.app", amount = BigDecimal("1.00"), status = status, direction = Direction.DEBIT,
        merchant = "Ravi", upiRef = null, detectedAtMillis = 0, updatedAtMillis = 0, sessionId = 1,
        flag = flag, flagReason = null, possibleDuplicateOfId = null,
    )

    @Test
    fun insertedExpenseIsLoggedAsPrompted() {
        val t = txn(2)
        val lines = NotePromptLog.lines(listOf(Decision.Inserted(t, "")), listOf(t))
        assertEquals(listOf("record #2 inserted (new ₹1.00 expense): note prompt triggered"), lines)
    }

    @Test
    fun insertedNonExpenseIsLoggedAsNotPrompted() {
        val t = txn(3, status = TxnStatus.FAILED)
        val line = NotePromptLog.lines(listOf(Decision.Inserted(t, "")), emptyList()).single()
        assertTrue(line, line.contains("FAILED") && line.endsWith("no note prompt"))
    }

    @Test
    fun updateOfAnExistingExpenseIsNotPrompted() {
        val line = NotePromptLog.lines(listOf(Decision.Updated(txn(1), TxnStatus.SUCCESS, "")), emptyList()).single()
        assertTrue(line, line.endsWith("no note prompt (existing record)"))
    }

    @Test
    fun pendingBecomingSuccessIsPromptedOnce() {
        val t = txn(1)
        val line = NotePromptLog.lines(listOf(Decision.Updated(t, TxnStatus.PENDING, "")), listOf(t)).single()
        assertTrue(line, line.contains("PENDING -> SUCCESS") && line.endsWith("note prompt triggered"))
    }

    @Test
    fun duplicatesAreLoggedAsNotPrompted() {
        val ignored = NotePromptLog.lines(listOf(Decision.IgnoredDuplicate(1, MatchRule.SCREEN_SESSION, "")), emptyList()).single()
        assertTrue(ignored, ignored.contains("ignored as a duplicate (SCREEN_SESSION)") && ignored.endsWith("no note prompt"))
        val flagged = NotePromptLog.lines(
            listOf(Decision.FlaggedPossibleDuplicate(txn(2, flag = Flag.POSSIBLE_DUPLICATE), 1, "")), emptyList(),
        ).single()
        assertTrue(flagged, flagged.contains("POSSIBLE_DUPLICATE of record #1") && flagged.endsWith("no note prompt"))
    }

    @Test
    fun aRecordThatStartsCountingWithoutADecisionIsLoggedToo() {
        // Keep on a flagged record: no detector decision names it.
        assertEquals(listOf("record #4 now counts as an expense: note prompt triggered"), NotePromptLog.lines(emptyList(), listOf(txn(4))))
    }
}
