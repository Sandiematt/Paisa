package io.yestack.upidetector.service

import android.accessibilityservice.AccessibilityService
import android.graphics.Color
import android.graphics.PixelFormat
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import io.yestack.upidetector.AppStore
import com.expense_tracker.R
import io.yestack.upidetector.core.ConfirmResult
import io.yestack.upidetector.core.ConfirmRejectReason
import io.yestack.upidetector.core.ConfirmScreenParser
import io.yestack.upidetector.core.ScreenSnapshot
import io.yestack.upidetector.core.SpendLimit
import io.yestack.upidetector.ui.OverlayStyle
import java.math.BigDecimal

/**
 * Daily-limit warning on the pre-payment confirm screen. When today's spend plus the amount about to be paid is over
 * the limit, it covers the screen with a warning ([WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY], no extra
 * permission). Cancel removes it and presses Back for the user; Pay anyway removes it and does not warn again for
 * that amount on that screen. A warning only: it cannot stop the UPI app's payment. Main thread only.
 */
class SpendGuard(
    private val service: AccessibilityService,
    /** Asks the service to run the check again after [delayMillis], when no new event may come. */
    private val recheckAfter: (delayMillis: Long) -> Unit,
) {

    private val windowManager = service.getSystemService(WindowManager::class.java)
    private var overlay: View? = null

    /** Confirm screen (package/class) the current state belongs to. */
    private var screenKey: String? = null

    /** Amount already warned about on [screenKey]; it is not warned about again there. */
    private var warnedAmount: BigDecimal? = null

    /** After Cancel, the confirm screen is still on screen while Back takes effect; no new warning until then. */
    private var quietUntil = 0L

    /** Last verdict reported to the log and raw captures, so only changes are reported. */
    private var lastVerdict: String? = null

    /**
     * Reads every window of the app on screen ([windows], from [SnapshotBuilder.readApp]) as a possible confirm
     * screen and shows or removes the warning. Any window showing a confirm screen counts.
     */
    fun check(windows: List<ScreenSnapshot>, now: Long) {
        val results = windows.map { it to ConfirmScreenParser.parse(it) }
        val hit = results.firstOrNull { it.second is ConfirmResult.Candidate }
        report(hit ?: results.firstOrNull { (it.second as? ConfirmResult.Rejected)?.reason != ConfirmRejectReason.EMPTY_SNAPSHOT }, now)
        if (hit == null) {
            // Blank redraws say nothing about which screen this is; anything else means the confirm screen is gone.
            val allBlank = results.all { (it.second as ConfirmResult.Rejected).reason == ConfirmRejectReason.EMPTY_SNAPSHOT }
            if (!allBlank) reset()
            return
        }
        // Over-Budget Blocking switched off in Paisa: no warning, and one already showing is removed. Checked before the
        // warned-amount and quiet-period returns below, which would otherwise leave an old warning up.
        if (!AppStore.blockingEnabled) {
            dismiss()
            return
        }
        val snapshot = hit.first
        val result = hit.second as ConfirmResult.Candidate
        val key = "${snapshot.packageName}/${snapshot.screenClass ?: "?"}"
        if (key != screenKey) {
            reset()
            screenKey = key
        }
        if (warnedAmount?.compareTo(result.amount) == 0) return
        if (now < quietUntil) return
        dismiss()
        // (noteConfirmAttempt is not gated by Over-Budget Blocking: dedupe needs it.)
        // Today's allowance from the Paisa budget; no budget (or no snapshot yet) means no guard.
        val allowance = AppStore.allowance(now) ?: return
        val limit = allowance.dailyLimit
        // Paisa spend today plus this phone's detections not yet synced: not only what the detector saw.
        val spent = allowance.spentToday
        if (!SpendLimit.exceeds(spent, result.amount, limit)) return
        warnedAmount = result.amount
        AppStore.log(
            "confirm screen ₹${result.amount.toPlainString()} ('${result.payButton}'): over today's allowance " +
                "(spent ₹${spent.toPlainString()}, allowance ₹${limit.toPlainString()}); warning shown",
            now,
        )
        show(spent, result.amount, limit)
    }

    /** The supported app on screen changed: forget the confirm screen and remove any warning. */
    fun reset() {
        dismiss()
        screenKey = null
        warnedAmount = null
        quietUntil = 0L
    }

    private fun report(read: Pair<ScreenSnapshot, ConfirmResult>?, now: Long) {
        read ?: return
        val (snapshot, result) = read
        val key = when (result) {
            is ConfirmResult.Candidate -> "confirm ₹${result.amount.toPlainString()}"
            is ConfirmResult.Rejected -> "not a confirm screen (${result.reason})"
        }
        if (key == lastVerdict) return
        lastVerdict = key
        val verdict = when (result) {
            is ConfirmResult.Candidate -> "$key via '${result.payButton}'"
            is ConfirmResult.Rejected -> "$key: ${result.detail}"
        }
        // Only windows that could be a confirm screen are worth a raw capture; the rest would push out useful ones.
        val capture = result is ConfirmResult.Candidate ||
            snapshot.nodes.any { n -> listOfNotNull(n.text, n.contentDescription).any { PAY_WORD.containsMatchIn(it) } }
        AppStore.onConfirmCheck(snapshot, verdict, capture, now)
    }

    /** Removes the warning if it is showing. */
    fun dismiss() {
        val v = overlay ?: return
        overlay = null
        try {
            windowManager?.removeView(v)
        } catch (e: RuntimeException) {
            // already gone
        }
    }

    private fun show(spent: BigDecimal, amount: BigDecimal, limit: BigDecimal) {
        val wm = windowManager ?: return
        val message = TextView(service).apply {
            text = service.getString(
                R.string.limit_message,
                spent.toPlainString(),
                amount.toPlainString(),
                (spent + amount).toPlainString(),
                limit.toPlainString(),
            )
            textSize = 16f
            setTextColor(service.getColor(R.color.text_primary))
            setPadding(0, dp(8), 0, dp(4))
        }
        val title = TextView(service).apply {
            setText(R.string.limit_title)
            OverlayStyle.title(this, R.color.failed)
            textSize = 20f
        }
        val note = TextView(service).apply {
            setText(R.string.limit_note)
            OverlayStyle.body(this)
            textSize = 12f
        }
        // Cancel is the safe action (it backs out of the payment), so it gets the violet pill.
        val cancel = Button(service).apply {
            setText(R.string.limit_cancel)
            setOnClickListener { onCancel() }
            OverlayStyle.primaryButton(this)
        }
        val payAnyway = Button(service).apply {
            setText(R.string.limit_pay_anyway)
            setOnClickListener { onPayAnyway() }
            OverlayStyle.secondaryButton(this)
        }
        val buttons = LinearLayout(service).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.END
            setPadding(0, dp(16), 0, 0)
            addView(payAnyway)
            addView(
                cancel,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                ).apply { setMargins(dp(10), 0, 0, 0) },
            )
        }
        val card = LinearLayout(service).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(20), dp(20), dp(20))
            background = OverlayStyle.card(service)
            addView(title)
            addView(message)
            addView(note)
            addView(buttons)
        }
        val scrim = FrameLayout(service).apply {
            setBackgroundColor(Color.argb(220, 14, 14, 17))
            // Swallows touches so the Pay button underneath cannot be tapped through the warning.
            isClickable = true
            addView(
                card,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    Gravity.CENTER,
                ).apply { setMargins(dp(24), 0, dp(24), 0) },
            )
        }
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT,
        )
        try {
            wm.addView(scrim, params)
            overlay = scrim
        } catch (e: RuntimeException) {
            AppStore.log("could not show the allowance warning: $e")
        }
    }

    private fun onCancel() {
        dismiss()
        // Still on the confirm screen once Back has taken effect: warn again rather than let this amount through.
        warnedAmount = null
        quietUntil = System.currentTimeMillis() + CANCEL_QUIET_MILLIS
        val ok = service.performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK)
        AppStore.log("allowance warning: user cancelled; Back ${if (ok) "pressed" else "failed"}")
        recheckAfter(CANCEL_QUIET_MILLIS + 50L)
    }

    private fun onPayAnyway() {
        dismiss()
        AppStore.log("allowance warning: user chose Pay anyway")
    }

    private fun dp(v: Int) = (v * service.resources.displayMetrics.density).toInt()

    private companion object {
        const val CANCEL_QUIET_MILLIS = 800L
        val PAY_WORD = Regex("""(?<![A-Za-z])(?:pay|send|proceed)(?![A-Za-z])""", RegexOption.IGNORE_CASE)
    }
}
