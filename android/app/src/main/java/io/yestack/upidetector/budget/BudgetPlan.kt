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
    /** Calendar month the snapshot describes, "YYYY-MM". */
    val monthKey: String,
    /** Monthly budget; zero or less means no budget (guard off). */
    val monthlyBudget: BigDecimal,
    /** Expense spend per local day of [monthKey] from Paisa rows (manual and already-synced auto-tracked). */
    val spendByDate: Map<LocalDate, BigDecimal>,
    /**
     * When the Paisa ledger behind [spendByDate] was read. A detection synced after this is not in the snapshot yet
     * and still counts as extra spend (see [ExtraSpend]). Absent in the JSON means 0.
     */
    val dataAsOfMillis: Long = 0L,
)

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
 * __tests__/fixtures/dailyAllowanceVectors.json). Weeks run Monday to Sunday and are clipped to the calendar month.
 * The monthly budget B is split over the daysInMonth / 7 weeks of the month; unspent money does not roll forward.
 *
 *   weeklyBudget = B / (daysInMonth / 7),  dailyBudget = weeklyBudget / 7
 *   weekBudget = min(dailyBudget * weekDaysInMonth, max(0, B - spentMonthBeforeWeek))
 *   dailyLimit = min(dailyBudget, max(0, weekBudget - spentWeekBeforeToday) / daysLeftInWeek)
 *
 * Intermediates keep full precision; only the returned figures are rounded (half up, 2 decimals). Pure Kotlin.
 */
object BudgetPlan {
    private val MC = MathContext.DECIMAL128
    private val SEVEN = BigDecimal(7)

    /**
     * Today's allowance, or null when there is no budget. [extraSpendByDate] is spend this phone detected that Paisa
     * does not hold yet (not synced); it is added to the snapshot's spend. Entries outside [today]'s month are
     * ignored, and a snapshot for another month contributes no spend (the budget still applies).
     */
    fun allowance(
        snapshot: BudgetSnapshot,
        extraSpendByDate: Map<LocalDate, BigDecimal>,
        today: LocalDate,
    ): Allowance? {
        val budget = snapshot.monthlyBudget
        if (budget.signum() <= 0) return null

        val month = YearMonth.from(today)
        val monthStart = month.atDay(1)
        val monthEnd = month.atEndOfMonth()
        val monday = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        val weekStart = maxOf(monday, monthStart)
        val weekEnd = minOf(monday.plusDays(6), monthEnd)

        val spend = HashMap<LocalDate, BigDecimal>()
        fun add(date: LocalDate, amount: BigDecimal) {
            if (YearMonth.from(date) == month) spend.merge(date, amount, { a, b -> a + b })
        }
        if (snapshot.monthKey == month.toString()) snapshot.spendByDate.forEach { (d, a) -> add(d, a) }
        extraSpendByDate.forEach { (d, a) -> add(d, a) }

        fun sum(from: LocalDate, toExclusive: LocalDate): BigDecimal =
            spend.entries.filter { it.key >= from && it.key < toExclusive }
                .fold(BigDecimal.ZERO) { acc, e -> acc + e.value }

        val spentMonthBeforeWeek = sum(monthStart, weekStart)
        val spentWeekBeforeToday = sum(weekStart, today)
        val spentToday = spend[today] ?: BigDecimal.ZERO

        val weekDaysInMonth = daysBetweenInclusive(weekStart, weekEnd)
        val daysLeftInWeek = daysBetweenInclusive(today, weekEnd)

        val weeklyBudget = budget.multiply(SEVEN, MC).divide(BigDecimal(month.lengthOfMonth()), MC)
        val dailyBudget = weeklyBudget.divide(SEVEN, MC)
        val weekBudget = dailyBudget.multiply(BigDecimal(weekDaysInMonth), MC)
            .min(budget.subtract(spentMonthBeforeWeek).max(BigDecimal.ZERO))
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

    private fun daysBetweenInclusive(from: LocalDate, to: LocalDate): Int = (to.toEpochDay() - from.toEpochDay()).toInt() + 1

    private fun money(v: BigDecimal): BigDecimal = v.setScale(2, RoundingMode.HALF_UP)
}
