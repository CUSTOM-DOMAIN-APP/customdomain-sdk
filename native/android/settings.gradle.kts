// Gradle settings for the CustomDomain Android SDK: the library and a sample app.
// SPDX-License-Identifier: Apache-2.0
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "customdomain-android"
include(":customdomain", ":sample")
