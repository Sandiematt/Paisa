package io.yestack.upidetector.core

/** The resumed Activity, as `dumpsys activity activities` prints it. */
data class ForegroundActivity(val packageName: String, val className: String) {
    companion object {
        /** "ActivityRecord{2b4d5e1 u0 com.phonepe.app/.Navigator_MainActivity t1234}" */
        private val RECORD = Regex("""ActivityRecord\{\S+ u\d+ ([A-Za-z0-9_.]+)/([A-Za-z0-9_.$]+)""")

        /**
         * Most reliable first: "topResumedActivity=" (Android 10+, the one with focus when several are resumed),
         * "mResumedActivity:" (Android 9 and older), "ResumedActivity:" (per display, Android 10+).
         */
        private val KEYS = listOf("topResumedActivity", "mResumedActivity", "ResumedActivity")

        /** The resumed Activity in [output] (lines of `dumpsys activity activities`), or null when none is listed. */
        fun parse(output: String): ForegroundActivity? {
            val lines = output.lines().map { it.trim() }
            for (key in KEYS) {
                for (line in lines) {
                    if (!line.startsWith(key)) continue
                    val m = RECORD.find(line) ?: continue
                    val pkg = m.groupValues[1]
                    val cls = m.groupValues[2]
                    return ForegroundActivity(pkg, if (cls.startsWith(".")) pkg + cls else cls)
                }
            }
            return null
        }
    }
}

/**
 * Shell scripts run as the shell user (through Shizuku) to capture a screen, and the reading of what they print.
 * Plain text in and out, so the whole exchange is tested on the JVM.
 */
object DumpScript {
    const val DUMP_FILE = "/data/local/tmp/upidetector-dump.xml"

    private const val LOG = "@@UPIDETECTOR-LOG"
    private const val XML = "@@UPIDETECTOR-XML"
    private const val FOREGROUND_AFTER = "@@UPIDETECTOR-FG"
    private const val END = "@@UPIDETECTOR-END"

    /** Prints the resumed-Activity lines; read with [ForegroundActivity.parse]. Cheap next to a dump. */
    const val FOREGROUND = "dumpsys activity activities 2>/dev/null | grep ResumedActivity"

    /**
     * Dumps every window, then lists the resumed Activity again, so a dump taken while the screen changed under it can
     * be told apart. The file is removed first, so a failed dump never prints a stale one.
     */
    val DUMP = """
        rm -f $DUMP_FILE
        echo $LOG
        uiautomator dump --windows $DUMP_FILE 2>&1
        echo $XML
        cat $DUMP_FILE 2>/dev/null
        rm -f $DUMP_FILE
        echo
        echo $FOREGROUND_AFTER
        $FOREGROUND
        echo $END
    """.trimIndent()

    /**
     * Grants [packageName] what its pop-ups need, as the shell user: drawing over other apps (daily-limit warning, note
     * pop-up), and on Android 13+ ([notifications]) posting the "capture running" notification.
     */
    fun grantPermissions(packageName: String, notifications: Boolean): String =
        "appops set $packageName SYSTEM_ALERT_WINDOW allow" +
            if (notifications) "; pm grant $packageName android.permission.POST_NOTIFICATIONS" else ""

    /**
     * What [DUMP] printed.
     * - [log]: uiautomator's own output ("UI hierchary dumped to: ...", or why it failed).
     * - [xml]: the dump, or null when uiautomator wrote none.
     * - [foregroundAfter]: the resumed Activity once the dump was done, when it could be read.
     * - [complete]: every section was printed (the script was not cut short).
     */
    class Output(val log: String, val xml: String?, val foregroundAfter: ForegroundActivity?, val complete: Boolean) {
        /** Why no dump was written, from uiautomator's output, for the live log. */
        val failure: String?
            get() = if (xml != null) null else log.lines().map { it.trim() }.firstOrNull { it.isNotEmpty() }
                ?.let { if (it.contains("could not get idle state")) "$it (the screen kept animating for 10 s)" else it }
                ?: "uiautomator printed nothing"
    }

    /**
     * Starts [component] ("pkg/.Cls") in a task of its own, kept out of recents: the shell user may start an Activity
     * while the app is in the background. Read the output with [startFailure].
     */
    fun startActivity(component: String): String = "am start -n $component -f 0x10800000 2>&1"

    /** Why [startActivity] did not start the Activity, from what `am start` printed; null when it did. */
    fun startFailure(output: String): String? {
        val lines = output.lines().map { it.trim() }.filter { it.isNotEmpty() }
        val bad = lines.firstOrNull { it.startsWith("Error") || it.contains("Exception") || it.startsWith("Warning: Activity not started") }
        return when {
            bad != null -> bad
            lines.none { it.startsWith("Starting:") } -> "am start printed ${lines.firstOrNull() ?: "nothing"}"
            else -> null
        }
    }

    /** How the log line of an in-process dump starts (see [format]). */
    const val IN_PROCESS_LOG = "dumped in process"

    /**
     * What [DUMP] prints, for a dump taken some other way (in process, see the app's ScreenReader): [log] for
     * uiautomator's own line, [xml] the dump or null, [foreground] the `FOREGROUND` output taken after it.
     */
    fun format(log: String, xml: String?, foreground: String): String = buildString {
        append(LOG).append('\n').append(log).append('\n')
        append(XML).append('\n')
        if (xml != null) append(xml).append('\n')
        append(FOREGROUND_AFTER).append('\n').append(foreground).append('\n')
        append(END).append('\n')
    }

    fun parseDump(output: String): Output {
        val sections = HashMap<String, StringBuilder>()
        var current: StringBuilder? = null
        for (line in output.lines()) {
            when (line.trim()) {
                LOG, XML, FOREGROUND_AFTER, END -> current = StringBuilder().also { sections[line.trim()] = it }
                else -> current?.append(line)?.append('\n')
            }
        }
        val xml = sections[XML]?.toString()?.trim()?.takeIf { it.startsWith("<") }
        return Output(
            log = sections[LOG]?.toString()?.trim().orEmpty(),
            xml = xml,
            foregroundAfter = sections[FOREGROUND_AFTER]?.let { ForegroundActivity.parse(it.toString()) },
            complete = END in sections,
        )
    }
}
