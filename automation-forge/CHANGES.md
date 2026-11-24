# Automation Forge 4.2.1 integration notes

This branch copies the 4.2.1 source and then disables two things the 4.2.1 build still did:

- Native webhook steps are rejected in `MainActivity.normalizeWorkflow` and `ForgeWorker`. `postWebhook` was removed. Hostname screening is not treated as a complete protection against a rebinding attack.
- The WebView only allows `file:///android_asset/index.html`. Other top-level loads are blocked. File access from the page, mixed content, and extra windows are off. The back button no longer walks WebView history.
- The bundled page no longer sends queued webhook payloads when it loads or when the network returns. A send still requires the on-screen confirm button.

Not done in that commit: Gradle unit tests, APK assembly, and a phone test.

## Build results for this hardened version (2026-11-24)
- Built in a Linux container with Gradle 8.14.3, JDK 21, Android SDK platform 36 and build-tools 35.0.0: `testDebugUnitTest` ran **7 tests, 0 failures**, and `assembleDebug` made a debug APK of about 2.9 MB.
- The same build runs on every push in `.github/workflows/checks.yml` (job "Automation Forge"). Each run keeps the debug APK and test reports as a downloadable artifact for 14 days.
- A Gradle wrapper (`./gradlew`, Gradle 8.14.3) is now included, so Android Studio and CI use the same Gradle version.
- Still not done: a test on a phone, and release signing.


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
