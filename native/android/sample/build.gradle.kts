// Build file of the sample app: one activity that opens the widget.
// SPDX-License-Identifier: Apache-2.0
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "ai.customdomain.sample"
    compileSdk = 34
    defaultConfig {
        applicationId = "ai.customdomain.sample"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation(project(":customdomain"))
    implementation("androidx.appcompat:appcompat:1.7.0")
}
