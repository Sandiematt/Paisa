package io.yestack.upidetector.core

/**
 * One live-log line per record touched by [decisions]: inserted, updated, ignored as a duplicate or flagged, and
 * whether its note prompt was triggered. [prompted] are the records being asked about now (see [NewExpenses]); a
 * record among them not named by any decision (Keep, a notification clearing its flag) gets a line too.
 */
object NotePromptLog {

    fun lines(decisions: List<Decision>, prompted: List<Transaction>): List<String> {
        val asked = prompted.associateBy { it.id }
        val out = ArrayList<String>()
        val covered = HashSet<Long>()
        for (d in decisions) {
            when (d) {
                is Decision.Inserted -> {
                    covered += d.txn.id
                    out += if (d.txn.id in asked) {
                        "record #${d.txn.id} inserted (new ₹${d.txn.amount.toPlainString()} expense): note prompt triggered"
                    } else {
                        "record #${d.txn.id} inserted (${d.txn.status} ${d.txn.direction}, not an expense): no note prompt"
                    }
                }
                is Decision.Updated -> {
                    covered += d.txn.id
                    out += if (d.txn.id in asked) {
                        "record #${d.txn.id} updated ${d.previousStatus} -> ${d.txn.status}, now an expense for the first time: " +
                            "note prompt triggered"
                    } else {
                        "record #${d.txn.id} updated ${d.previousStatus} -> ${d.txn.status}: no note prompt (existing record)"
                    }
                }
                is Decision.IgnoredDuplicate ->
                    out += "repeat of record #${d.existingId} ignored as a duplicate (${d.rule}): no new record, no note prompt"
                is Decision.FlaggedPossibleDuplicate -> {
                    covered += d.txn.id
                    out += "record #${d.txn.id} inserted as a POSSIBLE_DUPLICATE of record #${d.matchedId}: not an expense " +
                        "until you tap Keep, no note prompt"
                }
                is Decision.NotificationChecked -> d.txn?.let { t ->
                    if (t.id in asked) {
                        covered += t.id
                        out += "record #${t.id} confirmed by a notification, now an expense: note prompt triggered"
                    }
                }
                else -> Unit
            }
        }
        for (t in prompted) {
            if (t.id !in covered) out += "record #${t.id} now counts as an expense: note prompt triggered"
        }
        return out
    }
}
