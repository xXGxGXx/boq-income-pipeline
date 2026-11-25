# Drive ID redaction rule

Raw Google Drive file or folder IDs (the 1[A-Za-z0-9_-]{24,43} pattern) must never be committed to this public repository.

## Why
An ID alone opens anything shared by link. privacy_scan.py flags them as cloud findings. Baselining them accepts the leak; redacting removes it.

## Where full IDs belong
Drive-side copies only: Ara Memory Backups folders (primary and backup), Handover Protocol docs, and any Drive-native file. The public repo gets placeholders like [redacted — primary Ara Memory Backups folder].

## When writing research or protocol notes
1. Read the Drive source.
2. Write the note with IDs masked or replaced by a short label.
3. Run privacy_scan.py --staged before committing. If a cloud finding appears, redact — do not baseline.
4. Baseline lines are for reviewed-but-unavoidable references in skill scripts and fixtures, never for notes you control.

## CI backstop
.github/workflows/checks.yml runs privacy_scan.py --tracked --baseline on every push to main. A raw ID that slips past local checks still fails the build.
