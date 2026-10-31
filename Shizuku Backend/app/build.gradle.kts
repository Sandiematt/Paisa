plugins {
    id("com.android.application")
}

android {
    namespace = "io.yestack.upidetector"
    compileSdk = 37

    defaultConfig {
        applicationId = "io.yestack.upidetector"
        minSdk = 26
        targetSdk = 36
        versionCode = 2
        versionName = "0.1.0"
        // Platform runner (android.test), not AndroidX: the device test keeps the framework-only setup.
        testInstrumentationRunner = "android.test.InstrumentationTestRunner"
    }

    useLibrary("android.test.runner")
    useLibrary("android.test.base")

    buildTypes {
        release {
            isMinifyEnabled = false
            // Test build only: sign release with the debug key so it installs without a keystore.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
        // IShellService: the Shizuku user service that runs uiautomator as the shell user.
        aidl = true
    }
}

dependencies {
    // Framework-only on purpose: no AndroidX, Compose or Room, so the detector has
    // nothing between it and the platform Accessibility API while we validate it.
    // The one exception is Shizuku below, which the dump capture mode needs.
    implementation(project(":core"))
    // Dump capture mode only: runs `uiautomator dump` as the shell user, no root. Brings only androidx.annotation.
    implementation("dev.rikka.shizuku:api:13.1.5")
    implementation("dev.rikka.shizuku:provider:13.1.5")
    testImplementation("junit:junit:4.13.2")
}
