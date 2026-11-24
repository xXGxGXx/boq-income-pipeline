# Automation Forge v4.2 · Autonomous Automation Core

## Included
- Android-native shell using WebView to bundle the v3 Forge interface offline.
- WorkManager native execution for queued workflows that persist across app exits/reboots, subject to Android scheduling.
- Allow-listed worker steps: `note`, `delay` (1–60 seconds), `notify`, and HTTPS `webhook`.
- Retry/backoff, progress data, Android notification channel.
- JS bridge `ForgeNative.enqueueWorkflow(json)` accepts `{ "steps": [...] }`.
- No arbitrary shell execution, dynamic code evaluation, arbitrary Intent launching, or remote JavaScript.

## Build
Open the project folder in Android Studio (or import it as a Gradle project). Use a current Android Studio/Gradle installation and JDK 17+. Sync Gradle, then build the APK.

This generated source project is provided; an APK is not prebuilt because this environment does not have a configured Android SDK/Gradle build toolchain.

## Integration API
From the WebView JavaScript, after checking `window.ForgeNative`:

```js
ForgeNative.enqueueWorkflow(JSON.stringify({
  steps: [
    {type: "note", text: "queued"},
    {type: "delay", seconds: 3},
    {type: "notify", text: "Finished"},
    {type: "webhook", url: "https://example.com/endpoint", body: "{}"}
  ]
}));
```

The native worker enforces a maximum of 30 steps and a per-delay cap of 60 seconds. Webhook URLs must use HTTPS. This is a starter integration API; the existing v3 UI does not yet expose a workflow-to-native queue button, so native enqueue calls currently require JavaScript integration or future UI wiring.

## Android background behavior
WorkManager persists queued work and schedules it around constraints and battery policies. Execution time is not exact and can be delayed by OS policy. A worker should be idempotent because retries can happen. Notifications require notification permission on Android 13+.

## v4.2 major upgrade
- **Quick visual workflow builder:** add `note`, `delay`, and `notify` steps directly from the native panel; undo last step or clear builder steps. JSON editor remains available for advanced edits and webhook steps.
- **Persistent execution audit:** SQLite-backed event log records start, step checkpoints, success, interruption and failure; latest events display in the companion panel.
- **Job controls:** existing WorkManager queue list and cancel controls remain available for one-time jobs and repeating schedules.
- **Webhook hardening:** HTTPS required, local hostnames and IPv4 literal targets rejected. Review destinations and payloads before execution.
- **Visual-first:** mobile-sized builder controls, import and schedule actions.

## Safety
The bridge intentionally exposes only an allow-listed workflow API. Do not expand to arbitrary shell commands, code execution, or unrestricted Intent dispatch. Review webhook destinations and payloads before enqueueing.
\n## Native v4 UI panel\n\nThe embedded Forge page now injects a Native Execution panel in the Android WebView. It checks whether the native bridge exists, provides a sample workflow JSON, and lets the user enqueue allow-listed jobs. The browser standalone shows a safe unavailable-state message.\n\n## Validation\n\nRun `node --check app/src/main/assets/app.js` and `node --check app/src/main/assets/native-bridge.js`. Android Gradle build and on-device validation are still required; this environment does not have the Android build toolchain.\n
## v4.1 additions
- **Repeat schedules:** repeating workflows use Android `PeriodicWorkRequest`; interval selection is clamped to Android WorkManager's 15-minute minimum and one-week maximum. System constraints may defer execution, so it is not an exact alarm.
- **Native job history and controls:** inspect tagged one-time and repeating jobs with their current WorkManager state, interval and ID; cancel a job/schedule by ID.
- **Android SAF import:** `Import v3 / JSON` opens Android's document picker. Selected JSON is read with the user-granted URI and imported into the editor; original file is not modified.
- **Direct v3 conversion:** accepts a selected v3 backup (`workspace.flows` or top-level `flows`) or workflow JSON. `WAIT: N` is converted to bounded native delay; `NOTIFY:` becomes notification; other v3 steps are converted to reviewable note/checkpoints. The conversion is intentionally conservative and does not claim to run the v3 toolbox commands natively.
- **Manual review:** imported native steps are displayed in the JSON editor before enqueue or scheduling.

Android scheduling is best-effort, subject to WorkManager/battery/system policy. The job list is WorkManager's active/recent tagged records, not an indefinite audit log. APK compilation/device testing still requires an Android SDK/Gradle environment.


## v4.2 implementation notes
SQLite audit is stored locally in `forge_history.db` and currently retains its event history until app data is cleared (no automatic retention policy yet). Each workflow records STARTED, STEP, SUCCEEDED, INTERRUPTED, or FAILED events. The visual builder intentionally supports basic native steps only; advanced JSON remains editable. Execution-history rendering is capped to 35 recent entries, with the API returning up to 150. Webhook destination checks are basic hostname/IP screening, not a full network-security boundary.

### Android build and test status
Static checks were performed on JavaScript, XML, archive structure and integration references. APK compilation and physical-device testing remain outstanding because Android SDK/Gradle are not installed in the build environment.
