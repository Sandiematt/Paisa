package io.yestack.upidetector.service

/** What one read of a UPI app's windows amounts to. Plain Kotlin, so it is tested on the JVM. */
internal enum class ReadOutcome {
    /** At least one of the app's windows had text: a usable read. */
    CAPTURED,

    /** The app is on screen but none of its windows has text yet (Flutter publishes it a moment later). */
    NO_TEXT_YET,

    /** No window of the app is listed, and nothing says another app took over: a window in transition. */
    NOT_LISTED_YET,

    /** Another app's window is active and none of this app's is on screen: it was left (this app, the launcher, ...). */
    APP_LEFT;

    companion object {
        fun of(packageName: String, appOnScreen: Boolean, activePackage: String?, windowsWithText: Int): ReadOutcome =
            when {
                windowsWithText > 0 -> CAPTURED
                appOnScreen -> NO_TEXT_YET
                activePackage != null && activePackage != packageName -> APP_LEFT
                else -> NOT_LISTED_YET
            }
    }
}
