package io.yestack.upidetector.core

/**
 * Tells which records have just been recorded as expenses ([SpendLimit.isExpense]), so the user is asked about each
 * one exactly once, whatever screen or app it came from. Not thread-safe: the caller serialises access.
 */
class NewExpenses {

    private val seen = HashSet<Long>()

    /** Records that already count (restored after a restart): remembered without being reported. */
    fun markKnown(txns: List<Transaction>) {
        txns.filter { SpendLimit.isExpense(it) }.forEach { seen += it.id }
    }

    /** Records in [txns] that count as an expense for the first time, oldest first. Each id is returned at most once. */
    fun newlyRecorded(txns: List<Transaction>): List<Transaction> =
        txns.filter { SpendLimit.isExpense(it) && seen.add(it.id) }.sortedBy { it.id }
}
