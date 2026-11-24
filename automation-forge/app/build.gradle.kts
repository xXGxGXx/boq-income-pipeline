plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}
android {
    namespace = "com.automationforge.v4"
    compileSdk = 36
    defaultConfig {
        applicationId = "com.automationforge.v4"
        minSdk = 26
        targetSdk = 35
        versionCode = 43
        versionName = "4.2.1"
    }
    compileOptions {                       // Java and Kotlin must target the same JVM version, or the build stops
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
kotlin {
    compilerOptions { jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17) }
}
dependencies {
    implementation("androidx.core:core-ktx:1.16.0")
    implementation("androidx.work:work-runtime-ktx:2.10.1")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")     // real org.json for JVM tests (android.jar only has stubs)
}
