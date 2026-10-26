package io.yestack.upidetector.data

/**
 * Sync and ownership columns of one saved record. They live only in the DB and in AppStore's side map; the core
 * Transaction model does not carry them.
 */
data class RowMeta(
    /** Saved to Supabase at least once. */
    val synced: Boolean,
    /** Changed since the last successful sync. */
    val dirty: Boolean,
    /** Supabase transactions.id once synced. */
    val remoteId: String?,
    /** When the last sync was acknowledged; null when never synced. */
    val syncedAtMillis: Long?,
    /** Paisa user the record belongs to; null for a record made before any user was known. */
    val owner: String?,
    /** ref_epoch when the record was inserted; part of its external ref and never changed afterwards. */
    val epoch: Long,
)
