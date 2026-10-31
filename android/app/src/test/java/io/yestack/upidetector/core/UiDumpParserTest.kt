package io.yestack.upidetector.core

import io.yestack.upidetector.core.DumpXml.Node
import io.yestack.upidetector.core.DumpXml.Win
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class UiDumpParserTest {

    private val phonePe = "com.phonepe.app"
    private val launcher = "com.sec.android.app.launcher"

    @Test
    fun multiWindowDumpKeepsZOrderIdsTypesAndPackages() {
        val xml = DumpXml.windows(
            Win(41, "com.android.systemui", DumpXml.texts("10:01"), type = "TYPE_SYSTEM"),
            Win(87, phonePe, DumpXml.texts("Payment Successful", "₹1"), active = true),
            Win(85, phonePe, DumpXml.texts("Ravi (bro)", "₹11", "PAID")),
        )
        val dump = UiDumpParser.parse(xml)
        assertTrue(dump.allWindows)
        assertEquals(listOf(41, 87, 85), dump.windows.map { it.id })
        assertEquals(listOf("TYPE_SYSTEM", "TYPE_APPLICATION", "TYPE_APPLICATION"), dump.windows.map { it.type })
        assertEquals(listOf(false, true, false), dump.windows.map { it.active })
        assertEquals(listOf("com.android.systemui", phonePe, phonePe), dump.windows.map { it.packageName })
        assertEquals(listOf("Payment Successful", "₹1"), dump.windows[1].nodes.map { it.text })
        assertEquals("android.widget.FrameLayout", dump.windows[1].rootClass)
        // The root container has no text: walked and counted, not kept.
        assertEquals(3, dump.windows[1].nodeCount)
    }

    @Test
    fun nodeFieldsMapToTextNodesInPreOrder() {
        val xml = DumpXml.windows(
            Win(
                1, phonePe,
                listOf(
                    Node(
                        cls = "android.view.ViewGroup", id = "com.phonepe.app:id/card",
                        children = listOf(
                            Node(text = "₹", id = "com.phonepe.app:id/currency"),
                            Node(text = "11"),
                        ),
                    ),
                    Node(desc = "Done", cls = "android.widget.Button"),
                    Node(cls = "android.widget.ImageView"),
                ),
            ),
        )
        val nodes = UiDumpParser.parse(xml).windows.single().nodes
        assertEquals(
            listOf(
                TextNode("₹", null, "com.phonepe.app:id/currency"),
                TextNode("11", null, null),
                TextNode(null, "Done", null),
            ),
            nodes,
        )
    }

    @Test
    fun passwordFieldTextIsNeverKeptButItsChildrenAre() {
        val xml = DumpXml.windows(
            Win(1, phonePe, listOf(Node(text = "123456", password = true, children = listOf(Node(text = "Show"))))),
        )
        assertEquals(listOf("Show"), UiDumpParser.parse(xml).windows.single().nodes.map { it.text })
    }

    @Test
    fun escapedTextAndTheRupeeSignSurvive() {
        val xml = DumpXml.windows(Win(1, phonePe, DumpXml.texts("Tom & Jerry \"Café\" <shop>", "₹1,250.50")))
        assertEquals(
            listOf("Tom & Jerry \"Café\" <shop>", "₹1,250.50"),
            UiDumpParser.parse(xml).windows.single().nodes.map { it.text },
        )
    }

    @Test
    fun singleWindowDumpIsTheActiveWindowWithNoId() {
        val dump = UiDumpParser.parse(DumpXml.single(phonePe, DumpXml.texts("Payment Successful", "₹1")))
        assertFalse(dump.allWindows)
        val w = dump.windows.single()
        assertNull(w.id)
        assertTrue(w.active)
        assertEquals(phonePe, w.packageName)
        assertEquals(listOf("Payment Successful", "₹1"), w.nodes.map { it.text })
    }

    @Test
    fun childWindowsAreListedBeforeTheirParentAsTheDumperWritesThem() {
        val xml = DumpXml.windows(
            Win(5, phonePe, DumpXml.texts("parent"), childWindows = listOf(Win(6, phonePe, DumpXml.texts("embedded")))),
        )
        assertEquals(listOf(6, 5), UiDumpParser.parse(xml).windows.map { it.id })
    }

    @Test
    fun windowWithNoRootHasNoPackageOrNodes() {
        val w = UiDumpParser.parse(DumpXml.windows(Win(9, phonePe, emptyList(), noRoot = true))).windows.single()
        assertNull(w.packageName)
        assertEquals(0, w.nodeCount)
    }

    @Test(expected = UiDumpParser.MalformedDumpException::class)
    fun truncatedDumpIsRejected() {
        val xml = DumpXml.windows(Win(1, phonePe, DumpXml.texts("Payment Successful", "₹1")))
        UiDumpParser.parse(xml.substring(0, xml.length / 2))
    }

    @Test(expected = UiDumpParser.MalformedDumpException::class)
    fun doctypeIsRejected() {
        UiDumpParser.parse("<?xml version='1.0'?><!DOCTYPE x [<!ENTITY a \"b\">]><hierarchy><node text=\"&a;\"/></hierarchy>")
    }

    @Test(expected = UiDumpParser.MalformedDumpException::class)
    fun unexpectedRootIsRejected() {
        UiDumpParser.parse("<?xml version='1.0'?><html/>")
    }

    // ---- DumpRead ----------------------------------------------------------------------

    @Test
    fun readKeepsOnlyTheAppsWindowsTopMostFirstWithTheirIds() {
        val dump = UiDumpParser.parse(
            DumpXml.windows(
                Win(30, "com.google.android.inputmethod.latin", DumpXml.texts("q", "w"), type = "TYPE_INPUT_METHOD"),
                Win(87, phonePe, DumpXml.texts("Payment Successful", "₹1"), active = true),
                Win(85, phonePe, DumpXml.texts("Ravi (bro)", "₹11", "PAID")),
                Win(2, launcher, DumpXml.texts("Phone")),
            ),
        )
        val read = DumpRead.of(dump, phonePe, "com.phonepe.app.Navigator_MainActivity")
        assertTrue(read.appOnScreen)
        assertEquals(phonePe, read.activePackage)
        assertEquals(listOf(87, 85), read.windows.map { it.snapshot.windowId })
        assertTrue(read.windows.all { it.snapshot.screenClass == "com.phonepe.app.Navigator_MainActivity" })
        assertTrue(read.windows[0].info, read.windows[0].info.startsWith("window 87, layer 2 of 4, app, active"))
        assertTrue(read.diagnostics, read.diagnostics.contains("keyboard:com.google.android.inputmethod.latin"))
    }

    @Test
    fun pinWindowIsDroppedAndCounted() {
        val dump = UiDumpParser.parse(
            DumpXml.windows(
                Win(90, phonePe, DumpXml.texts("Enter UPI PIN", "1", "2", "3"), active = true),
                Win(85, phonePe, DumpXml.texts("Ravi (bro)")),
            ),
        )
        val read = DumpRead.of(dump, phonePe, null)
        assertEquals(1, read.pinWindowsDropped)
        assertEquals(listOf(85), read.windows.map { it.snapshot.windowId })
        assertTrue(read.windows.none { w -> w.snapshot.nodes.any { it.text == "Enter UPI PIN" } })
    }

    @Test
    fun anotherAppInFrontLeavesNothingOfTheApp() {
        val dump = UiDumpParser.parse(DumpXml.windows(Win(2, launcher, DumpXml.texts("Phone"), active = true)))
        val read = DumpRead.of(dump, phonePe, null)
        assertFalse(read.appOnScreen)
        assertEquals(launcher, read.activePackage)
        assertTrue(read.windows.isEmpty())
    }
}
