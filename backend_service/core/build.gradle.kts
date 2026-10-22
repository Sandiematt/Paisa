plugins {
    id("com.android.library")
}

// Pure-Kotlin detection logic (snapshot model, UpiTextParser, DuplicateDetector).
// Nothing in here may touch android.* so it stays testable on the JVM.
android {
    namespace = "io.yestack.upidetector.core"
    compileSdk = 37

    defaultConfig {
        minSdk = 26
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
