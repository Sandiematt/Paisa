package io.yestack.upidetector.bridge

import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import io.yestack.upidetector.AppStore
import io.yestack.upidetector.SupportedApps
import io.yestack.upidetector.budget.BudgetJson
import io.yestack.upidetector.core.SpendLimit
import io.yestack.upidetector.ui.ReportBuilder
import java.math.BigDecimal
import org.json.JSONArray

/**
 * `NativeModules.UpiDetector`: the bridge between Paisa's JS and the detector (see src/lib/autotrack/types.ts).
 *
 * Every object crosses as a JSON string (the JS wrapper parses it); a missing value resolves null. [AppStore] is main
 * thread only, so each method hops to the main thread first. Change notifications go out as the device event
 * "UpiDetectorChanged" with {reason}, coalesced so a burst of log lines is one event.
 *
 * A legacy native module: the New Architecture serves it through the TurboModule interop layer.
 */
class UpiDetectorModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val main = Handler(Looper.getMainLooper())
    private val queuedReasons = LinkedHashSet<String>()
    private var flushScheduled = false
    private var listenerAdded = false

    /** Whether "log" events go out; off until JS asks (the log changes on every screen read). */
    private var logStreaming = false

    private val flush = Runnable {
        flushScheduled = false
        val reasons = queuedReasons.toList()
        queuedReasons.clear()
        if (!reactContext.hasActiveReactInstance()) return@Runnable
        for (reason in reasons) {
            try {
                val payload = Arguments.createMap().apply { putString("reason", reason) }
                reactContext.emitDeviceEvent(EVENT, payload)
            } catch (t: Throwable) {
                AppStore.log("could not emit $EVENT: $t")
            }
        }
    }

    private val listener = AppStore.Listener { reason -> queue(reason) }

    override fun getName(): String = NAME

    override fun initialize() {
        super.initialize()
        AppStore.post {
            try {
                AppStore.init(reactContext.applicationContext)
                if (!listenerAdded) {
                    listenerAdded = true
                    AppStore.addListener(listener)
                }
            } catch (t: Throwable) {
                // The module must load even if the detector store cannot: methods report the error to JS.
            }
        }
    }

    override fun invalidate() {
        AppStore.post {
            listenerAdded = false
            logStreaming = false
            AppStore.removeListener(listener)
            main.removeCallbacks(flush)
            queuedReasons.clear()
            flushScheduled = false
        }
        super.invalidate()
    }

    private fun queue(reason: String) {
        if (reason == AppStore.REASON_LOG && !logStreaming) return
        queuedReasons.add(reason)
        if (!flushScheduled) {
            flushScheduled = true
            main.postDelayed(flush, EVENT_COALESCE_MILLIS)
        }
    }

    /** Runs [block] on the main thread after making sure the store is open, and resolves [promise] with its result. */
    private fun onMain(promise: Promise, block: () -> Any?) {
        AppStore.post {
            try {
                AppStore.init(reactContext.applicationContext)
                promise.resolve(block())
            } catch (t: Throwable) {
                promise.reject(ERROR_CODE, t.message ?: t.toString(), t)
            }
        }
    }

    // ---- status and settings screens ----

    @ReactMethod
    fun getStatus(promise: Promise) = onMain(promise) {
        val ctx = reactContext.applicationContext
        DetectorJson.status(
            SystemStatus.isAccessibilityServiceEnabled(ctx),
            SystemStatus.isNotificationAccessEnabled(ctx),
            SystemStatus.installedApps(ctx),
        ).toString()
    }

    @ReactMethod
    fun openAccessibilitySettings(promise: Promise) = onMain(promise) {
        startSettings(Settings.ACTION_ACCESSIBILITY_SETTINGS)
        null
    }

    @ReactMethod
    fun openNotificationAccessSettings(promise: Promise) = onMain(promise) {
        startSettings(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        null
    }

    private fun startSettings(action: String) {
        val intent = Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        val activity = reactContext.currentActivity
        if (activity != null) activity.startActivity(Intent(action)) else reactContext.startActivity(intent)
    }

    // ---- detections ----

    /** DetectedTxn[], newest first. */
    @ReactMethod
    fun getTransactions(promise: Promise) = onMain(promise) {
        val sync = AppStore.rowMeta
        val arr = JSONArray()
        AppStore.ownedTransactions.sortedByDescending { it.detectedAtMillis }.forEach { arr.put(DetectorJson.txn(it, sync[it.id])) }
        arr.toString()
    }

    /** The live log as a JSON array of strings, newest first. */
    @ReactMethod
    fun getLog(promise: Promise) = onMain(promise) {
        JSONArray(AppStore.logNewestFirst).toString()
    }

    /** PendingTxn[]: SUCCESS, unflagged records changed since their last sync. */
    @ReactMethod
    fun getPending(promise: Promise) = onMain(promise) {
        val arr = JSONArray()
        AppStore.pending().forEach { arr.put(DetectorJson.pending(it)) }
        arr.toString()
    }

    /** [json] is an AckEntry[]; resolves null. */
    @ReactMethod
    fun ackSynced(json: String, promise: Promise) = onMain(promise) {
        AppStore.ackSynced(DetectorJson.parseAcks(json))
        null
    }

    /** Resolves true if a flagged record with that id was found. */
    @ReactMethod
    fun keep(id: Double, promise: Promise) = onMain(promise) { AppStore.keep(id.toLong()) }

    @ReactMethod
    fun merge(id: Double, promise: Promise) = onMain(promise) { AppStore.merge(id.toLong()) }

    /** Clears the detection history, the log and raw captures. Preferences and the budget snapshot stay. */
    @ReactMethod
    fun clear(promise: Promise) = onMain(promise) {
        AppStore.clear()
        null
    }

    /** The plain-text diagnostics report (not JSON). */
    @ReactMethod
    fun buildReport(promise: Promise) = onMain(promise) {
        val ctx = reactContext.applicationContext
        val installed = SystemStatus.installedApps(ctx).toSet()
        val header = ReportBuilder.Header(
            appVersion = appVersion(ctx),
            device = "${Build.MANUFACTURER} ${Build.MODEL}",
            androidVersion = "${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})",
            timeMillis = System.currentTimeMillis(),
            serviceEnabled = SystemStatus.isAccessibilityServiceEnabled(ctx),
            installed = SupportedApps.all.associate { it.packageName to (it.packageName in installed) },
            notificationAccess = SystemStatus.isNotificationAccessEnabled(ctx),
            notificationsIgnored = AppStore.ignoredNotificationCount,
        )
        val owned = AppStore.ownedTransactions
        ReportBuilder.build(
            header,
            owned.sortedByDescending { it.detectedAtMillis },
            owned.filter { SpendLimit.isExpense(it) }.fold(BigDecimal.ZERO) { acc, t -> acc + t.amount },
            AppStore.logNewestFirst,
            AppStore.rawCaptures,
        )
    }

    @Suppress("DEPRECATION")
    private fun appVersion(ctx: Context): String = try {
        val info = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
        val code = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
        "${info.versionName} ($code)"
    } catch (e: Exception) {
        "unknown"
    }

    // ---- preferences and budget ----

    /** [json] is AutoTrackPrefs (a missing flag keeps its value); resolves the saved AutoTrackPrefs. */
    @ReactMethod
    fun setPreferences(json: String, promise: Promise) = onMain(promise) {
        val (notes, blocking) = DetectorJson.parsePrefs(json, AppStore.notesEnabled, AppStore.blockingEnabled)
        AppStore.setPreferences(notes, blocking)
        DetectorJson.prefs(AppStore.notesEnabled, AppStore.blockingEnabled).toString()
    }

    /** AutoTrackPrefs; both default to true. */
    @ReactMethod
    fun getPreferences(promise: Promise) = onMain(promise) {
        DetectorJson.prefs(AppStore.notesEnabled, AppStore.blockingEnabled).toString()
    }

    /** [json] is a BudgetSnapshot; resolves true when it was usable and saved. */
    @ReactMethod
    fun setBudgetSnapshot(json: String, promise: Promise) = onMain(promise) { AppStore.setBudgetSnapshot(json) }

    /** DailyAllowance computed natively (snapshot plus this phone's unsynced detections), or null when there is no budget. */
    @ReactMethod
    fun getAllowance(promise: Promise) = onMain(promise) {
        AppStore.allowance(System.currentTimeMillis())?.let { BudgetJson.allowanceToJson(it) }
    }

    /**
     * Sign-out: preferences back to defaults and the budget snapshot forgotten. Detection history is kept, unless
     * [purgeHistory] (account deletion): then the owner's records are deleted too.
     */
    @ReactMethod
    fun clearUserData(purgeHistory: Boolean, promise: Promise) = onMain(promise) {
        AppStore.clearUserData(purgeHistory)
        null
    }

    /**
     * The Paisa user id on sign-in, null on sign-out. Detections are tagged with it; lists, the sync queue and the
     * spend guard's extra spend only cover the current user. Resolves null.
     */
    @ReactMethod
    fun setOwner(userId: String?, promise: Promise) = onMain(promise) {
        AppStore.setOwner(userId)
        null
    }

    /** Turns "log"-reason events on or off (default off). "transactions" and "status" events always go out. */
    @ReactMethod
    fun setLogStreaming(enabled: Boolean, promise: Promise) = onMain(promise) {
        logStreaming = enabled
        null
    }

    // ---- NativeEventEmitter requirements ----

    @ReactMethod
    fun addListener(eventName: String) {
        // Events are always emitted while the module is alive; JS subscribes through NativeEventEmitter.
    }

    @ReactMethod
    fun removeListeners(count: Double) {
        // Nothing to release per subscription.
    }

    companion object {
        const val NAME = "UpiDetector"
        const val EVENT = "UpiDetectorChanged"
        private const val ERROR_CODE = "E_UPI_DETECTOR"
        private const val EVENT_COALESCE_MILLIS = 250L
    }
}
