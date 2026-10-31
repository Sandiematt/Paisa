package io.yestack.upidetector.shizuku

import android.accessibilityservice.AccessibilityServiceInfo
import android.app.UiAutomation
import android.graphics.Rect
import android.os.HandlerThread
import android.os.Looper
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo

/**
 * Reads the screen in [ShellService]'s process (the shell user) through one UiAutomation connection kept open, which
 * is what `uiautomator dump` opens and closes on every run. With it a dump takes tens of milliseconds instead of
 * seconds (no process to start, no wait for an idle screen), and screen changes arrive as events.
 *
 * [dumpXml] writes the XML `uiautomator dump --windows` writes (same elements and attributes, invisible nodes left
 * out), so the app reads it with the same parser. Connected with FLAG_DONT_SUSPEND_ACCESSIBILITY_SERVICES, so other
 * accessibility services (TalkBack, autofill) keep running, unlike under `uiautomator dump`.
 *
 * UiAutomation's constructor and `connect(int)` are hidden APIs; they are reached by reflection, which works in the
 * shell process Shizuku starts (as it does for `uiautomator` itself). When they cannot be reached, [connect] throws
 * and the app falls back to `uiautomator dump`.
 */
internal class ScreenReader {

    private var thread: HandlerThread? = null
    private var automation: UiAutomation? = null

    private val lock = Object()
    private var eventSeq = 0L

    @Volatile
    private var watched: Set<String> = emptySet()

    /** The open connection, opened on first use. Throws when it cannot be opened. */
    @Synchronized
    fun connect(): UiAutomation {
        automation?.let { return it }
        val t = thread ?: HandlerThread("ui-automation").also { it.start(); thread = it }
        val connectionClass = Class.forName("android.app.UiAutomationConnection")
        val connection = connectionClass.getDeclaredConstructor().newInstance()
        val ua = UiAutomation::class.java
            .getDeclaredConstructor(Looper::class.java, Class.forName("android.app.IUiAutomationConnection"))
            .newInstance(t.looper, connection)
        UiAutomation::class.java.getDeclaredMethod("connect", Int::class.javaPrimitiveType)
            .invoke(ua, FLAG_DONT_SUSPEND_ACCESSIBILITY_SERVICES)
        ua.serviceInfo = ua.serviceInfo.apply {
            flags = flags or AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS or
                AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS or
                AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
        }
        ua.setOnAccessibilityEventListener { event ->
            if (event.packageName?.toString() in watched) {
                synchronized(lock) {
                    eventSeq++
                    lock.notifyAll()
                }
            }
        }
        automation = ua
        return ua
    }

    /** Forgets a connection that stopped working; the next call opens a new one. */
    @Synchronized
    private fun reset() {
        try {
            automation?.let { UiAutomation::class.java.getDeclaredMethod("disconnect").invoke(it) }
        } catch (e: Exception) {
            // already gone
        }
        automation = null
    }

    /**
     * Waits until a screen event from one of [packages] arrives after event number [afterSeq], or [timeoutMillis]
     * passes. Returns the number of the latest event (pass it back next time).
     */
    fun awaitEvent(packages: Array<String>, afterSeq: Long, timeoutMillis: Long): Long {
        watched = packages.toSet()
        connect()
        val deadline = System.currentTimeMillis() + timeoutMillis
        synchronized(lock) {
            while (eventSeq <= afterSeq) {
                val left = deadline - System.currentTimeMillis()
                if (left <= 0) break
                lock.wait(left)
            }
            return eventSeq
        }
    }

    /** Every window on the default display, top-most first, as `uiautomator dump --windows` writes it. */
    fun dumpXml(): String {
        val windows = try {
            connect().windows
        } catch (e: IllegalStateException) {
            // "UiAutomation not connected": the system dropped it. Try once with a new connection.
            reset()
            connect().windows
        }
        val out = StringBuilder(64 * 1024)
        out.append("<?xml version='1.0' encoding='UTF-8' standalone='yes' ?><displays><display id=\"0\">")
        windows.forEachIndexed { index, w -> appendWindow(out, w, index) }
        out.append("</display></displays>")
        return out.toString()
    }

