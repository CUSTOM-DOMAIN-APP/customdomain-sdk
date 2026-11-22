// Build file of the CustomDomain library: a View, a sheet, and the bridge, with Custom Tabs for sign in.
// minSdk 24; the unit tests run on the JVM and need no emulator.
// SPDX-License-Identifier: Apache-2.0
plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ai.customdomain"
    compileSdk = 34
    defaultConfig {
        minSdk = 24
        consumerProguardFiles("consumer-rules.pro")
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.browser:browser:1.8.0")
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("androidx.fragment:fragment-ktx:1.8.2")
    testImplementation("junit:junit:4.13.2")
    // The Android jar stubs org.json in unit tests; use the real one on the JVM.
    testImplementation("org.json:json:20240303")
}
