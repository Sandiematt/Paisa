package io.yestack.upidetector

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import io.yestack.upidetector.budget.Allowance
import io.yestack.upidetector.budget.BudgetJson
import io.yestack.upidetector.budget.BudgetPlan
import io.yestack.upidetector.budget.BudgetSnapshot
import io.yestack.upidetector.budget.ExtraSpend
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
import io.yestack.upidetector.data.OwnerScope
import io.yestack.upidetector.data.RowMeta
import io.yestack.upidetector.data.SyncRules
import io.yestack.upidetector.ui.NoteActivity
import java.math.BigDecimal
import java.text.SimpleDateFormat
import java.time.Instant
import java.time.ZoneId
import java.util.Date
import java.util.Locale

/**
 * Process-wide state. Transactions (with their notes), the Paisa preferences and the budget snapshot are saved in
 * [ExpenseDb] once [init] has run; the live log and raw captures are memory only.
 *
 * Main thread only. The service and the activity both run there; anything else must go through [post].
 */
object AppStore {
    const val MAX_LOG_LINES = 300
    private const val OPEN_RETRY_MILLIS = 30_000L
    const val MAX_RAW_CAPTURES = 60
    private const val MAX_CRASH_LINES = 40

    /** Why the store changed, for [Listener]: a record was written, only the log changed, or a setting/status changed. */
    const val REASON_TRANSACTIONS = "transactions"
    const val REASON_LOG = "log"
    const val REASON_STATUS = "status"

