package io.yestack.upidetector.service

import io.yestack.upidetector.core.DumpScript
import io.yestack.upidetector.core.PaymentPipeline
import io.yestack.upidetector.core.ScreenSnapshot
import io.yestack.upidetector.core.TxnStatus
import java.math.BigDecimal
import java.time.LocalDateTime
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * [DumpCaptureLoop] against a fake shell that answers like a phone would: `dumpsys` lines for the resumed Activity and
 * `uiautomator dump --windows` XML for the screen. The sink feeds the real [PaymentPipeline], as AppStore does.
 */
class DumpCaptureLoopTest {

    private val ist = ZoneId.of("Asia/Kolkata")
    private fun at(text: String): Long = LocalDateTime.parse(text).atZone(ist).toInstant().toEpochMilli()

    private val gpay = "com.google.android.apps.nbu.paisa.user"
    private val gpayMain = "$gpay.main.MainActivity"
    private val phonePe = "com.phonepe.app"
    private val phonePeChat = "com.phonepe.app.chat.ui.Navigator_ChatActivity"
    private val paytm = "net.one97.paytm"
    private val pin = "org.npci.upi.security.pinactivitycomponent.GetCredential"
    private val launcher = "com.sec.android.app.launcher"

    // ---- what the phone prints ------------------------------------------------------------------

    private fun resumed(pkg: String, cls: String) =
        "  ResumedActivity: ActivityRecord{8a1b2c u0 $launcher/.Launcher t2}\n" +
            "  topResumedActivity=ActivityRecord{2b4d5e1 u0 $pkg/$cls t1234}\n"

    private class Win(val id: Int, val pkg: String, val texts: List<String>, val active: Boolean = false)

