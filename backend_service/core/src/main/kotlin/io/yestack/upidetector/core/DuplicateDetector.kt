package io.yestack.upidetector.core

import java.math.BigDecimal

/**
 * Owns screen sessions and the in-memory transaction list. Time is always passed in, never read here.
 * Not thread-safe: the caller serialises access.
 */
class DuplicateDetector(private val windowMillis: Long = 60_000L) {

    private class Record(var txn: Transaction, var lastSeenMillis: Long)

    private class Session(val id: Long, val key: String, val packageName: String) {
        var everHadStatusPhrase = false
        var previousHadStatusPhrase = false
    }

    private val records = mutableListOf<Record>()
    private val pendingHits = mutableListOf<NotificationHit>()
    private var session: Session? = null
    private var nextTxnId = 1L
    private var nextSessionId = 1L

    /** Newest first. */
    val transactions: List<Transaction> get() = records.map { it.txn }.asReversed().toList()

    /** A supported app showed a (possibly new) screen or came to the foreground. */
    fun onScreenChanged(packageName: String, screenClass: String?, windowId: Int?, nowMillis: Long): List<Decision> {
        val key: String
        val fallbackNote: String
        when {
            screenClass != null -> {
                key = "$packageName/$screenClass"
                fallbackNote = ""
            }
            windowId != null -> {
                key = "$packageName#window$windowId"
                fallbackNote = " (no screen class, using window-ID fallback)"
            }
            else -> {
                val out = mutableListOf<Decision>()
                endSession()?.let { out += it }
                out += Decision.NoSession(
                    "No session for $packageName: no screen class and no window ID; only UPI-ref and ${windowMillis / 1000} s rules apply",
                )
                return out
            }
        }
        val current = session
        if (current != null && current.key == key) return emptyList()

        val out = mutableListOf<Decision>()
        endSession()?.let { out += it }
        val started = Session(nextSessionId++, key, packageName)
        session = started
        out += Decision.SessionStarted(started.id, key, "Session #${started.id} started on $key$fallbackNote")
        return out
    }

    /** The supported app left the foreground. */
    fun onAppBackground(packageName: String, nowMillis: Long): List<Decision> {
        if (session?.packageName != packageName) return emptyList()
        return listOfNotNull(endSession("app went to background"))
    }

    /** A parsed snapshot of the current screen. */
    fun onParseResult(packageName: String, result: ParseResult, nowMillis: Long): List<Decision> {
        val current = session?.takeIf { it.packageName == packageName }
        val reappeared = current != null &&
            current.everHadStatusPhrase && !current.previousHadStatusPhrase && result.statusPhrasePresent
        if (current != null) {
            if (result.statusPhrasePresent) current.everHadStatusPhrase = true
            current.previousHadStatusPhrase = result.statusPhrasePresent
        }
        val out = expirePendingHits(nowMillis)
        when (result) {
            is ParseResult.Rejected ->
                out += Decision.Rejected(result.reason, "Rejected (${result.reason}): ${result.detail}")
            is ParseResult.Candidate -> {
                val decisions = handleCandidate(packageName, result, current, reappeared, nowMillis)
                out += decisions
                if (decisions.any { it is Decision.Inserted || it is Decision.FlaggedPossibleDuplicate }) {
                    out += retryPendingHits(nowMillis)
                }
            }
        }
        return out
    }

    /**
     * Cross-checks a payment notification against screen-detected records. Never inserts a record: a hit that matches
     * nothing yet is kept pending (newest [MAX_PENDING_HITS]) and retried when a record is inserted.
     */
    fun onNotification(hit: NotificationHit, nowMillis: Long): List<Decision> {
        val out = expirePendingHits(nowMillis)
        val decision = resolveHit(hit, nowMillis)
        if (decision != null) {
            out += decision
        } else {
            if (pendingHits.none { it.upiRef == hit.upiRef }) {
                pendingHits += hit
                if (pendingHits.size > MAX_PENDING_HITS) pendingHits.removeAt(0)
            }
            out += Decision.NotificationChecked(
                null,
                "Notification ${hitSummary(hit)} from ${sourceLabel(hit.sourcePackage)}: no matching screen record yet; " +
                    "waiting up to ${NOTIFICATION_WINDOW_MILLIS / 60_000} min",
            )
        }
        return out
    }

