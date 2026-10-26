package io.yestack.upidetector.service

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReadRetryTest {

    private val retry = ReadRetry(maxRetries = 3, emptyDelayMillis = 700L, noWindowDelayMillis = 250L)
    private val cls = "com.phonepe.app.transaction.detail.ui.Navigator_TransactionDetailsActivity"
    private val reason = "no readable window for com.phonepe.app (active window: com.android.systemui)"

    @Test
    fun everySkippedReadIsLoggedWithItsReason() {
        val lines = (1..4).map { retry.onMiss(cls, noWindow = true, reason = reason).logLine }
        assertEquals(4, lines.size)
        lines.forEach {
            assertTrue(it, it.startsWith("snapshot skipped of $cls"))
            assertTrue(it, it.contains(reason))
        }
        assertTrue(lines.last().contains("gave up after 3 retries"))
    }

    @Test
    fun retriesUpToTheLimitThenGivesUp() {
        val misses = (1..4).map { retry.onMiss(cls, noWindow = true, reason = reason) }
        assertEquals(listOf(true, true, true, false), misses.map { it.retry })
        assertEquals(250L, misses.first().delayMillis)
        assertTrue(misses[1].logLine.contains("retry 2 of 3"))
    }

    @Test
    fun emptyWindowRetriesAtItsOwnPace() {
        val miss = retry.onMiss(null, noWindow = false, reason = "root android.widget.FrameLayout childCount=0")
        assertTrue(miss.retry)
        assertEquals(700L, miss.delayMillis)
        assertTrue(miss.logLine.startsWith("empty read of unknown screen"))
    }

    @Test
    fun givingUpIsRememberedUntilReset() {
        repeat(3) { retry.onMiss(cls, noWindow = true, reason = reason) }
        assertFalse(retry.gaveUp)
        retry.onMiss(cls, noWindow = true, reason = reason)
        assertTrue(retry.gaveUp)
        retry.reset()
        assertFalse(retry.gaveUp)
    }

    @Test
    fun resetStartsCountingAgain() {
        repeat(3) { retry.onMiss(cls, noWindow = true, reason = reason) }
        assertFalse(retry.onMiss(cls, noWindow = true, reason = reason).retry)
        retry.reset()
        assertEquals(0, retry.misses)
        assertTrue(retry.onMiss(cls, noWindow = true, reason = reason).retry)
    }
}
