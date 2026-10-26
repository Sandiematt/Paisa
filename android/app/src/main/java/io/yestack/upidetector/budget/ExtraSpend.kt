package io.yestack.upidetector.budget

import io.yestack.upidetector.core.SpendLimit
import io.yestack.upidetector.core.Transaction
import io.yestack.upidetector.data.RowMeta
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Spend this phone detected that the Paisa ledger behind a [BudgetSnapshot] does not hold yet (the "extra spend" that
 * [BudgetPlan.allowance] adds). Pure Kotlin. Same rule as the JS side:
 *
 * a detection counts when it is SUCCESS + DEBIT + unflagged ([SpendLimit.isExpense]), belongs to the current [owner],
 * and is either not synced yet or was synced after the snapshot's ledger was read (`syncedAt > dataAsOfMillis`).
 * Without an owner nothing counts (records of nobody are never counted).
 */
object ExtraSpend {

    fun byDate(
        txns: List<Transaction>,
        meta: Map<Long, RowMeta>,
        owner: String?,
        dataAsOfMillis: Long,
        zone: ZoneId,
    ): Map<LocalDate, BigDecimal> {
        if (owner == null) return emptyMap()
        val out = HashMap<LocalDate, BigDecimal>()
        for (t in txns) {
            if (!SpendLimit.isExpense(t)) continue
            val m = meta[t.id] ?: continue
            if (m.owner != owner) continue
            val coveredBySnapshot = m.synced && (m.syncedAtMillis ?: 0L) <= dataAsOfMillis
            if (coveredBySnapshot) continue
            val day = Instant.ofEpochMilli(t.detectedAtMillis).atZone(zone).toLocalDate()
            out.merge(day, t.amount) { a, b -> a + b }
        }
        return out
    }
}
