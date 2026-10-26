package io.yestack.upidetector.budget

import io.yestack.upidetector.core.Direction
import io.yestack.upidetector.core.Flag
import io.yestack.upidetector.core.Transaction
import io.yestack.upidetector.core.TxnStatus
import io.yestack.upidetector.data.RowMeta
import java.math.BigDecimal
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ExtraSpendTest {

    private val zone: ZoneId = ZoneOffset.UTC
    private val dayMillis = LocalDate.parse("2026-10-27").atStartOfDay(zone).toInstant().toEpochMilli() + 3_600_000L
    private val day = LocalDate.parse("2026-10-27")

    private fun txn(
        id: Long,
        amount: String = "100",
        status: TxnStatus = TxnStatus.SUCCESS,
        direction: Direction = Direction.DEBIT,
        flag: Flag? = null,
    ) = Transaction(
        id = id, sourceApp = "com.phonepe.app", amount = BigDecimal(amount), status = status, direction = direction,
        merchant = null, upiRef = null, detectedAtMillis = dayMillis, updatedAtMillis = dayMillis, sessionId = 1L,
        flag = flag, flagReason = null, possibleDuplicateOfId = null,
    )

    private fun meta(
        owner: String? = "u1",
        synced: Boolean = false,
        syncedAt: Long? = null,
    ) = RowMeta(synced = synced, dirty = false, remoteId = null, syncedAtMillis = syncedAt, owner = owner, epoch = 0)

    private fun total(m: Map<LocalDate, BigDecimal>): BigDecimal = m.values.fold(BigDecimal.ZERO) { a, b -> a + b }

    private fun extra(txns: List<Transaction>, meta: Map<Long, RowMeta>, owner: String? = "u1", asOf: Long = 0L) =
        ExtraSpend.byDate(txns, meta, owner, asOf, zone)

    @Test
    fun anUnsyncedExpenseCountsOnItsDay() {
        val m = extra(listOf(txn(1)), mapOf(1L to meta()))
        assertEquals(setOf(day), m.keys)
        assertTrue(BigDecimal(100).compareTo(m[day]) == 0)
    }

    @Test
    fun aRecordSyncedBeforeTheLedgerWasReadIsAlreadyInTheSnapshot() {
        val m = extra(listOf(txn(1)), mapOf(1L to meta(synced = true, syncedAt = 1_000L)), asOf = 2_000L)
        assertTrue(m.isEmpty())
    }

    @Test
    fun aRecordSyncedExactlyAtTheLedgerReadTimeIsCovered() {
        assertTrue(extra(listOf(txn(1)), mapOf(1L to meta(synced = true, syncedAt = 2_000L)), asOf = 2_000L).isEmpty())
    }

    @Test
    fun aRecordSyncedAfterTheLedgerWasReadStillCounts() {
        val m = extra(listOf(txn(1)), mapOf(1L to meta(synced = true, syncedAt = 3_000L)), asOf = 2_000L)
        assertTrue(BigDecimal(100).compareTo(total(m)) == 0)
    }

    @Test
    fun aSnapshotWithoutDataAsOfCountsEverySyncedRecordUntilItIsRefreshed() {
        // dataAsOfMillis absent is 0, so any sync (syncedAt > 0) is newer than the ledger read behind the snapshot.
        val m = extra(listOf(txn(1)), mapOf(1L to meta(synced = true, syncedAt = 5L)), asOf = 0L)
        assertTrue(BigDecimal(100).compareTo(total(m)) == 0)
    }

    @Test
    fun onlySuccessDebitUnflaggedCounts() {
        val txns = listOf(
            txn(1),
            txn(2, status = TxnStatus.FAILED),
            txn(3, status = TxnStatus.PENDING),
            txn(4, direction = Direction.CREDIT),
            txn(5, direction = Direction.UNKNOWN),
            txn(6, flag = Flag.POSSIBLE_DUPLICATE),
        )
        val m = extra(txns, txns.associate { it.id to meta() })
        assertTrue(BigDecimal(100).compareTo(total(m)) == 0)
    }

    @Test
    fun otherOwnersAndUnownedRecordsAreNeverCounted() {
        val txns = listOf(txn(1), txn(2), txn(3))
        val m = extra(txns, mapOf(1L to meta(owner = "u1"), 2L to meta(owner = "u2"), 3L to meta(owner = null)))
        assertTrue(BigDecimal(100).compareTo(total(m)) == 0)
    }

    @Test
    fun noCurrentOwnerCountsNothing() {
        assertTrue(extra(listOf(txn(1)), mapOf(1L to meta()), owner = null).isEmpty())
    }

    @Test
    fun aRecordWithNoMetaIsLeftOut() {
        assertTrue(extra(listOf(txn(1)), emptyMap()).isEmpty())
    }

    @Test
    fun extraSpendFeedsTheAllowance() {
        val snapshot = BudgetSnapshot("2026-10", BigDecimal(31000), mapOf(LocalDate.parse("2026-10-05") to BigDecimal(20000)), 2_000L)
        val extras = extra(listOf(txn(1, "300")), mapOf(1L to meta(synced = true, syncedAt = 3_000L)), asOf = snapshot.dataAsOfMillis)
        val a = BudgetPlan.allowance(snapshot, extras, day)!!
        assertTrue(BigDecimal(300).compareTo(a.spentToday) == 0)
    }
}
