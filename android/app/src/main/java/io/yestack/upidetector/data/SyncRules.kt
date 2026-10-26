package io.yestack.upidetector.data

import io.yestack.upidetector.core.Direction
import io.yestack.upidetector.core.Transaction
import io.yestack.upidetector.core.TxnStatus

/** Which detections go to Paisa's backend, and when a change to one needs sending again. Pure, so it is unit tested. */
object SyncRules {

    /**
     * Only a successful, unflagged payment with a known direction is saved to Supabase: DEBIT as an expense, CREDIT as
     * income. FAILED, PENDING, POSSIBLE_DUPLICATE and UNKNOWN direction wait (UNKNOWN never syncs).
     */
    fun isSyncable(t: Transaction): Boolean =
        t.status == TxnStatus.SUCCESS && t.flag == null && (t.direction == Direction.DEBIT || t.direction == Direction.CREDIT)

    /**
     * Whether [now] differs from [previous] in something the backend stores or that decides syncing: a new record
     * ([previous] null), a status upgrade, a note attached or changed, a UPI ref added, a flag cleared (Keep or a
     * notification). Timestamps and the screen session alone do not count.
     */
    fun contentChanged(previous: Transaction?, now: Transaction): Boolean {
        if (previous == null) return true
        return previous.status != now.status ||
            previous.flag != now.flag ||
            previous.note != now.note ||
            previous.upiRef != now.upiRef ||
            previous.merchant != now.merchant ||
            previous.direction != now.direction ||
            previous.amount.compareTo(now.amount) != 0 ||
            previous.sourceApp != now.sourceApp
    }

    /** A row is marked dirty when it is syncable and its content changed. Otherwise its dirty flag stays as it was. */
    fun marksDirty(previous: Transaction?, now: Transaction): Boolean = isSyncable(now) && contentChanged(previous, now)

    /**
     * Stable Supabase dedupe key. [epoch] (ref_epoch when the row was inserted) keeps refs unique when ids restart
     * after Clear history and a restart.
     */
    fun externalRef(installId: String, epoch: Long, id: Long): String = "upi:$installId:$epoch:$id"
}
