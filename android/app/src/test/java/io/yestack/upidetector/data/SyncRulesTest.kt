package io.yestack.upidetector.data

import io.yestack.upidetector.core.Direction
import io.yestack.upidetector.core.Flag
import io.yestack.upidetector.core.Transaction
import io.yestack.upidetector.core.TxnStatus
import java.math.BigDecimal
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SyncRulesTest {

    private fun txn(
        status: TxnStatus = TxnStatus.SUCCESS,
        flag: Flag? = null,
        direction: Direction = Direction.DEBIT,
        note: String? = null,
        upiRef: String? = null,
        updated: Long = 1_000L,
    ) = Transaction(
        id = 7, sourceApp = "com.phonepe.app", amount = BigDecimal("149.50"), status = status,
        direction = direction, merchant = "Cafe", upiRef = upiRef, detectedAtMillis = 1_000L,
        updatedAtMillis = updated, sessionId = 1L, flag = flag, flagReason = null, possibleDuplicateOfId = null, note = note,
    )

    @Test
    fun onlySuccessfulUnflaggedRecordsSync() {
        assertTrue(SyncRules.isSyncable(txn()))
        assertFalse(SyncRules.isSyncable(txn(status = TxnStatus.FAILED)))
        assertFalse(SyncRules.isSyncable(txn(status = TxnStatus.PENDING)))
        assertFalse(SyncRules.isSyncable(txn(flag = Flag.POSSIBLE_DUPLICATE)))
    }

    @Test
    fun unknownDirectionNeverSyncs() {
        assertFalse(SyncRules.isSyncable(txn(direction = Direction.UNKNOWN)))
        assertFalse(SyncRules.marksDirty(null, txn(direction = Direction.UNKNOWN)))
    }

    @Test
    fun debitAndCreditBothSync() {
        assertTrue(SyncRules.isSyncable(txn(direction = Direction.DEBIT)))
        assertTrue(SyncRules.isSyncable(txn(direction = Direction.CREDIT)))
    }

    @Test
    fun directionResolvedLaterBecomesDirty() {
        assertTrue(SyncRules.marksDirty(txn(direction = Direction.UNKNOWN), txn(direction = Direction.DEBIT)))
    }

    @Test
    fun aNewSuccessfulRecordIsMarkedDirty() {
        assertTrue(SyncRules.marksDirty(null, txn()))
    }

    @Test
    fun aNewFailedOrPendingOrFlaggedRecordIsNotMarkedDirty() {
        assertFalse(SyncRules.marksDirty(null, txn(status = TxnStatus.FAILED)))
        assertFalse(SyncRules.marksDirty(null, txn(status = TxnStatus.PENDING)))
        assertFalse(SyncRules.marksDirty(null, txn(flag = Flag.POSSIBLE_DUPLICATE)))
    }

    @Test
    fun statusUpgradeBecomesDirty() {
        assertTrue(SyncRules.marksDirty(txn(status = TxnStatus.PENDING), txn(status = TxnStatus.SUCCESS)))
    }

    @Test
    fun noteAttachedBecomesDirty() {
        assertTrue(SyncRules.marksDirty(txn(), txn(note = "lunch")))
    }

    @Test
    fun upiRefAddedBecomesDirty() {
        assertTrue(SyncRules.marksDirty(txn(), txn(upiRef = "123456789012")))
    }

    @Test
    fun flagClearedByKeepBecomesDirty() {
        assertTrue(SyncRules.marksDirty(txn(flag = Flag.POSSIBLE_DUPLICATE), txn(flag = null)))
    }

    @Test
    fun aTimestampOnlyChangeIsNotDirty() {
        assertFalse(SyncRules.marksDirty(txn(), txn(updated = 9_999L)))
    }

    @Test
    fun aSyncableRecordTurnedFlaggedIsNotMarkedDirty() {
        assertFalse(SyncRules.marksDirty(txn(), txn(flag = Flag.POSSIBLE_DUPLICATE)))
    }

    @Test
    fun externalRefFollowsTheContract() {
        assertEquals("upi:abc:0:7", SyncRules.externalRef("abc", 0, 7))
    }

    @Test
    fun theSameIdInANewEpochGivesADifferentRef() {
        // Clear history bumps the epoch; ids restart after a process restart.
        assertTrue(SyncRules.externalRef("abc", 0, 1) != SyncRules.externalRef("abc", 1, 1))
        assertEquals("upi:abc:3:1", SyncRules.externalRef("abc", 3, 1))
    }
}
