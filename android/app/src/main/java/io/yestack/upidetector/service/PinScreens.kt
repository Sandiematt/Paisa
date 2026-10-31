package io.yestack.upidetector.service

/** UPI PIN entry screens (NPCI's common library), by Activity class. Never dumped. */
internal object PinScreens {
    private val MARKERS = listOf("pinactivitycomponent", "GetCredential")

    fun isPinScreen(screenClass: String?): Boolean =
        screenClass != null && MARKERS.any { screenClass.contains(it, ignoreCase = true) }
}
