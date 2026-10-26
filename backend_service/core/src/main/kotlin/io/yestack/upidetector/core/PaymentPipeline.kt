package io.yestack.upidetector.core

import java.time.ZoneId

/**
 * Turns one read of a UPI app into [DuplicateDetector] decisions. A read is every window of the app on screen,
 * top-most first: a result or processing screen can be a window of its own above the screen it started from (PhonePe
 * shows it over the chat), so every window is parsed on its own and one is chosen for the detector. Windows are never
 * merged: a chat's old payment cards next to a result would make its amount ambiguous.
 *
 * Not thread-safe: the caller serialises access, like [DuplicateDetector].
 */
class PaymentPipeline(val detector: DuplicateDetector = DuplicateDetector()) {

    class WindowResult(
        val snapshot: ScreenSnapshot,
        val result: ParseResult,
        /**
         * Accepted as a live result because a payment of its amount had just been started in the app (see
         * [DuplicateDetector.hasOpenAttempt]), although history-looking text is on screen with it.
         */
        val liveByPaymentFlow: Boolean = false,
    )

    class Outcome(
        /** Every window of the read, in the order given, with its parse result (after [HistoryScreen.gate]). */
        val windows: List<WindowResult>,
        /** Index into [windows] of the window given to the detector. */
        val chosen: Int,
        val decisions: List<Decision>,
        /** A new payment the user should be asked about (see [NotePrompt]); null otherwise. */
        val notePayment: Transaction?,
    )

    private var lastPackage: String? = null
    private var lastRead: List<Pair<Int?, List<TextNode>>>? = null

    /**
     * Decides one read. [windows] are all of one app, top-most first, and not empty. Returns null when the read is the
     * same as the previous one since the last [forgetLastRead]: a redraw with nothing new to decide.
     */
    fun onRead(
        windows: List<ScreenSnapshot>,
        notBeforeMillis: Long?,
        nowMillis: Long,
        zone: ZoneId = ZoneId.systemDefault(),
    ): Outcome? {
        require(windows.isNotEmpty()) { "a read has at least one window" }
        val pkg = windows.first().packageName
        require(windows.all { it.packageName == pkg }) { "a read is of one app only" }
        val key = windows.map { it.windowId to it.nodes }
        if (pkg == lastPackage && key == lastRead) return null
        lastPackage = pkg
        lastRead = key

        val results = windows.map { w ->
            val parsed = UpiTextParser.parse(w, notBeforeMillis, zone, nowMillis)
            val open = parsed is ParseResult.Candidate && detector.hasOpenAttempt(pkg, parsed.amount, nowMillis)
            val gated = HistoryScreen.gate(w, parsed, nowMillis, openAttempt = open)
            val byFlow = open && gated is ParseResult.Candidate && HistoryScreen.reasonOf(w) != null &&
                !HistoryScreen.isLiveResult(w, gated, nowMillis)
            WindowResult(w, gated, byFlow)
        }
        val chosen = choose(results.map { it.result })
        val pick = results[chosen]
        val decisions = detector.onParseResult(pkg, pick.result, nowMillis)
        return Outcome(results, chosen, decisions, NotePrompt.paymentFor(pick.snapshot, pick.result, decisions, nowMillis))
    }

    /** A new screen session or app: the next read is decided even if it looks the same as the last one. */
    fun forgetLastRead() {
        lastPackage = null
        lastRead = null
    }

    companion object {
        /**
         * The window whose result the detector gets: the top-most one with a status phrase (a candidate, or a
         * rejection such as an ambiguous amount, which must not be lost to a phrase-less window below it), else the
         * first window, so the detector still learns that no status phrase is showing.
         */
        fun choose(results: List<ParseResult>): Int = results.indexOfFirst { it.statusPhrasePresent }.coerceAtLeast(0)
    }
}
