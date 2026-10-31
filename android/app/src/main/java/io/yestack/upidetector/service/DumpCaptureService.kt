package io.yestack.upidetector.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.PowerManager
import android.provider.Settings
import android.view.WindowManager
import com.expense_tracker.MainActivity
import com.expense_tracker.R
import io.yestack.upidetector.AppStore
import io.yestack.upidetector.SupportedApps
import io.yestack.upidetector.core.DumpScript
import io.yestack.upidetector.core.ScreenSnapshot
import io.yestack.upidetector.shizuku.ShizukuShell
import io.yestack.upidetector.ui.LimitWarningActivity
import java.math.BigDecimal
import rikka.shizuku.Shizuku

/**
 * The Shizuku tracking method: reads the supported UPI apps' screens as the shell user through Shizuku (no root, no
 * accessibility service); see [DumpCaptureLoop]. Every capture goes to [AppStore], exactly as the accessibility
 * service's do. It also shows the allowance warning ([CaptureSpendGuard]) and the note pop-up ([NoteOverlay]) over
 * the UPI app; the overlay permission they need is granted through Shizuku when capture starts.
 *
 * Started from Paisa when the user picks Shizuku, and kept running (sticky) until they stop it: from Paisa or the
 * notification. It waits for Shizuku when Shizuku is not up yet (after a restart of this app). While it runs, the
 * accessibility service (if also enabled) stays idle, so no screen is read twice.
 */
class DumpCaptureService : Service() {

    private lateinit var thread: HandlerThread
    private lateinit var worker: Handler
    private lateinit var shell: ShizukuShell
    private lateinit var loop: DumpCaptureLoop
    private lateinit var guard: CaptureSpendGuard
    private lateinit var noteOverlay: NoteOverlay
    private var notConnectedTicks = 0
    private var waitingLogged = false

    /** The shell service was bound and the loop started (main thread). */
    private var started = false

    /** The loop keeps ticking; cleared when capture stops. */
    @Volatile
    private var active = false

    /** Overlay and notification permissions asked for through Shizuku (worker thread). */
    private var permissionsGranted = false

    /** This service's note prompter, and the one it replaced (the accessibility service's), restored on stop. */
    private val notePrompter: (Long) -> Boolean = { id -> noteOverlay.ask(id) }
    private val noteQueueDropper: () -> Unit = { noteOverlay.dropQueued() }
    private var previousPrompter: ((Long) -> Boolean)? = null
    private var previousDropper: (() -> Unit)? = null

    private val binderReceived = Shizuku.OnBinderReceivedListener { AppStore.post { begin() } }

    private val binderDead = Shizuku.OnBinderDeadListener {
        AppStore.post {
            AppStore.log("Shizuku stopped; capture stopped (start Shizuku again and Paisa resumes it)")
            stopSelf()
        }
    }

    /** Number of the last screen event seen from a supported app (worker thread). */
    private var eventSeq = 0L

    /** Screen events arrive through Shizuku (worker thread); false once they failed, and then the loop polls. */
    private var eventsAvailable = true

    private val tick = object : Runnable {
        override fun run() {
            if (!active) return
            val delay = step()
            if (!active) return
            if (shell.isConnected && eventsAvailable) {
                // The next tick runs as soon as a UPI app's screen changes; the loop's delay only bounds the wait.
                val before = eventSeq
                eventSeq = awaitScreenEvent(maxOf(delay, EVENT_MAX_WAIT_MILLIS))
                if (active) worker.postDelayed(this, if (eventSeq > before) SETTLE_MILLIS else 0L)
            } else {
                worker.postDelayed(this, delay)
            }
        }
    }

    private fun awaitScreenEvent(timeoutMillis: Long): Long = try {
        shell.awaitScreenEvent(WATCHED_PACKAGES, eventSeq, timeoutMillis)
    } catch (e: Exception) {
        eventsAvailable = false
        AppStore.post { AppStore.log("screen-change events unavailable ($e); reading on a timer instead") }
        eventSeq
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        AppStore.init(applicationContext)
        thread = HandlerThread("dump-capture").also { it.start() }
        worker = Handler(thread.looper)
        shell = ShizukuShell(this)
        guard = CaptureSpendGuard(this) { onFailed -> openLimitWarning(onFailed) }
        noteOverlay = NoteOverlay(this, WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY)
        loop = DumpCaptureLoop(
            object : DumpCaptureLoop.Shell {
                override fun run(script: String, timeoutMillis: Long) = shell.run(script, timeoutMillis)
                override fun dump(timeoutMillis: Long) = shell.dump(timeoutMillis)
            },
            StoreSink(),
        )
        // Payments dated before the app was installed, or before tracking first started here, are history.
        AppStore.installedAtMillis = listOfNotNull(installTime(), AppStore.trackingStartedAt).maxOrNull()
        AppStore.log(
            "Shizuku capture service started; ignoring payments dated before install " +
                (AppStore.installedAtMillis?.let { java.util.Date(it).toString() } ?: "(install time unknown)"),
        )
    }

