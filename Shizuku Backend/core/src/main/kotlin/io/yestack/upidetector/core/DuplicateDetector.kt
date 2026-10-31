package io.yestack.upidetector.core

import java.math.BigDecimal

/**
 * Owns screen sessions and the in-memory transaction list. Time is always passed in, never read here.
 * Not thread-safe: the caller serialises access.
 */
class DuplicateDetector(private val windowMillis: Long = 60_000L) {

    /**
     * [shownAtMillis]: the payment time printed on its result screen, when one was read. Memory only (records restored
     * after a restart have none), which is enough: it only tells apart payments seen minutes apart.
     */
    private class Record(var txn: Transaction, var lastSeenMillis: Long, var shownAtMillis: Long? = null)

    private class Session(val id: Long, val key: String, val packageName: String) {
        var everHadStatusPhrase = false
        var previousHadStatusPhrase = false
    }

    /** A payment being started: a PIN screen ([amount] unknown) or a confirm screen with its amount. */
    private class Attempt(val packageName: String, var atMillis: Long, val amount: BigDecimal?) {
        /** A finished (success or failed) record came out of this attempt: it confirms no further result screen. */
        var finished = false
    }

    private val records = mutableListOf<Record>()
    private val pendingHits = mutableListOf<NotificationHit>()
    private val attempts = ArrayDeque<Attempt>()
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
                for (d in decisions) {
                    val txn = when (d) {
                        is Decision.Inserted -> d.txn
                        is Decision.Updated -> d.txn
                        else -> null
                    }
                    if (txn != null && txn.status != TxnStatus.PENDING) finishAttempts(packageName, txn.amount, nowMillis)
                }
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
            val heldBack = records.map { it.txn }
                .filter { it.upiRef == null && matches(hit, it) }
                .mapNotNull { t -> laterAttemptElsewhere(hit, t)?.let { a -> "#${t.id} (${sourceLabel(a.packageName)} payment started after it)" } }
            val why = if (heldBack.isEmpty()) "" else "; not attached to ${heldBack.joinToString()}"
            out += Decision.NotificationChecked(
                null,
                "Notification ${hitSummary(hit)} from ${sourceLabel(hit.sourcePackage)}: no matching screen record yet$why; " +
                    "waiting up to ${NOTIFICATION_WINDOW_MILLIS / 60_000} min",
            )
        }
        return out
    }

    /**
     * A payment is being started in [packageName]: a UPI PIN screen came up ([amount] null; the screen is never read),
     * or a confirm screen showing [amount] about to be paid. Never creates a record. It is used twice:
     * - A success read after it is a new payment, not a repeat of a record last seen before it (same app, amount and
     *   merchant, or same screen session): paying the same merchant again from the same chat stays in one session.
     * - A bank SMS posted after it is not attached to an earlier record of a different app; it waits for this app's.
     *
     * Returns false when it only refreshed the attempt already noted (the same confirm screen read again), or when it
     * was ignored because the result of that amount is still showing (see [resultStillShowing]).
     */
    fun onPaymentAttempt(packageName: String, nowMillis: Long, amount: BigDecimal? = null): Boolean {
        if (amount != null && resultStillShowing(packageName, amount)) return false
        val last = attempts.lastOrNull()
        if (amount != null && last != null && !last.finished && last.packageName == packageName &&
            last.amount?.compareTo(amount) == 0
        ) {
            last.atMillis = nowMillis
            return false
        }
        attempts.addLast(Attempt(packageName, nowMillis, amount))
        while (attempts.size > MAX_ATTEMPTS) attempts.removeFirst()
        return true
    }

    /**
     * A payment of [amount] was started in [packageName] at most [LIVE_ATTEMPT_MILLIS] before [nowMillis] and has not
     * produced a finished record yet: a result screen for that amount read now is that payment's live result. This is
     * how the GPay screen is trusted (nothing on it looks like history) carried over to PhonePe, whose live result shares
     * its screen with chat cards and an old payment's details: the payment flow itself (confirm screen, PIN or
     * fingerprint) says the result is live, instead of a "Done" button and printed time that may not be drawn yet.
     */
    fun hasOpenAttempt(packageName: String, amount: BigDecimal, nowMillis: Long): Boolean =
        openAttempts(packageName, amount, nowMillis).isNotEmpty()

    /** When the open attempt for [amount] in [packageName] was started, or null; for the live log. */
    fun openAttemptAt(packageName: String, amount: BigDecimal, nowMillis: Long): Long? =
        openAttempts(packageName, amount, nowMillis).maxOfOrNull { it.atMillis }

    /**
     * The last read of this screen session still showed a status phrase, and the session already has a finished record
     * of [amount]: a confirm-screen match now is that result read again (say after our note prompt closed over it), not
     * a new payment. A real repeat payment first leaves the result (the chat or pay sheet shows no status phrase).
     */
    private fun resultStillShowing(pkg: String, amount: BigDecimal): Boolean {
        val s = session?.takeIf { it.packageName == pkg && it.previousHadStatusPhrase } ?: return false
        return records.any {
            it.txn.sessionId == s.id && it.txn.sourceApp == pkg && it.txn.amount.compareTo(amount) == 0 &&
                it.txn.status != TxnStatus.PENDING
        }
    }

    private fun openAttempts(pkg: String, amount: BigDecimal, now: Long) = attempts.filter {
        !it.finished && it.packageName == pkg && it.atMillis <= now && now - it.atMillis <= LIVE_ATTEMPT_MILLIS &&
            (it.amount == null || it.amount.compareTo(amount) == 0)
    }

    /** A finished record of [amount] came out of the payment flow: its attempts confirm nothing more. */
    private fun finishAttempts(pkg: String, amount: BigDecimal, now: Long) {
        openAttempts(pkg, amount, now).forEach { it.finished = true }
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

    /**
     * Replaces the records with [saved] (loaded from disk after a restart). Record ids continue after the highest saved
     * id, and session ids after the highest saved session, so a new session never matches a restored record's session.
     * The current session and pending notification hits are dropped.
     */
    fun restore(saved: List<Transaction>) {
        records.clear()
        saved.sortedBy { it.id }.forEach { records += Record(it, it.updatedAtMillis) }
        pendingHits.clear()
        attempts.clear()
        session = null
        nextTxnId = maxOf(nextTxnId, (saved.maxOfOrNull { it.id } ?: 0L) + 1)
        nextSessionId = maxOf(nextSessionId, (saved.mapNotNull { it.sessionId }.maxOrNull() ?: 0L) + 1)
    }

    /** Sets the note on record [id]; a blank [note] clears it. Returns false if no such record. */
    fun attachNote(id: Long, note: String?): Boolean {
        val rec = records.firstOrNull { it.txn.id == id } ?: return false
        rec.txn = rec.txn.copy(note = note?.trim()?.takeIf { it.isNotEmpty() })
        return true
    }

    /** Sum of SUCCESS + DEBIT records without a flag. */
    fun expenseTotal(): BigDecimal = records.map { it.txn }
        .filter { it.status == TxnStatus.SUCCESS && it.direction == Direction.DEBIT && it.flag == null }
        .fold(BigDecimal.ZERO) { acc, t -> acc + t.amount }

    fun clear() {
        records.clear()
        pendingHits.clear()
        attempts.clear()
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

    /**
     * For a bank SMS (which names no UPI app): a payment attempt in a different app between [t]'s detection and the
     * SMS, which makes the SMS more likely that app's. Null when there is none.
     */
    /**
     * A payment of [amount] (or of an unknown amount, from a PIN screen) was started in [pkg] after [sinceMillis]:
     * whatever is read now is a new payment, not a repeat of what was last seen at [sinceMillis].
     */
    private fun newAttemptSince(pkg: String, amount: BigDecimal, sinceMillis: Long, now: Long) = attempts.any {
        it.packageName == pkg && it.atMillis > sinceMillis && it.atMillis <= now &&
            (it.amount == null || it.amount.compareTo(amount) == 0)
    }

    private fun laterAttemptElsewhere(h: NotificationHit, t: Transaction): Attempt? {
        if (h.sourcePackage in UPI_APP_PACKAGES) return null
        return attempts.lastOrNull {
            it.packageName != t.sourceApp && it.atMillis > t.detectedAtMillis && it.atMillis <= h.postedAtMillis
        }
    }

    /** Applies [h] to the records; null when nothing matched. */
    private fun resolveHit(h: NotificationHit, now: Long): Decision.NotificationChecked? {
        val source = sourceLabel(h.sourcePackage)
        records.firstOrNull { it.txn.upiRef == h.upiRef }?.let {
            return Decision.NotificationChecked(
                it.txn,
                "Notification from $source confirms record #${it.txn.id}: UPI ref ${h.upiRef} already attached",
            )
        }
        val candidates = records.filter {
            it.txn.upiRef == null && matches(h, it.txn) && laterAttemptElsewhere(h, it.txn) == null
        }
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

        // Rule 2: same screen session (not across a payment started since the record was last seen).
        if (session != null) {
            val rec = records.lastOrNull {
                it.txn.sessionId == session.id && sameCore(it.txn, pkg, c) && !refConflict(it.txn, c) &&
                    !printedApart(it, c) && !newAttemptSince(pkg, c.amount, it.lastSeenMillis, now)
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

        // Rule 3: recent record in a different (or no) session (not across a payment started since it was last seen).
        val recent = records.lastOrNull {
            sameCore(it.txn, pkg, c) && !refConflict(it.txn, c) && !printedApart(it, c) &&
                now - it.lastSeenMillis <= windowMillis &&
                (it.txn.sessionId == null || it.txn.sessionId != session?.id) &&
                !newAttemptSince(pkg, c.amount, it.lastSeenMillis, now)
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

        // Rule 4: new record. Say so when only a payment started since kept it from matching an earlier record.
        val repeatOf = records.lastOrNull {
            sameCore(it.txn, pkg, c) && !refConflict(it.txn, c) &&
                (it.txn.sessionId == session?.id || now - it.lastSeenMillis <= windowMillis)
        }
        val why = repeatOf?.let {
            if (printedApart(it, c)) {
                "; same app/amount/merchant as record #${it.txn.id}, but its result screen prints a different payment time"
            } else {
                "; same app/amount/merchant as record #${it.txn.id}, but a new payment was started after it was last seen"
            }
        } ?: ""
        val txn = newTransaction(pkg, c, session?.id, now, null, null, null)
        records += Record(txn, now, c.shownAtMillis)
        return Decision.Inserted(txn, "Inserted record #${txn.id}: $summary${c.upiRef?.let { " ref $it" } ?: ""}$why")
    }

    private fun sameCore(t: Transaction, pkg: String, c: ParseResult.Candidate) =
        t.sourceApp == pkg && t.amount.compareTo(c.amount) == 0 && merchantsMatch(t.merchant, c.merchant)

    private fun merchantsMatch(a: String?, b: String?) =
        a == null || b == null || a.trim().equals(b.trim(), ignoreCase = true)

    private fun refConflict(t: Transaction, c: ParseResult.Candidate) =
        t.upiRef != null && c.upiRef != null && t.upiRef != c.upiRef

    /**
     * Both result screens print a payment time and the times differ: two payments. One payment's result screen always
     * prints the same time, however often it is read. Two payments in the same printed minute still need the other rules.
     */
    private fun printedApart(rec: Record, c: ParseResult.Candidate) =
        rec.shownAtMillis != null && c.shownAtMillis != null && rec.shownAtMillis != c.shownAtMillis

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
        if (rec.shownAtMillis == null) rec.shownAtMillis = c.shownAtMillis
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
        records += Record(txn, now, c.shownAtMillis)
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
        private const val MAX_ATTEMPTS = 20

        /** A payment's result screen comes within this long after it was started (processing can take a while). */
        const val LIVE_ATTEMPT_MILLIS = 180_000L
        private const val GPAY_PACKAGE = "com.google.android.apps.nbu.paisa.user"
        private const val PHONEPE_PACKAGE = "com.phonepe.app"
        private const val PAYTM_PACKAGE = "net.one97.paytm"
        private val UPI_APP_PACKAGES = setOf(GPAY_PACKAGE, PHONEPE_PACKAGE, PAYTM_PACKAGE)
    }
}
