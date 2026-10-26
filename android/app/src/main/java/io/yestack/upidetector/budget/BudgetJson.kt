package io.yestack.upidetector.budget

import java.math.BigDecimal
import java.time.LocalDate
import org.json.JSONObject

/** JSON for [BudgetSnapshot] and [Allowance], as in src/lib/autotrack/types.ts. */
object BudgetJson {

    /** Null when [json] is not a usable snapshot; a bad spend entry is skipped rather than failing the whole snapshot. */
    fun parseSnapshot(json: String): BudgetSnapshot? = try {
        val o = JSONObject(json)
        val monthKey = o.getString("monthKey")
        require(Regex("""\d{4}-\d{2}""").matches(monthKey))
        val budget = BigDecimal(o.get("monthlyBudget").toString())
        val spend = HashMap<LocalDate, BigDecimal>()
        o.optJSONObject("spendByDate")?.let { m ->
            val keys = m.keys()
            while (keys.hasNext()) {
                val k = keys.next()
                try {
                    val amount = BigDecimal(m.get(k).toString())
                    spend.merge(LocalDate.parse(k), amount, { a, b -> a + b })
                } catch (e: RuntimeException) {
                    // skip an entry that does not parse
                }
            }
        }
        BudgetSnapshot(monthKey, budget, spend, o.optLong("dataAsOfMillis", 0L).coerceAtLeast(0L))
    } catch (e: Exception) {
        null
    }

    fun snapshotToJson(s: BudgetSnapshot): String {
        val spend = JSONObject()
        s.spendByDate.entries.sortedBy { it.key }.forEach { (d, a) -> spend.put(d.toString(), a.toDouble()) }
        return JSONObject()
            .put("monthKey", s.monthKey)
            .put("monthlyBudget", s.monthlyBudget.toDouble())
            .put("spendByDate", spend)
            .put("dataAsOfMillis", s.dataAsOfMillis)
            .toString()
    }

    fun allowanceToJson(a: Allowance): String = JSONObject()
        .put("date", a.date.toString())
        .put("weekStart", a.weekStart.toString())
        .put("weekEnd", a.weekEnd.toString())
        .put("weekBudget", a.weekBudget.toDouble())
        .put("spentWeekBeforeToday", a.spentWeekBeforeToday.toDouble())
        .put("daysLeftInWeek", a.daysLeftInWeek)
        .put("dailyLimit", a.dailyLimit.toDouble())
        .put("spentToday", a.spentToday.toDouble())
        .put("remainingToday", a.remainingToday.toDouble())
        .put("remainingWeek", a.remainingWeek.toDouble())
        .toString()
}
