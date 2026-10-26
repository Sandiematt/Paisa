package io.yestack.upidetector

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CrashLogTest {

    @Test
    fun keepsClassesAndFramesButNotMessages() {
        val error = IllegalStateException("screen text ₹1 Ravi", IllegalArgumentException("more screen text"))
        val text = CrashLog.describe("main", error)
        assertTrue(text, text.startsWith("crash on thread main"))
        assertTrue(text, text.contains("java.lang.IllegalStateException"))
        assertTrue(text, text.contains("caused by java.lang.IllegalArgumentException"))
        assertTrue(text, text.contains("  at "))
        assertFalse(text, text.contains("screen text"))
    }
}
