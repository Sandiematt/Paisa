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

/**
 * Expense history and settings on this phone, via the framework SQLite API. Amounts are stored as plain BigDecimal
 * strings. Main thread only, like [io.yestack.upidetector.AppStore]: the data is small.
 */
class ExpenseDb(context: Context, name: String = NAME) : SQLiteOpenHelper(context, name, null, VERSION) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            "CREATE TABLE $T_TXN (" +
                "id INTEGER PRIMARY KEY, source_app TEXT NOT NULL, amount TEXT NOT NULL, status TEXT NOT NULL, " +
                "direction TEXT NOT NULL, merchant TEXT, upi_ref TEXT, detected_at INTEGER NOT NULL, " +
                "updated_at INTEGER NOT NULL, session_id INTEGER, flag TEXT, flag_reason TEXT, duplicate_of INTEGER, " +
                "note TEXT)",
        )
        db.execSQL("CREATE TABLE $T_SETTINGS (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        // Only version 1 exists.
    }

    /** Every saved transaction, oldest id first. Rows that no longer parse are skipped. */
    fun loadTransactions(): List<Transaction> {
        val out = ArrayList<Transaction>()
        readableDatabase.query(T_TXN, null, null, null, null, null, "id").use { c ->
            while (c.moveToNext()) rowOf(c)?.let { out += it }
        }
        return out
    }

    fun upsert(t: Transaction) {
        val v = ContentValues().apply {
            put("id", t.id)
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
        }
        writableDatabase.insertWithOnConflict(T_TXN, null, v, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun delete(id: Long) {
        writableDatabase.delete(T_TXN, "id = ?", arrayOf(id.toString()))
    }

    /** Deletes the transaction history; settings (the daily limit) are kept. */
    fun deleteAllTransactions() {
        writableDatabase.delete(T_TXN, null, null)
    }

    fun getSetting(key: String): String? =
        readableDatabase.query(T_SETTINGS, arrayOf("value"), "key = ?", arrayOf(key), null, null, null).use { c ->
            if (c.moveToFirst()) c.getString(0) else null
        }

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
        const val KEY_DAILY_LIMIT = "daily_limit"
        const val NAME = "expenses.db"
        private const val VERSION = 1
        private const val T_TXN = "transactions"
        private const val T_SETTINGS = "settings"
    }
}
