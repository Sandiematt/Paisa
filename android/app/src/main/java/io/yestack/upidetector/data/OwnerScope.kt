package io.yestack.upidetector.data

import io.yestack.upidetector.core.Transaction

/**
 * Which records belong to the signed-in Paisa user. The detector (core) keeps every owner's records in memory; this is
 * the filter that keeps other users' records out of the app's lists. Pure Kotlin.
 */
object OwnerScope {

    /** Records whose owner is [owner]. No owner (signed out) means no records; a record with no meta belongs to nobody. */
    fun filter(txns: List<Transaction>, meta: Map<Long, RowMeta>, owner: String?): List<Transaction> {
        if (owner == null) return emptyList()
        return txns.filter { meta[it.id]?.owner == owner }
    }

    /** The owner a new record is stamped with: the signed-in user, else the last user, else nobody yet. */
    fun stampFor(current: String?, last: String?): String? = current ?: last
}
