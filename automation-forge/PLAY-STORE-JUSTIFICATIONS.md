# Automation Forge — Play Store Permission Justifications
**Prepared:** 2026-11-24 | **App:** Automation Forge v4.2.1 | **Status:** Draft for first submission

## App summary (one line for reviewers)
Automation Forge is a local-first Android automation tool. All workflows run on-device. No user data is collected, stored, or transmitted except when the user explicitly configures an HTTPS webhook.

## Permissions declared

### 1. INTERNET
**Why needed:** The optional webhook step sends HTTPS requests to endpoints the user types in. No other network use exists by default.
**User benefit:** Users can trigger external services (e.g., home automation, notifications) from a scheduled workflow.
**Data:** Only the URL, headers, and body the user writes. Nothing is logged server-side by Forge.

### 2. POST_NOTIFICATIONS (Android 13+)
**Why needed:** The notify step displays a local notification when a workflow completes or hits a checkpoint.
**User benefit:** Users get visible confirmation that a background job finished without opening the app.
**Data:** Notification text is user-supplied. No analytics or remote push.

### 3. WAKE_LOCK (added automatically by WorkManager)
**Why needed:** WorkManager holds a partial wake lock while a worker runs so the CPU does not sleep mid-step.
**User benefit:** Long-running workflows (up to the 8-minute delay budget) complete reliably instead of being killed.
**Data:** None. Purely a runtime execution aid.

### 4. ACCESS_NETWORK_STATE (added automatically by WorkManager)
**Why needed:** WorkManager checks connectivity before running network-dependent steps like webhooks.
**User benefit:** Webhook steps skip or retry cleanly when offline instead of failing silently.
**Data:** None. Local OS state query only.

### 5. RECEIVE_BOOT_COMPLETED (added automatically by WorkManager)
**Why needed:** WorkManager reschedules persisted jobs after a device reboot.
**User benefit:** Repeating schedules survive restarts — the core value of an automation app.
**Data:** None. No boot-time network calls.

### 6. FOREGROUND_SERVICE (added automatically by WorkManager)
**Why needed:** WorkManager may promote a long-running worker to a foreground service with a persistent notification so Android does not throttle it.
**User benefit:** Users see a visible indicator that Forge is actively working, and jobs are less likely to be deferred by battery policy.
**Data:** None. The notification text is generated locally from the workflow name.

## Data safety form answers
- Data collected: None.
- Data shared: None.
- Data encrypted in transit: N/A (no collection).
- Data deletion: N/A.
- Independent security review: No.

## Webhook opt-in (policy declaration)
Webhooks are disabled by default. The user must explicitly add a webhook step and confirm the destination URL before any request is sent. The app refuses non-HTTPS URLs, private/local IP ranges, and does not follow redirects. This is declared in the Play listing description and in-app UI.

## Sensitive permissions NOT requested
- No location, camera, microphone, contacts, SMS, call log, or storage broad access.
- SAF import uses the system document picker with a user-granted URI only.
- No background location, no device admin, no accessibility service for input injection.

## Release notes (short)
Local-first automation builder with allow-listed steps, on-device audit log, and opt-in HTTPS webhooks. No data collection.
