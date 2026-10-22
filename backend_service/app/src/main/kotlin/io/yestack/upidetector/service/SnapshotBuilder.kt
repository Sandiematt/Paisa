package io.yestack.upidetector.service

import android.accessibilityservice.AccessibilityService
import android.os.Build
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import io.yestack.upidetector.core.ScreenSnapshot
import io.yestack.upidetector.core.TextNode

/** Copies the visible text of one app's window into an Android-free [ScreenSnapshot]. Read-only. */
class SnapshotBuilder(private val service: AccessibilityService) {

    /** Exactly one of [snapshot] and [failure] is set. */
    class Result(val snapshot: ScreenSnapshot?, val failure: String?)

    fun build(packageName: String, screenClass: String?, eventWindowId: Int): Result {
        val root = findRoot(packageName)
            ?: return Result(null, "no readable window for $packageName")
        val windowId = try {
            root.windowId.takeIf { it >= 0 } ?: eventWindowId.takeIf { it >= 0 }
        } catch (e: RuntimeException) {
            eventWindowId.takeIf { it >= 0 }
        }
        // An empty node list is still passed on: the parser logs EMPTY_SNAPSHOT and the detector learns the
        // status phrase is gone, which the disappear/reappear rule depends on.
        return Result(ScreenSnapshot(packageName, screenClass, windowId, collect(root)), null)
    }

    private fun findRoot(packageName: String): AccessibilityNodeInfo? {
        val active = service.rootInActiveWindow
        if (active != null) {
            if (active.packageName?.toString() == packageName) return active
            release(active)
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
    private fun collect(root: AccessibilityNodeInfo): List<TextNode> {
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
        return out
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
