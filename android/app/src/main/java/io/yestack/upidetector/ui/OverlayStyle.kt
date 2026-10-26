package io.yestack.upidetector.ui

import android.content.Context
import android.content.res.ColorStateList
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import com.expense_tracker.R

/**
 * Paisa look for the views the detector builds in code (note overlay, spend-guard warning, note dialog): surface card
 * with a 22dp radius and a 1dp line border, a violet pill for the main action and a raised pill for the other.
 * Colours are the Paisa tokens in res/values/colors.xml. Styling only; no behaviour lives here.
 */
object OverlayStyle {
    private const val CARD_RADIUS_DP = 22
    private const val BUTTON_HEIGHT_DP = 48

    private fun Context.dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    /** Surface card, 22dp radius, 1dp line border. */
    fun card(context: Context): GradientDrawable = GradientDrawable().apply {
        setColor(context.getColor(R.color.paisa_surface))
        cornerRadius = context.dp(CARD_RADIUS_DP).toFloat()
        setStroke(context.dp(1), context.getColor(R.color.paisa_line))
    }

    private fun pill(context: Context, fill: Int, withBorder: Boolean) = GradientDrawable().apply {
        setColor(context.getColor(fill))
        cornerRadius = context.dp(BUTTON_HEIGHT_DP).toFloat() // fully rounded
        if (withBorder) setStroke(context.dp(1), context.getColor(R.color.paisa_line))
    }

    fun title(view: TextView, color: Int = R.color.paisa_text) = view.apply {
        textSize = 18f
        typeface = Typeface.DEFAULT_BOLD
        setTextColor(context.getColor(color))
    }

    fun body(view: TextView) = view.apply {
        textSize = 14f
        setTextColor(view.context.getColor(R.color.paisa_muted))
    }

    /** Violet pill with light text. */
    fun primaryButton(button: Button) = styleButton(button, R.color.paisa_violet, R.color.paisa_text, withBorder = false)

    /** Raised pill with a line border. */
    fun secondaryButton(button: Button) = styleButton(button, R.color.paisa_surface_raised, R.color.paisa_text, withBorder = true)

    private fun styleButton(button: Button, fill: Int, textColor: Int, withBorder: Boolean) = button.apply {
        val c = context
        background = pill(c, fill, withBorder)
        stateListAnimator = null
        isAllCaps = false
        textSize = 15f
        typeface = Typeface.DEFAULT_BOLD
        gravity = Gravity.CENTER
        minHeight = c.dp(BUTTON_HEIGHT_DP)
        minimumHeight = c.dp(BUTTON_HEIGHT_DP)
        minWidth = c.dp(96)
        minimumWidth = c.dp(96)
        setPadding(c.dp(20), 0, c.dp(20), 0)
        setTextColor(c.getColor(textColor))
    }

    /** Dark text box with a raised fill, matching Paisa's inputs. */
    fun input(field: EditText) = field.apply {
        val c = context
        setTextColor(c.getColor(R.color.paisa_text))
        setHintTextColor(c.getColor(R.color.paisa_muted))
        textSize = 16f
        background = GradientDrawable().apply {
            setColor(c.getColor(R.color.paisa_surface_raised))
            cornerRadius = c.dp(14).toFloat()
            setStroke(c.dp(1), c.getColor(R.color.paisa_line))
        }
        setPadding(c.dp(14), c.dp(12), c.dp(14), c.dp(12))
        backgroundTintList = null
        highlightColor = c.getColor(R.color.paisa_violet)
        setLinkTextColor(ColorStateList.valueOf(c.getColor(R.color.paisa_lavender)))
    }
}
