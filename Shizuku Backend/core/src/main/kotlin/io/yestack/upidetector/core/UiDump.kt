package io.yestack.upidetector.core

import java.io.StringReader
import javax.xml.parsers.DocumentBuilderFactory
import org.w3c.dom.Element
import org.xml.sax.InputSource

/** One window of a `uiautomator dump`, its nodes flattened in tree (pre-order) order, as [ScreenSnapshot] holds them. */
data class DumpWindow(
    /** Window ID (`--windows` dumps only). */
    val id: Int?,
    /** "TYPE_APPLICATION", "TYPE_INPUT_METHOD", ... (`--windows` dumps only). */
    val type: String?,
    val active: Boolean,
    /** Package of the window's root node; null when the window had no content. */
    val packageName: String?,
    val rootClass: String?,
    /** Nodes with text or a content description, in pre-order. A password field's text is never kept. */
    val nodes: List<TextNode>,
    /** Every node in the window, with or without text. */
    val nodeCount: Int,
)

/** A parsed dump: every window, top-most first. [allWindows] is false for a dump of the active window only. */
data class UiDump(val windows: List<DumpWindow>, val allWindows: Boolean)

/**
 * Reads the XML that `uiautomator dump` writes. Two layouts exist:
 * - `uiautomator dump --windows` (Android 11+): `<displays><display><window ...>[child windows]<hierarchy><node>...`,
 *   every window on screen in z-order, top-most first, with its ID, type and whether it is active.
 * - plain `uiautomator dump` (and older platforms, which ignore `--windows`): `<hierarchy><node>...`, the active window
 *   only.
 *
 * The dumper leaves out nodes that are not visible to the user (scrolled off screen or hidden), so a dump holds only
 * what could be seen on screen.
 */
object UiDumpParser {

    class MalformedDumpException(message: String, cause: Throwable? = null) : Exception(message, cause)

    fun parse(xml: String): UiDump {
        // uiautomator never writes a DOCTYPE; refusing one rules out entity tricks whatever the parser supports.
        if (xml.contains("<!DOCTYPE", ignoreCase = true)) throw MalformedDumpException("dump has a DOCTYPE")
        val root = try {
            DocumentBuilderFactory.newInstance().apply {
                isNamespaceAware = false
                isExpandEntityReferences = false
            }.newDocumentBuilder().parse(InputSource(StringReader(xml))).documentElement
        } catch (e: Exception) {
            throw MalformedDumpException("not a complete XML dump: ${e.message}", e)
        }
        return when (root.tagName) {
            "displays" -> UiDump(
                root.children("display").flatMap { display ->
                    display.children("window").flatMap { windowsOf(it) }
                },
                allWindows = true,
            )
            "hierarchy" -> UiDump(listOf(window(root, id = null, type = null, active = true)), allWindows = false)
            else -> throw MalformedDumpException("unexpected root element <${root.tagName}>")
        }
    }

    /** [element] and its child windows (picture-in-picture, embedded), children first as the dumper writes them. */
    private fun windowsOf(element: Element): List<DumpWindow> {
        val out = ArrayList<DumpWindow>()
        element.children("window").forEach { out += windowsOf(it) }
        val hierarchy = element.children("hierarchy").firstOrNull()
        val id = element.getAttribute("id").toIntOrNull()
        val type = element.getAttribute("type").ifEmpty { null }
        val active = element.getAttribute("active") == "true"
        out += if (hierarchy != null) {
            window(hierarchy, id, type, active)
        } else {
            DumpWindow(id, type, active, null, null, emptyList(), 0)
        }
        return out
    }

