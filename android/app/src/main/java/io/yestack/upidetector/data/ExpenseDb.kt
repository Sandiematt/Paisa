package io.yestack.upidetector.data

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import io.yestack.upidetector.core.Direction
import io.yestack.upidetector.core.Flag
import io.yestack.upidetector.core.Transaction
import io.yestack.upidetector.core.TxnStatus
import java.math.BigDecimal
import java.util.UUID

/**
 * Expense history and settings on this phone, via the framework SQLite API. Amounts are stored as plain BigDecimal
 * strings. Main thread only, like [io.yestack.upidetector.AppStore]: the data is small.
 *
 * Version 2 adds the sync queue columns used by Paisa: `synced` (saved to Supabase at least once), `dirty` (changed
 * since the last successful sync) and `remote_id` (Supabase transactions.id). They live only here; the in-memory
 * [Transaction] model is untouched.
 */
class ExpenseDb(context: Context, name: String = NAME) : SQLiteOpenHelper(context, name, null, VERSION) {

    /** A syncable row waiting to be sent. [alreadySynced] means only a later change (a note) needs sending. */
    class Pending(val txn: Transaction, val externalRef: String, val meta: RowMeta) {
        val alreadySynced: Boolean get() = meta.synced
    }

    class Ack(val id: Long, val remoteId: String?)

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE $T_TXN (" +
                "id INTEGER PRIMARY KEY, source_app TEXT NOT NULL, amount TEXT NOT NULL, status TEXT NOT NULL, " +
                "direction TEXT NOT NULL, merchant TEXT, upi_ref TEXT, detected_at INTEGER NOT NULL, " +
                "updated_at INTEGER NOT NULL, session_id INTEGER, flag TEXT, flag_reason TEXT, duplicate_of INTEGER, " +
                "note TEXT, synced INTEGER NOT NULL DEFAULT 0, dirty INTEGER NOT NULL DEFAULT 0, remote_id TEXT, " +
                "synced_at INTEGER, owner TEXT, epoch INTEGER NOT NULL DEFAULT 0)",
        )
        db.execSQL("CREATE TABLE $T_SETTINGS (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 2) {
            db.execSQL("ALTER TABLE $T_TXN ADD COLUMN synced INTEGER NOT NULL DEFAULT 0")
            db.execSQL("ALTER TABLE $T_TXN ADD COLUMN dirty INTEGER NOT NULL DEFAULT 0")
            db.execSQL("ALTER TABLE $T_TXN ADD COLUMN remote_id TEXT")
            db.execSQL("ALTER TABLE $T_TXN ADD COLUMN synced_at INTEGER")
            db.execSQL("ALTER TABLE $T_TXN ADD COLUMN owner TEXT")
            db.execSQL("ALTER TABLE $T_TXN ADD COLUMN epoch INTEGER NOT NULL DEFAULT 0")
            // Records saved before syncing existed: everything syncable still has to be sent once (once a user owns them).
            db.execSQL(
                "UPDATE $T_TXN SET dirty = 1 WHERE status = 'SUCCESS' AND flag IS NULL AND direction IN ('DEBIT', 'CREDIT')",
            )
        }
    }

    /** Every saved transaction, oldest id first. Rows that no longer parse are skipped. */
    fun loadTransactions(): List<Transaction> {
        val out = ArrayList<Transaction>()
        readableDatabase.query(T_TXN, null, null, null, null, null, "id").use { c ->
            while (c.moveToNext()) rowOf(c)?.let { out += it }
        }
        return out
    }

    /**
     * Saves [t]. [previous] is what the DB held before (null for a new row); the row is marked dirty when it is
     * syncable and its content changed (see [SyncRules.marksDirty]), otherwise its sync columns are left alone.
     * A new row is stamped with [owner] and [epoch]; an existing row keeps both. Returns whether the row was marked dirty.
     */
    fun upsert(t: Transaction, previous: Transaction?, owner: String?, epoch: Long): Boolean {
        val dirty = SyncRules.marksDirty(previous, t)
        val v = ContentValues().apply {
            put("source_app", t.sourceApp)
            put("amount", t.amount.toPlainString())
            put("status", t.status.name)
            put("direction", t.direction.name)
            put("merchant", t.merchant)
            put("upi_ref", t.upiRef)
            put("detected_at", t.detectedAtMillis)
            put("updated_at", t.updatedAtMillis)
            put("session_id", t.sessionId)
            put("flag", t.flag?.name)
            put("flag_reason", t.flagReason)
            put("duplicate_of", t.possibleDuplicateOfId)
            put("note", t.note)
            if (dirty) put("dirty", 1)
        }
        val db = writableDatabase
        val updated = db.update(T_TXN, v, "id = ?", arrayOf(t.id.toString()))
        if (updated == 0) {
            v.put("id", t.id)
            v.put("owner", owner)
            v.put("epoch", epoch)
            if (!dirty) v.put("dirty", 0)
            db.insertWithOnConflict(T_TXN, null, v, SQLiteDatabase.CONFLICT_REPLACE)
        }
        return dirty
    }

    fun delete(id: Long) {
        writableDatabase.delete(T_TXN, "id = ?", arrayOf(id.toString()))
    }

    /** Deletes the transaction history; settings are kept. */
    fun deleteAllTransactions() {
        writableDatabase.delete(T_TXN, null, null)
    }

    /** Sync and ownership columns of every row, by id. */
    fun loadMeta(): Map<Long, RowMeta> {
        val out = HashMap<Long, RowMeta>()
        readableDatabase.query(
            T_TXN, arrayOf("id", "synced", "dirty", "remote_id", "synced_at", "owner", "epoch"),
            null, null, null, null, null,
        ).use { c ->
            while (c.moveToNext()) out[c.getLong(0)] = metaOf(c)
        }
        return out
    }

    private fun metaOf(c: Cursor): RowMeta = RowMeta(
        synced = c.getInt(c.getColumnIndexOrThrow("synced")) == 1,
        dirty = c.getInt(c.getColumnIndexOrThrow("dirty")) == 1,
        remoteId = c.stringOrNull("remote_id"),
        syncedAtMillis = c.longOrNull("synced_at"),
        owner = c.stringOrNull("owner"),
        epoch = c.getLong(c.getColumnIndexOrThrow("epoch")),
    )

    /**
     * Syncable rows of [owner] changed since their last sync, oldest first. With no owner nothing is pending: a
     * detection is only sent once a Paisa user owns it.
     */
    fun getPending(owner: String?): List<Pending> {
        if (owner == null) return emptyList()
        val install = installId()
        val out = ArrayList<Pending>()
        readableDatabase.query(
            T_TXN, null, "dirty = 1 AND status = ? AND flag IS NULL AND direction IN ('DEBIT', 'CREDIT') AND owner = ?",
            arrayOf(TxnStatus.SUCCESS.name, owner), null, null, "id",
        ).use { c ->
            while (c.moveToNext()) {
                val txn = rowOf(c) ?: continue
                val meta = metaOf(c)
                out += Pending(txn, SyncRules.externalRef(install, meta.epoch, txn.id), meta)
            }
        }
        return out
    }

    /**
     * Marks [acks] as saved to Supabase at [nowMillis]: `synced = 1`, `synced_at`, `remote_id` set (an ack without one
     * keeps the old), and `dirty = 0` except for ids in [stillDirty] (changed again after they were handed out).
     * Only rows of [owner] are touched; unknown ids are ignored.
     */
    fun ackSynced(acks: List<Ack>, owner: String?, nowMillis: Long, stillDirty: Set<Long> = emptySet()) {
        if (owner == null) return
        val db = writableDatabase
        db.beginTransaction()
        try {
            for (a in acks) {
                val v = ContentValues().apply {
                    put("synced", 1)
                    put("synced_at", nowMillis)
                    if (a.id !in stillDirty) put("dirty", 0)
                    if (a.remoteId != null) put("remote_id", a.remoteId)
                }
                db.update(T_TXN, v, "id = ? AND owner = ?", arrayOf(a.id.toString(), owner))
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    /** First user to sign in takes the records made before any user was known. */
    fun adoptUnowned(owner: String) {
        val v = ContentValues().apply { put("owner", owner) }
        writableDatabase.update(T_TXN, v, "owner IS NULL", null)
    }

    /** Deletes every record of [owner] (account deletion); returns their ids. */
    fun deleteOwnerRows(owner: String): List<Long> {
        val ids = ArrayList<Long>()
        readableDatabase.query(T_TXN, arrayOf("id"), "owner = ?", arrayOf(owner), null, null, null).use { c ->
            while (c.moveToNext()) ids += c.getLong(0)
        }
        writableDatabase.delete(T_TXN, "owner = ?", arrayOf(owner))
        return ids
    }

    /** Random id of this install, made once; part of every external ref so two phones never collide. */
    fun installId(): String {
        getSetting(KEY_INSTALL_ID)?.let { return it }
        val id = UUID.randomUUID().toString()
        putSetting(KEY_INSTALL_ID, id)
        return id
    }

    fun getSetting(key: String): String? =
        readableDatabase.query(T_SETTINGS, arrayOf("value"), "key = ?", arrayOf(key), null, null, null).use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }

    fun getLongSetting(key: String, default: Long): Long = getSetting(key)?.toLongOrNull() ?: default

    /** A boolean setting; [default] when it is absent or unreadable. */
    fun getBoolSetting(key: String, default: Boolean): Boolean = when (getSetting(key)) {
        "1", "true" -> true
        "0", "false" -> false
        else -> default
    }

    fun putBoolSetting(key: String, value: Boolean) = putSetting(key, if (value) "1" else "0")

    /** A null [value] removes the setting. */
    fun putSetting(key: String, value: String?) {
        if (value == null) {
            writableDatabase.delete(T_SETTINGS, "key = ?", arrayOf(key))
            return
        }
        val v = ContentValues().apply {
            put("key", key)
            put("value", value)
        }
        writableDatabase.insertWithOnConflict(T_SETTINGS, null, v, SQLiteDatabase.CONFLICT_REPLACE)
    }

    private fun rowOf(c: Cursor): Transaction? = try {
        Transaction(
            id = c.getLong(c.getColumnIndexOrThrow("id")),
            sourceApp = c.getString(c.getColumnIndexOrThrow("source_app")),
            amount = BigDecimal(c.getString(c.getColumnIndexOrThrow("amount"))),
            status = TxnStatus.valueOf(c.getString(c.getColumnIndexOrThrow("status"))),
            direction = Direction.valueOf(c.getString(c.getColumnIndexOrThrow("direction"))),
            merchant = c.stringOrNull("merchant"),
            upiRef = c.stringOrNull("upi_ref"),
            detectedAtMillis = c.getLong(c.getColumnIndexOrThrow("detected_at")),
            updatedAtMillis = c.getLong(c.getColumnIndexOrThrow("updated_at")),
            sessionId = c.longOrNull("session_id"),
            flag = c.stringOrNull("flag")?.let { Flag.valueOf(it) },
            flagReason = c.stringOrNull("flag_reason"),
            possibleDuplicateOfId = c.longOrNull("duplicate_of"),
            note = c.stringOrNull("note"),
        )
    } catch (e: IllegalArgumentException) {
        null
    }

    private fun Cursor.stringOrNull(column: String): String? {
        val i = getColumnIndexOrThrow(column)
        return if (isNull(i)) null else getString(i)
    }

    private fun Cursor.longOrNull(column: String): Long? {
        val i = getColumnIndexOrThrow(column)
        return if (isNull(i)) null else getLong(i)
    }

    companion object {
        /** The framework's old standalone daily limit; no longer read (the limit now comes from the Paisa budget). */
        const val KEY_DAILY_LIMIT = "daily_limit"
        const val KEY_NOTES_ENABLED = "notes_enabled"
        const val KEY_BLOCKING_ENABLED = "blocking_enabled"
        const val KEY_BUDGET_SNAPSHOT = "budget_snapshot"
        const val KEY_INSTALL_ID = "install_id"

        /** Paisa user id set by the app on sign-in; absent while signed out. */
        const val KEY_OWNER = "owner"

        /** Last non-null owner: detections made while signed out belong to this user. */
        const val KEY_LAST_OWNER = "last_owner"

        /** Bumped by Clear history so external refs never repeat after ids restart. */
        const val KEY_REF_EPOCH = "ref_epoch"

        /** When tracking first started on this phone; payments dated earlier on screen are ignored. */
        const val KEY_TRACKING_STARTED_AT = "tracking_started_at"
        const val NAME = "expenses.db"
        private const val VERSION = 2
        private const val T_TXN = "transactions"
        private const val T_SETTINGS = "settings"
    }
}
