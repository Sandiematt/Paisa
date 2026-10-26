package io.yestack.upidetector

import org.junit.Assert.assertTrue
import org.junit.Test

class NotificationSourcesTest {
    @Test
    fun containsEverySupportedAppPackage() {
        assertTrue(NotificationSources.packageNames.containsAll(SupportedApps.packageNames))
    }

    @Test
    fun containsMessagingApps() {
        listOf("com.google.android.apps.messaging", "com.samsung.android.messaging", "com.android.mms")
            .forEach { assertTrue(it, NotificationSources.isSource(it)) }
    }
}
