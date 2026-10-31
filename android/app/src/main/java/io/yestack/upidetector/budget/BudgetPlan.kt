package io.yestack.upidetector.budget

import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate
import java.time.YearMonth

/**
 * What JS knows about spending, pushed to the phone so the spend guard works while Paisa is closed
 * (src/lib/autotrack/types.ts, BudgetSnapshot).
 */
data class BudgetSnapshot(
    /** Month the budget cycle starts in, "YYYY-MM" (the calendar month when [cycleStartDay] is 1). */
    val monthKey: String,
    /**
     * Money for day-to-day spending this cycle: the budget less bills, the savings goal and anything spent before
     * tracking began, plus top-ups. Zero or less means no budget (guard off).
     */
    val monthlyBudget: BigDecimal,
    /** Day-to-day expense spend per local day of the cycle from Paisa rows (manual and already-synced auto-tracked). */
    val spendByDate: Map<LocalDate, BigDecimal>,
    /**
     * When the Paisa ledger behind [spendByDate] was read. A detection synced after this is not in the snapshot yet
     * and still counts as extra spend (see [ExtraSpend]). Absent in the JSON means 0.
     */
    val dataAsOfMillis: Long = 0L,
    /** Payday the cycle starts on, 1-31 (31 = last day); 1 is the calendar month. */
    val cycleStartDay: Int = 1,
    /** First day whose spending counts; before it the budget has not started and there is no allowance. */
    val trackingStart: LocalDate? = null,
)

/** One budget cycle, [start] to [end] inclusive (src/lib/budgetCycle.ts). */
data class Cycle(val start: LocalDate, val end: LocalDate) {
    val length: Int get() = (end.toEpochDay() - start.toEpochDay()).toInt() + 1
}

/** Today's allowance (src/lib/autotrack/types.ts, DailyAllowance). Money is in rupees, to the paisa. */
data class Allowance(
    val date: LocalDate,
    val cycleStart: LocalDate,
    val cycleEnd: LocalDate,
    /** Days left in the cycle, today included. */
    val daysLeft: Int,
    val budget: BigDecimal,
    val spentBeforeToday: BigDecimal,
    val dailyLimit: BigDecimal,
    val spentToday: BigDecimal,
    val remainingToday: BigDecimal,
    val remainingMonth: BigDecimal,
)

/**
 * The daily allowance, identical to src/features/autotrack/dailyAllowance.ts (shared vectors in
 * __tests__/fixtures/dailyAllowanceVectors.json). One rolling limit over the budget cycle (the calendar month, or
 * payday to the day before the next payday), recalculated every day:
 *
 *   dailyLimit = max(0, B - spentBeforeToday) / daysLeft      (daysLeft includes today; rounded down to the paisa)
 *
 * Money not spent raises the days after it and overspending lowers them; nothing is capped by week. Every amount is
 * taken to the paisa (half up) before it is added, the same as the JS side. Pure Kotlin.
 */
object BudgetPlan {

    /**
     * Today's allowance, or null when there is no budget or it has not started. [extraSpendByDate] is spend this
     * phone detected that Paisa does not hold yet (not synced); it is added to the snapshot's spend. Entries outside
     * [today]'s cycle or before tracking began are ignored, and a snapshot for another cycle contributes no spend
     * (the budget still applies).
     */
    fun allowance(
        snapshot: BudgetSnapshot,
        extraSpendByDate: Map<LocalDate, BigDecimal>,
        today: LocalDate,
    ): Allowance? {
        val budget = paise(snapshot.monthlyBudget)
        if (budget.signum() <= 0) return null
        val trackingStart = snapshot.trackingStart
        if (trackingStart != null && today < trackingStart) return null

        val cycle = cycleFor(today, snapshot.cycleStartDay)
        val from = if (trackingStart != null && trackingStart > cycle.start) trackingStart else cycle.start

        var before = BigDecimal.ZERO
        var spentToday = BigDecimal.ZERO
        fun add(date: LocalDate, amount: BigDecimal) {
            if (date < from || date > cycle.end) return
            val value = paise(amount)
            if (date < today) before += value else if (date == today) spentToday += value
        }
        if (snapshot.monthKey == YearMonth.from(cycle.start).toString()) {
            snapshot.spendByDate.forEach { (d, a) -> add(d, a) }
        }
        extraSpendByDate.forEach { (d, a) -> add(d, a) }

        val daysLeft = daysBetweenInclusive(today, cycle.end)
        val left = budget.subtract(before)
        val dailyLimit = left.max(BigDecimal.ZERO).divide(BigDecimal(daysLeft), 2, RoundingMode.DOWN)

        return Allowance(
            date = today,
            cycleStart = cycle.start,
            cycleEnd = cycle.end,
            daysLeft = daysLeft,
            budget = budget,
            spentBeforeToday = before,
            dailyLimit = dailyLimit,
            spentToday = spentToday,
            remainingToday = dailyLimit.subtract(spentToday),
            remainingMonth = left.subtract(spentToday),
        )
    }

    /**
     * The cycle holding [date]: from the latest payday on or before it to the day before the next. A payday past a
     * short month's end falls on its last day. Mirrors cycleFor in src/lib/budgetCycle.ts.
     */
    fun cycleFor(date: LocalDate, cycleStartDay: Int): Cycle {
        val startDay = if (cycleStartDay in 1..31) cycleStartDay else 1
        fun startIn(month: YearMonth): LocalDate = month.atDay(minOf(startDay, month.lengthOfMonth()))
        val month = YearMonth.from(date)
        val here = startIn(month)
        val start = if (date >= here) here else startIn(month.minusMonths(1))
        val next = startIn(YearMonth.from(start).plusMonths(1))
        return Cycle(start, next.minusDays(1))
    }

    private fun daysBetweenInclusive(from: LocalDate, to: LocalDate): Int = (to.toEpochDay() - from.toEpochDay()).toInt() + 1

    /** To the paisa, half up: the JS side's toPaise. */
    private fun paise(v: BigDecimal): BigDecimal = v.setScale(2, RoundingMode.HALF_UP)
}
