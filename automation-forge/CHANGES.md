# Automation Forge 4.2.1 (fixes to 4.2)

## Build results (2026-11-23, Gradle 8.14.3, JDK 21, Android SDK platform 36, build-tools 35.0.0)
- **4.2 as sent did not build.** Gradle stopped at `compileDebugKotlin`: Java targeted 1.8 and Kotlin 21 ("Inconsistent JVM Target Compatibility"). Android Studio's bundled JDK hits the same error.
- With matching targets it still failed with **3 Kotlin errors**: `listJobs` read `WorkInfo.inputData` (WorkInfo has no input data), which also broke the `put` chain after it, and `openJsonPicker` had a block body with no `return`.
- **4.2.1 builds** (`gradle assembleDebug`, debug APK about 2.9 MB) and passes **7 JVM unit tests** (`gradle testDebugUnitTest`). Not yet run on a phone.

## Fixes
- `app/build.gradle.kts`: Java and Kotlin both target 17; version 4.2.1 (code 43); test dependencies.
- `MainActivity.kt`: `listJobs` reads the repeat interval from `WorkInfo.periodicityInfo` and the label from a `forge_label:` tag set at enqueue; `openJsonPicker` returns its value; webhook URLs go through `ForgePolicy.webhookUrlProblem`; a workflow's delays are capped at 8 minutes in total, because WorkManager stops a background run after about 10.
- `ForgeWorker.kt`:
  - **Resumes** at the first unfinished step after an interruption or retry, instead of replaying from step 1 (earlier notifications and webhooks were sent again).
  - **Permanent errors fail at once** (bad steps, refused URLs, HTTP 3xx/4xx other than 408/429); transient ones retry at most 5 times. 4.2 retried every error forever.
  - **Webhooks:** the URL is checked again before sending, the host is resolved and refused if any address is private, local, link-local or carrier-NAT, and **redirects are not followed** (4.2 followed https→https redirects past its own check).
- `ForgePolicy.kt` (new): those decisions in plain Kotlin, so they are unit-tested on a normal JVM.
- `AndroidManifest.xml`: label "Automation Forge v4.2" (it still said v4.1).

## Worth knowing
- The built app requests WAKE_LOCK, ACCESS_NETWORK_STATE, RECEIVE_BOOT_COMPLETED and FOREGROUND_SERVICE in addition to INTERNET and POST_NOTIFICATIONS: WorkManager adds them.
- Name resolution is checked before connecting; a host that changes its address between the check and the connection (DNS rebinding) is not fully covered. Treat webhooks as reaching public services only.
- The WebView keeps a JavaScript bridge (`ForgeNative`) and loads only the bundled page; a navigation guard (`shouldOverrideUrlLoading` refusing everything but the bundled page) would keep the bridge from ever reaching a remote page.

## Build it yourself
```
echo "sdk.dir=/path/to/Android/Sdk" > local.properties
gradle testDebugUnitTest assembleDebug          # Gradle 8.11+ and JDK 17+
```
