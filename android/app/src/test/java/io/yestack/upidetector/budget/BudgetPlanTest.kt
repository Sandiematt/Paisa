package io.yestack.upidetector.budget

import java.io.File
import java.math.BigDecimal
import java.time.LocalDate
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** BudgetPlan against the vectors shared with the JS implementation (__tests__/fixtures/dailyAllowanceVectors.json). */
class BudgetPlanTest {

    // Gradle runs unit tests with the module directory (android/app) as working directory.
    private val fixture = File("../../__tests__/fixtures/dailyAllowanceVectors.json")

    private fun vectors(): List<JSONObject> {
        check(fixture.exists()) {
            "Shared allowance vectors not found at ${fixture.absolutePath}; they must stay in __tests__/fixtures/"
        }
        val arr = JSONObject(fixture.readText()).getJSONArray("vectors")
        return (0 until arr.length()).map { arr.getJSONObject(it) }
    }

    private fun num(o: JSONObject, key: String): BigDecimal = BigDecimal(o.get(key).toString())

    private fun assertMoney(name: String, field: String, expected: BigDecimal, actual: BigDecimal) {
        assertTrue(
            "$name: $field expected ${expected.toPlainString()} but was ${actual.toPlainString()}",
            expected.compareTo(actual) == 0,
        )
    }

    @Test
    fun matchesEverySharedVector() {
        val all = vectors()
        assertTrue("fixture has no vectors", all.isNotEmpty())
        for (v in all) {
            val name = v.getString("name")
            val snapshot = BudgetJson.parseSnapshot(v.getJSONObject("snapshot").toString())
            assertNotNull("$name: snapshot did not parse", snapshot)
            val actual = BudgetPlan.allowance(snapshot!!, emptyMap(), LocalDate.parse(v.getString("today")))
            if (v.isNull("expected")) {
                assertNull("$name: expected no allowance", actual)
                continue
            }
            val e = v.getJSONObject("expected")
            assertNotNull("$name: expected an allowance", actual)
            actual!!
            assertEquals("$name: date", LocalDate.parse(e.getString("date")), actual.date)
            assertEquals("$name: weekStart", LocalDate.parse(e.getString("weekStart")), actual.weekStart)
            assertEquals("$name: weekEnd", LocalDate.parse(e.getString("weekEnd")), actual.weekEnd)
            assertEquals("$name: daysLeftInWeek", e.getInt("daysLeftInWeek"), actual.daysLeftInWeek)
            assertMoney(name, "weekBudget", num(e, "weekBudget"), actual.weekBudget)
            assertMoney(name, "spentWeekBeforeToday", num(e, "spentWeekBeforeToday"), actual.spentWeekBeforeToday)
            assertMoney(name, "dailyLimit", num(e, "dailyLimit"), actual.dailyLimit)
            assertMoney(name, "spentToday", num(e, "spentToday"), actual.spentToday)
            assertMoney(name, "remainingToday", num(e, "remainingToday"), actual.remainingToday)
            assertMoney(name, "remainingWeek", num(e, "remainingWeek"), actual.remainingWeek)
        }
    }

    private fun snapshot(month: String, budget: Int, vararg spend: Pair<String, Int>) = BudgetSnapshot(
        month,
        BigDecimal(budget),
        spend.associate { LocalDate.parse(it.first) to BigDecimal(it.second) },
    )

    private fun extra(vararg spend: Pair<String, Int>): Map<LocalDate, BigDecimal> =
        spend.associate { LocalDate.parse(it.first) to BigDecimal(it.second) }

    @Test
    fun unsyncedSpendTodayIsAddedToSpentToday() {
        // First vector: Tuesday 2026-10-27, B 31000, Paisa spent 200 today.
        val s = snapshot("2026-10", 31000, "2026-10-05" to 20000, "2026-10-26" to 1500, "2026-10-27" to 200)
        val a = BudgetPlan.allowance(s, extra("2026-10-27" to 300), LocalDate.parse("2026-10-27"))!!
        assertMoney("extra today", "spentToday", BigDecimal(500), a.spentToday)
        assertMoney("extra today", "remainingToday", BigDecimal(1400), a.remainingToday)
        assertMoney("extra today", "dailyLimit", BigDecimal(1900), a.dailyLimit)
    }

