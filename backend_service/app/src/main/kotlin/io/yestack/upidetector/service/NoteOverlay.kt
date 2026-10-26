package io.yestack.upidetector.service

import android.accessibilityservice.AccessibilityService
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import io.yestack.upidetector.AppStore
import io.yestack.upidetector.R
import io.yestack.upidetector.SupportedApps

/**
 * "What was this for?" over whatever is on screen, drawn by the accessibility service as an overlay
 * ([WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY], like [SpendGuard]'s warning). Starting an activity from
 * the service in the background can be blocked by Android, or land behind the UPI app, without any error; an overlay
 * is shown at once.
 *
 * One card: the payment, a text box (keyboard up at once) and Skip / Save. Save (or the keyboard's Done) attaches the
 * note; Skip or Back leaves the record as it is. State lives in [NotePromptFlow]; every callback goes through it and is
 * guarded, so a repeated tap or a late callback does nothing and an error is logged instead of crashing.
 * Main thread only.
 */
class NoteOverlay(private val service: AccessibilityService) {

    private val windowManager = service.getSystemService(WindowManager::class.java)
    private val handler = Handler(Looper.getMainLooper())
    private val flow = NotePromptFlow()
    private var view: View? = null

    /** Asks about record [id], now or after the question in progress. False if the overlay could not be shown. */
    fun ask(id: Long): Boolean {
        val step = flow.ask(id)
        if (step !is NotePromptFlow.Step.Show) return true
        if (show(id)) return true
        flow.showFailed(id) // nothing else is waiting: this was the first question
        return false
    }

    /** Removes the question and forgets the waiting ones (the service is going away). */
    fun dismissAll() {
        handler.removeCallbacksAndMessages(null)
        flow.clear()
        remove()
    }

    /** Carries out [step], and whatever follows from it. */
    private fun run(step: NotePromptFlow.Step) {
        when (step) {
            is NotePromptFlow.Step.Show -> {
                remove()
                if (!show(step.id)) run(flow.showFailed(step.id))
            }
            NotePromptFlow.Step.None -> Unit
        }
    }

    private fun onSkip(id: Long) = guarded("Skip") {
        // A second tap, or a tap on a question already replaced, is not about the question on screen: nothing to do.
        if (flow.showing != id) return@guarded
        val step = flow.answer(id)
        remove()
        AppStore.log("user skipped the note for record #$id")
        run(step)
    }

    private fun onSave(id: Long, note: String) = guarded("Save") {
        if (flow.showing != id) return@guarded
        val step = flow.answer(id)
        remove()
        if (note.isBlank()) {
            AppStore.log("user skipped the note for record #$id")
        } else {
            AppStore.attachNote(id, note)
        }
        run(step)
    }

    private fun show(id: Long): Boolean {
        val wm = windowManager ?: return false
        val txn = AppStore.transactions.firstOrNull { it.id == id } ?: return false

        val title = TextView(service).apply {
            setText(R.string.note_title)
            textSize = 18f
            setTextColor(service.getColor(R.color.text_primary))
        }
        val details = TextView(service).apply {
            text = service.getString(
                R.string.note_details,
                txn.amount.toPlainString(),
                txn.merchant ?: service.getString(R.string.note_unknown_merchant),
                SupportedApps.displayName(txn.sourceApp),
            )
            textSize = 14f
            setTextColor(service.getColor(R.color.text_secondary))
            setPadding(0, dp(4), 0, dp(8))
        }
        val input = EditText(service).apply {
            setHint(R.string.note_hint)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            imeOptions = EditorInfo.IME_ACTION_DONE
            maxLines = 1
            txn.note?.let { setText(it) }
        }
        input.setOnEditorActionListener { _, action, _ ->
            if (action == EditorInfo.IME_ACTION_DONE) onSave(id, input.text.toString())
            action == EditorInfo.IME_ACTION_DONE
        }
        val skip = Button(service, null, android.R.attr.buttonBarButtonStyle).apply {
            setText(R.string.note_skip)
            setOnClickListener { onSkip(id) }
        }
        val save = Button(service, null, android.R.attr.buttonBarButtonStyle).apply {
            setText(R.string.save)
            setOnClickListener { onSave(id, input.text.toString()) }
        }
        val buttons = LinearLayout(service).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.END
            addView(skip)
            addView(save)
        }
        val card = LinearLayout(service).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(20), dp(20), dp(8))
            background = GradientDrawable().apply {
                setColor(service.getColor(R.color.surface))
                cornerRadius = dp(12).toFloat()
            }
            addView(title)
            addView(details)
            addView(input, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            addView(buttons, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        val scrim = object : FrameLayout(service) {
            // The overlay takes key focus, so Back comes here rather than to the app below: it means Skip.
            override fun dispatchKeyEvent(event: KeyEvent): Boolean {
                if (event.keyCode == KeyEvent.KEYCODE_BACK) {
                    // Handled after this dispatch returns: the window is not removed while it is delivering the key.
                    if (event.action == KeyEvent.ACTION_UP) handler.post { onSkip(id) }
                    return true
                }
                return super.dispatchKeyEvent(event)
            }
        }.apply {
            setBackgroundColor(Color.argb(160, 0, 0, 0))
            isClickable = true
            // Near the top, so the keyboard does not cover the text box or the buttons.
            addView(
                card,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    Gravity.TOP,
                ).apply { setMargins(dp(24), dp(96), dp(24), 0) },
            )
        }
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT,
        ).apply {
            softInputMode = WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE
        }
        try {
            wm.addView(scrim, params)
        } catch (e: RuntimeException) {
            AppStore.log("could not show the note prompt for record #$id over the screen: $e")
            return false
        }
        view = scrim
        input.post { showKeyboard(input) }
        AppStore.log("note prompt on screen for record #$id")
        return true
    }

    /** Asked for explicitly once the overlay has focus: the window's "keyboard visible" request alone is not enough. */
    private fun showKeyboard(field: EditText) = guarded("keyboard") {
        if (view == null || !field.isAttachedToWindow) return@guarded
        field.requestFocus()
        if (Build.VERSION.SDK_INT >= 30) {
            field.windowInsetsController?.show(WindowInsets.Type.ime())
        } else {
            service.getSystemService(InputMethodManager::class.java)?.showSoftInput(field, 0)
        }
    }

    private fun remove() {
        val v = view ?: return
        view = null
        try {
            windowManager?.removeView(v)
        } catch (e: RuntimeException) {
            // already gone
        }
    }

    /** Runs a UI callback; an error is logged (with where it happened) and the question removed, never thrown. */
    private fun guarded(what: String, block: () -> Unit) {
        try {
            block()
        } catch (t: Throwable) {
            AppStore.log("ERROR in note prompt ($what): ${t.javaClass.name} at ${t.stackTrace.take(3).joinToString(" < ")}")
            remove()
        }
    }

    private fun dp(v: Int) = (v * service.resources.displayMetrics.density).toInt()
}
