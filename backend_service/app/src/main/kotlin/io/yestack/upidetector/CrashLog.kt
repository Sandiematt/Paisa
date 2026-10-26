package io.yestack.upidetector

import android.content.Context
import java.io.File

/**
 * Keeps the last crash's exception class and stack frames in a small private file, so the next start can show what
 * crashed in the live log (and so in the shared report) without a computer and Logcat. Exception messages are left
 * out: they can carry text that was on screen. Nothing else is written.
 */
object CrashLog {
    private const val FILE_NAME = "last_crash.txt"
    private const val MAX_FRAMES = 25
    private var installed = false

    fun install(context: Context) {
        if (installed) return
        installed = true
        val file = File(context.applicationContext.filesDir, FILE_NAME)
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            try {
                file.writeText(describe(thread.name, error))
            } catch (ignored: Throwable) {
                // nothing more can be done while crashing
            }
            previous?.uncaughtException(thread, error)
        }
    }

    /** The crash saved by an earlier run, as lines, then forgotten; null when there was none. */
    fun takePrevious(context: Context): List<String>? {
        val file = File(context.applicationContext.filesDir, FILE_NAME)
        if (!file.exists()) return null
        return try {
            file.readLines().also { file.delete() }
        } catch (e: Exception) {
            null
        }
    }

    internal fun describe(threadName: String, error: Throwable): String = buildString {
        append("crash on thread ").append(threadName).append('\n')
        var e: Throwable? = error
        var depth = 0
        while (e != null && depth < 4) {
            append(if (depth == 0) "" else "caused by ").append(e.javaClass.name).append('\n')
            e.stackTrace.take(MAX_FRAMES).forEach { append("  at ").append(it.toString()).append('\n') }
            e = e.cause
            depth++
        }
    }
}
