package io.yestack.upidetector.core

import java.math.BigDecimal

/** One node of the accessibility tree, flattened. Any field may be missing on a real screen. */
data class TextNode(
    val text: String?,
    val contentDescription: String?,
    val viewId: String?,
)

/**
 * Android-free copy of one UPI app screen, in accessibility-tree (pre-order) order.
 * The service builds it; [UpiTextParser] reads it.
 */
data class ScreenSnapshot(
    val packageName: String,
    val screenClass: String?,
    val windowId: Int?,
    val nodes: List<TextNode>,
)

enum class TxnStatus { SUCCESS, FAILED, PENDING }

enum class Direction { DEBIT, CREDIT, UNKNOWN }

enum class RejectReason {
    EMPTY_SNAPSHOT,
    NO_STATUS_PHRASE,
    CONFLICTING_STATUS,
    NO_AMOUNT,
    AMBIGUOUS_AMOUNT,

    /** The screen shows a payment dated before the app was installed (history, chat, receipts). */
    BEFORE_INSTALL,

    /** A history list or an old payment's detail page (see [HistoryScreen]): not a payment just made. */
    HISTORY_SCREEN,
}

sealed interface ParseResult {
    /** Whether a recognised status phrase was on this screen. DuplicateDetector tracks this across snapshots. */
    val statusPhrasePresent: Boolean

    data class Candidate(
        val amount: BigDecimal,
        val status: TxnStatus,
        val direction: Direction,
        val merchant: String?,
        /** Validated 12-digit UPI reference (UTR), only when it followed a recognised label. */
        val upiRef: String?,
        /** Set when a reference label was found but no valid 12-digit value followed it; null otherwise. */
        val refExtractionFailure: String?,
        /** The phrase that decided [status], as matched on screen. */
        val statusPhrase: String,
        /** Index into [ScreenSnapshot.nodes] of the node holding [statusPhrase]. */
        val statusNodeIndex: Int,
        /** Payment date/time printed on screen (nearest to the status phrase), when one could be read. */
        val shownAtMillis: Long? = null,
    ) : ParseResult {
        override val statusPhrasePresent: Boolean get() = true
    }

    data class Rejected(
        val reason: RejectReason,
        /** Human-readable specifics for the live log, e.g. which amounts tied. */
        val detail: String,
        override val statusPhrasePresent: Boolean,
    ) : ParseResult
}

enum class Flag { POSSIBLE_DUPLICATE }

/** Which duplicate rule matched an existing record. */
enum class MatchRule { UPI_REF, SCREEN_SESSION, WINDOW_60S }

data class Transaction(
    val id: Long,
    val sourceApp: String,
    val amount: BigDecimal,
    val status: TxnStatus,
    val direction: Direction,
    val merchant: String?,
    val upiRef: String?,
    val detectedAtMillis: Long,
    val updatedAtMillis: Long,
    /** Screen session it was first seen in; null when no session could be identified. */
    val sessionId: Long?,
    val flag: Flag?,
    val flagReason: String?,
    /** For a flagged record: the earlier record it may duplicate. */
    val possibleDuplicateOfId: Long?,
    /** What the user said the payment was for; null when they skipped the prompt or were never asked. */
    val note: String? = null,
)

enum class ConfirmRejectReason {
    EMPTY_SNAPSHOT,

    /** A success, failure or pending phrase is on screen: the payment already happened (or is happening). */
    RESULT_SCREEN,

    /** A history list or old-payment detail page, or a screen with too many amounts to be a confirm screen. */
    HISTORY_SCREEN,
    PIN_SCREEN,
    NO_PAY_BUTTON,
    NO_AMOUNT,
    AMBIGUOUS_AMOUNT,
}

/** What [ConfirmScreenParser] read from a pre-payment confirm screen. Never creates a record. */
sealed interface ConfirmResult {
    data class Candidate(
        /** The amount about to be paid: the one nearest the Pay button. */
        val amount: BigDecimal,
        /** The Pay button label as shown, for the live log. */
        val payButton: String,
    ) : ConfirmResult

    data class Rejected(val reason: ConfirmRejectReason, val detail: String) : ConfirmResult
}

/** Everything DuplicateDetector decides. Each carries the live-log line explaining why. */
sealed interface Decision {
    val logLine: String

    data class SessionStarted(val sessionId: Long, val key: String, override val logLine: String) : Decision
    data class SessionEnded(val sessionId: Long, val key: String, override val logLine: String) : Decision

    /** Screen change with neither screen class nor window ID: only the UPI-ref and 60 s rules apply. */
    data class NoSession(override val logLine: String) : Decision

    data class Inserted(val txn: Transaction, override val logLine: String) : Decision
    data class Updated(val txn: Transaction, val previousStatus: TxnStatus, override val logLine: String) : Decision
    data class IgnoredDuplicate(val existingId: Long, val rule: MatchRule, override val logLine: String) : Decision
    data class FlaggedPossibleDuplicate(val txn: Transaction, val matchedId: Long, override val logLine: String) : Decision
    data class Rejected(val reason: RejectReason, override val logLine: String) : Decision

    /** Parser found a reference label without a valid value. Logged alongside the main decision. */
    data class RefExtractionFailed(override val logLine: String) : Decision

    /**
     * Outcome of cross-checking one payment notification. Never creates a record: [txn] is the record it confirmed,
     * gave a UPI ref to, or un-flagged, or null when nothing matched (yet).
     */
    data class NotificationChecked(val txn: Transaction?, override val logLine: String) : Decision
}

/** A payment notification (UPI app or bank SMS) reduced to the fields used for cross-checking. Raw text is not kept. */
data class NotificationHit(
    val sourcePackage: String,
    val amount: BigDecimal,
    /** Validated 12-digit UPI reference; a notification without one is not a hit. */
    val upiRef: String,
    val direction: Direction,
    val postedAtMillis: Long,
)