    /** Pre-order walk of the `<node>` elements under [hierarchy]. */
    private fun window(hierarchy: Element, id: Int?, type: String?, active: Boolean): DumpWindow {
        val roots = hierarchy.children("node")
        val out = ArrayList<TextNode>()
        val stack = ArrayDeque<Element>()
        roots.asReversed().forEach { stack.addLast(it) }
        var count = 0
        while (stack.isNotEmpty()) {
            val node = stack.removeLast()
            count++
            if (node.getAttribute("password") != "true") {
                val text = node.getAttribute("text").ifEmpty { null }
                val desc = node.getAttribute("content-desc").ifEmpty { null }
                if (!text.isNullOrBlank() || !desc.isNullOrBlank()) {
                    out += TextNode(text, desc, node.getAttribute("resource-id").ifEmpty { null })
                }
            }
            // Push in reverse so the stack pops children in tree order.
            node.children("node").asReversed().forEach { stack.addLast(it) }
        }
        val first = roots.firstOrNull()
        return DumpWindow(
            id, type, active,
            packageName = first?.getAttribute("package")?.ifEmpty { null },
            rootClass = first?.getAttribute("class")?.ifEmpty { null },
            nodes = out,
            nodeCount = count,
        )
    }

    private fun Element.children(tag: String): List<Element> {
        val out = ArrayList<Element>()
        var n = firstChild
        while (n != null) {
            if (n is Element && n.tagName == tag) out += n
            n = n.nextSibling
        }
        return out
    }
}

/**
 * What one dump shows of one app: every window of the app, each as its own [ScreenSnapshot] for [PaymentPipeline].
 * - [windows]: the app's windows, top-most first, as snapshots. Windows of any other app are never in it, and neither
 *   is a window showing PIN entry.
 * - [appOnScreen]: some window of the app is in the dump, even one with no text.
 * - [activePackage]: the app owning the active window, when known.
 * - [diagnostics]: what the window list looked like (package names and window types only), for the live log.
 */
class DumpRead(
    val packageName: String,
    val windows: List<Window>,
    val appOnScreen: Boolean,
    val activePackage: String?,
    val pinWindowsDropped: Int,
    val diagnostics: String,
) {
    /** One window of the app as read; [info] says which window it was, for the raw captures. */
    class Window(val snapshot: ScreenSnapshot, val info: String)

    companion object {
        fun of(dump: UiDump, packageName: String, screenClass: String?): DumpRead {
            val out = ArrayList<Window>()
            val described = ArrayList<String>()
            var appOnScreen = false
            var activePackage: String? = null
            var pinDropped = 0
            for ((layer, w) in dump.windows.withIndex()) {
                val type = typeName(w.type)
                if (w.active) activePackage = w.packageName
                described += "$type:${w.packageName ?: "no root"}${if (w.active) " active" else ""}"
                if (w.packageName != packageName) continue
                appOnScreen = true
                val snapshot = ScreenSnapshot(packageName, screenClass, w.id, w.nodes)
                if (ConfirmScreenParser.isPinScreen(snapshot)) {
                    pinDropped++
                    continue
                }
                val where = if (dump.allWindows) {
                    "window ${w.id ?: "?"}, layer ${layer + 1} of ${dump.windows.size}, $type${if (w.active) ", active" else ""}"
                } else {
                    "active window (single-window dump)"
                }
                out += Window(snapshot, "$where, root ${w.rootClass ?: "?"}, ${w.nodeCount} nodes in dump")
            }
            val diagnostics = "active window: ${activePackage ?: "none"}; " +
                (if (dump.allWindows) "windows" else "single-window dump") + ": [${described.joinToString()}]" +
                if (pinDropped > 0) "; $pinDropped PIN window(s) not kept" else ""
            return DumpRead(packageName, out, appOnScreen, activePackage, pinDropped, diagnostics)
        }

        private fun typeName(type: String?) = when (type) {
            null -> "window"
            "TYPE_APPLICATION" -> "app"
            "TYPE_INPUT_METHOD" -> "keyboard"
            "TYPE_SYSTEM" -> "system"
            "TYPE_ACCESSIBILITY_OVERLAY" -> "a11y-overlay"
            "TYPE_SPLIT_SCREEN_DIVIDER" -> "divider"
            else -> type.removePrefix("TYPE_").lowercase()
        }
    }
}
