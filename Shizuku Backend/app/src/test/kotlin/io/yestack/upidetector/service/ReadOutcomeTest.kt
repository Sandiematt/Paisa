package io.yestack.upidetector.service

import org.junit.Assert.assertEquals
import org.junit.Test

class ReadOutcomeTest {

    private val phonePe = "com.phonepe.app"

    @Test
    fun textInAnyWindowIsACapture() {
        assertEquals(ReadOutcome.CAPTURED, ReadOutcome.of(phonePe, appOnScreen = true, activePackage = phonePe, windowsWithText = 1))
        // The active window can be the system's (a fingerprint prompt over the pay sheet).
        assertEquals(
            ReadOutcome.CAPTURED,
            ReadOutcome.of(phonePe, appOnScreen = true, activePackage = "com.android.systemui", windowsWithText = 2),
        )
    }

    @Test
    fun theDetectorOrTheLauncherActiveMeansTheAppWasLeft() {
        assertEquals(
            ReadOutcome.APP_LEFT,
            ReadOutcome.of(phonePe, appOnScreen = false, activePackage = "io.yestack.upidetector", windowsWithText = 0),
        )
        assertEquals(
            ReadOutcome.APP_LEFT,
            ReadOutcome.of(phonePe, appOnScreen = false, activePackage = "com.sec.android.app.launcher", windowsWithText = 0),
        )
    }

    @Test
    fun appOnScreenWithoutTextIsRetried() {
        assertEquals(
            ReadOutcome.NO_TEXT_YET,
            ReadOutcome.of(phonePe, appOnScreen = true, activePackage = "io.yestack.upidetector", windowsWithText = 0),
        )
    }

    @Test
    fun nothingListedAndNoOtherAppActiveIsATransition() {
        assertEquals(ReadOutcome.NOT_LISTED_YET, ReadOutcome.of(phonePe, appOnScreen = false, activePackage = null, windowsWithText = 0))
        assertEquals(ReadOutcome.NOT_LISTED_YET, ReadOutcome.of(phonePe, appOnScreen = false, activePackage = phonePe, windowsWithText = 0))
    }
}