    /** Clears the POSSIBLE_DUPLICATE flag so the record counts. Returns false if no such flagged record. */
    fun keep(id: Long): Boolean {
        val rec = records.firstOrNull { it.txn.id == id && it.txn.flag != null } ?: return false
        rec.txn = rec.txn.copy(flag = null, flagReason = null)
        return true
    }

    /** Removes a flagged record as a duplicate of its earlier match. Returns false if no such flagged record. */
    fun merge(id: Long): Boolean {
        val rec = records.firstOrNull { it.txn.id == id && it.txn.flag != null } ?: return false
        records.remove(rec)
        return true
    }

    /** Sum of SUCCESS + DEBIT records without a flag. */
    fun expenseTotal(): BigDecimal = records.map { it.txn }
        .filter { it.status == TxnStatus.SUCCESS && it.direction == Direction.DEBIT && it.flag == null }
        .fold(BigDecimal.ZERO) { acc, t -> acc + t.amount }

    fun clear() {
        records.clear()
        pendingHits.clear()
        session = null
    }

    private fun hitSummary(h: NotificationHit) = "₹${h.amount.toPlainString()} ref ${h.upiRef}"

    private fun sourceLabel(pkg: String) = when (pkg) {
        GPAY_PACKAGE -> "GPay"
        PHONEPE_PACKAGE -> "PhonePe"
        PAYTM_PACKAGE -> "Paytm"
        else -> "bank SMS ($pkg)"
    }

    private fun directionCompatible(hit: Direction, record: Direction) =
        hit == Direction.UNKNOWN || record == Direction.UNKNOWN || hit == record

    /** UPI-app notifications only match that app's records; bank SMS matches any app. */
    private fun sourceCompatible(h: NotificationHit, t: Transaction) =
        h.sourcePackage !in UPI_APP_PACKAGES || t.sourceApp == h.sourcePackage

    private fun matches(h: NotificationHit, t: Transaction) =
        t.amount.compareTo(h.amount) == 0 &&
            Math.abs(t.detectedAtMillis - h.postedAtMillis) <= NOTIFICATION_WINDOW_MILLIS &&
            directionCompatible(h.direction, t.direction) && sourceCompatible(h, t)

    /** Applies [h] to the records; null when nothing matched. */
    private fun resolveHit(h: NotificationHit, now: Long): Decision.NotificationChecked? {
        val source = sourceLabel(h.sourcePackage)
        records.firstOrNull { it.txn.upiRef == h.upiRef }?.let {
            return Decision.NotificationChecked(
                it.txn,
                "Notification from $source confirms record #${it.txn.id}: UPI ref ${h.upiRef} already attached",
            )
        }
        val candidates = records.filter { it.txn.upiRef == null && matches(h, it.txn) }
        fun closest(flagged: Boolean) = candidates.filter { (it.txn.flag != null) == flagged }
            .minByOrNull { Math.abs(it.txn.detectedAtMillis - h.postedAtMillis) }

        closest(false)?.let {
            it.txn = it.txn.copy(upiRef = h.upiRef, updatedAtMillis = now)
            return Decision.NotificationChecked(
                it.txn,
                "Notification ${hitSummary(h)}: attached UPI ref ${h.upiRef} from $source to record #${it.txn.id}",
            )
        }
        closest(true)?.let {
            val against = it.txn.possibleDuplicateOfId?.let { id -> "flagged against record #$id" }
                ?: "flagged as a possible duplicate"
            it.txn = it.txn.copy(upiRef = h.upiRef, flag = null, flagReason = null, updatedAtMillis = now)
            return Decision.NotificationChecked(
                it.txn,
                "Notification ${hitSummary(h)}: attached UPI ref ${h.upiRef} from $source to record #${it.txn.id}; " +
                    "it was $against but carries a different ref, so it is a separate payment — cleared POSSIBLE_DUPLICATE",
            )
        }
        return null
    }

    private fun retryPendingHits(now: Long): List<Decision> {
        val out = mutableListOf<Decision>()
        for (h in pendingHits.sortedBy { it.postedAtMillis }) {
            val decision = resolveHit(h, now) ?: continue
            pendingHits.remove(h)
            out += decision
        }
        return out
    }

