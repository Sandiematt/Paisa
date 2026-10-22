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
        versionCode = 1
        versionName = "0.1.0"
    }

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
    }
}

dependencies {
    // Framework-only on purpose: no AndroidX, Compose or Room, so the detector has
    // nothing between it and the platform Accessibility API while we validate it.
    implementation(project(":core"))
    testImplementation("junit:junit:4.13.2")
}
