package io.yestack.upidetector.core

import java.math.BigDecimal
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DuplicateDetectorTest {

    private val pkg = "com.phonepe.app"
    private val otherPkg = "net.one97.paytm"
    private val d = DuplicateDetector()

    private fun cand(
        amount: String = "100",
        status: TxnStatus = TxnStatus.SUCCESS,
        direction: Direction = Direction.DEBIT,
        merchant: String? = "Chai Shop",
        ref: String? = null,
        refFailure: String? = null,
    ) = ParseResult.Candidate(BigDecimal(amount), status, direction, merchant, ref, refFailure, "Payment successful", 0)

    private fun rejected(present: Boolean = false, reason: RejectReason = RejectReason.NO_AMOUNT) =
        ParseResult.Rejected(reason, "detail text", present)

    private fun screen(cls: String, t: Long = 0, p: String = pkg) = d.onScreenChanged(p, cls, 1, t)

    private fun parse(r: ParseResult, t: Long = 0, p: String = pkg) = d.onParseResult(p, r, t)

    private fun assertLogged(decisions: List<Decision>) {
        assertTrue(decisions.isNotEmpty())
        decisions.forEach { assertTrue(it.logLine.isNotBlank()) }
    }

    // ---- sessions ----

    @Test fun firstScreenStartsSession() {
        val out = screen("A")
        assertEquals(1, out.size)
        val s = out[0] as Decision.SessionStarted
        assertEquals(1L, s.sessionId)
        assertEquals("$pkg/A", s.key)
        assertLogged(out)
    }

    @Test fun differentScreenEndsAndStartsSession() {
        screen("A")
        val out = screen("B")
        assertEquals(2, out.size)
        assertEquals(1L, (out[0] as Decision.SessionEnded).sessionId)
        val started = out[1] as Decision.SessionStarted
        assertEquals(2L, started.sessionId)
        assertEquals("$pkg/B", started.key)
        assertLogged(out)
    }

    @Test fun sameKeyIsNoOp() {
        screen("A")
        assertTrue(screen("A", 5).isEmpty())
    }

    @Test fun otherPackageScreenEndsCurrentSession() {
        screen("A")
        val out = screen("A", 1, otherPkg)
        assertEquals("$pkg/A", (out[0] as Decision.SessionEnded).key)
        assertEquals("$otherPkg/A", (out[1] as Decision.SessionStarted).key)
    }

    @Test fun backgroundEndsOwnSession() {
        screen("A")
        val out = d.onAppBackground(pkg, 1)
        assertEquals(1, out.size)
        assertTrue(out[0] is Decision.SessionEnded)
        assertLogged(out)
        assertTrue(screen("A", 2)[0] is Decision.SessionStarted)
    }

    @Test fun backgroundOfOtherPackageIsIgnored() {
        screen("A")
        assertTrue(d.onAppBackground(otherPkg, 1).isEmpty())
        assertTrue(screen("A", 2).isEmpty())
    }

    @Test fun windowIdFallbackWhenNoScreenClass() {
        val out = d.onScreenChanged(pkg, null, 7, 0)
        val s = out[0] as Decision.SessionStarted
        assertEquals("$pkg#window7", s.key)
        assertTrue(s.logLine.contains("window", ignoreCase = true))
    }

    @Test fun noClassNoWindowEndsSessionAndReportsNoSession() {
        screen("A")
        val out = d.onScreenChanged(pkg, null, null, 1)
        assertTrue(out[0] is Decision.SessionEnded)
        assertTrue(out.any { it is Decision.NoSession })
        assertLogged(out)
        val alone = d.onScreenChanged(pkg, null, null, 2)
        assertEquals(1, alone.size)
        assertTrue(alone[0] is Decision.NoSession)
    }

    // ---- screen session rule ----

    @Test fun firstCandidateIsInserted() {
        screen("A")
        val out = parse(cand(ref = "123456789012"))
        val ins = out.single() as Decision.Inserted
        assertEquals(1L, ins.txn.id)
        assertEquals(1L, ins.txn.sessionId)
        assertEquals(BigDecimal("100"), ins.txn.amount)
        assertNull(ins.txn.flag)
        assertLogged(out)
        assertEquals(1, d.transactions.size)
    }

    @Test fun repeatedIdenticalCandidateInSessionIsOneRecordEvenAfterWindow() {
        screen("A")
        parse(cand(), 0)
        val out = parse(cand(), 200_000)
        val ig = out.single() as Decision.IgnoredDuplicate
        assertEquals(MatchRule.SCREEN_SESSION, ig.rule)
        assertEquals(1L, ig.existingId)
        assertLogged(out)
        assertEquals(1, d.transactions.size)
    }

    @Test fun amountEqualityIgnoresScale() {
        screen("A")
        parse(cand(amount = "1"))
        assertTrue(parse(cand(amount = "1.00")).single() is Decision.IgnoredDuplicate)
    }

    @Test fun pendingToSuccessUpdatesInSession() {
        screen("A")
        parse(cand(status = TxnStatus.PENDING), 0)
        val out = parse(cand(status = TxnStatus.SUCCESS), 5_000)
        val up = out.single() as Decision.Updated
        assertEquals(TxnStatus.PENDING, up.previousStatus)
        assertEquals(TxnStatus.SUCCESS, up.txn.status)
        assertEquals(5_000L, up.txn.updatedAtMillis)
        assertEquals(TxnStatus.SUCCESS, d.transactions.single().status)
        assertLogged(out)
    }

    @Test fun pendingToFailedUpdatesInSession() {
        screen("A")
        parse(cand(status = TxnStatus.PENDING))
        val up = parse(cand(status = TxnStatus.FAILED)).single() as Decision.Updated
        assertEquals(TxnStatus.FAILED, up.txn.status)
    }

    @Test fun downgradeIsRefused() {
        screen("A")
        parse(cand(status = TxnStatus.SUCCESS))
        val out = parse(cand(status = TxnStatus.PENDING))
        val ig = out.single() as Decision.IgnoredDuplicate
        assertTrue(ig.logLine.contains("refused", ignoreCase = true))
        assertEquals(TxnStatus.SUCCESS, d.transactions.single().status)
    }

    @Test fun successToFailedIsRefused() {
        screen("A")
        parse(cand(status = TxnStatus.SUCCESS))
        val ig = parse(cand(status = TxnStatus.FAILED)).single() as Decision.IgnoredDuplicate
        assertTrue(ig.logLine.contains("refused", ignoreCase = true))
        assertEquals(TxnStatus.SUCCESS, d.transactions.single().status)
    }

    @Test fun differentAmountSameSessionIsInserted() {
        screen("A")
        parse(cand(amount = "100"))
        assertTrue(parse(cand(amount = "250")).single() is Decision.Inserted)
        assertEquals(2, d.transactions.size)
    }

    @Test fun merchantFlickeringNullStillMatchesSession() {
        screen("A")
        parse(cand(merchant = null))
        val out = parse(cand(merchant = " chai shop "), 1000)
        assertTrue(out.single() is Decision.IgnoredDuplicate)
        assertEquals("chai shop", d.transactions.single().merchant?.trim()?.lowercase())
        assertTrue(out.single().logLine.contains("merchant"))
    }

    @Test fun differentMerchantSameSessionIsInserted() {
        screen("A")
        parse(cand(merchant = "Chai Shop"))
        assertTrue(parse(cand(merchant = "Book Store")).single() is Decision.Inserted)
    }

    @Test fun differentAppSameAmountIsNotSessionMatch() {
        screen("A")
        parse(cand())
        screen("A", 1, otherPkg)
        val out = parse(cand(), 2, otherPkg)
        assertTrue(out.single() is Decision.Inserted)
        assertEquals(2, d.transactions.size)
    }

    // ---- UPI ref rule ----

    @Test fun matchingRefIgnoresDuplicate() {
        screen("A")
        parse(cand(ref = "123456789012"))
        screen("B", 1000)
        val ig = parse(cand(ref = "123456789012"), 500_000).single() as Decision.IgnoredDuplicate
        assertEquals(MatchRule.UPI_REF, ig.rule)
        assertTrue(ig.logLine.contains("123456789012"))
        assertEquals(1, d.transactions.size)
    }

    @Test fun matchingRefUpgradesPendingAcrossSessions() {
        screen("A")
        parse(cand(status = TxnStatus.PENDING, ref = "123456789012"), 0)
        screen("B", 100_000)
        val up = parse(cand(status = TxnStatus.SUCCESS, ref = "123456789012", amount = "100.00"), 200_000)
            .single() as Decision.Updated
        assertEquals(TxnStatus.PENDING, up.previousStatus)
        assertEquals(1, d.transactions.size)
        assertEquals(TxnStatus.SUCCESS, d.transactions.single().status)
    }

    @Test fun differentRefsWithinWindowGiveTwoRecords() {
        screen("A")
        parse(cand(ref = "111111111111"), 0)
        screen("B", 1000)
        val out = parse(cand(ref = "222222222222"), 2000)
        assertTrue(out.single() is Decision.Inserted)
        assertEquals(2, d.transactions.size)
    }

    @Test fun differentRefsSameSessionGiveTwoRecords() {
        screen("A")
        parse(cand(ref = "111111111111"), 0)
        val out = parse(cand(ref = "222222222222"), 1000)
        assertTrue(out.single() is Decision.Inserted)
        assertEquals(2, d.transactions.size)
    }

    @Test fun refFillsMissingRefOnSessionMatch() {
        screen("A")
        parse(cand(ref = null))
        val ig = parse(cand(ref = "123456789012"), 1000).single()
        assertTrue(ig is Decision.IgnoredDuplicate)
        assertEquals("123456789012", d.transactions.single().upiRef)
        assertTrue(ig.logLine.contains("upiRef"))
    }

    @Test fun directionUnknownIsFilledIn() {
        screen("A")
        parse(cand(direction = Direction.UNKNOWN))
        parse(cand(direction = Direction.DEBIT), 10)
        assertEquals(Direction.DEBIT, d.transactions.single().direction)
    }

    // ---- reappearance ----

    @Test fun statusPhraseAlwaysPresentIsIgnored() {
        screen("A")
        parse(cand())
        parse(cand(), 1000)
        assertTrue(parse(cand(), 2000).single() is Decision.IgnoredDuplicate)
        assertEquals(1, d.transactions.size)
    }

    @Test fun statusDisappearedThenReappearedIsFlagged() {
        screen("A")
        parse(cand(), 0)
        val rej = parse(rejected(present = false), 1000)
        assertTrue(rej.single() is Decision.Rejected)
        val out = parse(cand(), 2000)
        val f = out.single() as Decision.FlaggedPossibleDuplicate
        assertEquals(1L, f.matchedId)
        assertEquals(Flag.POSSIBLE_DUPLICATE, f.txn.flag)
        assertEquals(1L, f.txn.possibleDuplicateOfId)
        assertTrue(f.txn.flagReason!!.contains("reappeared"))
        assertLogged(out)
        assertEquals(2, d.transactions.size)
    }

    @Test fun pendingToSuccessThroughPhraseLessRedrawIsUpgradeNotFlag() {
        screen("A")
        parse(cand(status = TxnStatus.PENDING), 0)
        parse(rejected(present = false), 500)
        val out = parse(cand(status = TxnStatus.SUCCESS), 1000)
        val u = out.single() as Decision.Updated
        assertEquals(TxnStatus.PENDING, u.previousStatus)
        assertEquals(1, d.transactions.size)
        assertNull(d.transactions.single().flag)
    }

    @Test fun rejectedWithPhrasePresentDoesNotCountAsDisappearance() {
        screen("A")
        parse(cand(), 0)
        parse(rejected(present = true, reason = RejectReason.AMBIGUOUS_AMOUNT), 1000)
        assertTrue(parse(cand(), 2000).single() is Decision.IgnoredDuplicate)
    }

    @Test fun reappearanceWithNewMatchingRefIsNotFlagged() {
        screen("A")
        parse(cand(ref = null), 0)
        parse(rejected(present = false), 1000)
        val out = parse(cand(ref = "123456789012"), 2000)
        assertTrue(out.single() is Decision.IgnoredDuplicate)
        assertEquals(1, d.transactions.size)
    }

    @Test fun reappearanceTrackingResetsOnNewSession() {
        screen("A")
        parse(cand(), 0)
        parse(rejected(present = false), 1000)
        screen("B", 2000)
        // new session: no phrase seen earlier in it, so no "reappeared"; the 60 s rule applies instead
        val out = parse(cand(), 3000)
        val f = out.single() as Decision.FlaggedPossibleDuplicate
        assertFalse(f.txn.flagReason!!.contains("reappeared"))
    }

    // ---- 60 s rule ----

    @Test fun newSessionWithinWindowMissingRefIsFlagged() {
        screen("A")
        parse(cand(), 0)
        screen("B", 10_000)
        val out = parse(cand(), 30_000)
        val f = out.single() as Decision.FlaggedPossibleDuplicate
        assertEquals(1L, f.matchedId)
        assertEquals(1L, f.txn.possibleDuplicateOfId)
        assertEquals(2L, f.txn.sessionId)
        assertTrue(f.txn.flagReason!!.contains("60 s"))
        assertLogged(out)
    }

    @Test fun windowBoundaryIsInclusive() {
        screen("A")
        parse(cand(), 0)
        screen("B", 1000)
        assertTrue(parse(cand(), 60_000).single() is Decision.FlaggedPossibleDuplicate)
    }

    @Test fun newSessionAfterWindowIsInserted() {
        screen("A")
        parse(cand(), 0)
        screen("B", 10_000)
        assertTrue(parse(cand(), 60_001).single() is Decision.Inserted)
    }

    @Test fun windowMeasuredFromLastSeen() {
        screen("A")
        parse(cand(), 0)
        parse(cand(), 50_000) // ignored duplicate, refreshes last-seen
        screen("B", 90_000)
        assertTrue(parse(cand(), 100_000).single() is Decision.FlaggedPossibleDuplicate)
    }

    @Test fun pendingThenSuccessInNewSessionWithinWindowUpdates() {
        screen("A")
        parse(cand(status = TxnStatus.PENDING), 0)
        screen("B", 5_000)
        val up = parse(cand(status = TxnStatus.SUCCESS), 8_000).single() as Decision.Updated
        assertEquals(TxnStatus.PENDING, up.previousStatus)
        assertEquals(1, d.transactions.size)
        assertLogged(listOf(up))
    }

    @Test fun sixtySecondRuleWithoutSessionAfterBackground() {
        screen("A")
        parse(cand(), 0)
        d.onAppBackground(pkg, 1000)
        val f = parse(cand(), 2000).single() as Decision.FlaggedPossibleDuplicate
        assertNull(f.txn.sessionId)
    }

    @Test fun refsBothPresentAndEqualNeverFlagged() {
        screen("A")
        parse(cand(ref = "123456789012"), 0)
        screen("B", 1000)
        assertTrue(parse(cand(ref = "123456789012"), 2000).single() is Decision.IgnoredDuplicate)
    }

    @Test fun parseForOtherPackageUsesNoSessionBehaviour() {
        screen("A")
        parse(cand(), 0)
        // package differs from the current session's: session rule does not apply, record gets no session
        val out = d.onParseResult(otherPkg, cand(), 1000)
        assertNull((out.single() as Decision.Inserted).txn.sessionId)
        assertEquals(2, d.transactions.size)
    }

    @Test fun parseForOtherPackageStillMatchesByRef() {
        screen("A")
        parse(cand(ref = "123456789012"), 0)
        val out = d.onParseResult(otherPkg, cand(ref = "123456789012"), 1000)
        assertTrue(out.single() is Decision.IgnoredDuplicate)
    }

    // ---- review + totals ----

    @Test fun keepClearsFlagAndCountsInTotal() {
        screen("A")
        parse(cand(), 0)
        screen("B", 1000)
        val f = parse(cand(), 2000).single() as Decision.FlaggedPossibleDuplicate
        assertEquals(0, BigDecimal("100").compareTo(d.expenseTotal()))
        assertTrue(d.keep(f.txn.id))
        val kept = d.transactions.first { it.id == f.txn.id }
        assertNull(kept.flag)
        assertNull(kept.flagReason)
        assertEquals(0, BigDecimal("200").compareTo(d.expenseTotal()))
    }

    @Test fun keepUnflaggedOrUnknownIsFalse() {
        screen("A")
        parse(cand())
        assertFalse(d.keep(1))
        assertFalse(d.keep(99))
    }

    @Test fun mergeRemovesFlaggedRecord() {
        screen("A")
        parse(cand(), 0)
        screen("B", 1000)
        val f = parse(cand(), 2000).single() as Decision.FlaggedPossibleDuplicate
        assertTrue(d.merge(f.txn.id))
        assertEquals(listOf(1L), d.transactions.map { it.id })
        assertEquals(0, BigDecimal("100").compareTo(d.expenseTotal()))
        assertFalse(d.merge(f.txn.id))
    }

    @Test fun mergeUnflaggedIsFalse() {
        screen("A")
        parse(cand())
        assertFalse(d.merge(1))
        assertEquals(1, d.transactions.size)
    }

    @Test fun expenseTotalCountsOnlySettledDebitsWithoutFlag() {
        screen("A")
        parse(cand(amount = "10.50"))
        screen("B", 100_000)
        parse(cand(amount = "20", status = TxnStatus.PENDING), 100_000)
        screen("C", 200_000)
        parse(cand(amount = "30", status = TxnStatus.FAILED), 200_000)
        screen("D", 300_000)
        parse(cand(amount = "40", direction = Direction.CREDIT), 300_000)
        screen("E", 400_000)
        parse(cand(amount = "50", direction = Direction.UNKNOWN), 400_000)
        screen("F", 500_000)
        parse(cand(amount = "60"), 500_000)
        screen("G", 510_000)
        parse(cand(amount = "60"), 520_000) // flagged, excluded
        screen("H", 700_000)
        parse(cand(amount = "5"), 700_000)
        assertEquals(0, BigDecimal("75.50").compareTo(d.expenseTotal()))
    }

    @Test fun transactionsAreNewestFirstSnapshot() {
        screen("A")
        parse(cand(amount = "1"))
        parse(cand(amount = "2"))
        val snap = d.transactions
        assertEquals(listOf(2L, 1L), snap.map { it.id })
        parse(cand(amount = "3"))
        assertEquals(2, snap.size)
    }

    @Test fun clearDropsEverythingButKeepsCounting() {
        screen("A")
        parse(cand())
        d.clear()
        assertTrue(d.transactions.isEmpty())
        assertEquals(0, BigDecimal.ZERO.compareTo(d.expenseTotal()))
        // session gone: the same screen starts a new session again
        assertTrue(screen("A", 1)[0] is Decision.SessionStarted)
        assertTrue(parse(cand(), 2).single() is Decision.Inserted)
        assertEquals(1, d.transactions.size)
    }

    // ---- pass-through decisions ----

    @Test fun rejectedPassesThroughWithReasonAndDetail() {
        screen("A")
        val out = parse(rejected(reason = RejectReason.CONFLICTING_STATUS))
        val r = out.single() as Decision.Rejected
        assertEquals(RejectReason.CONFLICTING_STATUS, r.reason)
        assertTrue(r.logLine.contains("detail text"))
        assertTrue(d.transactions.isEmpty())
    }

    @Test fun refExtractionFailureEmitsExtraDecision() {
        screen("A")
        val out = parse(cand(refFailure = "label UTR followed by abc"))
        assertEquals(2, out.size)
        assertTrue(out.any { it is Decision.RefExtractionFailed && it.logLine.contains("UTR") })
        assertTrue(out.any { it is Decision.Inserted })
        assertLogged(out)
    }

    @Test fun everyDecisionHasLogLine() {
        val all = mutableListOf<Decision>()
        all += screen("A")
        all += parse(cand(status = TxnStatus.PENDING))
        all += parse(cand(status = TxnStatus.SUCCESS))
        all += parse(cand(status = TxnStatus.SUCCESS))
        all += parse(rejected())
        all += parse(cand(refFailure = "x"))
        all += d.onAppBackground(pkg, 5)
        all += d.onScreenChanged(pkg, null, null, 6)
        all.forEach { assertTrue(it.logLine.isNotBlank()) }
        assertNotNull(all.firstOrNull { it is Decision.NoSession })
    }
}