    private fun esc(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace("\"", "&quot;")

    /** Same layout as AOSP's dumper writes for `--windows`; see core's DumpXml for the full attribute set. */
    private fun dumpXml(vararg windows: Win) = buildString {
        append("<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><displays><display id=\"0\">")
        windows.forEachIndexed { i, w ->
            append("<window index=\"$i\" title=\"\" bounds=\"[0,0][1080,2400]\" active=\"${w.active}\" focused=\"${w.active}\" ")
            append("accessibility-focused=\"false\" id=\"${w.id}\" layer=\"${10 - i}\" type=\"TYPE_APPLICATION\">")
            append("<hierarchy rotation=\"0\"><node index=\"0\" text=\"\" resource-id=\"\" class=\"android.widget.FrameLayout\" ")
            append("package=\"${w.pkg}\" content-desc=\"\" password=\"false\" bounds=\"[0,0][1080,2400]\">")
            w.texts.forEachIndexed { j, t ->
                append("<node index=\"$j\" text=\"${esc(t)}\" resource-id=\"\" class=\"android.widget.TextView\" ")
                append("package=\"${w.pkg}\" content-desc=\"\" password=\"false\" bounds=\"[0,0][1080,100]\" />")
            }
            append("</node></hierarchy></window>")
        }
        append("</display></displays>")
    }

    private fun dumpOutput(xml: String?, after: String, log: String = "UI hierchary dumped to: ${DumpScript.DUMP_FILE}") =
        "@@UPIDETECTOR-LOG\n$log\n@@UPIDETECTOR-XML\n${xml.orEmpty()}\n\n@@UPIDETECTOR-FG\n$after@@UPIDETECTOR-END\n"

    /** One poll's worth of phone state: what dumpsys says, and what a dump would print (null: must not dump). */
    private class Screen(val foreground: String, val dump: String?, val at: Long)

    private inner class FakeShell : DumpCaptureLoop.Shell {
        val screens = ArrayDeque<Screen>()
        var current: Screen? = null
        var dumps = 0
        var throwNext: Exception? = null

        override fun run(script: String, timeoutMillis: Long): String {
            throwNext?.let { throwNext = null; throw it }
            return when (script) {
                DumpScript.FOREGROUND -> screens.removeFirst().also { current = it }.foreground
                DumpScript.DUMP -> {
                    dumps++
                    current?.dump ?: throw AssertionError("dumped a screen that must not be dumped")
                }
                else -> throw AssertionError("unexpected script $script")
            }
        }
    }

    // ---- where it goes --------------------------------------------------------------------------

    private class PipelineSink : DumpCaptureLoop.Sink {
        val pipeline = PaymentPipeline()
        val calls = ArrayList<String>()
        val reads = ArrayList<List<ScreenSnapshot>>()
        val misses = ArrayList<String>()

        override fun log(message: String, now: Long) {
            calls += "log: $message"
        }

        override fun onScreenChanged(packageName: String, screenClass: String, now: Long) {
            calls += "screen $packageName/$screenClass"
            pipeline.forgetLastRead()
            pipeline.detector.onScreenChanged(packageName, screenClass, null, now)
        }

        override fun onAppBackground(packageName: String, now: Long) {
            calls += "background $packageName"
            pipeline.forgetLastRead()
            pipeline.detector.onAppBackground(packageName, now)
        }

        override fun onPaymentAttempt(packageName: String, now: Long, amount: BigDecimal?) {
            calls += "attempt $packageName ${amount?.toPlainString()}"
            pipeline.detector.onPaymentAttempt(packageName, now, amount)
        }

        override fun onCaptured(packageName: String, windows: List<ScreenSnapshot>, now: Long) {
            calls += "captured $packageName ${windows.size}"
        }

        override fun onRead(packageName: String, windows: List<ScreenSnapshot>, infos: List<String>, now: Long) {
            calls += "read $packageName ${windows.size}"
            reads += windows
            pipeline.onRead(windows, notBeforeMillis = null, nowMillis = now, zone = ZoneId.of("Asia/Kolkata"))
        }

        override fun onReadMiss(packageName: String, screenClass: String?, logLine: String, now: Long) {
            calls += "miss"
            misses += logLine
        }
    }

    private val shell = FakeShell()
    private val sink = PipelineSink()
    private var clock = 0L
    private val loop = DumpCaptureLoop(shell, sink) { shell.current?.at ?: clock }

    private fun play(vararg screens: Screen) {
        shell.screens.addAll(screens)
        while (shell.screens.isNotEmpty()) loop.tick()
    }

    private fun appScreen(pkg: String, cls: String, at: Long, vararg windows: Win) =
        Screen(resumed(pkg, cls), dumpOutput(dumpXml(*windows), resumed(pkg, cls)), at)

    private fun home(at: Long) = Screen(resumed(launcher, ".Launcher"), null, at)

    // ---- GPay ------------------------------------------------------------------------------------

    private val gpayConfirm = listOf("Paying SANJAY MATHEW", "sanjay@okicici", "₹", "1", "Add a note", "Pay")
    private val gpaySuccess = listOf(
        "₹1", "Paid to", "SANJAY MATHEW", "Banking name: SANJAY MATHEW", "23 October 2026, 1:24am",
        "POWERED BY", "Share screenshot", "See details", "Done",
    )

    @Test
    fun gpayPaymentFlowIsRecordedOnceAndThePinScreenIsNeverDumped() {
        val t = at("2026-10-23T01:23:50")
        play(
            home(t),
            appScreen(gpay, gpayMain, t + 2_000, Win(70, gpay, gpayConfirm, active = true)),
            Screen(resumed(gpay, pin), null, t + 5_000),
            Screen(resumed(gpay, pin), null, t + 6_000),
            appScreen(gpay, gpayMain, at("2026-10-23T01:24:10"), Win(70, gpay, gpaySuccess, active = true)),
            appScreen(gpay, gpayMain, at("2026-10-23T01:24:12"), Win(70, gpay, gpaySuccess, active = true)),
            appScreen(gpay, gpayMain, at("2026-10-23T01:24:14"), Win(70, gpay, gpaySuccess, active = true)),
            home(at("2026-10-23T01:24:20")),
        )
        val txns = sink.pipeline.detector.transactions
        assertEquals(1, txns.size)
        assertEquals(BigDecimal("1.00"), txns.single().amount)
        assertEquals(TxnStatus.SUCCESS, txns.single().status)
        assertEquals(4, shell.dumps)
        assertTrue(sink.calls.toString(), sink.calls.contains("attempt $gpay 1.00"))
        assertTrue(sink.calls.contains("log: skipped PIN-entry screen (not dumped)"))
        assertEquals("background $gpay", sink.calls.last())
        assertFalse(sink.reads.flatten().any { s -> s.nodes.any { it.text?.contains("PIN") == true } })
    }

    // ---- PhonePe ---------------------------------------------------------------------------------

    private val phonePeChatCards = listOf("Ravi (bro)", "₹1", "PAID", "1:58 AM", "₹11", "PAID", "3:40 PM")
    private val phonePeSuccess = listOf(
        "Payment Successful", "24 October 2026 at 03:43 PM", "Ravi (bro)", "ravi@okicici", "₹1",
        "Split Expense", "View Details", "Share Receipt", "Done",
    )

    @Test
    fun phonePeResultWindowOverTheChatIsReadAsItsOwnWindow() {
        play(
            appScreen(phonePe, phonePeChat, at("2026-10-24T15:43:05"), Win(87, phonePe, phonePeSuccess, active = true), Win(85, phonePe, phonePeChatCards)),
            home(at("2026-10-24T15:43:30")),
        )
        assertEquals(listOf(87, 85), sink.reads.single().map { it.windowId })
        val txn = sink.pipeline.detector.transactions.single()
        assertEquals(BigDecimal("1.00"), txn.amount)
    }

    @Test
    fun dumpTakenWhileTheActivityChangedIsDiscarded() {
        val t = at("2026-10-24T15:43:05")
        val detail = "com.phonepe.app.transaction.detail.ui.Navigator_TransactionDetailsActivity"
        play(
            Screen(
                resumed(phonePe, phonePeChat),
                dumpOutput(dumpXml(Win(87, phonePe, phonePeSuccess, active = true)), after = resumed(phonePe, detail)),
                t,
            ),
        )
        assertTrue(sink.reads.isEmpty())
        assertTrue(sink.calls.toString(), sink.calls.any { it.contains("screen changed during the dump") })
    }

    @Test
    fun animatedScreenThatCannotBeDumpedIsLoggedABoundedNumberOfTimes() {
        val t = at("2026-10-24T15:43:05")
        val failing = Screen(resumed(phonePe, phonePeChat), dumpOutput(null, resumed(phonePe, phonePeChat), "ERROR: could not get idle state."), t)
        play(*Array(10) { failing })
        assertEquals(10, shell.dumps)
        assertEquals(DumpCaptureLoop.MAX_MISS_LOGS + 1, sink.misses.size)
        assertTrue(sink.misses.first(), sink.misses.first().contains("could not get idle state"))
        assertTrue(sink.misses.last(), sink.misses.last().contains("gave up"))
        assertTrue(sink.reads.isEmpty())
    }

    @Test
    fun appCoveredByAnotherAppsWindowIsAMissNotARead() {
        val t = at("2026-10-24T15:43:05")
        play(appScreen(phonePe, phonePeChat, t, Win(5, "com.android.systemui", listOf("Notifications"), active = true)))
        assertTrue(sink.reads.isEmpty())
        assertTrue(sink.misses.single(), sink.misses.single().contains("no window of PhonePe in the dump"))
    }

    // ---- Paytm (synthetic screen) ----------------------------------------------------------------

    @Test
    fun paytmSuccessThenAnotherSupportedAppEndsPaytmsSession() {
        val cls = "net.one97.paytm.wallet.newdesign.activity.PaymentSuccessActivity"
        val screen = listOf("Paid Successfully", "Rs.1", "To: Ravi", "UPI Ref No: 123456789012", "Done")
        val t = at("2026-10-24T16:00:00")
        play(
            appScreen(paytm, cls, t, Win(60, paytm, screen, active = true)),
            appScreen(phonePe, phonePeChat, t + 5_000, Win(85, phonePe, phonePeChatCards, active = true)),
        )
        assertEquals("123456789012", sink.pipeline.detector.transactions.single().upiRef)
        val i = sink.calls.indexOf("background $paytm")
        assertTrue(sink.calls.toString(), i >= 0 && i < sink.calls.indexOf("screen $phonePe/$phonePeChat"))
    }

    // ---- failures --------------------------------------------------------------------------------

    @Test
    fun unknownForegroundChangesNothingAndIsLoggedOnce() {
        play(Screen("", null, 0L), Screen("", null, 0L))
        assertEquals(listOf("log: dump capture: no resumed Activity listed by dumpsys; waiting"), sink.calls)
        assertEquals(0, shell.dumps)
    }

    @Test
    fun shellFailureIsLoggedAndWaitedOut() {
        shell.throwNext = IllegalStateException("shell service not connected")
        assertEquals(DumpCaptureLoop.ERROR_DELAY_MILLIS, loop.tick())
        assertTrue(sink.calls.single().contains("foreground check failed"))
    }

    @Test
    fun stoppingReportsTheAppBeingReadAsLeft() {
        val t = at("2026-10-23T01:24:10")
        play(appScreen(gpay, gpayMain, t, Win(70, gpay, gpaySuccess, active = true)))
        loop.stop()
        assertEquals("background $gpay", sink.calls.last())
        assertEquals(null, loop.current)
    }
}
