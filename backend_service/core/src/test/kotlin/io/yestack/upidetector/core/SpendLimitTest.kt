package io.yestack.upidetector.core

import java.math.BigDecimal
import java.time.ZoneId
import java.time.ZonedDateTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class SpendLimitTest {

    private val zone = ZoneId.of("Asia/Kolkata")

    private fun millis(day: Int, hour: Int, minute: Int = 0) =
        ZonedDateTime.of(2026, 10, day, hour, minute, 0, 0, zone).toInstant().toEpochMilli()

    private fun txn(
        id: Long,
        amount: String,
        at: Long,
        status: TxnStatus = TxnStatus.SUCCESS,
        direction: Direction = Direction.DEBIT,
        flag: Flag? = null,
    ) = Transaction(id, "com.phonepe.app", BigDecimal(amount), status, direction, null, null, at, at, null, flag, null, null)

    @Test
    fun reachingTheLimitExactlyIsAllowed() {
        assertFalse(SpendLimit.exceeds(BigDecimal("1500.00"), BigDecimal("500"), BigDecimal("2000")))
    }

    @Test
    fun onePaisaOverIsBlocked() {
        assertTrue(SpendLimit.exceeds(BigDecimal("1500.00"), BigDecimal("500.01"), BigDecimal("2000")))
    }

    @Test
    fun startOfDayIsLocalMidnight() {
        assertEquals(millis(24, 0), SpendLimit.startOfDay(millis(24, 23, 59), zone))
        assertEquals(millis(25, 0), SpendLimit.startOfDay(millis(25, 0, 1), zone))
    }

    @Test
    fun spentTodayCountsOnlyTodaysUnflaggedSuccessfulDebits() {
        val txns = listOf(
            txn(1, "100", millis(23, 23, 59)), // yesterday
            txn(2, "200", millis(24, 0)),
            txn(3, "300", millis(24, 9), status = TxnStatus.PENDING),
            txn(4, "400", millis(24, 10), status = TxnStatus.FAILED),
            txn(5, "500", millis(24, 11), direction = Direction.CREDIT),
            txn(6, "600", millis(24, 12), flag = Flag.POSSIBLE_DUPLICATE),
            txn(7, "50.50", millis(24, 13)),
        )
        val start = SpendLimit.startOfDay(millis(24, 14), zone)
        assertEquals(0, BigDecimal("250.50").compareTo(SpendLimit.spentSince(txns, start)))
    }
}
