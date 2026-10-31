package io.yestack.upidetector.core

/**
 * Builds dump XML the way `uiautomator dump` writes it (AOSP frameworks/base/cmds/uiautomator,
 * AccessibilityNodeInfoDumper): same elements, attributes and attribute order, UTF-8 text unescaped except XML specials.
 */
internal object DumpXml {
    class Node(
        val text: String = "",
        val desc: String = "",
        val id: String = "",
        val cls: String = "android.widget.TextView",
        val password: Boolean = false,
        val children: List<Node> = emptyList(),
    )

    class Win(
        val id: Int,
        val pkg: String,
        val nodes: List<Node>,
        val type: String = "TYPE_APPLICATION",
        val active: Boolean = false,
        val childWindows: List<Win> = emptyList(),
        /** A window that reported no root (still being created). */
        val noRoot: Boolean = false,
    )

    private const val HEADER = "<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>"

    fun texts(vararg texts: String) = texts.map { Node(text = it) }

    /** The nodes of [s], each as a leaf under one root container, so pre-order gives them back in order. */
    fun nodesOf(s: ScreenSnapshot) = s.nodes.map { Node(text = it.text.orEmpty(), desc = it.contentDescription.orEmpty(), id = it.viewId.orEmpty()) }

    /** `uiautomator dump --windows`: [windows] top-most first. */
    fun windows(vararg windows: Win): String =
        HEADER + "<displays><display id=\"0\">" + windows.withIndex().joinToString("") { (i, w) -> window(w, i) } +
            "</display></displays>"

    /** Plain `uiautomator dump`: the active window only. */
    fun single(pkg: String, nodes: List<Node>): String =
        HEADER + "<hierarchy rotation=\"0\">" + node(root(nodes), pkg, 0) + "</hierarchy>"

    private fun root(nodes: List<Node>) = Node(cls = "android.widget.FrameLayout", children = nodes)

    private fun window(w: Win, index: Int): String = buildString {
        append("<window index=\"$index\" title=\"${esc(w.pkg)}\" bounds=\"[0,0][1080,2400]\" active=\"${w.active}\" ")
        append("focused=\"${w.active}\" accessibility-focused=\"false\" id=\"${w.id}\" layer=\"${10 - index}\" type=\"${w.type}\">")
        w.childWindows.withIndex().forEach { (i, c) -> append(window(c, i)) }
        if (!w.noRoot) append("<hierarchy rotation=\"0\">").append(node(root(w.nodes), w.pkg, 0)).append("</hierarchy>")
        append("</window>")
    }

    private fun node(n: Node, pkg: String, index: Int): String = buildString {
        append("<node index=\"$index\" text=\"${esc(n.text)}\" resource-id=\"${esc(n.id)}\" class=\"${n.cls}\" ")
        append("package=\"$pkg\" content-desc=\"${esc(n.desc)}\" checkable=\"false\" checked=\"false\" clickable=\"false\" ")
        append("enabled=\"true\" focusable=\"false\" focused=\"false\" scrollable=\"false\" long-clickable=\"false\" ")
        append("password=\"${n.password}\" selected=\"false\" bounds=\"[0,0][1080,100]\" drawing-order=\"0\" hint=\"\"")
        if (n.children.isEmpty()) {
            append(" />")
        } else {
            append(">")
            n.children.withIndex().forEach { (i, c) -> append(node(c, pkg, i)) }
            append("</node>")
        }
    }

    private fun esc(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")
}
