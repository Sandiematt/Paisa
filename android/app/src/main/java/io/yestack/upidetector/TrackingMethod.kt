package io.yestack.upidetector

import android.content.Context

/**
 * How the UPI apps' screens are read on this phone, chosen by the user when turning auto-tracking on. Device-wide (not
 * per Paisa user), like the system permissions behind it. Absent means [ACCESSIBILITY], the original method.
 */
enum class TrackingMethod(val key: String) {
    /** [io.yestack.upidetector.service.UpiAccessibilityService], enabled in Android's accessibility settings. */
    ACCESSIBILITY("accessibility"),

    /** [io.yestack.upidetector.service.DumpCaptureService], reading screens as the shell user through Shizuku. */
    SHIZUKU("shizuku"),
    ;

    companion object {
        private const val PREFS = "upi_tracking"
        private const val KEY_METHOD = "method"

        fun of(key: String?): TrackingMethod? = entries.firstOrNull { it.key == key }

        fun get(context: Context): TrackingMethod =
            of(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_METHOD, null)) ?: ACCESSIBILITY

        fun set(context: Context, method: TrackingMethod) {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_METHOD, method.key).apply()
        }
    }
}
