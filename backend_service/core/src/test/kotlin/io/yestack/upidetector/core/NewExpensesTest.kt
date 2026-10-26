package io.yestack.upidetector.core

import java.math.BigDecimal
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class NewExpensesTest {

    private val phonePe = "com.phonepe.app"

    private fun txn(
        id: Long,
        status: TxnStatus = TxnStatus.SUCCESS,
        direction: Direction = Direction.DEBIT,
        flag: Flag? = null,
    ) = Transaction(
        id = id, sourceApp = phonePe, amount = BigDecimal("1.00"), status = status, direction = direction,
        merchant = "Ravi", upiRef = null, detectedAtMillis = id * 1_000, updatedAtMillis = id * 1_000, sessionId = 1,
        flag = flag, flagReason = null, possibleDuplicateOfId = null,
    )

    private val tracker = NewExpenses()

    @Test
    fun aRecordedExpenseIsReportedOnce() {
        assertEquals(listOf(1L), tracker.newlyRecorded(listOf(txn(1))).map { it.id })
        assertTrue(tracker.newlyRecorded(listOf(txn(1))).isEmpty())
        // A later update of the same record (UPI ref attached, note saved) does not report it again.
        assertTrue(tracker.newlyRecorded(listOf(txn(1).copy(upiRef = "123456789012", note = "Lunch"))).isEmpty())
    }

    @Test
    fun onlyExpensesAreReported() {
        val txns = listOf(
            txn(1, status = TxnStatus.FAILED),
            txn(2, status = TxnStatus.PENDING),
            txn(3, direction = Direction.CREDIT),
            txn(4, flag = Flag.POSSIBLE_DUPLICATE),
        )
        assertTrue(tracker.newlyRecorded(txns).isEmpty())
    }

    @Test
    fun pendingThatSucceedsIsReportedWhenItSucceeds() {
        assertTrue(tracker.newlyRecorded(listOf(txn(1, status = TxnStatus.PENDING))).isEmpty())
        assertEquals(listOf(1L), tracker.newlyRecorded(listOf(txn(1))).map { it.id })
    }

    @Test
    fun aFlaggedRecordKeptOrClearedIsReportedThen() {
        assertTrue(tracker.newlyRecorded(listOf(txn(1, flag = Flag.POSSIBLE_DUPLICATE))).isEmpty())
        assertEquals(listOf(1L), tracker.newlyRecorded(listOf(txn(1))).map { it.id })
    }

    @Test
    fun restoredExpensesAreNeverReported() {
        tracker.markKnown(listOf(txn(1), txn(2, status = TxnStatus.PENDING)))
        assertTrue(tracker.newlyRecorded(listOf(txn(1))).isEmpty())
        // A restored record that only becomes an expense later is still new then.
        assertEquals(listOf(2L), tracker.newlyRecorded(listOf(txn(1), txn(2))).map { it.id })
    }

    @Test
    fun severalNewExpensesComeOldestFirst() {
        assertEquals(listOf(1L, 2L, 3L), tracker.newlyRecorded(listOf(txn(3), txn(1), txn(2))).map { it.id })
    }

    @Test
    fun anyRecordedPhonePeExpenseIsReportedWhateverScreenItCameFrom() {
        // A PhonePe result window without a Done button or a printed time: recorded, so the user is asked about it.
        val pipeline = PaymentPipeline()
        val result = ScreenSnapshot(phonePe, "Chat", 20, listOf("Payment Successful", "₹1", "Ravi").map { TextNode(it, null, null) })
        pipeline.detector.onScreenChanged(phonePe, "Chat", 1, 0L)
        pipeline.onRead(listOf(result), null, 1_000L)
        assertEquals(1, pipeline.detector.transactions.size)
        assertEquals(listOf(1L), tracker.newlyRecorded(pipeline.detector.transactions).map { it.id })
    }
}
