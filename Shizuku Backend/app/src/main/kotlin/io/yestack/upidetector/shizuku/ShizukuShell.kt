package io.yestack.upidetector.shizuku

import android.content.ComponentName
import android.content.Context
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.os.IBinder
import android.os.ParcelFileDescriptor
import io.yestack.upidetector.BuildConfig
import java.io.IOException
import java.util.Timer
import kotlin.concurrent.schedule
import rikka.shizuku.Shizuku

/**
 * Runs shell commands as the shell user through Shizuku, with no root: Shizuku (started by the user over wireless
 * debugging or adb) hosts [ShellService] for this app once the user has granted it Shizuku permission.
 */
class ShizukuShell(context: Context) {

    enum class Status {
        /** The Shizuku app is not installed or its service is not started. */
        NOT_RUNNING,

        /** Shizuku is older than v11, which has no user services. */
        TOO_OLD,

        /** Shizuku runs but this app has not been granted its permission. */
        NO_PERMISSION,
        READY,
    }

    private val args = Shizuku.UserServiceArgs(ComponentName(context.packageName, ShellService::class.java.name))
        .daemon(false)
        .processNameSuffix("shell")
        .debuggable(BuildConfig.DEBUG)
        .version(BuildConfig.VERSION_CODE)

    @Volatile
    private var remote: IShellService? = null

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
            remote = if (binder != null && binder.pingBinder()) IShellService.Stub.asInterface(binder) else null
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            remote = null
        }
    }

    val isConnected: Boolean get() = remote != null

    /** Starts (or reuses) the shell process; [isConnected] turns true once Shizuku has it running. */
    fun bind() {
        Shizuku.bindUserService(args, connection)
    }

    fun unbind() {
        try {
            Shizuku.unbindUserService(args, connection, true)
        } catch (e: RuntimeException) {
            // Shizuku already gone
        }
        remote = null
    }

    /**
     * Runs [script] and returns everything it printed (stdout and stderr). Blocking: never on the main thread. Gives up
     * shortly after [timeoutMillis] even if a child process keeps the output open.
     */
    fun run(script: String, timeoutMillis: Long): String {
        val service = remote ?: throw IOException("shell service not connected")
        return readAll(service.run(script, timeoutMillis), timeoutMillis)
    }

    /** Dumps every window, as [io.yestack.upidetector.core.DumpScript.DUMP] prints it (see [ShellService.dumpWindows]). */
    fun dump(timeoutMillis: Long): String {
        val service = remote ?: throw IOException("shell service not connected")
        return readAll(service.dumpWindows(timeoutMillis), timeoutMillis)
    }

    /**
     * Blocks until a screen event from one of [packages] after event number [afterSeq], or [timeoutMillis]; returns the
     * latest event number. Throws when screen events are not available.
     */
    fun awaitScreenEvent(packages: Array<String>, afterSeq: Long, timeoutMillis: Long): Long {
        val service = remote ?: throw IOException("shell service not connected")
        return service.awaitScreenEvent(packages, afterSeq, timeoutMillis)
    }

    private fun readAll(pfd: ParcelFileDescriptor?, timeoutMillis: Long): String {
        if (pfd == null) throw IOException("shell service returned no output")
        val stream = ParcelFileDescriptor.AutoCloseInputStream(pfd)
        val watchdog = Timer("shell-read-timeout", true)
        watchdog.schedule(timeoutMillis + READ_SLACK_MILLIS) {
            try {
                stream.close()
            } catch (e: IOException) {
                // already closed
            }
        }
        try {
            return stream.use { it.readBytes().toString(Charsets.UTF_8) }
        } finally {
            watchdog.cancel()
        }
    }

    companion object {
        private const val READ_SLACK_MILLIS = 3_000L

        fun status(): Status = try {
            when {
                !Shizuku.pingBinder() -> Status.NOT_RUNNING
                Shizuku.isPreV11() -> Status.TOO_OLD
                Shizuku.checkSelfPermission() != PackageManager.PERMISSION_GRANTED -> Status.NO_PERMISSION
                else -> Status.READY
            }
        } catch (e: RuntimeException) {
            Status.NOT_RUNNING
        }
    }
}
