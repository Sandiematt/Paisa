package io.yestack.upidetector.shizuku

import android.os.ParcelFileDescriptor
import io.yestack.upidetector.core.DumpScript
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread
import kotlin.system.exitProcess

/**
 * Shizuku user service. Shizuku starts it in a process of its own running as the shell user (what `adb shell` runs
 * as), so it can read the screen ([ScreenReader]) and run `uiautomator` and `dumpsys`. It is not started by Android
 * and has no Context. It only runs what [ShizukuShell] asks for; see [io.yestack.upidetector.core.DumpScript].
 */
class ShellService : IShellService.Stub() {

    private val reader = ScreenReader()

    override fun destroy() {
        exitProcess(0)
    }

    override fun run(script: String, timeoutMillis: Long): ParcelFileDescriptor {
        val (readEnd, writeEnd) = ParcelFileDescriptor.createPipe()
        val process = try {
            start(script)
        } catch (e: IOException) {
            readEnd.close()
            writeEnd.close()
            throw IllegalStateException("could not start sh: $e")
        }
        thread(name = "shell-output") {
            try {
                ParcelFileDescriptor.AutoCloseOutputStream(writeEnd).use { out ->
                    process.inputStream.use { it.copyTo(out) }
                }
            } catch (e: IOException) {
                // The app stopped reading (it timed out or went away): nothing is waiting for the rest.
                process.destroy()
            }
        }
        killAfter(process, timeoutMillis)
        return readEnd
    }

    override fun dumpWindows(timeoutMillis: Long): ParcelFileDescriptor {
        val (readEnd, writeEnd) = ParcelFileDescriptor.createPipe()
        thread(name = "shell-dump") {
            val text = try {
                val started = System.nanoTime()
                val xml = reader.dumpXml()
                val took = (System.nanoTime() - started) / 1_000_000
                DumpScript.format("${DumpScript.IN_PROCESS_LOG} in $took ms", xml, runToString(DumpScript.FOREGROUND, FOREGROUND_TIMEOUT_MILLIS))
            } catch (e: Throwable) {
                // Hidden API out of reach, or the connection refused: dump the slow way, and say why.
                val fallback = DumpScript.parseDump(runToString(DumpScript.DUMP, timeoutMillis))
                val fg = runToString(DumpScript.FOREGROUND, FOREGROUND_TIMEOUT_MILLIS)
                DumpScript.format("in-process dump failed (${e.cause ?: e}); uiautomator: ${fallback.log}", fallback.xml, fg)
            }
            try {
                ParcelFileDescriptor.AutoCloseOutputStream(writeEnd).use { it.write(text.toByteArray(Charsets.UTF_8)) }
            } catch (e: IOException) {
                // The app stopped reading.
            }
        }
        return readEnd
    }

    override fun awaitScreenEvent(packages: Array<String>, afterSeq: Long, timeoutMillis: Long): Long = try {
        reader.awaitEvent(packages, afterSeq, timeoutMillis)
    } catch (e: Throwable) {
        // Only a few exception types cross binder; this one does.
        throw IllegalStateException("screen events unavailable: ${e.cause ?: e}")
    }

    private fun start(script: String): Process =
        ProcessBuilder("sh", "-c", script).redirectErrorStream(true).start().also { it.outputStream.close() }

    private fun killAfter(process: Process, timeoutMillis: Long) {
        thread(name = "shell-timeout") {
            if (!process.waitFor(timeoutMillis, TimeUnit.MILLISECONDS)) process.destroyForcibly()
        }
    }

    /** Runs [script] and returns what it printed; empty when it could not be started. */
    private fun runToString(script: String, timeoutMillis: Long): String = try {
        val process = start(script)
        killAfter(process, timeoutMillis)
        process.inputStream.use { it.readBytes().toString(Charsets.UTF_8) }
    } catch (e: IOException) {
        ""
    }

    private companion object {
        const val FOREGROUND_TIMEOUT_MILLIS = 5_000L
    }
}