    private fun expirePendingHits(now: Long): MutableList<Decision> {
        val out = mutableListOf<Decision>()
        for (h in pendingHits.filter { now - it.postedAtMillis > NOTIFICATION_WINDOW_MILLIS }) {
            pendingHits.remove(h)
            out += Decision.NotificationChecked(
                null,
                "Notification ${hitSummary(h)} from ${sourceLabel(h.sourcePackage)} never matched a screen detection " +
                    "— possible missed screen",
            )
        }
        return out
    }

    private fun endSession(reason: String? = null): Decision.SessionEnded? {
        val s = session ?: return null
        session = null
        val why = reason?.let { " ($it)" } ?: ""
        return Decision.SessionEnded(s.id, s.key, "Session #${s.id} ended on ${s.key}$why")
    }

    private fun handleCandidate(
        pkg: String,
        c: ParseResult.Candidate,
        session: Session?,
        reappeared: Boolean,
        now: Long,
    ): List<Decision> {
        val out = mutableListOf<Decision>()
        c.refExtractionFailure?.let {
            out += Decision.RefExtractionFailed("UPI reference label found but no valid 12-digit value: $it")
        }
        out += decide(pkg, c, session, reappeared, now)
        return out
    }

    private fun decide(
        pkg: String,
        c: ParseResult.Candidate,
        session: Session?,
        reappeared: Boolean,
        now: Long,
    ): Decision {
        val summary = "${c.amount.toPlainString()} ${c.status} at ${c.merchant ?: "unknown merchant"}"

        // Rule 1: UPI reference.
        if (c.upiRef != null) {
            val rec = records.lastOrNull { it.txn.upiRef == c.upiRef }
            if (rec != null) {
                return resolveMatch(rec, c, MatchRule.UPI_REF, "UPI ref ${c.upiRef} matches record #${rec.txn.id}", now)
            }
        }

        // Rule 2: same screen session.
        if (session != null) {
            val rec = records.lastOrNull {
                it.txn.sessionId == session.id && sameCore(it.txn, pkg, c) && !refConflict(it.txn, c)
            }
            if (rec != null) {
                // A PENDING -> final transition often passes through a phrase-less redraw; that is an upgrade, not a second payment.
                if (reappeared && c.upiRef == null && !isUpgrade(rec.txn.status, c.status)) {
                    return flag(
                        pkg, c, session.id, rec, now,
                        "status phrase disappeared and reappeared in the same screen session #${session.id}",
                        "Flagged POSSIBLE_DUPLICATE of record #${rec.txn.id} ($summary): status phrase disappeared " +
                            "and reappeared in session #${session.id}",
                    )
                }
                return resolveMatch(
                    rec, c, MatchRule.SCREEN_SESSION,
                    "same app/amount/merchant in screen session #${session.id} matches record #${rec.txn.id}", now,
                )
            }
        }

        // Rule 3: recent record in a different (or no) session.
        val recent = records.lastOrNull {
            sameCore(it.txn, pkg, c) && !refConflict(it.txn, c) &&
                now - it.lastSeenMillis <= windowMillis &&
                (it.txn.sessionId == null || it.txn.sessionId != session?.id)
        }
        if (recent != null) {
            val t = recent.txn
            if (t.status == TxnStatus.PENDING && c.status != TxnStatus.PENDING) {
                return upgrade(
                    recent, c, now,
                    "${windowMillis / 1000} s rule: record #${t.id} was PENDING, now ${c.status} within ${now - recent.lastSeenMillis} ms in a different screen",
                )
            }
            if (t.upiRef == null || c.upiRef == null) {
                return flag(
                    pkg, c, session?.id, recent, now,
                    "same app/amount/merchant within ${windowMillis / 1000} s in a different screen session, reference missing",
                    "Flagged POSSIBLE_DUPLICATE of record #${t.id} ($summary): same app/amount/merchant within " +
                        "${windowMillis / 1000} s in a different screen session, reference missing",
                )
            }
        }

        // Rule 4: new record.
        val txn = newTransaction(pkg, c, session?.id, now, null, null, null)
        records += Record(txn, now)
        return Decision.Inserted(txn, "Inserted record #${txn.id}: $summary${c.upiRef?.let { " ref $it" } ?: ""}")
    }

    private fun sameCore(t: Transaction, pkg: String, c: ParseResult.Candidate) =
        t.sourceApp == pkg && t.amount.compareTo(c.amount) == 0 && merchantsMatch(t.merchant, c.merchant)

