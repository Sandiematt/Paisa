package io.yestack.upidetector.ui

import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import io.yestack.upidetector.AppStore
import com.expense_tracker.R
import io.yestack.upidetector.SupportedApps

/**
 * Dialog shown after a successful payment: "what was this for?", only when the service's note overlay could not be
 * shown. The payment is already saved as an expense; Save adds the note to it and Skip (or Back) leaves it without one.
 */
class NoteActivity : Activity() {

    private var txnId = -1L
    private var input: EditText? = null
    private var reportedOpen = false
    private val answer = NoteAnswer()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AppStore.init(applicationContext)
        val id = intent.getLongExtra(EXTRA_TXN_ID, -1L)
        txnId = id
        val txn = AppStore.transactions.firstOrNull { it.id == id }
        if (txn == null) {
            finish()
            return
        }

        val title = TextView(this).apply {
            setText(R.string.note_title)
            OverlayStyle.title(this)
        }
        val details = TextView(this).apply {
            text = getString(
                R.string.note_details,
                txn.amount.toPlainString(),
                txn.merchant ?: getString(R.string.note_unknown_merchant),
                SupportedApps.displayName(txn.sourceApp),
            )
            OverlayStyle.body(this)
            setPadding(0, dp(4), 0, dp(12))
        }
        val input = EditText(this).apply {
            setHint(R.string.note_hint)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            imeOptions = EditorInfo.IME_ACTION_DONE
            maxLines = 1
            txn.note?.let { setText(it) }
            OverlayStyle.input(this)
        }
        val skip = Button(this).apply {
            setText(R.string.note_skip)
            setOnClickListener { skip() }
            OverlayStyle.secondaryButton(this)
        }
        val save = Button(this).apply {
            setText(R.string.save)
            setOnClickListener { save(id, input.text.toString()) }
            OverlayStyle.primaryButton(this)
        }
        input.setOnEditorActionListener { _, action, _ ->
            if (action == EditorInfo.IME_ACTION_DONE) save(id, input.text.toString())
            action == EditorInfo.IME_ACTION_DONE
        }
        val buttons = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.END
            setPadding(0, dp(16), 0, 0)
            addView(skip)
            addView(
                save,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                ).apply { setMargins(dp(10), 0, 0, 0) },
            )
        }
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(20), dp(20), dp(20))
            addView(title)
            addView(details)
            addView(input, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            addView(buttons, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        setContentView(root)
        window.setLayout((resources.displayMetrics.widthPixels * 0.9).toInt(), ViewGroup.LayoutParams.WRAP_CONTENT)
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE)
        input.requestFocus()
        this.input = input
    }

    override fun onResume() {
        super.onResume()
        if (!reportedOpen && txnId >= 0) {
            reportedOpen = true
            AppStore.noteScreenOpened(txnId)
        }
        // Asked for explicitly once the window has focus: the window's "keyboard visible" request alone is not always
        // honoured for an activity started from another app's screen.
        input?.let { field -> field.post { showKeyboard(field) } }
    }

    override fun onStop() {
        super.onStop()
        // Left without an answer (Home, another app): this screen is not in Recents, so treat it as Skip.
        if (!isChangingConfigurations && !isFinishing) skip()
    }

    override fun onDestroy() {
        try {
            if (reportedOpen && isFinishing) {
                // Back closes the screen without Skip or Save: that is a skip too.
                if (answer.take(NoteAnswer.Kind.SKIP)) AppStore.log("user skipped the note for record #$txnId")
            }
        } catch (t: Throwable) {
            logError("closing", t)
        }
        super.onDestroy()
    }

    private fun showKeyboard(field: EditText) {
        // Posted from onResume: the screen may have been answered and closed since.
        if (isFinishing || isDestroyed) return
        field.requestFocus()
        if (Build.VERSION.SDK_INT >= 30) {
            field.windowInsetsController?.show(WindowInsets.Type.ime())
        } else {
            getSystemService(InputMethodManager::class.java)?.showSoftInput(field, 0)
        }
    }

    /** Leaves the record as it is. Only the first answer counts: a second tap or Skip after Save does nothing. */
    private fun skip() {
        try {
            if (answer.take(NoteAnswer.Kind.SKIP)) AppStore.log("user skipped the note for record #$txnId")
        } catch (t: Throwable) {
            logError("Skip", t)
        }
        if (!isFinishing) finish()
    }

    /** Saves the note once; never after Skip, never twice. */
    private fun save(id: Long, note: String) {
        try {
            if (answer.take(NoteAnswer.Kind.SAVE)) AppStore.attachNote(id, note)
        } catch (t: Throwable) {
            logError("Save", t)
        }
        if (!isFinishing) finish()
    }

    private fun logError(what: String, t: Throwable) {
        try {
            AppStore.log("ERROR in note screen ($what): ${t.javaClass.name} at ${t.stackTrace.take(3).joinToString(" < ")}")
        } catch (ignored: Throwable) {
            // logging must never take the screen down
        }
    }

    private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    companion object {
        const val EXTRA_TXN_ID = "txn_id"
    }
}
