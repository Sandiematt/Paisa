package io.yestack.upidetector.ui

import io.yestack.upidetector.AppStore
import io.yestack.upidetector.core.ScreenSnapshot
import io.yestack.upidetector.core.TextNode
import java.math.BigDecimal
import org.junit.Assert.assertTrue
import org.junit.Test

class ReportBuilderTest {
    private val header = ReportBuilder.Header("1.0", "Test Phone", "14", 0L, true, emptyMap(), false, 0)

    private fun capture(n: Int) = AppStore.RawCapture(
        ScreenSnapshot("com.phonepe.app", "Cls$n", 1, List(2000) { TextNode("t$n-$it ".repeat(4), null, "id/$it") }),
        0L, "v",
    )

    @Test
    fun headerShowsNotificationFields() {
        val h = ReportBuilder.Header("1.0", "Test Phone", "14", 0L, true, emptyMap(), true, 7)
        val text = ReportBuilder.build(h, emptyList(), BigDecimal.ZERO, emptyList(), emptyList())
        assertTrue(text.contains("Notification access: true"))
        assertTrue(text.contains("Notifications ignored: 7"))
    }

    @Test
    fun trimsOldestRawCapturesToStayUnderCap() {
        val raws = List(30) { capture(it) } // newest first
        val text = ReportBuilder.build(header, emptyList(), BigDecimal.ZERO, listOf("00:00:00 x"), raws)
        assertTrue(text.toByteArray().size <= ReportBuilder.MAX_BYTES)
        assertTrue(text.contains("oldest capture(s) omitted"))
        assertTrue(text.contains("Cls0"))
        assertTrue(!text.contains("Cls29"))
    }
}
