package io.yestack.upidetector.ui

import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.window.OnBackInvokedDispatcher
import io.yestack.upidetector.AppStore
import io.yestack.upidetector.service.CaptureSpendGuard

/**
 * The allowance warning of Shizuku capture, over the UPI app's Pay screen (see [CaptureSpendGuard] for why it is an
 * Activity). Started through Shizuku, so it is exported; it takes nothing from the Intent and shows only
 * [CaptureSpendGuard.pending], so starting it from anywhere else shows nothing. Closing it returns to the UPI app's
 * screen as it was.
 */
class LimitWarningActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AppStore.init(applicationContext)
        val warning = CaptureSpendGuard.pending
        if (warning == null) {
            finish()
            return
        }
        setContentView(
            CaptureSpendGuard.warningView(
                this, warning,
                onCancel = { answer("allowance warning: user cancelled") },
                onPayAnyway = { answer("allowance warning: user chose Pay anyway") },
            ),
        )
        if (Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) {
                answer("allowance warning: user cancelled (back)")
            }
        }
    }

    /** Android 12 and older. */
    @Deprecated("Back is Cancel", ReplaceWith("answer"))
    override fun onBackPressed() {
        answer("allowance warning: user cancelled (back)")
    }

    private fun answer(log: String) {
        if (CaptureSpendGuard.pending != null) {
            CaptureSpendGuard.pending = null
            AppStore.log(log)
        }
        finish()
    }

    override fun finish() {
        super.finish()
        @Suppress("DEPRECATION")
        overridePendingTransition(0, 0)
    }
}
