package io.yestack.upidetector.core

import java.math.BigDecimal
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DuplicateDetectorNotificationTest {

    private val gpay = "com.google.android.apps.nbu.paisa.user"
    private val phonepe = "com.phonepe.app"
    private val sms = "com.google.android.apps.messaging"
    private val ref1 = "507743921781"
    private val ref2 = "507743921799"
    private val min = 60_000L
    private val d = DuplicateDetector()
    private val allDecisions = mutableListOf<Decision>()

    private fun track(list: List<Decision>): List<Decision> = list.also { allDecisions += it }

    private fun cand(
        amount: String = "1.00",
        direction: Direction = Direction.DEBIT,
        ref: String? = null,
    ) = ParseResult.Candidate(
        BigDecimal(amount), TxnStatus.SUCCESS, direction, "Mathen", ref, null, "Payment successful", 0,
    )

    private fun screen(pkg: String, cls: String, cand: ParseResult.Candidate, t: Long): List<Decision> {
        track(d.onScreenChanged(pkg, cls, 1, t))
        return track(d.onParseResult(pkg, cand, t))
    }

    private fun hit(
        pkg: String = gpay,
        amount: String = "1.00",
        ref: String = ref1,
        direction: Direction = Direction.DEBIT,
        at: Long,
    ) = NotificationHit(pkg, BigDecimal(amount), ref, direction, at)

    private fun notify(h: NotificationHit, now: Long = h.postedAtMillis) = track(d.onNotification(h, now))

    private fun checked(list: List<Decision>) = list.filterIsInstance<Decision.NotificationChecked>()

    @Test
    fun attachesRefToUnflaggedRecord() {
        screen(gpay, "A", cand(), 1_000)
        val out = notify(hit(at = 2_000), now = 3_000)
        assertEquals(1, out.size)
        val txn = (out.single() as Decision.NotificationChecked).txn
        assertNotNull(txn)
        assertEquals(ref1, txn!!.upiRef)
        assertEquals(3_000L, txn.updatedAtMillis)
        assertEquals(ref1, d.transactions.single().upiRef)
        assertTrue(out.single().logLine, out.single().logLine.contains("attached UPI ref $ref1"))
        assertTrue(out.single().logLine.contains("record #${txn.id}"))
    }

    @Test
    fun duplicateNotificationsForSamePaymentAreIdempotent() {
        screen(gpay, "A", cand(), 1_000)
        notify(hit(at = 2_000))
        val again = notify(hit(pkg = sms, at = 2_500))
        val txn = (again.single() as Decision.NotificationChecked).txn
        assertNotNull(txn)
        assertTrue(again.single().logLine, again.single().logLine.contains("already"))
        assertEquals(1, d.transactions.size)
        assertEquals(ref1, d.transactions.single().upiRef)
        assertEquals(2_000L, d.transactions.single().updatedAtMillis)
    }

    @Test
    fun differentRefUnflagsPossibleDuplicateAndTotalDoubles() {
        screen(gpay, "A", cand(), 1_000)
        screen(gpay, "B", cand(), 10_000) // different session, no refs -> flagged
        val flagged = d.transactions.first()
        assertEquals(Flag.POSSIBLE_DUPLICATE, flagged.flag)
        assertEquals(0, BigDecimal("1.00").compareTo(d.expenseTotal()))

        notify(hit(ref = ref1, at = 1_500))
        val out = notify(hit(pkg = sms, ref = ref2, at = 10_500))

        val txn = (out.single() as Decision.NotificationChecked).txn!!
        assertEquals(flagged.id, txn.id)
        assertNull(txn.flag)
        assertNull(txn.flagReason)
        assertEquals(ref2, txn.upiRef)
        assertEquals(2, d.transactions.size)
        assertEquals(0, BigDecimal("2.00").compareTo(d.expenseTotal()))
        assertTrue(out.single().logLine, out.single().logLine.contains("separate"))
    }

    @Test
    fun outsideWindowStaysPendingThenExpires() {
        screen(gpay, "A", cand(), 1_000)
        val h = hit(at = 1_000 + 5 * min + 1)
        val out = notify(h)
        assertNull((out.single() as Decision.NotificationChecked).txn)
        assertTrue(out.single().logLine, out.single().logLine.contains("waiting up to 5 min"))
        assertNull(d.transactions.single().upiRef)

        // Lazily expired on the next call, past the window from the posting time.
        val now = h.postedAtMillis + 5 * min + 1
        val later = d.onNotification(hit(amount = "77.00", ref = ref2, at = now), now)
        val expired = checked(later).first()
        assertNull(expired.txn)
        assertTrue(expired.logLine, expired.logLine.contains("never matched a screen detection"))
        assertTrue(expired.logLine.contains(ref1))
        assertTrue(expired.logLine.contains("1.00"))
        assertTrue(expired.logLine.contains("missed screen"))
    }

    @Test
    fun exactlyAtWindowEdgeStillMatches() {
        screen(gpay, "A", cand(), 1_000)
        val out = notify(hit(at = 1_000 + 5 * min))
        assertNotNull((out.single() as Decision.NotificationChecked).txn)
    }

    @Test
    fun notificationBeforeScreenIsMatchedWhenRecordInserted() {
        val pendingOut = notify(hit(at = 1_000))
        assertNull((pendingOut.single() as Decision.NotificationChecked).txn)

        val out = screen(gpay, "A", cand(), 2_000)
        assertTrue(out.first() is Decision.Inserted)
        val retry = checked(out).single()
        assertEquals(ref1, retry.txn!!.upiRef)
        assertEquals(ref1, d.transactions.single().upiRef)

        // The matched hit left the pending list: a later insertion yields no more notification decisions.
        val out2 = screen(gpay, "B", cand(amount = "9.00"), 3_000)
        assertTrue(checked(out2).isEmpty())
    }

    @Test
    fun pendingHitIsRetriedAfterFlaggedInsertion() {
        screen(gpay, "A", cand(), 1_000)
        notify(hit(ref = ref1, at = 1_100)) // attaches to record 1
        notify(hit(ref = ref2, at = 9_000)) // second payment's notification arrives early: pending
        val out = screen(gpay, "B", cand(), 10_000)
        assertTrue(out.first() is Decision.FlaggedPossibleDuplicate)
        val retry = checked(out).single()
        assertNull(retry.txn!!.flag)
        assertEquals(ref2, retry.txn!!.upiRef)
        assertEquals(0, BigDecimal("2.00").compareTo(d.expenseTotal()))
    }

    @Test
    fun expiryAlsoReportedFromParseResult() {
        notify(hit(at = 1_000))
        val out = screen(gpay, "A", cand(amount = "55.00"), 1_000 + 5 * min + 5)
        assertTrue(out.any { it is Decision.NotificationChecked && it.logLine.contains("never matched") })
        assertTrue(out.any { it is Decision.Inserted })
    }

    @Test
    fun sourceMismatchDoesNotMatch() {
        screen(gpay, "A", cand(), 1_000)
        val out = notify(hit(pkg = phonepe, at = 2_000))
        assertNull((out.single() as Decision.NotificationChecked).txn)
        assertNull(d.transactions.single().upiRef)
    }

    @Test
    fun bankSmsMatchesAnyApp() {
        screen(phonepe, "A", cand(), 1_000)
        val out = notify(hit(pkg = sms, at = 2_000))
        assertEquals(ref1, (out.single() as Decision.NotificationChecked).txn!!.upiRef)
    }

    @Test
    fun directionMismatchDoesNotMatchButUnknownDoes() {
        screen(gpay, "A", cand(direction = Direction.DEBIT), 1_000)
        val credit = notify(hit(direction = Direction.CREDIT, at = 2_000))
        assertNull((credit.single() as Decision.NotificationChecked).txn)
        val unknown = notify(hit(ref = ref2, direction = Direction.UNKNOWN, at = 2_100))
        assertEquals(ref2, (unknown.single() as Decision.NotificationChecked).txn!!.upiRef)
    }

    @Test
    fun amountMismatchDoesNotMatch() {
        screen(gpay, "A", cand(), 1_000)
        val out = notify(hit(amount = "2.00", at = 2_000))
        assertNull((out.single() as Decision.NotificationChecked).txn)
    }

    @Test
    fun attachesToClosestInTimeUnflaggedRecord() {
        screen(gpay, "A", cand(), 1_000)
        screen(gpay, "B", cand(), 30_000) // flagged against record 1
        assertTrue(d.keep(2)) // user keeps it: now unflagged, both without refs
        val out = notify(hit(at = 25_000))
        assertEquals(2L, (out.single() as Decision.NotificationChecked).txn!!.id)
    }

    @Test
    fun neverInsertsRecords() {
        notify(hit(at = 1_000))
        assertEquals(0, d.transactions.size)
        screen(gpay, "A", cand(), 2_000)
        notify(hit(ref = ref2, at = 2_100))
        notify(hit(ref = ref2, at = 2_200))
        assertEquals(1, d.transactions.size)
    }

    @Test
    fun laterScreenCandidateWithSameRefIsDedupedByRefRule() {
        screen(gpay, "A", cand(), 1_000)
        notify(hit(at = 2_000))
        val out = screen(gpay, "B", cand(ref = ref1), 3_000)
        val ignored = out.filterIsInstance<Decision.IgnoredDuplicate>().single()
        assertEquals(MatchRule.UPI_REF, ignored.rule)
        assertEquals(1, d.transactions.size)
        assertEquals(0, BigDecimal("1.00").compareTo(d.expenseTotal()))
    }

    @Test
    fun clearDropsPendingHits() {
        notify(hit(at = 1_000))
        d.clear()
        val out = screen(gpay, "A", cand(), 2_000)
        assertTrue(checked(out).isEmpty())
        assertNull(d.transactions.single().upiRef)
    }

    @Test
    fun pendingListKeepsOnlyNewest20() {
        for (i in 0 until 21) {
            notify(hit(amount = "${i + 1}.00", ref = "5077439217%02d".format(i), at = 1_000L + i))
        }
        // The oldest (amount 1.00) was dropped; the newest still matches.
        val oldOut = screen(gpay, "A", cand(amount = "1.00"), 2_000)
        assertTrue(checked(oldOut).isEmpty())
        val newOut = screen(gpay, "B", cand(amount = "21.00"), 2_100)
        assertEquals("507743921720", checked(newOut).single().txn!!.upiRef)
    }

    @Test
    fun everyDecisionHasNonBlankLogLine() {
        screen(gpay, "A", cand(), 1_000)
        screen(gpay, "B", cand(), 10_000)
        notify(hit(at = 1_500))
        notify(hit(pkg = sms, at = 1_600))
        notify(hit(ref = ref2, at = 10_500))
        notify(hit(amount = "9.00", ref = "507743921700", at = 11_000))
        screen(gpay, "C", cand(amount = "9.00"), 12_000)
        notify(hit(amount = "8.00", ref = "507743921701", at = 13_000))
        screen(gpay, "D", cand(amount = "3.00"), 13_000 + 6 * min)
        assertTrue(allDecisions.isNotEmpty())
        allDecisions.forEach { assertTrue(it.toString(), it.logLine.isNotBlank()) }
        assertTrue(allDecisions.filterIsInstance<Decision.NotificationChecked>().size >= 6)
    }
}
