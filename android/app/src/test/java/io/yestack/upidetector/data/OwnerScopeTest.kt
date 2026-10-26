package io.yestack.upidetector.data

import io.yestack.upidetector.core.Direction
import io.yestack.upidetector.core.Transaction
import io.yestack.upidetector.core.TxnStatus
import java.math.BigDecimal
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class OwnerScopeTest {

    private fun txn(id: Long) = Transaction(
        id = id, sourceApp = "com.phonepe.app", amount = BigDecimal("10"), status = TxnStatus.SUCCESS,
        direction = Direction.DEBIT, merchant = null, upiRef = null, detectedAtMillis = 1L, updatedAtMillis = 1L,
        sessionId = null, flag = null, flagReason = null, possibleDuplicateOfId = null,
    )

    private fun meta(owner: String?) = RowMeta(false, false, null, null, owner, 0)

    private val all = listOf(txn(1), txn(2), txn(3), txn(4))
    private val metas = mapOf(1L to meta("u1"), 2L to meta("u2"), 3L to meta(null), 4L to meta("u1"))

    @Test
    fun onlyTheCurrentOwnersRecordsAreListed() {
        assertEquals(listOf(1L, 4L), OwnerScope.filter(all, metas, "u1").map { it.id })
        assertEquals(listOf(2L), OwnerScope.filter(all, metas, "u2").map { it.id })
    }

    @Test
    fun signedOutSeesNothing() {
        assertEquals(emptyList<Transaction>(), OwnerScope.filter(all, metas, null))
    }

    @Test
    fun aRecordWithNoMetaBelongsToNobody() {
        assertEquals(emptyList<Transaction>(), OwnerScope.filter(listOf(txn(9)), metas, "u1"))
    }

    @Test
    fun newRecordsAreStampedWithTheCurrentThenTheLastOwner() {
        assertEquals("u1", OwnerScope.stampFor("u1", "u0"))
        assertEquals("u0", OwnerScope.stampFor(null, "u0"))
        assertNull(OwnerScope.stampFor(null, null))
    }
}
