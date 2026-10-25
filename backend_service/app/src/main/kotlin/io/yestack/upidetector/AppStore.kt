package io.yestack.upidetector

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import io.yestack.upidetector.core.ConfirmScreenParser
import io.yestack.upidetector.core.Decision
import io.yestack.upidetector.core.NewExpenses
import io.yestack.upidetector.core.NotePromptLog
import io.yestack.upidetector.core.NotificationParser
import io.yestack.upidetector.core.ParseResult
import io.yestack.upidetector.core.PaymentPipeline
import io.yestack.upidetector.core.ScreenCheck
import io.yestack.upidetector.core.ScreenSnapshot
import io.yestack.upidetector.core.SpendLimit
import io.yestack.upidetector.core.Transaction
import io.yestack.upidetector.data.ExpenseDb
import io.yestack.upidetector.ui.NoteActivity
import java.math.BigDecimal
import java.text.SimpleDateFormat
import java.time.ZoneId
import java.util.Date
import java.util.Locale

/**
 * Process-wide state. Transactions (with their notes) and the daily limit are saved in [ExpenseDb] once [init] has
 * run; the live log and raw captures are memory only.
 *
 * Main thread only. The service and the activity both run there; anything else must go through [post].
 */
object AppStore {
    const val MAX_LOG_LINES = 300
    const val MAX_RAW_CAPTURES = 60
    private const val MAX_CRASH_LINES = 40

    fun interface Listener {
        fun onStoreChanged()
    }

    /**
     * One window as read (text, content description and view ID of every node, the Activity class, the time) with
     * what was decided about it. A failed read is kept too, with no nodes and the reason as its verdict. Memory only.
     */
    class RawCapture(
        val snapshot: ScreenSnapshot,
        val timeMillis: Long,
        val verdict: String,
        /** Which window it was (id, layer, type, root class), when known. */
        val detail: String? = null,
    )

    private val mainHandler = Handler(Looper.getMainLooper())
    private val pipeline = PaymentPipeline()
    private val detector get() = pipeline.detector
    private val logLines = ArrayDeque<String>()
    private val captures = ArrayList<RawCapture>() // newest first
    private val listeners = ArrayList<Listener>()
    private val timeFormat = SimpleDateFormat("HH:mm:ss", Locale.US)

    private var appContext: Context? = null
    private var db: ExpenseDb? = null

    /** What the DB holds, by id, so only changed rows are written. */
    private val persisted = HashMap<Long, Transaction>()

    /** Records already asked about in this process, so no payment is asked about twice. */
    private val notePrompted = HashSet<Long>()

    /** Which records have just become expenses: each is asked about once, whatever app or screen recorded it. */
    private val newExpenses = NewExpenses()

    private var limit: BigDecimal? = null

    /** When this app was first installed; payments dated earlier on screen are history and are ignored. */
    var installedAtMillis: Long? = null

    /** In-memory switch; resets to on when the process restarts. */
    var rawCaptureEnabled: Boolean = true

    /** Notifications from allowlisted apps that carried no amount + UPI ref. Shown in the report. */
    var ignoredNotificationCount: Int = 0
        private set

    /**
     * Set by the accessibility service while it runs: asks about a record over whatever is on screen. Returns false
     * when it could not; the note activity is then started instead.
     */
    var notePrompter: ((Long) -> Boolean)? = null

    /** Supported app last reported on screen and not yet reported as backgrounded. */
    var lastPackage: String? = null
        private set

    /**
     * Opens the database and restores the saved transactions and daily limit. Safe to call from every entry point;
     * only the first call does anything.
     */
    fun init(context: Context) {
        if (appContext != null) return
        appContext = context.applicationContext
        val now = System.currentTimeMillis()
        CrashLog.takePrevious(context)?.let { lines ->
            appendLog(now, "the app crashed last time; what crashed:")
            lines.take(MAX_CRASH_LINES).forEach { appendLog(now, "  $it") }
        }
        CrashLog.install(context)
        try {
            val opened = ExpenseDb(context.applicationContext)
            val saved = opened.loadTransactions()
            detector.restore(saved)
            // Expenses recorded before a restart were asked about then; never ask again.
            newExpenses.markKnown(saved)
            persisted.clear()
            saved.forEach { persisted[it.id] = it }
            limit = opened.getSetting(ExpenseDb.KEY_DAILY_LIMIT)?.toBigDecimalOrNull()
            db = opened
            appendLog(now, "restored ${saved.size} saved records; daily limit ${limit?.let { "₹${it.toPlainString()}" } ?: "not set"}")
        } catch (t: Throwable) {
            appendLog(now, "ERROR opening the expense database: $t (history will not be saved)")
        }
        notifyChanged()
    }

