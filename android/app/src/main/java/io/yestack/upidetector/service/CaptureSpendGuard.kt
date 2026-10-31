package io.yestack.upidetector.service

import android.content.Context
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
import com.expense_tracker.R
import io.yestack.upidetector.AppStore
import io.yestack.upidetector.core.ConfirmRejectReason
import io.yestack.upidetector.core.ConfirmResult
import io.yestack.upidetector.core.ConfirmScreenParser
import io.yestack.upidetector.core.ScreenSnapshot
import io.yestack.upidetector.core.SpendLimit
import io.yestack.upidetector.ui.OverlayStyle
import java.math.BigDecimal

/**
 * [SpendGuard] for Shizuku capture ([DumpCaptureService]): the same daily-allowance warning on the pre-payment confirm
 * screen, without an accessibility service. Cancel and Pay anyway both remove it and do not warn again for that amount;
 * nothing is pressed or tapped for the user (there is no accessibility service to press Back). A warning only: it
 * cannot stop the UPI app's payment. Main thread only.
 *
 * The warning is an Activity ([io.yestack.upidetector.ui.LimitWarningActivity]) started by [openWarning] (through
 * Shizuku: the shell user may start an Activity from the background). An overlay window would be simpler, but GPay's
 * amount screen hides other apps' overlays; an Activity on top cannot be hidden. When it cannot be started,
 * [openWarning] calls back and the overlay ([WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY]) is shown instead.
 */
class CaptureSpendGuard(
    private val context: Context,
    /** Starts the warning Activity off the main thread; calls its argument (on any thread) when that failed. */
    private val openWarning: (onFailed: (String) -> Unit) -> Unit,
) {

    private val windowManager = context.getSystemService(WindowManager::class.java)
    private var overlay: View? = null

    /** Confirm screen (package/class) the current state belongs to. */
    private var screenKey: String? = null

    /** Amount already warned about on [screenKey]; it is not warned about again there. */
    private var warnedAmount: BigDecimal? = null

    /** Last verdict reported to the log and raw captures, so only changes are reported. */
    private var lastVerdict: String? = null

    /**
     * The last warning shown. The warning Activity puts the UPI app in the background, which resets this guard; when
     * the user returns to the same confirm screen they are not warned again about the same payment.
     */
    private var lastWarned: Warning? = null

    /**
     * Reads every window of the app on screen ([windows], from one dump) as a possible confirm screen and shows or
     * removes the warning. Any window showing a confirm screen counts.
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
        // Over-Budget Blocking switched off in Paisa: no warning, and one already showing is removed.
        if (!AppStore.blockingEnabled) {
            dismiss()
            pending = null
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
        dismiss()
        // Today's allowance from the Paisa budget; no budget (or no snapshot yet) means no guard.
        val allowance = AppStore.allowance(now) ?: return
        val limit = allowance.dailyLimit
        val spent = allowance.spentToday
        if (!SpendLimit.exceeds(spent, result.amount, limit)) return
        warnedAmount = result.amount
        val last = lastWarned
        if (last != null && last.packageName == snapshot.packageName && last.amount.compareTo(result.amount) == 0 &&
            now - last.atMillis in 0..REWARN_AFTER_MILLIS
        ) {
            return
        }
        val warning = Warning(snapshot.packageName, spent, result.amount, limit, now)
        lastWarned = warning
        pending = warning
        AppStore.log(
            "confirm screen ₹${result.amount.toPlainString()} ('${result.payButton}'): over today's allowance " +
                "(spent ₹${spent.toPlainString()}, allowance ₹${limit.toPlainString()}); warning shown",
            now,
        )
        openWarning { why ->
            AppStore.post {
                if (pending !== warning) return@post
                AppStore.log("could not open the allowance warning screen ($why); showing it as an overlay")
                showOverlay(warning)
            }
        }
    }

    /** The supported app on screen changed: forget the confirm screen and remove any warning. */
    fun reset() {
        dismiss()
        screenKey = null
        warnedAmount = null
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

    /** Removes the overlay warning if it is showing. */
    fun dismiss() {
        val v = overlay ?: return
        overlay = null
        try {
            windowManager?.removeView(v)
        } catch (e: RuntimeException) {
            // already gone
        }
    }

    private fun showOverlay(w: Warning) {
        val wm = windowManager ?: return
        val scrim = warningView(context, w, onCancel = { onCancel() }, onPayAnyway = { onPayAnyway() })
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
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
        pending = null
        AppStore.log("allowance warning: user cancelled")
    }

    private fun onPayAnyway() {
        dismiss()
        pending = null
        AppStore.log("allowance warning: user chose Pay anyway")
    }

    /** One warning: [spent] today, [amount] about to be paid in [packageName], over [limit]. */
    class Warning(
        val packageName: String,
        val spent: BigDecimal,
        val amount: BigDecimal,
        val limit: BigDecimal,
        val atMillis: Long,
    )

    companion object {
        private val PAY_WORD = Regex("""(?<![A-Za-z])(?:pay|send|proceed)(?![A-Za-z])""", RegexOption.IGNORE_CASE)

        /** The same payment is not warned about again within this long (the warning screen comes and goes over it). */
        private const val REWARN_AFTER_MILLIS = 120_000L

        /** The warning waiting for the warning Activity, or showing; null once the user answered. Main thread. */
        var pending: Warning? = null

        /** The warning: a dimmed full-screen scrim (it swallows touches) with a card on it, styled as [SpendGuard]'s. */
        fun warningView(context: Context, w: Warning, onCancel: () -> Unit, onPayAnyway: () -> Unit): View {
            fun dp(v: Int) = (v * context.resources.displayMetrics.density).toInt()
            val message = TextView(context).apply {
                text = context.getString(
                    R.string.limit_message,
                    w.spent.toPlainString(),
                    w.amount.toPlainString(),
                    (w.spent + w.amount).toPlainString(),
                    w.limit.toPlainString(),
                )
                textSize = 16f
                setTextColor(context.getColor(R.color.text_primary))
                setPadding(0, dp(8), 0, dp(4))
            }
            val title = TextView(context).apply {
                setText(R.string.limit_title)
                OverlayStyle.title(this, R.color.failed)
                textSize = 20f
            }
            val note = TextView(context).apply {
                setText(R.string.limit_note)
                OverlayStyle.body(this)
                textSize = 12f
            }
            // Cancel is the safe action (it backs out of the payment), so it gets the violet pill.
            val cancel = Button(context).apply {
                setText(R.string.limit_cancel)
                setOnClickListener { onCancel() }
                OverlayStyle.primaryButton(this)
            }
            val payAnyway = Button(context).apply {
                setText(R.string.limit_pay_anyway)
                setOnClickListener { onPayAnyway() }
                OverlayStyle.secondaryButton(this)
            }
            val buttons = LinearLayout(context).apply {
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
            val card = LinearLayout(context).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(20), dp(20), dp(20), dp(20))
                background = OverlayStyle.card(context)
                addView(title)
                addView(message)
                addView(note)
                addView(buttons)
            }
            return FrameLayout(context).apply {
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
        }
    }
}
