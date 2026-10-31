package io.yestack.upidetector.ui

import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.window.OnBackInvokedDispatcher
import io.yestack.upidetector.AppStore
import io.yestack.upidetector.service.SpendGuard

/**
 * The daily-limit warning, over the UPI app's Pay screen (see [SpendGuard] for why it is an Activity). Started through
 * Shizuku, so it is exported; it takes nothing from the Intent and shows only [SpendGuard.pending], so starting it
 * from anywhere else shows nothing. Closing it returns to the UPI app's screen as it was.
 */
class LimitWarningActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AppStore.init(applicationContext)
        val warning = SpendGuard.pending
        if (warning == null) {
            finish()
            return
        }
        setContentView(
            SpendGuard.warningView(
                this, warning,
                onCancel = { answer("daily-limit warning: user cancelled") },
                onPayAnyway = { answer("daily-limit warning: user chose Pay anyway") },
            ),
        )
        if (Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT) {
                answer("daily-limit warning: user cancelled (back)")
            }
        }
    }

    /** Android 12 and older. */
    @Deprecated("Back is Cancel", ReplaceWith("answer"))
    override fun onBackPressed() {
        answer("daily-limit warning: user cancelled (back)")
    }

    private fun answer(log: String) {
        if (SpendGuard.pending != null) {
            SpendGuard.pending = null
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
