package io.yestack.upidetector

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Test

class SupportedAppsTest {
    @Test
    fun accessibilityConfigPackageNamesMatchSupportedApps() {
        // Gradle runs unit tests with the module directory as working directory.
        val xml = File("src/main/res/xml/accessibility_service_config.xml").readText()
        val value = Regex("""android:packageNames\s*=\s*"([^"]*)"""").find(xml)?.groupValues?.get(1)
            ?: error("packageNames attribute not found")
        val configured = value.split(',').map { it.trim() }.filter { it.isNotEmpty() }.toSet()
        assertEquals(SupportedApps.packageNames, configured)
    }
}
