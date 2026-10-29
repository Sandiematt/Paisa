package io.yestack.upidetector.budget

import java.math.BigDecimal
import java.math.MathContext
import java.math.RoundingMode
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.temporal.TemporalAdjusters

/**
 * What JS knows about spending, pushed to the phone so the spend guard works while Paisa is closed
 * (src/lib/autotrack/types.ts, BudgetSnapshot).
 */
data class BudgetSnapshot(
    /** Month the budget cycle starts in, "YYYY-MM" (the calendar month when [cycleStartDay] is 1). */
    val monthKey: String,
    /** Budget left for day-to-day spending (bills already taken off); zero or less means no budget (guard off). */
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
)

/** One budget cycle, [start] to [end] inclusive (src/lib/budgetCycle.ts). */
data class Cycle(val start: LocalDate, val end: LocalDate) {
    val length: Int get() = (end.toEpochDay() - start.toEpochDay()).toInt() + 1
}

/** Daily allowance split from the monthly budget (src/lib/autotrack/types.ts, DailyAllowance). Money is rounded to 2 decimals. */
data class Allowance(
    val date: LocalDate,
    val weekStart: LocalDate,
    val weekEnd: LocalDate,
    val weekBudget: BigDecimal,
    val spentWeekBeforeToday: BigDecimal,
    /** Days left in the (clipped) week, including today. */
    val daysLeftInWeek: Int,
    val dailyLimit: BigDecimal,
    val spentToday: BigDecimal,
    val remainingToday: BigDecimal,
    val remainingWeek: BigDecimal,
)

/**
 * The daily allowance, identical to src/features/autotrack/dailyAllowance.ts (shared vectors in
 * __tests__/fixtures/dailyAllowanceVectors.json). Weeks run Monday to Sunday and are clipped to the budget cycle: the
 * calendar month, or payday to the day before the next payday. The budget B is split over the cycleDays / 7 weeks of
 * the cycle; unspent money does not roll forward.
 *
 *   weeklyBudget = B / (cycleDays / 7),  dailyBudget = weeklyBudget / 7
 *   weekBudget = min(dailyBudget * weekDaysInCycle, max(0, B - spentCycleBeforeWeek))
 *   dailyLimit = min(dailyBudget, max(0, weekBudget - spentWeekBeforeToday) / daysLeftInWeek)
 *
 * Intermediates keep full precision; only the returned figures are rounded (half up, 2 decimals). Pure Kotlin.
 */
object BudgetPlan {
    private val MC = MathContext.DECIMAL128
    private val SEVEN = BigDecimal(7)

    /**
     * Today's allowance, or null when there is no budget. [extraSpendByDate] is spend this phone detected that Paisa
     * does not hold yet (not synced); it is added to the snapshot's spend. Entries outside [today]'s cycle are
     * ignored, and a snapshot for another cycle contributes no spend (the budget still applies).
     */
    fun allowance(
        snapshot: BudgetSnapshot,
        extraSpendByDate: Map<LocalDate, BigDecimal>,
        today: LocalDate,
    ): Allowance? {
        val budget = snapshot.monthlyBudget
        if (budget.signum() <= 0) return null

        val cycle = cycleFor(today, snapshot.cycleStartDay)
        val monday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        val weekStart = maxOf(monday, cycle.start)
        val weekEnd = minOf(monday.plusDays(6), cycle.end)

        val spend = HashMap<LocalDate, BigDecimal>()
        fun add(date: LocalDate, amount: BigDecimal) {
            if (date >= cycle.start && date <= cycle.end) spend.merge(date, amount, { a, b -> a + b })
        }
        if (snapshot.monthKey == YearMonth.from(cycle.start).toString()) {
            snapshot.spendByDate.forEach { (d, a) -> add(d, a) }
        }
        extraSpendByDate.forEach { (d, a) -> add(d, a) }

        fun sum(from: LocalDate, toExclusive: LocalDate): BigDecimal =
            spend.entries.filter { it.key >= from && it.key < toExclusive }
                .fold(BigDecimal.ZERO) { acc, e -> acc + e.value }

        val spentCycleBeforeWeek = sum(cycle.start, weekStart)
        val spentWeekBeforeToday = sum(weekStart, today)
        val spentToday = spend[today] ?: BigDecimal.ZERO

        val weekDaysInCycle = daysBetweenInclusive(weekStart, weekEnd)
        val daysLeftInWeek = daysBetweenInclusive(today, weekEnd)

        val weeklyBudget = budget.multiply(SEVEN, MC).divide(BigDecimal(cycle.length), MC)
        val dailyBudget = weeklyBudget.divide(SEVEN, MC)
        val weekBudget = dailyBudget.multiply(BigDecimal(weekDaysInCycle), MC)
            .min(budget.subtract(spentCycleBeforeWeek).max(BigDecimal.ZERO))
        val dailyLimit = weekBudget.subtract(spentWeekBeforeToday).max(BigDecimal.ZERO)
            .divide(BigDecimal(daysLeftInWeek), MC)
            .min(dailyBudget)
        val remainingToday = dailyLimit.subtract(spentToday)
        val remainingWeek = weekBudget.subtract(spentWeekBeforeToday).subtract(spentToday)

        return Allowance(
            date = today,
            weekStart = weekStart,
            weekEnd = weekEnd,
            weekBudget = money(weekBudget),
            spentWeekBeforeToday = money(spentWeekBeforeToday),
            daysLeftInWeek = daysLeftInWeek,
            dailyLimit = money(dailyLimit),
            spentToday = money(spentToday),
            remainingToday = money(remainingToday),
            remainingWeek = money(remainingWeek),
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

    private fun money(v: BigDecimal): BigDecimal = v.setScale(2, RoundingMode.HALF_UP)
}
