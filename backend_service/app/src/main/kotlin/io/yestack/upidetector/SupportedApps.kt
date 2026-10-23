package io.yestack.upidetector

/** The only apps the service reads. Keep in sync with packageNames in res/xml/accessibility_service_config.xml (a unit test checks). */
object SupportedApps {
    data class App(val packageName: String, val displayName: String)

    val all: List<App> = listOf(
        App("com.google.android.apps.nbu.paisa.user", "Google Pay"),
        App("com.phonepe.app", "PhonePe"),
        App("net.one97.paytm", "Paytm"),
    )

    val packageNames: Set<String> = all.map { it.packageName }.toSet()

    fun isSupported(packageName: String?): Boolean = packageName != null && packageName in packageNames

    /** Display name, or the raw package name for an unknown one. */
    fun displayName(packageName: String): String =
        all.firstOrNull { it.packageName == packageName }?.displayName ?: packageName
}
