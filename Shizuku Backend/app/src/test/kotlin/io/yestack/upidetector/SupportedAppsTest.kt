package io.yestack.upidetector

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Test

class SupportedAppsTest {
    @Test
    fun manifestQueriesMatchSupportedApps() {
        // Gradle runs unit tests with the module directory as working directory.
        val manifest = File("src/main/AndroidManifest.xml").readText()
        val queries = Regex("""<queries>(.*?)</queries>""", RegexOption.DOT_MATCHES_ALL).find(manifest)?.groupValues?.get(1)
            ?: error("<queries> not found")
        val listed = Regex("""<package\s+android:name="([^"]+)"""").findAll(queries).map { it.groupValues[1] }.toSet()
        assertEquals(SupportedApps.packageNames, listed)
    }
}