    /**
     * Starts [LimitWarningActivity] as the shell user (allowed from the background, unlike from this app). On its own
     * thread: the worker may be waiting for a screen event.
     */
    private fun openLimitWarning(onFailed: (String) -> Unit) {
        val script = DumpScript.startActivity(ComponentName(this, LimitWarningActivity::class.java).flattenToShortString())
        kotlin.concurrent.thread(name = "limit-warning") {
            val why = try {
                DumpScript.startFailure(shell.run(script, START_TIMEOUT_MILLIS))
            } catch (e: Exception) {
                e.toString()
            }
            if (why != null) onFailed(why)
        }
    }

    private fun installTime(): Long? = try {
        // firstInstallTime survives `adb install -r` and app updates, so a reinstall doesn't hide earlier payments.
        @Suppress("DEPRECATION")
        packageManager.getPackageInfo(packageName, 0).firstInstallTime
    } catch (e: Exception) {
        null
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            setWanted(this, false)
            stopSelf()
            return START_NOT_STICKY
        }
        startInForeground()
        setWanted(this, true)
        // Sticky: runs now if Shizuku's binder is already here, else when it arrives.
        Shizuku.addBinderReceivedListenerSticky(binderReceived)
        if (!Shizuku.pingBinder() && !waitingLogged) {
            waitingLogged = true
            AppStore.log("capture waiting for Shizuku to start")
        }
        return START_STICKY
    }

    /** Starts capture once Shizuku is up, unless it already runs. Main thread. */
    private fun begin() {
        if (started) return
        when (val status = ShizukuShell.status()) {
            ShizukuShell.Status.NOT_RUNNING -> return // the binder listener calls again
            ShizukuShell.Status.READY -> Unit
            else -> {
                AppStore.log("capture not started: Shizuku $status (open Auto-tracking in Paisa to fix it)")
                stopSelf()
                return
            }
        }
        started = true
        running = true
        Shizuku.addBinderDeadListener(binderDead)
        try {
            shell.bind()
        } catch (e: RuntimeException) {
            AppStore.log("capture not started: could not start the Shizuku shell service: $e")
            stopSelf()
            return
        }
        claimNotePrompts()
        active = true
        AppStore.log("capture started (via Shizuku)")
        AppStore.statusChanged()
        worker.post(tick)
    }

    /**
     * Note questions go to this service's pop-up while it runs. Called again before each read: the accessibility
     * service clears the prompter when it is switched off, which must not leave capture without one. Main thread.
     */
    private fun claimNotePrompts() {
        val prompter = AppStore.notePrompter
        if (prompter !== notePrompter) {
            previousPrompter = prompter
            AppStore.notePrompter = notePrompter
        }
        val dropper = AppStore.noteQueueDropper
        if (dropper !== noteQueueDropper) {
            previousDropper = dropper
            AppStore.noteQueueDropper = noteQueueDropper
        }
    }

    /** Hands note questions back to whoever had them before capture started. Main thread. */
    private fun releaseNotePrompts() {
        if (AppStore.notePrompter === notePrompter) AppStore.notePrompter = previousPrompter
        if (AppStore.noteQueueDropper === noteQueueDropper) AppStore.noteQueueDropper = previousDropper
        previousPrompter = null
        previousDropper = null
    }

    /** One step on the worker thread; returns the delay before the next. */
    private fun step(): Long {
        if (!shell.isConnected) {
            if (++notConnectedTicks == NOT_CONNECTED_LOG_TICKS) {
                AppStore.post { AppStore.log("capture: Shizuku shell service still not connected; waiting") }
            }
            return NOT_CONNECTED_DELAY_MILLIS
        }
        notConnectedTicks = 0
        if (!permissionsGranted) {
            permissionsGranted = true
            grantPermissions()
        }
        // Nothing to read with the screen off; the app on screen is still there when it comes back on.
        if (getSystemService(PowerManager::class.java)?.isInteractive == false) return SCREEN_OFF_DELAY_MILLIS
        return loop.tick()
    }

    private fun grantPermissions() {
        val result = try {
            shell.run(DumpScript.grantPermissions(packageName, Build.VERSION.SDK_INT >= 33), GRANT_TIMEOUT_MILLIS).trim()
        } catch (e: Exception) {
            e.toString()
        }
        AppStore.post {
            if (Settings.canDrawOverlays(this)) {
                AppStore.log("overlay permission granted through Shizuku (allowance warning and note pop-up)")
            } else {
                AppStore.log(
                    "overlay permission not granted (${result.ifEmpty { "no output" }}); the allowance warning " +
                        "shows only as a screen and notes open in a screen instead",
                )
            }
        }
    }

    override fun onDestroy() {
        active = false
        val wasRunning = running
        running = false
        worker.removeCallbacksAndMessages(null)
        Shizuku.removeBinderReceivedListener(binderReceived)
        Shizuku.removeBinderDeadListener(binderDead)
        guard.reset()
        noteOverlay.dismissAll()
        releaseNotePrompts()
        if (started) {
            started = false
            worker.post {
                loop.stop()
                shell.unbind()
                AppStore.post { AppStore.log("capture stopped") }
            }
        }
        thread.quitSafely()
        if (wasRunning) AppStore.statusChanged()
        super.onDestroy()
    }

    private fun startInForeground() {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, getString(R.string.capture_channel_name), NotificationManager.IMPORTANCE_LOW),
        )
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
        )
        val stop = PendingIntent.getService(
            this, 1, Intent(this, DumpCaptureService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_upi_capture)
            .setContentTitle(getString(R.string.capture_notification_title))
            .setContentText(getString(R.string.capture_notification_text))
            .setContentIntent(open)
            .addAction(Notification.Action.Builder(null, getString(R.string.capture_stop), stop).build())
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    /** Hands each capture to [AppStore] (and the allowance check to [guard]) on the main thread, in order. */
    private inner class StoreSink : DumpCaptureLoop.Sink {
        override fun log(message: String, now: Long) = AppStore.post { AppStore.log(message, now) }

        override fun onScreenChanged(packageName: String, screenClass: String, now: Long) =
            AppStore.post { AppStore.onScreenChanged(packageName, screenClass, null, now) }

        override fun onAppBackground(packageName: String, now: Long) = AppStore.post {
            guard.reset()
            AppStore.onAppBackground(packageName, now)
        }

        override fun onPaymentAttempt(packageName: String, now: Long, amount: BigDecimal?) =
            AppStore.post { AppStore.onPaymentAttempt(packageName, now, amount) }

        override fun onCaptured(packageName: String, windows: List<ScreenSnapshot>, now: Long) = AppStore.post {
            try {
                guard.check(windows, now)
            } catch (e: Exception) {
                AppStore.log("confirm check failed: $e", now)
            }
        }

        override fun onRead(packageName: String, windows: List<ScreenSnapshot>, infos: List<String>, now: Long) =
            AppStore.post {
                if (active) claimNotePrompts()
                AppStore.onRead(packageName, windows, infos, now)
            }

        override fun onReadMiss(packageName: String, screenClass: String?, logLine: String, now: Long) =
            AppStore.post { AppStore.onReadMiss(packageName, screenClass, logLine, now) }
    }

    companion object {
        private const val ACTION_STOP = "io.yestack.upidetector.action.STOP_DUMP_CAPTURE"
        private const val CHANNEL_ID = "upi_capture"
        private const val NOTIFICATION_ID = 7107
        private const val NOT_CONNECTED_DELAY_MILLIS = 500L
        private const val NOT_CONNECTED_LOG_TICKS = 20
        private const val SCREEN_OFF_DELAY_MILLIS = 3_000L
        private const val GRANT_TIMEOUT_MILLIS = 5_000L
        private const val START_TIMEOUT_MILLIS = 5_000L

        /** Longest wait for a screen event; a screen that stays still is read again after this. */
        private const val EVENT_MAX_WAIT_MILLIS = 1_000L

        /** After a screen event, so the burst that redraws one screen leads to one read. */
        private const val SETTLE_MILLIS = 150L
        private val WATCHED_PACKAGES = SupportedApps.packageNames.toTypedArray()
        private const val PREFS = "capture"
        private const val KEY_WANTED = "wanted"

        /** Whether capture is running; while it is, the accessibility service ignores the UPI apps. */
        @Volatile
        var running = false
            private set

        /** The user started capture and has not stopped it: Paisa restarts it when it is not running. */
        fun isWanted(context: Context): Boolean =
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_WANTED, false)

        /** Whether Paisa should keep capture running (and start it once Shizuku is ready). */
        fun setWanted(context: Context, wanted: Boolean) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_WANTED, wanted).apply()
        }

        fun start(context: Context) {
            context.startForegroundService(Intent(context, DumpCaptureService::class.java))
        }

        fun stop(context: Context) {
            setWanted(context, false)
            context.stopService(Intent(context, DumpCaptureService::class.java))
        }
    }
}