    fun post(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) block() else mainHandler.post(block)
    }

    fun addListener(l: Listener) {
        if (l !in listeners) listeners.add(l)
    }

    fun removeListener(l: Listener) {
        listeners.remove(l)
    }

    val transactions: List<Transaction> get() = detector.transactions
    val logNewestFirst: List<String> get() = logLines.reversed()
    val rawCaptures: List<RawCapture> get() = captures.toList()

    fun log(message: String, now: Long = System.currentTimeMillis()) {
        appendLog(now, message)
        notifyChanged()
    }

    fun onScreenChanged(packageName: String, screenClass: String?, windowId: Int?, now: Long) {
        lastPackage = packageName
        pipeline.forgetLastRead()
        lastRepeatLine = null
        lastUnfinished = null
        decide("screen change", now) { detector.onScreenChanged(packageName, screenClass, windowId, now) }
    }

    fun onAppBackground(packageName: String, now: Long) {
        if (lastPackage == packageName) lastPackage = null
        pipeline.forgetLastRead()
        decide("background", now) { detector.onAppBackground(packageName, now) }
    }

    /** A UPI PIN screen of [packageName] came up (it is not read): see [io.yestack.upidetector.core.DuplicateDetector.onPaymentAttempt]. */
    fun onPaymentAttempt(packageName: String, now: Long, amount: BigDecimal? = null) {
        val isNew = detector.onPaymentAttempt(packageName, now, amount)
        if (isNew && amount != null) {
            appendLog(now, "payment of ₹${amount.toPlainString()} started in ${SupportedApps.displayName(packageName)} (confirm screen)")
            notifyChanged()
        }
    }

    /** Reports the last known supported app as backgrounded, if any. */
    fun onLastAppBackground(now: Long) {
        lastPackage?.let { onAppBackground(it, now) }
    }

    /**
     * One read of a UPI app: every window of it on screen, top-most first, with [infos] saying which window each was.
     * Each window is parsed on its own and one decides (see [PaymentPipeline]); every window is kept in the raw
     * captures with its verdict. A read the same as the last one since the screen changed is ignored.
     *
     * [treeIssues] says, per window, why its tree may be incomplete; [scan] names a re-read ("re-read 2 of 6").
     * Returns why the read looks like a result screen still being drawn (see [ScreenCheck]), so the service reads it
     * again; null when it does not.
     */
    fun onRead(
        packageName: String,
        windows: List<ScreenSnapshot>,
        infos: List<String>,
        now: Long,
        treeIssues: List<String?> = emptyList(),
        scan: String? = null,
    ): String? {
        if (windows.isEmpty()) return null
        val app = SupportedApps.displayName(packageName)
        var decisions: List<Decision> = emptyList()
        var unfinished: String? = null
        try {
            // A history list or an old payment's detail page is never recorded, so it cannot add an expense or ask.
            val outcome = pipeline.onRead(windows, notBeforeMillis = installedAtMillis, nowMillis = now)
            if (outcome == null) {
                // Same as the last read: still whatever it was.
                if (scan != null && lastUnfinished != null) appendLog(now, "$scan of $app: unchanged ($lastUnfinished)")
                return lastUnfinished
            }
            decisions = outcome.decisions
            appendLog(
                now,
                (scan?.let { "$it: " } ?: "") + "read $app ${windows.first().screenClass ?: "?"}: ${windows.size} window(s): " +
                    outcome.windows.mapIndexed { i, w ->
                        (if (i == outcome.chosen) "[used] " else "") + "${w.snapshot.nodes.size} nodes ${shortVerdict(w.result)}"
                    }.joinToString(" | "),
            )
            outcome.windows.forEachIndexed { i, w ->
                val flow = if (w.liveByPaymentFlow) {
                    "; live: follows the payment just started in $app (history-looking text on screen ignored)"
                } else {
                    ""
                }
                appendLog(now, "  window ${i + 1} keys: ${ScreenCheck.keywords(w.snapshot, now)}$flow")
            }
            outcome.decisions.forEach { appendLog(now, it.logLine) }
            unfinished = ScreenCheck.unfinishedReason(outcome, treeIssues)
            outcome.windows.forEachIndexed { i, w ->
                val verdict = if (i == outcome.chosen) {
                    verdictOf(w.result, outcome.decisions)
                } else {
                    "${shortVerdict(w.result)} (not used: another window decided)"
                }
                recordCapture(w.snapshot, now, verdict, infos.getOrNull(i))
            }
        } catch (t: Throwable) {
            appendLog(now, "ERROR in parse/detect: $t")
        }
        lastUnfinished = unfinished
        persist(now)
        promptNewExpenses(now, decisions)
        notifyChanged()
        return unfinished
    }

    /** Why the last decided read looked unfinished, for a re-read that comes back unchanged. */
    private var lastUnfinished: String? = null

    /** A read that got no text: logged, and kept in the raw captures with the window list it saw. */
    fun onReadMiss(packageName: String, screenClass: String?, logLine: String, now: Long) {
        appendLog(now, logLine)
        recordCapture(ScreenSnapshot(packageName, screenClass, null, emptyList()), now, logLine)
        notifyChanged()
    }

    /**
     * A window the daily-limit check read and its verdict. Logged; with [capture], also kept in the raw captures (when
     * enabled) so a confirm screen that was not recognised can be exported and examined. Called when the verdict changes.
     */
    fun onConfirmCheck(snapshot: ScreenSnapshot, verdict: String, capture: Boolean, now: Long) {
        appendLog(now, "confirm check ${SupportedApps.displayName(snapshot.packageName)}: $verdict")
        if (capture) recordCapture(snapshot, now, "confirm check: $verdict")
        notifyChanged()
    }

    /** Cross-verify only: never creates a transaction. Logs parsed fields, never the notification text. */
    fun onNotification(packageName: String, title: String?, text: String?, postedAt: Long) {
        val now = System.currentTimeMillis()
        var decisions: List<Decision> = emptyList()
        try {
            val hit = NotificationParser.parse(packageName, title, text, postedAt)
            if (hit == null) {
                ignoredNotificationCount++
                if (!NotificationSources.isMessagingApp(packageName)) {
                    appendLog(
                        now,
                        "notification from ${NotificationSources.displayName(packageName)} ignored " +
                            "(no amount + UPI ref)",
                    )
                }
            } else {
                appendLog(
                    now,
                    "notification ${NotificationSources.displayName(packageName)}: ₹${hit.amount.toPlainString()} " +
                        "${hit.direction} ref ${hit.upiRef}",
                )
                decisions = detector.onNotification(hit, now)
                decisions.forEach { appendLog(now, it.logLine) }
            }
        } catch (t: Throwable) {
            appendLog(now, "ERROR in notification cross-check: $t")
        }
        persist(now)
        // A notification can clear a POSSIBLE_DUPLICATE flag, which makes that record an expense.
        promptNewExpenses(now, decisions)
        notifyChanged()
    }

    fun keep(id: Long): Boolean = detector.keep(id).also { logAction("keep", id, it) }

    fun merge(id: Long): Boolean = detector.merge(id).also { logAction("merge", id, it) }

    /** Saves [note] on record [id]; a blank note clears it. */
    fun attachNote(id: Long, note: String?): Boolean {
        val ok = detector.attachNote(id, note)
        val now = System.currentTimeMillis()
        appendLog(now, "user note #$id: ${if (ok) "saved" else "no such record"}")
        persist(now)
        notifyChanged()
        return ok
    }

    fun expenseTotal(): BigDecimal = detector.expenseTotal()

    /** Expenses detected since local midnight of the day containing [now]. */
    fun todaySpent(now: Long): BigDecimal =
        SpendLimit.spentSince(detector.transactions, SpendLimit.startOfDay(now, ZoneId.systemDefault()))

    /** Combined daily limit across UPI apps, in rupees; null when not set. */
    val dailyLimit: BigDecimal? get() = limit

    /** Sets (or with null removes) the daily limit and saves it. */
    fun updateDailyLimit(value: BigDecimal?) {
        limit = value
        val now = System.currentTimeMillis()
        try {
            db?.putSetting(ExpenseDb.KEY_DAILY_LIMIT, value?.toPlainString())
        } catch (t: Throwable) {
            appendLog(now, "ERROR saving the daily limit: $t")
        }
        appendLog(now, "daily limit ${value?.let { "set to ₹${it.toPlainString()}" } ?: "removed"}")
        notifyChanged()
    }

    /** Clears transactions (also on disk), the log and raw captures. The daily limit is kept. */
    fun clear() {
        detector.clear()
        pipeline.forgetLastRead()
        try {
            db?.deleteAllTransactions()
        } catch (t: Throwable) {
            appendLog(System.currentTimeMillis(), "ERROR clearing saved transactions: $t")
        }
        persisted.clear()
        logLines.clear()
        captures.clear()
        lastPackage = null
        ignoredNotificationCount = 0
        notifyChanged()
    }

    private fun logAction(name: String, id: Long, ok: Boolean) {
        val now = System.currentTimeMillis()
        appendLog(now, "user $name #$id: ${if (ok) "done" else "no such flagged record"}")
        persist(now)
        // Keep makes a flagged record count, so it is then a newly recorded expense.
        promptNewExpenses(now)
        notifyChanged()
    }

    /** Writes records that changed since the last write and deletes removed ones. */
    private fun persist(now: Long) {
        val store = db ?: return
        try {
            val current = detector.transactions
            for (t in current) {
                if (persisted[t.id] != t) {
                    store.upsert(t)
                    persisted[t.id] = t
                }
            }
            val ids = current.mapTo(HashSet()) { it.id }
            for (id in persisted.keys.filter { it !in ids }) {
                store.delete(id)
                persisted.remove(id)
            }
        } catch (t: Throwable) {
            appendLog(now, "ERROR saving transactions: $t")
        }
    }

    /**
     * Asks what each newly recorded expense was for: any record that has just started counting as an expense, from
     * any app, whatever screen it was recorded from. Once per record; one that already has a note is not asked about.
     */
    private fun promptNewExpenses(now: Long, decisions: List<Decision> = emptyList()) {
        val prompted = newExpenses.newlyRecorded(detector.transactions).filter { it.note == null }
        for (line in NotePromptLog.lines(decisions, prompted)) {
            // A screen redrawn while it stays up repeats the same duplicate verdict; log it once.
            if (line.startsWith("repeat of record") && line == lastRepeatLine) continue
            if (line.startsWith("repeat of record")) lastRepeatLine = line
            appendLog(now, line)
        }
        prompted.forEach { promptNote(it, now) }
    }

    /** Last "ignored as a duplicate" line, so a redraw does not log it again. */
    private var lastRepeatLine: String? = null

    private fun promptNote(t: Transaction, now: Long) {
        if (!notePrompted.add(t.id)) return
        // An activity started from the background service can be blocked or land behind the UPI app without any
        // error (seen with PhonePe); the service's overlay is shown at once, so it goes first.
        if (notePrompter?.invoke(t.id) == true) {
            appendLog(now, "asked what record #${t.id} was for")
            return
        }
        if (openNoteScreen(t.id)) {
            appendLog(now, "asked what record #${t.id} was for (note screen; may not show if Android blocks it)")
        }
    }

    /**
     * Starts the note screen for record [id], used only when the service's overlay could not be shown. Returns false
     * if it could not be started; Android can also drop a start from the background without any error.
     */
    fun openNoteScreen(id: Long): Boolean {
        val context = appContext ?: return false
        return try {
            context.startActivity(
                Intent(context, NoteActivity::class.java)
                    .putExtra(NoteActivity.EXTRA_TXN_ID, id)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            true
        } catch (e: RuntimeException) {
            appendLog(System.currentTimeMillis(), "could not open the note screen for record #$id: $e")
            false
        }
    }

    fun noteScreenOpened(id: Long) {
        appendLog(System.currentTimeMillis(), "note screen on screen for record #$id")
    }

    private fun decide(what: String, now: Long, block: () -> List<Decision>) {
        try {
            block().forEach { appendLog(now, it.logLine) }
        } catch (t: Throwable) {
            appendLog(now, "ERROR in $what: $t")
        }
        notifyChanged()
    }

    private fun shortVerdict(result: ParseResult): String = when (result) {
        is ParseResult.Candidate -> "candidate ₹${result.amount.toPlainString()} ${result.status} ${result.direction}"
        is ParseResult.Rejected -> "rejected ${result.reason}: ${result.detail}"
    }

    private fun verdictOf(result: ParseResult, decisions: List<Decision>): String {
        val outcome = decisions.filter { it !is Decision.RefExtractionFailed }
            .joinToString { it::class.simpleName ?: "?" }
        val parsed = shortVerdict(result)
        return if (outcome.isEmpty()) parsed else "$parsed -> $outcome"
    }

    private fun recordCapture(snapshot: ScreenSnapshot, now: Long, verdict: String, detail: String? = null) {
        if (!rawCaptureEnabled) return
        // A PIN screen whose class is not on the skip list still must not be kept, not even its keypad labels.
        if (ConfirmScreenParser.isPinScreen(snapshot)) return
        // Apps redraw the same screen repeatedly; keep one copy of each window and verdict.
        val same = captures.any {
            it.snapshot.packageName == snapshot.packageName && it.snapshot.windowId == snapshot.windowId &&
                it.snapshot.nodes == snapshot.nodes && it.verdict == verdict
        }
        if (same) return
        captures.add(0, RawCapture(snapshot, now, verdict, detail))
        while (captures.size > MAX_RAW_CAPTURES) captures.removeAt(captures.size - 1)
    }

    private fun appendLog(now: Long, message: String) {
        logLines.addLast("${timeFormat.format(Date(now))} $message")
        while (logLines.size > MAX_LOG_LINES) logLines.removeFirst()
    }

    private fun notifyChanged() {
        listeners.toList().forEach { it.onStoreChanged() }
    }
}
