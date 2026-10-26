package io.yestack.upidetector.service

import android.accessibilityservice.AccessibilityService
import android.os.Build
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import io.yestack.upidetector.core.ConfirmScreenParser
import io.yestack.upidetector.core.ScreenSnapshot
import io.yestack.upidetector.core.TextNode

/** Copies the visible text of one app's windows into Android-free [ScreenSnapshot]s. Read-only. */
class SnapshotBuilder(private val service: AccessibilityService) {

    /**
     * One window of the app as read; [info] says which window it was, for the raw captures. [unfinished] says why its
     * tree may be incomplete (nodes that went stale while being walked, or the walk cut short by a limit), else null.
     */
    class ReadWindow(val snapshot: ScreenSnapshot, val info: String, val unfinished: String? = null)

    /**
     * Everything one read saw.
     * - [windows]: the app's windows with text, top-most first. Windows of any other app (this app's own screens, the
     *   launcher, the keyboard) are never in it, and neither is a window showing PIN entry.
     * - [appOnScreen]: some window of the app is on screen, even one with no text yet.
     * - [activePackage]: the app owning the active window, when known.
     * - [diagnostics]: what the window list looked like (package names and window types only), for the live log.
     */
    class AppRead(
        val packageName: String,
        val windows: List<ReadWindow>,
        val appOnScreen: Boolean,
        val activePackage: String?,
        val pinWindowsDropped: Int,
        val diagnostics: String,
    )

    private class Walk(
        val nodes: List<TextNode>,
        val visited: Int,
        /** Nodes that threw, or children that were gone, while walking: the tree was changing under the read. */
        val stale: Int = 0,
        val hitNodeLimit: Boolean = false,
        val hitDepthLimit: Boolean = false,
    ) {
        val unfinished: String?
            get() = listOfNotNull(
                "$stale node(s) went stale".takeIf { stale > 0 },
                "stopped at the $MAX_NODES-node limit".takeIf { hitNodeLimit },
                "deeper than $MAX_DEPTH levels not read".takeIf { hitDepthLimit },
            ).joinToString().ifEmpty { null }
    }

    /**
     * Reads every window of [packageName] on screen. PhonePe shows its processing and result screens in a window of
     * their own above the chat, and a confirm sheet can be one too, so the active window alone is not enough.
     *
     * [eventSource] is the node the triggering event carried, taken the instant it fired: the window list can lag behind
     * a window that just appeared, so that window is read from the event's own node when the list does not have it yet.
     * Consumes [eventSource].
     */
    fun readApp(packageName: String, screenClass: String?, eventSource: AccessibilityNodeInfo?): AppRead {
        val sourceRoot = eventSource?.let { src ->
            val root = climbToRoot(src)
            if (root !== src) release(src)
            if (packageOf(root) == packageName) root else null.also { release(root) }
        }
        val listed = try {
            service.windows
        } catch (e: RuntimeException) {
            emptyList()
        }
        val out = ArrayList<ReadWindow>()
        val seen = HashSet<Int>()
        val described = ArrayList<String>()
        var appOnScreen = false
        var activePackage: String? = null
        var pinDropped = 0

        for ((layer, window) in listed.withIndex()) {
            try {
                val type = windowTypeName(window.type)
                val active = try {
                    window.isActive
                } catch (e: RuntimeException) {
                    false
                }
                val root = try {
                    window.root
                } catch (e: RuntimeException) {
                    null
                }
                val pkg = root?.let { packageOf(it) }
                if (active) activePackage = pkg
                described += "$type:${pkg ?: "no root"}${if (active) " active" else ""}"
                if (root == null) continue
                if (pkg != packageName) {
                    release(root)
                    continue
                }
                appOnScreen = true
                val id = windowIdOf(root)
                seen += id
                val info = "window $id, layer ${layer + 1} of ${listed.size}, $type${if (active) ", active" else ""}"
                if (!add(out, root, packageName, screenClass, id, info)) pinDropped++
            } catch (e: RuntimeException) {
                described += "unreadable window"
            } finally {
                release(window)
            }
        }

        if (listed.isEmpty()) {
            // Window listing unavailable: fall back to the active window, still only if it is the app's own.
            val active = try {
                service.rootInActiveWindow
            } catch (e: RuntimeException) {
                null
            }
            val pkg = active?.let { packageOf(it) }
            activePackage = pkg
            described += "no window list; active root ${pkg ?: "none"}"
            if (active != null && pkg == packageName) {
                appOnScreen = true
                val id = windowIdOf(active)
                seen += id
                if (!add(out, active, packageName, screenClass, id, "window $id, active root (no window list)")) pinDropped++
            } else {
                active?.let { release(it) }
            }
        }

        if (sourceRoot != null) {
            val id = windowIdOf(sourceRoot)
            if (id in seen) {
                release(sourceRoot)
            } else {
                appOnScreen = true
                val fromSource = ArrayList<ReadWindow>()
                if (!add(fromSource, sourceRoot, packageName, screenClass, id, "window $id, from the event (not yet listed)")) pinDropped++
                out.addAll(0, fromSource)
            }
        }

        val diagnostics = "active window: ${activePackage ?: "none"}; event source: " +
            "${if (eventSource != null) "given" else "none"}; windows: [${described.joinToString()}]" +
            if (pinDropped > 0) "; $pinDropped PIN window(s) not kept" else ""
        return AppRead(packageName, out, appOnScreen, activePackage, pinDropped, diagnostics)
    }

