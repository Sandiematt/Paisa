package io.yestack.upidetector.service

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReReadScheduleTest {

    private val schedule = ReReadSchedule(listOf(250L, 500L, 750L))

    @Test
    fun anUnfinishedScreenIsReReadABoundedNumberOfTimes() {
        assertEquals(listOf(250L, 500L, 750L, null, null), (1..5).map { schedule.next("no Done yet") })
        assertTrue(schedule.exhausted)
    }

    @Test
    fun aFinishedReadStopsAndRefillsTheBudget() {
        schedule.next("no Done yet")
        schedule.next("no Done yet")
        assertNull(schedule.next(null))
        assertEquals(0, schedule.attempts)
        assertEquals(250L, schedule.next("no amount yet"))
    }

    @Test
    fun aNewScreenRefillsTheBudget() {
        repeat(3) { schedule.next("no Done yet") }
        assertTrue(schedule.exhausted)
        schedule.reset()
        assertFalse(schedule.exhausted)
        assertEquals(250L, schedule.next("no Done yet"))
    }
}