    private fun merchantsMatch(a: String?, b: String?) =
        a == null || b == null || a.trim().equals(b.trim(), ignoreCase = true)

    private fun refConflict(t: Transaction, c: ParseResult.Candidate) =
        t.upiRef != null && c.upiRef != null && t.upiRef != c.upiRef

    private fun isUpgrade(from: TxnStatus, to: TxnStatus) = from == TxnStatus.PENDING && to != TxnStatus.PENDING

    /** Rules 1 and 2 share the outcome: upgrade, or ignore (refusing any other status change). */
    private fun resolveMatch(rec: Record, c: ParseResult.Candidate, rule: MatchRule, why: String, now: Long): Decision {
        val t = rec.txn
        if (isUpgrade(t.status, c.status)) return upgrade(rec, c, now, "$rule: $why")
        rec.lastSeenMillis = now
        val filled = fillMissing(rec, c, now)
        val statusNote = when {
            t.status == c.status -> "same status ${t.status}"
            else -> "status change ${t.status} -> ${c.status} refused"
        }
        return Decision.IgnoredDuplicate(t.id, rule, "Ignored duplicate ($rule): $why; $statusNote$filled")
    }

    private fun upgrade(rec: Record, c: ParseResult.Candidate, now: Long, why: String): Decision {
        val previous = rec.txn.status
        rec.lastSeenMillis = now
        rec.txn = rec.txn.copy(status = c.status, updatedAtMillis = now)
        val filled = fillMissing(rec, c, now)
        return Decision.Updated(
            rec.txn, previous,
            "Updated record #${rec.txn.id} ($why): $previous -> ${c.status}$filled",
        )
    }

    /** Fills fields the record lacked from the candidate; returns a log suffix naming them. */
    private fun fillMissing(rec: Record, c: ParseResult.Candidate, now: Long): String {
        val t = rec.txn
        val filled = mutableListOf<String>()
        var upiRef = t.upiRef
        var merchant = t.merchant
        var direction = t.direction
        if (upiRef == null && c.upiRef != null) { upiRef = c.upiRef; filled += "upiRef=${c.upiRef}" }
        if (merchant == null && c.merchant != null) { merchant = c.merchant; filled += "merchant=${c.merchant}" }
        if (direction == Direction.UNKNOWN && c.direction != Direction.UNKNOWN) {
            direction = c.direction
            filled += "direction=${c.direction}"
        }
        if (filled.isEmpty()) return ""
        rec.txn = t.copy(upiRef = upiRef, merchant = merchant, direction = direction, updatedAtMillis = now)
        return "; filled in " + filled.joinToString(", ")
    }

    private fun flag(
        pkg: String,
        c: ParseResult.Candidate,
        sessionId: Long?,
        matched: Record,
        now: Long,
        reason: String,
        log: String,
    ): Decision {
        val txn = newTransaction(pkg, c, sessionId, now, Flag.POSSIBLE_DUPLICATE, reason, matched.txn.id)
        records += Record(txn, now)
        return Decision.FlaggedPossibleDuplicate(txn, matched.txn.id, "$log; inserted as record #${txn.id}")
    }

    private fun newTransaction(
        pkg: String,
        c: ParseResult.Candidate,
        sessionId: Long?,
        now: Long,
        flag: Flag?,
        flagReason: String?,
        duplicateOf: Long?,
    ) = Transaction(
        id = nextTxnId++,
        sourceApp = pkg,
        amount = c.amount,
        status = c.status,
        direction = c.direction,
        merchant = c.merchant,
        upiRef = c.upiRef,
        detectedAtMillis = now,
        updatedAtMillis = now,
        sessionId = sessionId,
        flag = flag,
        flagReason = flagReason,
        possibleDuplicateOfId = duplicateOf,
    )

    companion object {
        const val NOTIFICATION_WINDOW_MILLIS = 300_000L
        private const val MAX_PENDING_HITS = 20
        private const val GPAY_PACKAGE = "com.google.android.apps.nbu.paisa.user"
        private const val PHONEPE_PACKAGE = "com.phonepe.app"
        private const val PAYTM_PACKAGE = "net.one97.paytm"
        private val UPI_APP_PACKAGES = setOf(GPAY_PACKAGE, PHONEPE_PACKAGE, PAYTM_PACKAGE)
    }
}