    @Test
    fun unsyncedSpendEarlierThisWeekLowersTheLimit() {
        val s = snapshot("2026-10", 31000, "2026-10-05" to 20000, "2026-10-26" to 1500, "2026-10-27" to 200)
        val a = BudgetPlan.allowance(s, extra("2026-10-26" to 500), LocalDate.parse("2026-10-27"))!!
        assertMoney("extra earlier", "spentWeekBeforeToday", BigDecimal(2000), a.spentWeekBeforeToday)
        // (11000 - 2000) / 5 days left
        assertMoney("extra earlier", "dailyLimit", BigDecimal(1800), a.dailyLimit)
    }

    @Test
    fun unsyncedSpendBeforeTheWeekLowersTheWeekBudget() {
        val s = snapshot("2026-10", 31000, "2026-10-26" to 1500)
        val a = BudgetPlan.allowance(s, extra("2026-10-05" to 20000), LocalDate.parse("2026-10-27"))!!
        assertMoney("extra month", "weekBudget", BigDecimal(11000), a.weekBudget)
    }

    @Test
    fun unsyncedSpendWorksWithAStaleSnapshot() {
        val s = snapshot("2026-09", 31000, "2026-09-30" to 5000)
        val a = BudgetPlan.allowance(s, extra("2026-10-27" to 100), LocalDate.parse("2026-10-27"))!!
        assertMoney("stale", "spentToday", BigDecimal(100), a.spentToday)
        assertMoney("stale", "weekBudget", BigDecimal(31000), a.weekBudget)
    }

    @Test
    fun entriesOutsideTodaysMonthAreIgnored() {
        val s = snapshot("2026-10", 31000, "2026-09-15" to 9999, "2026-11-02" to 9999)
        val a = BudgetPlan.allowance(s, extra("2026-09-20" to 777, "2026-11-01" to 777), LocalDate.parse("2026-10-27"))!!
        assertMoney("outside", "spentToday", BigDecimal.ZERO, a.spentToday)
        assertMoney("outside", "weekBudget", BigDecimal(31000), a.weekBudget)
    }

    @Test
    fun noBudgetMeansNoAllowanceEvenWithSpend() {
        assertNull(BudgetPlan.allowance(snapshot("2026-10", 0), extra("2026-10-27" to 100), LocalDate.parse("2026-10-27")))
    }

    @Test
    fun dataAsOfMillisParsesAndDefaultsToZero() {
        val with = BudgetJson.parseSnapshot("""{"monthKey":"2026-10","monthlyBudget":100,"dataAsOfMillis":1234}""")!!
        assertEquals(1234L, with.dataAsOfMillis)
        val without = BudgetJson.parseSnapshot("""{"monthKey":"2026-10","monthlyBudget":100}""")!!
        assertEquals(0L, without.dataAsOfMillis)
        assertEquals(1234L, BudgetJson.parseSnapshot(BudgetJson.snapshotToJson(with))!!.dataAsOfMillis)
    }

    @Test
    fun snapshotJsonRoundTrips() {
        val s = snapshot("2026-10", 31000, "2026-10-05" to 20000, "2026-10-27" to 200)
        val back = BudgetJson.parseSnapshot(BudgetJson.snapshotToJson(s))
        assertNotNull(back)
        assertEquals(s.monthKey, back!!.monthKey)
        assertTrue(s.monthlyBudget.compareTo(back.monthlyBudget) == 0)
        assertEquals(s.spendByDate.keys, back.spendByDate.keys)
    }

    @Test
    fun unusableSnapshotJsonIsRejected() {
        assertNull(BudgetJson.parseSnapshot("not json"))
        assertNull(BudgetJson.parseSnapshot("""{"monthKey":"October","monthlyBudget":1}"""))
        assertNull(BudgetJson.parseSnapshot("""{"monthKey":"2026-10"}"""))
    }
}
