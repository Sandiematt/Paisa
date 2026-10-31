package io.yestack.upidetector.bridge

import io.yestack.upidetector.core.Transaction
import io.yestack.upidetector.data.ExpenseDb
import io.yestack.upidetector.data.RowMeta
import org.json.JSONArray
import org.json.JSONObject

/**
 * JSON for the React Native bridge, field for field as in src/lib/autotrack/types.ts (DetectedTxn, PendingTxn,
 * AckEntry, AutoTrackPrefs, DetectorStatus). Nullable fields are written as JSON null, never left out.
 */
object DetectorJson {

    /** DetectedTxn. [sync] is null for a record with no sync row (treated as not synced and not dirty). */
    fun txn(t: Transaction, sync: RowMeta?): JSONObject = JSONObject()
        .put("id", t.id)
        .put("sourceApp", t.sourceApp)
        .put("amount", t.amount.toPlainString())
        .put("status", t.status.name)
        .put("direction", t.direction.name)
        .put("merchant", t.merchant ?: JSONObject.NULL)
        .put("upiRef", t.upiRef ?: JSONObject.NULL)
        .put("detectedAtMillis", t.detectedAtMillis)
        .put("updatedAtMillis", t.updatedAtMillis)
        .put("flag", t.flag?.name ?: JSONObject.NULL)
        .put("flagReason", t.flagReason ?: JSONObject.NULL)
        .put("possibleDuplicateOfId", t.possibleDuplicateOfId ?: JSONObject.NULL)
        .put("note", t.note ?: JSONObject.NULL)
        .put("synced", sync?.synced ?: false)
        .put("dirty", sync?.dirty ?: false)
        .put("remoteId", sync?.remoteId ?: JSONObject.NULL)
        .put("syncedAtMillis", sync?.syncedAtMillis ?: JSONObject.NULL)

    /** PendingTxn: a dirty DetectedTxn plus its external ref. */
    fun pending(p: ExpenseDb.Pending): JSONObject =
        txn(p.txn, p.meta.copy(dirty = true))
            .put("externalRef", p.externalRef)
            .put("alreadySynced", p.alreadySynced)

    /**
     * DetectorStatus. [trackingMethod] is a [io.yestack.upidetector.TrackingMethod] key; [shizukuState] one of
     * "not_installed", "not_running", "too_old", "no_permission", "ready" (see SystemStatus.shizukuState).
     */
    fun status(
        accessibilityEnabled: Boolean,
        notificationAccessEnabled: Boolean,
        installedApps: List<String>,
        trackingMethod: String = "accessibility",
        shizukuState: String = "not_installed",
        shizukuCaptureRunning: Boolean = false,
    ): JSONObject =
        JSONObject()
            .put("accessibilityEnabled", accessibilityEnabled)
            .put("notificationAccessEnabled", notificationAccessEnabled)
            .put("installedApps", JSONArray(installedApps))
            .put("trackingMethod", trackingMethod)
            .put("shizukuState", shizukuState)
            .put("shizukuCaptureRunning", shizukuCaptureRunning)

    fun prefs(notesEnabled: Boolean, blockingEnabled: Boolean): JSONObject = JSONObject()
        .put("notesEnabled", notesEnabled)
        .put("blockingEnabled", blockingEnabled)

    /** AckEntry[]; an entry without a usable id is skipped. Throws on text that is not a JSON array. */
    fun parseAcks(json: String): List<ExpenseDb.Ack> {
        val arr = JSONArray(json)
        val out = ArrayList<ExpenseDb.Ack>()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            if (!o.has("id") || o.isNull("id")) continue
            val remote = if (o.isNull("remoteId")) null else o.optString("remoteId").takeIf { it.isNotEmpty() }
            out += ExpenseDb.Ack(o.getLong("id"), remote)
        }
        return out
    }

    /**
     * AutoTrackPrefs from [json]; a flag the object leaves out keeps its [currentNotes] / [currentBlocking] value.
     * Throws on text that is not a JSON object.
     */
    fun parsePrefs(json: String, currentNotes: Boolean, currentBlocking: Boolean): Pair<Boolean, Boolean> {
        val o = JSONObject(json)
        val notes = if (o.has("notesEnabled") && !o.isNull("notesEnabled")) o.getBoolean("notesEnabled") else currentNotes
        val blocking =
            if (o.has("blockingEnabled") && !o.isNull("blockingEnabled")) o.getBoolean("blockingEnabled") else currentBlocking
        return notes to blocking
    }
}