    private fun appendWindow(out: StringBuilder, w: AccessibilityWindowInfo, index: Int) {
        val bounds = Rect().also { w.getBoundsInScreen(it) }
        out.append("<window index=\"").append(index).append('"')
        attr(out, "title", w.title?.toString())
        attr(out, "bounds", bounds.toShortString())
        attr(out, "active", w.isActive.toString())
        attr(out, "focused", w.isFocused.toString())
        attr(out, "id", w.id.toString())
        attr(out, "layer", w.layer.toString())
        attr(out, "type", typeName(w.type))
        out.append('>')
        val root = w.root
        if (root != null) {
            out.append("<hierarchy rotation=\"0\">")
            var budget = MAX_NODES
            fun walk(node: AccessibilityNodeInfo, index: Int, depth: Int) {
                if (budget-- <= 0) return
                appendNodeOpen(out, node, index)
                if (depth < MAX_DEPTH) {
                    for (i in 0 until node.childCount) {
                        val child = node.getChild(i) ?: continue
                        // As uiautomator: what the user cannot see (scrolled off, hidden) is left out with its subtree.
                        if (child.isVisibleToUser) walk(child, i, depth + 1)
                    }
                }
                out.append("</node>")
            }
            walk(root, 0, 0)
            out.append("</hierarchy>")
        }
        out.append("</window>")
    }

    private fun appendNodeOpen(out: StringBuilder, node: AccessibilityNodeInfo, index: Int) {
        val bounds = Rect().also { node.getBoundsInScreen(it) }
        out.append("<node index=\"").append(index).append('"')
        attr(out, "text", node.text?.toString())
        attr(out, "resource-id", node.viewIdResourceName)
        attr(out, "class", node.className?.toString())
        attr(out, "package", node.packageName?.toString())
        attr(out, "content-desc", node.contentDescription?.toString())
        attr(out, "clickable", node.isClickable.toString())
        attr(out, "enabled", node.isEnabled.toString())
        attr(out, "password", node.isPassword.toString())
        attr(out, "bounds", "[${bounds.left},${bounds.top}][${bounds.right},${bounds.bottom}]")
        out.append('>')
    }

    private fun attr(out: StringBuilder, name: String, value: String?) {
        out.append(' ').append(name).append("=\"")
        value?.forEach { c ->
            when (c) {
                '&' -> out.append("&amp;")
                '<' -> out.append("&lt;")
                '>' -> out.append("&gt;")
                '"' -> out.append("&quot;")
                '\n' -> out.append("&#10;")
                '\r' -> out.append("&#13;")
                '\t' -> out.append("&#9;")
                // Other control characters are not allowed in XML 1.0 at all: dropped.
                else -> if (c >= ' ') out.append(c)
            }
        }
        out.append('"')
    }

    private fun typeName(type: Int) = when (type) {
        AccessibilityWindowInfo.TYPE_APPLICATION -> "TYPE_APPLICATION"
        AccessibilityWindowInfo.TYPE_INPUT_METHOD -> "TYPE_INPUT_METHOD"
        AccessibilityWindowInfo.TYPE_SYSTEM -> "TYPE_SYSTEM"
        AccessibilityWindowInfo.TYPE_ACCESSIBILITY_OVERLAY -> "TYPE_ACCESSIBILITY_OVERLAY"
        AccessibilityWindowInfo.TYPE_SPLIT_SCREEN_DIVIDER -> "TYPE_SPLIT_SCREEN_DIVIDER"
        AccessibilityWindowInfo.TYPE_MAGNIFICATION_OVERLAY -> "TYPE_MAGNIFICATION_OVERLAY"
        else -> "<UNKNOWN:$type>"
    }

    private companion object {
        const val MAX_NODES = 5_000
        const val MAX_DEPTH = 100

        /** UiAutomation.FLAG_DONT_SUSPEND_ACCESSIBILITY_SERVICES (hidden from the SDK). */
        const val FLAG_DONT_SUSPEND_ACCESSIBILITY_SERVICES = 0x00000001
    }
}
