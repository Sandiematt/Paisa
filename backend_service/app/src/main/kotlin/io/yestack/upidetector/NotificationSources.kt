package io.yestack.upidetector

/**
 * Packages whose notifications are cross-checked against screen-detected payments: the supported UPI apps plus
 * the messaging apps that show bank SMS. Notifications never create transactions.
 */
object NotificationSources {
    private val messagingApps: List<SupportedApps.App> = listOf(
        SupportedApps.App("com.google.android.apps.messaging", "Google Messages"),
        SupportedApps.App("com.samsung.android.messaging", "Samsung Messages"),
        SupportedApps.App("com.android.mms", "Messages"),
    )

    val all: List<SupportedApps.App> = SupportedApps.all + messagingApps

    val packageNames: Set<String> = all.map { it.packageName }.toSet()

    fun isSource(packageName: String?): Boolean = packageName != null && packageName in packageNames

    /** True for the messaging apps, whose unparsable notifications are too frequent to log. */
    fun isMessagingApp(packageName: String): Boolean = messagingApps.any { it.packageName == packageName }

    /** Display name, or the raw package name for an unknown one. */
    fun displayName(packageName: String): String =
        all.firstOrNull { it.packageName == packageName }?.displayName ?: packageName
}