    fun interface Listener {
        fun onStoreChanged(reason: String)
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

    /** Paisa's "Transaction Notes" switch (absent in the DB means on). Saved by [setPreferences]. */
    var notesEnabled: Boolean = true
        private set

    /** Paisa's "Over-Budget Blocking" switch (absent in the DB means on). Saved by [setPreferences]. */
    var blockingEnabled: Boolean = true
        private set

    /** Monthly budget and Paisa spend pushed by the app; null until the first push (then there is no guard). */
    private var budgetSnapshot: BudgetSnapshot? = null

    /**
     * Sync and ownership columns of every saved record, by id (a copy of the DB's, reloaded after each change). Records
     * missing here (not saved yet, or purged) belong to nobody and are left out of the app's lists and spend.
     */
    private var meta: Map<Long, RowMeta> = emptyMap()

    /** Paisa user signed in, set by [setOwner]; null while signed out. Only this user's records are listed or synced. */
    private var currentOwner: String? = null

    /** Last non-null owner: detections made while signed out are stamped with it. */
    private var lastOwner: String? = null

    /** Bumped by [clear]; stored on each new record so its external ref stays unique after ids restart. */
    private var refEpoch = 0L

    /** Ids deleted by an account purge but still held by the detector in memory: never written back. */
    private val purgedIds = HashSet<Long>()

    /** When the last attempt to open the database failed (0 = none); retries wait [OPEN_RETRY_MILLIS]. */
    private var lastOpenFailedAt = 0L
    private var openFailureReported = false

    /** When tracking first started on this phone; null until the database has been opened once. */
    var trackingStartedAt: Long? = null
        private set

    /** Set by the service reading screens: forgets the note questions waiting behind the one on screen. */
    var noteQueueDropper: (() -> Unit)? = null

    /** What [pending] handed out, to tell whether a record changed again before its ack. */
    private val served = HashMap<Long, Transaction>()

    /** Set when [persist] wrote or deleted a row since the last [notifyChanged]. */
    private var transactionsChanged = false

    /** When this app was first installed; payments dated earlier on screen are history and are ignored. */
    var installedAtMillis: Long? = null

    /** In-memory switch; resets to on when the process restarts. */
    var rawCaptureEnabled: Boolean = true

    /** Notifications from allowlisted apps that carried no amount + UPI ref. Shown in the report. */
    var ignoredNotificationCount: Int = 0
        private set

    /**
     * Set by the service reading screens while it runs: asks about a record over whatever is on screen. Returns false
     * when it could not; the note activity is then started instead.
     */
    var notePrompter: ((Long) -> Boolean)? = null

    /** Supported app last reported on screen and not yet reported as backgrounded. */
    var lastPackage: String? = null
        private set

    /**
     * Opens the database and restores the saved transactions, preferences and budget snapshot. Safe to call from every
     * entry point: the first call sets up the crash log; a call made while the database is not open (an earlier open
     * failed) tries to open it again.
     */
    fun init(context: Context) {
        val now = System.currentTimeMillis()
        if (appContext == null) {
            appContext = context.applicationContext
            CrashLog.takePrevious(context)?.let { lines ->
                appendLog(now, "the app crashed last time; what crashed:")
                lines.take(MAX_CRASH_LINES).forEach { appendLog(now, "  $it") }
            }
            CrashLog.install(context)
        }
        if (db != null) return
        // A failed open is retried, but not on every entry point: at most once per OPEN_RETRY_MILLIS.
        if (lastOpenFailedAt != 0L && now - lastOpenFailedAt < OPEN_RETRY_MILLIS) return
        try {
            val opened = ExpenseDb(context.applicationContext)
            val saved = opened.loadTransactions()
            if (detector.transactions.isEmpty()) {
                detector.restore(saved)
                // Expenses recorded before a restart were asked about then; never ask again.
                newExpenses.markKnown(saved)
                persisted.clear()
                saved.forEach { persisted[it.id] = it }
            }
            notesEnabled = opened.getBoolSetting(ExpenseDb.KEY_NOTES_ENABLED, true)
            blockingEnabled = opened.getBoolSetting(ExpenseDb.KEY_BLOCKING_ENABLED, true)
            budgetSnapshot = opened.getSetting(ExpenseDb.KEY_BUDGET_SNAPSHOT)?.let { BudgetJson.parseSnapshot(it) }
            currentOwner = opened.getSetting(ExpenseDb.KEY_OWNER)
            lastOwner = opened.getSetting(ExpenseDb.KEY_LAST_OWNER)
            refEpoch = opened.getLongSetting(ExpenseDb.KEY_REF_EPOCH, 0L)
            trackingStartedAt = opened.getSetting(ExpenseDb.KEY_TRACKING_STARTED_AT)?.toLongOrNull()
                ?: now.also { opened.putSetting(ExpenseDb.KEY_TRACKING_STARTED_AT, it.toString()) }
            meta = opened.loadMeta()
            db = opened
            lastOpenFailedAt = 0L
            openFailureReported = false
            appendLog(
                now,
                "restored ${saved.size} saved records; notes ${if (notesEnabled) "on" else "off"}, " +
                    "blocking ${if (blockingEnabled) "on" else "off"}, budget " +
                    (budgetSnapshot?.let { "${it.monthKey} ₹${it.monthlyBudget.toPlainString()}" } ?: "not pushed yet"),
            )
            // Records detected while the database was unavailable are written now.
            persist(now)
            notifyChanged(REASON_STATUS) // the store is now usable
        } catch (t: Throwable) {
            lastOpenFailedAt = now
            appendLog(now, "ERROR opening the expense database: $t (history will not be saved; will retry)")
            // Tell listeners once, not on every failed retry.
            if (!openFailureReported) {
                openFailureReported = true
                notifyChanged(REASON_STATUS)
            }
        }
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

    /** Something the status depends on changed outside the store (Shizuku capture started or stopped). */
    fun statusChanged() {
        notifyChanged(REASON_STATUS)
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
     * A window the allowance check read and its verdict. Logged; with [capture], also kept in the raw captures (when
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

    /**
     * Spend today for the guard: Paisa's spend (from the budget snapshot) plus this phone's detections not yet synced.
     * Without a budget snapshot, only the detections of today.
     */
    fun todaySpent(now: Long): BigDecimal =
        allowance(now)?.spentToday ?: SpendLimit.spentSince(ownedTransactions, SpendLimit.startOfDay(now, ZoneId.systemDefault()))

    /** Today's allowance from [BudgetPlan]; null when there is no budget (or none pushed yet). */
    fun allowance(now: Long): Allowance? {
        val snapshot = budgetSnapshot ?: return null
        val zone = ZoneId.systemDefault()
        val today = Instant.ofEpochMilli(now).atZone(zone).toLocalDate()
        val extra = ExtraSpend.byDate(detector.transactions, meta, currentOwner, snapshot.dataAsOfMillis, zone)
        return BudgetPlan.allowance(snapshot, extra, today)
    }

    /** Today's limit in rupees, from [BudgetPlan]; null when there is no budget. */
    val dailyLimit: BigDecimal? get() = allowance(System.currentTimeMillis())?.dailyLimit

    /**
     * The signed-in user's detections, for the app's lists. The detector (core, unchanged) also holds other users'
     * records in memory; they never leave through here. Empty while signed out.
     */
    val ownedTransactions: List<Transaction>
        get() {
            return OwnerScope.filter(detector.transactions, meta, currentOwner)
        }

    /** Sync and ownership columns by record id, for [ownedTransactions]. */
    val rowMeta: Map<Long, RowMeta> get() = meta

    /**
     * Sets the Paisa user ([userId], null when signed out). Records made while nobody was known are adopted by the
     * first user; records made while signed out are stamped with the last user. Persisted.
     */
    fun setOwner(userId: String?) {
        val id = userId?.takeIf { it.isNotBlank() }
        val now = System.currentTimeMillis()
        currentOwner = id
        if (id != null) lastOwner = id
        try {
            db?.putSetting(ExpenseDb.KEY_OWNER, id)
            if (id != null) {
                db?.putSetting(ExpenseDb.KEY_LAST_OWNER, id)
                db?.adoptUnowned(id)
            }
        } catch (t: Throwable) {
            appendLog(now, "ERROR saving the owner: $t")
        }
        reloadMeta(now)
        appendLog(now, if (id != null) "signed in: detections are tracked for this user" else "signed out: detections wait for the last user")
        transactionsChanged = true // the set of records the app may see changed
        notifyChanged(REASON_STATUS)
    }

    private fun reloadMeta(now: Long) {
        val store = db ?: return
        try {
            meta = store.loadMeta()
        } catch (t: Throwable) {
            appendLog(now, "ERROR reading record state: $t")
        }
    }

    /** Saves the two Paisa switches. Notes and blocking are on by default. */
    fun setPreferences(notes: Boolean, blocking: Boolean) {
        notesEnabled = notes
        blockingEnabled = blocking
        val now = System.currentTimeMillis()
        try {
            db?.putBoolSetting(ExpenseDb.KEY_NOTES_ENABLED, notes)
            db?.putBoolSetting(ExpenseDb.KEY_BLOCKING_ENABLED, blocking)
        } catch (t: Throwable) {
            appendLog(now, "ERROR saving preferences: $t")
        }
        appendLog(now, "preferences: notes ${if (notes) "on" else "off"}, blocking ${if (blocking) "on" else "off"}")
        // Notes switched off: questions already queued behind the one on screen are dropped, not shown later.
        if (!notes) noteQueueDropper?.invoke()
        notifyChanged(REASON_STATUS)
    }

    /** Stores the budget snapshot pushed by the app ([json] as in BudgetSnapshot of the JS contract). False if unusable. */
    fun setBudgetSnapshot(json: String): Boolean {
        val snapshot = BudgetJson.parseSnapshot(json) ?: return false
        budgetSnapshot = snapshot
        try {
            db?.putSetting(ExpenseDb.KEY_BUDGET_SNAPSHOT, BudgetJson.snapshotToJson(snapshot))
        } catch (t: Throwable) {
            appendLog(System.currentTimeMillis(), "ERROR saving the budget snapshot: $t")
        }
        notifyChanged(REASON_STATUS)
        return true
    }

    /**
     * Sign-out: preferences back to their defaults (on) and the budget snapshot forgotten. History is kept, unless
     * [purgeHistory] (account deletion): then every record of the owner is deleted too.
     */
    fun clearUserData(purgeHistory: Boolean) {
        val now = System.currentTimeMillis()
        notesEnabled = true
        blockingEnabled = true
        budgetSnapshot = null
        try {
            db?.putSetting(ExpenseDb.KEY_NOTES_ENABLED, null)
            db?.putSetting(ExpenseDb.KEY_BLOCKING_ENABLED, null)
            db?.putSetting(ExpenseDb.KEY_BUDGET_SNAPSHOT, null)
        } catch (t: Throwable) {
            appendLog(now, "ERROR clearing preferences: $t")
        }
        if (purgeHistory) {
            val owner = currentOwner ?: lastOwner
            if (owner != null) {
                try {
                    val ids = db?.deleteOwnerRows(owner) ?: emptyList()
                    purgedIds += ids
                    ids.forEach {
                        persisted.remove(it)
                        served.remove(it)
                    }
                    reloadMeta(now)
                    transactionsChanged = true
                } catch (t: Throwable) {
                    appendLog(now, "ERROR deleting the user's history: $t")
                }
            }
        }
        appendLog(now, "preferences and budget snapshot cleared (sign-out)" + if (purgeHistory) "; history deleted" else "")
        notifyChanged(REASON_STATUS)
    }

    /** Random id of this install; part of every record's external ref. Null when the database is not open. */
    fun installId(): String? = try {
        db?.installId()
    } catch (t: Throwable) {
        null
    }

    /** Syncable records of the signed-in user changed since their last sync, as handed to the app. */
    fun pending(): List<ExpenseDb.Pending> {
        val rows = try {
            db?.getPending(currentOwner) ?: emptyList()
        } catch (t: Throwable) {
            appendLog(System.currentTimeMillis(), "ERROR reading the sync queue: $t")
            emptyList()
        }
        rows.forEach { served[it.txn.id] = it.txn }
        return rows
    }

    /**
     * The app saved these records to Supabase. Only the signed-in user's records are acknowledged. A record that
     * changed again since [pending] stays queued.
     */
    fun ackSynced(acks: List<ExpenseDb.Ack>) {
        val store = db ?: return
        val owner = currentOwner ?: return
        val now = System.currentTimeMillis()
        try {
            val own = acks.filter { meta[it.id]?.owner == owner }
            val current = detector.transactions.associateBy { it.id }
            val stillDirty = own.mapNotNull { a ->
                val handedOut = served[a.id]
                val nowTxn = current[a.id]
                if (handedOut != null && nowTxn != null && SyncRules.contentChanged(handedOut, nowTxn)) a.id else null
            }.toSet()
            store.ackSynced(own, owner, now, stillDirty)
            own.forEach { served.remove(it.id) }
            reloadMeta(now)
            appendLog(now, "synced ${own.size} record(s) to Paisa" + if (stillDirty.isNotEmpty()) " (${stillDirty.size} changed again, queued)" else "")
        } catch (t: Throwable) {
            appendLog(now, "ERROR saving sync acknowledgements: $t")
        }
        notifyChanged(REASON_STATUS)
    }

    /** Clears transactions (also on disk), the log and raw captures. Preferences and the budget snapshot are kept. */
    fun clear() {
        detector.clear()
        pipeline.forgetLastRead()
        try {
            db?.deleteAllTransactions()
        } catch (t: Throwable) {
            appendLog(System.currentTimeMillis(), "ERROR clearing saved transactions: $t")
        }
        persisted.clear()
        meta = emptyMap()
        served.clear()
        purgedIds.clear()
        // Ids restart from 1 after the next process restart: a new epoch keeps every external ref unique.
        refEpoch++
        try {
            db?.putSetting(ExpenseDb.KEY_REF_EPOCH, refEpoch.toString())
        } catch (t: Throwable) {
            appendLog(System.currentTimeMillis(), "ERROR saving the ref epoch: $t")
        }
        transactionsChanged = true
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
            // A new record belongs to the signed-in user, or to the last one while signed out (nobody: not yet known).
            val stampOwner = OwnerScope.stampFor(currentOwner, lastOwner)
            var wrote = false
            for (t in current) {
                if (t.id in purgedIds) continue
                if (persisted[t.id] != t) {
                    store.upsert(t, persisted[t.id], stampOwner, refEpoch)
                    persisted[t.id] = t
                    transactionsChanged = true
                    wrote = true
                }
            }
            val ids = current.mapTo(HashSet()) { it.id }
            for (id in persisted.keys.filter { it !in ids }) {
                store.delete(id)
                persisted.remove(id)
                served.remove(id)
                transactionsChanged = true
                wrote = true
            }
            if (wrote) reloadMeta(now)
        } catch (t: Throwable) {
            appendLog(now, "ERROR saving transactions: $t")
        }
    }

    /**
     * Asks what each newly recorded expense was for: any record that has just started counting as an expense, from
     * any app, whatever screen it was recorded from. Once per record; one that already has a note is not asked about.
     */
    private fun promptNewExpenses(now: Long, decisions: List<Decision> = emptyList()) {
        val newlyRecorded = newExpenses.newlyRecorded(detector.transactions)
        // Transaction Notes switched off in Paisa: the records stay marked as seen above, so turning it back on never
        // asks about old payments. No NotePromptLog lines and no prompt.
        if (!notesEnabled) {
            if (newlyRecorded.isNotEmpty()) appendLog(now, "note prompt skipped (notes off)")
            return
        }
        val prompted = newlyRecorded.filter { it.note == null }
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

    /**
     * Tells listeners what changed. A pending record change is always reported (as "transactions") even when [reason]
     * names something else, so a status event never swallows it.
     */
    private fun notifyChanged(reason: String? = null) {
        val reasons = LinkedHashSet<String>()
        if (transactionsChanged) reasons += REASON_TRANSACTIONS
        if (reason != null) reasons += reason else if (reasons.isEmpty()) reasons += REASON_LOG
        transactionsChanged = false
        val copy = listeners.toList()
        for (r in reasons) copy.forEach { it.onStoreChanged(r) }
    }
}
