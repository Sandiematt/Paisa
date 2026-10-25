package io.yestack.upidetector.core

import java.math.BigDecimal
import java.time.Instant
import java.time.ZoneId

/** The combined daily-limit rule. Time and zone are always passed in. */
object SpendLimit {

    /** True when paying [amount] on top of [spentToday] would go over [limit]. Reaching the limit exactly is allowed. */
    fun exceeds(spentToday: BigDecimal, amount: BigDecimal, limit: BigDecimal): Boolean = spentToday + amount > limit

    /** Whether [t] counts as spending: SUCCESS + DEBIT and not flagged. A note is optional. */
    fun isExpense(t: Transaction): Boolean =
        t.status == TxnStatus.SUCCESS && t.direction == Direction.DEBIT && t.flag == null

    /** Sum of expenses detected at or after [fromMillis]. */
    fun spentSince(txns: List<Transaction>, fromMillis: Long): BigDecimal = txns
        .filter { isExpense(it) && it.detectedAtMillis >= fromMillis }
        .fold(BigDecimal.ZERO) { acc, t -> acc + t.amount }

    /** Start of the local calendar day that contains [nowMillis]. */
    fun startOfDay(nowMillis: Long, zone: ZoneId): Long =
        Instant.ofEpochMilli(nowMillis).atZone(zone).toLocalDate().atStartOfDay(zone).toInstant().toEpochMilli()
}
