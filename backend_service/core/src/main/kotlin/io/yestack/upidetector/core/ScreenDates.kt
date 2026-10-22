package io.yestack.upidetector.core

import java.time.DateTimeException
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import kotlin.math.abs

/** A payment date read off the screen. A date without a time covers the whole day; a time covers its whole minute. */
data class ShownDate(val text: String, val startMillis: Long, val endMillis: Long)

/**
 * Reads the payment dates UPI apps print ("23 October 2026, 1:24am", "23 October 2026 at 01:23 AM", "Oct 23, 2026",
 * "23/10/2026", "12 Oct", "Yesterday, 10:15 PM"). English only, like the rest of the parser.
 */
internal object ScreenDates {
    private const val MONTH =
        """(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?"""
    private const val TIME = """(?:\s*(?:,|at|\||-)?\s*(\d{1,2}):(\d{2})\s*([ap])?\.?\s*m?\.?)?"""
    private const val DAY = """(\d{1,2})(?:st|nd|rd|th)?"""

    private val DAY_MONTH = Regex("""(?<![\d])$DAY\s+$MONTH,?(?:\s+(\d{4}))?(?!\d)$TIME""", RegexOption.IGNORE_CASE)
    private val MONTH_DAY = Regex("""(?<![A-Za-z])$MONTH\s+$DAY,?\s+(\d{4})(?!\d)$TIME""", RegexOption.IGNORE_CASE)
    private val NUMERIC = Regex("""(?<![\d/])(\d{1,2})/(\d{1,2})/(\d{4}|\d{2})(?![\d/])$TIME""", RegexOption.IGNORE_CASE)
    private val RELATIVE = Regex("""(?<![A-Za-z])(today|yesterday)(?![A-Za-z])$TIME""", RegexOption.IGNORE_CASE)

    private val MONTHS = listOf("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec")

    /** The date whose node is nearest [statusIndex] (earlier node wins a tie); null when the screen shows none. */
    fun nearest(texts: List<String>, statusIndex: Int, zone: ZoneId, nowMillis: Long): ShownDate? {
        val today = Instant.ofEpochMilli(nowMillis).atZone(zone).toLocalDate()
        return texts.withIndex()
            .mapNotNull { (index, text) -> find(text, today, zone)?.let { index to it } }
            .minByOrNull { (index, _) -> abs(index - statusIndex) * 2 + if (index > statusIndex) 1 else 0 }
            ?.second
    }

    fun find(text: String, today: LocalDate, zone: ZoneId): ShownDate? {
        DAY_MONTH.find(text)?.let { m ->
            val (day, month, year) = m.destructured
            return build(m.value, year.toIntOrNull(), monthOf(month), day.toInt(), m.groupValues, 4, today, zone)
        }
        MONTH_DAY.find(text)?.let { m ->
            val (month, day, year) = m.destructured
            return build(m.value, year.toInt(), monthOf(month), day.toInt(), m.groupValues, 4, today, zone)
        }
        NUMERIC.find(text)?.let { m ->
            val (day, month, year) = m.destructured
            val fullYear = year.toInt().let { if (it < 100) 2000 + it else it }
            return build(m.value, fullYear, month.toInt(), day.toInt(), m.groupValues, 4, today, zone)
        }
        RELATIVE.find(text)?.let { m ->
            val date = if (m.groupValues[1].equals("today", ignoreCase = true)) today else today.minusDays(1)
            return build(m.value, date.year, date.monthValue, date.dayOfMonth, m.groupValues, 2, today, zone)
        }
        return null
    }

    private fun monthOf(name: String) = MONTHS.indexOf(name.take(3).lowercase()) + 1

    private fun build(
        matched: String,
        year: Int?,
        month: Int,
        day: Int,
        groups: List<String>,
        timeGroup: Int,
        today: LocalDate,
        zone: ZoneId,
    ): ShownDate? = try {
        // A year-less date ("12 Oct") is this year's, unless that would be in the future.
        var date = LocalDate.of(year ?: today.year, month, day)
        if (year == null && date.isAfter(today)) date = date.minusYears(1)
        val time = timeOf(groups[timeGroup], groups[timeGroup + 1], groups[timeGroup + 2])
        val text = matched.trim()
        if (time == null) {
            val start = date.atStartOfDay(zone).toInstant().toEpochMilli()
            val end = date.plusDays(1).atStartOfDay(zone).toInstant().toEpochMilli() - 1
            ShownDate(text, start, end)
        } else {
            val start = LocalDateTime.of(date, time).atZone(zone).toInstant().toEpochMilli()
            ShownDate(text, start, start + 59_999)
        }
    } catch (e: DateTimeException) {
        null
    }

    private fun timeOf(hour: String, minute: String, meridiem: String): LocalTime? {
        if (hour.isEmpty()) return null
        var h = hour.toInt()
        val m = minute.toInt()
        when (meridiem.lowercase()) {
            "a" -> if (h == 12) h = 0
            "p" -> if (h < 12) h += 12
        }
        return if (h in 0..23 && m in 0..59) LocalTime.of(h, m) else null
    }
}
