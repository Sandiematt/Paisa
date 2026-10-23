package io.yestack.upidetector.service

import android.accessibilityservice.AccessibilityService
import android.os.Build
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import io.yestack.upidetector.core.ScreenSnapshot
import io.yestack.upidetector.core.TextNode

/** Copies the visible text of one app's window into an Android-free [ScreenSnapshot]. Read-only. */
class SnapshotBuilder(private val service: AccessibilityService) {

    /**
     * Exactly one of [snapshot] and [failure] is set. [note] explains an empty read (what the window tree looked like)
     * so the live log can say why nothing was extracted.
     */
    class Result(val snapshot: ScreenSnapshot?, val failure: String?, val note: String? = null)

    private class Walk(val nodes: List<TextNode>, val visited: Int)

    fun build(packageName: String, screenClass: String?, eventWindowId: Int, eventSource: AccessibilityNodeInfo? = null): Result {
        val root = findRoot(packageName, eventSource)
            ?: return Result(null, "no readable window for $packageName")
        val windowId = try {
            root.windowId.takeIf { it >= 0 } ?: eventWindowId.takeIf { it >= 0 }
        } catch (e: RuntimeException) {
            eventWindowId.takeIf { it >= 0 }
        }
        val rootClass = try {
            root.className?.toString()
        } catch (e: RuntimeException) {
            null
        }
        val rootChildren = try {
            root.childCount
        } catch (e: RuntimeException) {
            -1
        }
        val first = collect(root)
        var nodes = first.nodes
        var note: String? = null
        if (nodes.isEmpty()) {
            // The active window can be a bare shell (Flutter before its semantics tree arrives, or the app's real
            // content living in a sibling dialog/overlay window). Try the app's other windows before giving up.
            val others = collectOtherWindows(packageName, windowId)
            nodes = others.nodes
            note = "root ${rootClass ?: "?"} childCount=$rootChildren visited=${first.visited}; " +
                "other windows of the app: ${others.visited} nodes visited, ${others.nodes.size} with text"
        }
        // An empty node list is still passed on: the parser logs EMPTY_SNAPSHOT and the detector learns the
        // status phrase is gone, which the disappear/reappear rule depends on.
        return Result(ScreenSnapshot(packageName, screenClass, windowId, nodes), null, note.takeIf { nodes.isEmpty() })
    }

    /** Text of every window of [packageName] except [skipWindowId], top-most window first. */
    private fun collectOtherWindows(packageName: String, skipWindowId: Int?): Walk {
        val windows = try {
            service.windows
        } catch (e: RuntimeException) {
            emptyList()
        }
        val nodes = ArrayList<TextNode>()
        var visited = 0
        for (window in windows) {
            try {
                val root = try {
                    window.root
                } catch (e: RuntimeException) {
                    null
                }
                if (root == null) continue
                val sameApp = root.packageName?.toString() == packageName
                val otherWindow = try {
                    root.windowId != skipWindowId
                } catch (e: RuntimeException) {
                    true
                }
                if (sameApp && otherWindow) {
                    val walk = collect(root)
                    nodes += walk.nodes
                    visited += walk.visited
                } else {
                    release(root)
                }
            } finally {
                release(window)
            }
        }
        return Walk(nodes, visited)
    }

    /**
     * [eventSource] is the node the triggering [android.view.accessibility.AccessibilityEvent] carried, captured by
     * the service the instant the event fired. By the time a debounced read runs, GPay's payment card is often a
     * short-lived dialog/bottom-sheet window that [rootInActiveWindow] and [AccessibilityService.getWindows] can
     * already have moved past (focus returned to the underlying activity, or the window listing hasn't caught up);
     * climbing from the event's own source to its root is more reliable for exactly that case. Fully consumes
     * [eventSource]: on every path it is either returned (for the caller to release via [collect]) or released here.
     */
    private fun findRoot(packageName: String, eventSource: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        val active = service.rootInActiveWindow
        if (active != null) {
            if (active.packageName?.toString() == packageName) {
                eventSource?.let { release(it) }
                return active
            }
            release(active)
        }

        if (eventSource != null) {
            val fromSource = climbToRoot(eventSource)
            if (fromSource.packageName?.toString() == packageName) return fromSource
            release(fromSource)
        }

        // Active window can be a dialog, keyboard or another app's overlay.
        val windows = try {
            service.windows
        } catch (e: RuntimeException) {
            emptyList()
        }
        var found: AccessibilityNodeInfo? = null
        for (window in windows) {
            if (found == null) {
                val root = try {
                    window.root
                } catch (e: RuntimeException) {
                    null
                }
                if (root != null) {
                    if (root.packageName?.toString() == packageName) found = root else release(root)
                }
            }
            release(window)
        }
        return found
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

    /** Pre-order walk; consumes (and recycles on old APIs) [root]. */
    private fun collect(root: AccessibilityNodeInfo): Walk {
        val out = ArrayList<TextNode>()
        val stack = ArrayDeque<Pair<AccessibilityNodeInfo, Int>>()
        stack.addLast(root to 0)
        var visited = 0
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
                    if (depth < MAX_DEPTH) {
                        // Push in reverse so the stack pops children in tree order.
                        for (i in node.childCount - 1 downTo 0) {
                            val child = try {
                                node.getChild(i)
                            } catch (e: RuntimeException) {
                                null
                            } ?: continue
                            stack.addLast(child to depth + 1)
                        }
                    }
                } catch (e: RuntimeException) {
                    // Stale/recycled node: keep what we have and carry on.
                } finally {
                    release(node)
                }
            }
        } finally {
            stack.forEach { release(it.first) }
        }
        return Walk(out, visited)
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

    private companion object {
        const val MAX_NODES = 2000
        const val MAX_DEPTH = 60
    }
}