    /** Whether a window of [packageName] is listed on screen. Reads no text. */
    fun isOnScreen(packageName: String): Boolean {
        val listed = try {
            service.windows
        } catch (e: RuntimeException) {
            emptyList()
        }
        var found = false
        for (window in listed) {
            try {
                if (!found) {
                    val root = try {
                        window.root
                    } catch (e: RuntimeException) {
                        null
                    }
                    if (root != null) {
                        found = packageOf(root) == packageName
                        release(root)
                    }
                }
            } finally {
                release(window)
            }
        }
        return found
    }

    /**
     * Walks [root] into [out], unless the window shows PIN entry: its text is then dropped at once and false returned.
     * Consumes [root].
     */
    private fun add(
        out: MutableList<ReadWindow>,
        root: AccessibilityNodeInfo,
        packageName: String,
        screenClass: String?,
        windowId: Int,
        info: String,
    ): Boolean {
        val rootClass = try {
            root.className?.toString()
        } catch (e: RuntimeException) {
            null
        }
        val walk = collect(root)
        val snapshot = ScreenSnapshot(packageName, screenClass, windowId.takeIf { it >= 0 }, walk.nodes)
        if (ConfirmScreenParser.isPinScreen(snapshot)) return false
        val unfinished = walk.unfinished
        out += ReadWindow(
            snapshot,
            "$info, root ${rootClass ?: "?"}, ${walk.visited} nodes visited" + (unfinished?.let { ", incomplete: $it" } ?: ""),
            unfinished,
        )
        return true
    }

    private fun packageOf(node: AccessibilityNodeInfo): String? = try {
        node.packageName?.toString()
    } catch (e: RuntimeException) {
        null
    }

    private fun windowIdOf(node: AccessibilityNodeInfo): Int = try {
        node.windowId
    } catch (e: RuntimeException) {
        -1
    }

    private fun windowTypeName(type: Int) = when (type) {
        AccessibilityWindowInfo.TYPE_APPLICATION -> "app"
        AccessibilityWindowInfo.TYPE_INPUT_METHOD -> "keyboard"
        AccessibilityWindowInfo.TYPE_SYSTEM -> "system"
        AccessibilityWindowInfo.TYPE_ACCESSIBILITY_OVERLAY -> "a11y-overlay"
        AccessibilityWindowInfo.TYPE_SPLIT_SCREEN_DIVIDER -> "divider"
        else -> "type$type"
    }

    /** Walks up to the top-most ancestor reachable from [source], releasing every node it passes (not [source] itself). */
    private fun climbToRoot(source: AccessibilityNodeInfo): AccessibilityNodeInfo {
        var node = source
        try {
            while (true) {
                val parent = try {
                    node.parent
                } catch (e: RuntimeException) {
                    null
                } ?: return node
                if (node !== source) release(node)
                node = parent
            }
        } catch (e: RuntimeException) {
            return node
        }
    }

    @Suppress("DEPRECATION")
    private fun release(window: AccessibilityWindowInfo) {
        if (Build.VERSION.SDK_INT < 33) {
            try {
                window.recycle()
            } catch (e: RuntimeException) {
                // already recycled
            }
        }
    }

    /**
     * Pre-order walk; consumes (and recycles on old APIs) [root]. A node that throws or a child that is gone (the tree
     * changed under the read) is skipped and counted, so the caller can read the window again.
     */
    private fun collect(root: AccessibilityNodeInfo): Walk {
        val out = ArrayList<TextNode>()
        val stack = ArrayDeque<Pair<AccessibilityNodeInfo, Int>>()
        stack.addLast(root to 0)
        var visited = 0
        var stale = 0
        var depthLimit = false
        try {
            while (stack.isNotEmpty() && visited < MAX_NODES) {
                val (node, depth) = stack.removeLast()
                visited++
                try {
                    if (!node.isPassword) {
                        val text = node.text?.toString()
                        val desc = node.contentDescription?.toString()
                        if (!text.isNullOrBlank() || !desc.isNullOrBlank()) {
                            out.add(TextNode(text, desc, node.viewIdResourceName))
                        }
                    }
                    val children = node.childCount
                    if (depth < MAX_DEPTH) {
                        // Push in reverse so the stack pops children in tree order.
                        for (i in children - 1 downTo 0) {
                            val child = try {
                                node.getChild(i)
                            } catch (e: RuntimeException) {
                                null
                            }
                            if (child == null) {
                                stale++
                                continue
                            }
                            stack.addLast(child to depth + 1)
                        }
                    } else if (children > 0) {
                        depthLimit = true
                    }
                } catch (e: RuntimeException) {
                    stale++
                } finally {
                    release(node)
                }
            }
        } finally {
            stack.forEach { release(it.first) }
        }
        return Walk(out, visited, stale, hitNodeLimit = visited >= MAX_NODES && stack.isNotEmpty(), hitDepthLimit = depthLimit)
    }

    @Suppress("DEPRECATION")
    private fun release(node: AccessibilityNodeInfo) {
        // recycle() is a no-op from API 33 and deprecated.
        if (Build.VERSION.SDK_INT < 33) {
            try {
                node.recycle()
            } catch (e: RuntimeException) {
                // already recycled
            }
        }
    }

    /**
     * Drops the service's cached copy of the app's nodes (API 33+), so the next read fetches the tree fresh. The cache
     * can hold text from before a change whose event was merged away, which reads as a screen missing its "Done".
     */
    fun clearCache() {
        if (Build.VERSION.SDK_INT >= 33) {
            try {
                service.clearCache()
            } catch (e: RuntimeException) {
                // nothing cached, or the service is going away
            }
        }
    }

    private companion object {
        // PhonePe's result screen holds an ad whose tree can be large, and "Done" comes after it in tree order.
        const val MAX_NODES = 4000
        const val MAX_DEPTH = 60
    }
}
