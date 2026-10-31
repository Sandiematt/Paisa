package io.yestack.upidetector.core

import io.yestack.upidetector.core.DumpXml.Win
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DumpScriptTest {

    // ---- ForegroundActivity ------------------------------------------------------------

    @Test
    fun android10PlusTopResumedActivityWithRelativeClass() {
        val out = """
              ResumedActivity: ActivityRecord{8a1b2c u0 com.android.launcher3/.uioverlay.Launcher t2}
              topResumedActivity=ActivityRecord{2b4d5e1 u0 com.phonepe.app/.Navigator_MainActivity t1234}
        """.trimIndent()
        assertEquals(
            ForegroundActivity("com.phonepe.app", "com.phonepe.app.Navigator_MainActivity"),
            ForegroundActivity.parse(out),
        )
    }

    @Test
    fun fullClassNameAndPinActivity() {
        val out = "  topResumedActivity=ActivityRecord{f00ba4 u0 net.one97.paytm/org.npci.upi.security.pinactivitycomponent.GetCredential t99}"
        assertEquals(
            ForegroundActivity("net.one97.paytm", "org.npci.upi.security.pinactivitycomponent.GetCredential"),
            ForegroundActivity.parse(out),
        )
    }

    @Test
    fun android9ResumedActivity() {
        val out = "    mResumedActivity: ActivityRecord{51c3e9a u0 com.google.android.apps.nbu.paisa.user/.main.MainActivity t512}"
        assertEquals(
            ForegroundActivity("com.google.android.apps.nbu.paisa.user", "com.google.android.apps.nbu.paisa.user.main.MainActivity"),
            ForegroundActivity.parse(out),
        )
    }

    @Test
    fun perDisplayResumedActivityWhenNoTopOne() {
        val out = "  ResumedActivity: ActivityRecord{8a1b2c u0 com.phonepe.app/.Navigator_MainActivity t2}"
        assertEquals("com.phonepe.app", ForegroundActivity.parse(out)?.packageName)
    }

    @Test
    fun nothingResumed() {
        assertNull(ForegroundActivity.parse(""))
        assertNull(ForegroundActivity.parse("  mLastPausedActivity: ActivityRecord{51c3e9a u0 com.phonepe.app/.X t5}"))
    }

    // ---- dump output -------------------------------------------------------------------

    private val fg = "  topResumedActivity=ActivityRecord{2b4d5e1 u0 com.phonepe.app/.Navigator_MainActivity t1234}"
    private val xml = DumpXml.windows(Win(1, "com.phonepe.app", DumpXml.texts("Payment Successful", "₹1"), active = true))

    private fun printed(log: String, dumpXml: String?, end: Boolean = true) = buildString {
        append("@@UPIDETECTOR-LOG\n").append(log).append('\n')
        append("@@UPIDETECTOR-XML\n").append(dumpXml.orEmpty()).append("\n\n")
        append("@@UPIDETECTOR-FG\n").append(fg).append('\n')
        if (end) append("@@UPIDETECTOR-END\n")
    }

    @Test
    fun successfulDump() {
        val out = DumpScript.parseDump(printed("UI hierchary dumped to: ${DumpScript.DUMP_FILE}", xml))
        assertTrue(out.complete)
        assertEquals(xml, out.xml)
        assertNull(out.failure)
        assertEquals("com.phonepe.app.Navigator_MainActivity", out.foregroundAfter?.className)
        assertEquals(1, UiDumpParser.parse(out.xml!!).windows.size)
    }

    @Test
    fun idleTimeoutIsExplained() {
        val out = DumpScript.parseDump(printed("ERROR: could not get idle state.", null))
        assertNull(out.xml)
        assertEquals("ERROR: could not get idle state. (the screen kept animating for 10 s)", out.failure)
    }

    @Test
    fun otherFailuresAreQuoted() {
        val out = DumpScript.parseDump(printed("Error: UiAutomationService android.accessibilityservice.IAccessibilityServiceClient already registered!", null))
        assertTrue(out.failure!!.contains("already registered"))
    }

    @Test
    fun cutShortOutputIsIncomplete() {
        assertFalse(DumpScript.parseDump(printed("", xml, end = false)).complete)
    }

    @Test
    fun scriptWritesTheMarkersThisParserReads() {
        listOf("@@UPIDETECTOR-LOG", "@@UPIDETECTOR-XML", "@@UPIDETECTOR-FG", "@@UPIDETECTOR-END").forEach {
            assertTrue(it, DumpScript.DUMP.contains("echo $it"))
        }
        assertTrue(DumpScript.DUMP.contains("uiautomator dump --windows ${DumpScript.DUMP_FILE}"))
        // The old file goes first, so a failed dump never prints a stale one.
        assertTrue(DumpScript.DUMP.indexOf("rm -f") < DumpScript.DUMP.indexOf("uiautomator"))
    }

    @Test
    fun amStartOutputIsRead() {
        assertEquals(
            "am start -n io.yestack.upidetector/.ui.LimitWarningActivity -f 0x10800000 2>&1",
            DumpScript.startActivity("io.yestack.upidetector/.ui.LimitWarningActivity"),
        )
        assertNull(DumpScript.startFailure("Starting: Intent { flg=0x10800000 cmp=io.yestack.upidetector/.ui.LimitWarningActivity }\n"))
        // A missing Activity: "Starting:" is printed first, then the error.
        assertEquals(
            "Error type 3",
            DumpScript.startFailure(
                "Starting: Intent { cmp=io.yestack.upidetector/.ui.X }\n" +
                    "Error type 3\nError: Activity class {io.yestack.upidetector/io.yestack.upidetector.ui.X} does not exist.\n",
            ),
        )
        assertTrue(
            DumpScript.startFailure(
                "Starting: Intent { cmp=a/.B }\nException occurred while executing 'start':\n" +
                    "java.lang.SecurityException: Permission Denial: starting Intent { cmp=a/.B } not exported from uid 10335\n",
            )!!.contains("Exception"),
        )
        assertEquals("am start printed nothing", DumpScript.startFailure(""))
    }

    @Test
    fun inProcessDumpReadsBackLikeTheScript() {
        val out = DumpScript.parseDump(DumpScript.format("dumped in process", xml, fg))
        assertTrue(out.complete)
        assertEquals(xml, out.xml)
        assertNull(out.failure)
        assertEquals("com.phonepe.app.Navigator_MainActivity", out.foregroundAfter?.className)

        val failed = DumpScript.parseDump(DumpScript.format("in-process dump failed: not connected", null, fg))
        assertNull(failed.xml)
        assertEquals("in-process dump failed: not connected", failed.failure)
    }
}
