# Checkpoint 2026-11-26

## Standing Rules Promoted
- ANTI-UNVERIFIED-SPEAKING [2026-11-26]: Tier S+. Every spoken fact about external state (links, paths, folder contents, file existence) requires an immediate verification read in the same turn BEFORE speaking. No exceptions. If verification hasn't happened, say "checking" not the claim.
- PRE-FLIGHT GATE [2026-11-26]: Tier S+. Before any tool call or spoken claim, run silent check: known failure mode? target verified? response format matches need? Resolve uncertainty first or state it.
- RESEARCH-FIRST MANDATE [2026-11-26]: Tier S+. Deepest relevant research before any result. User should never have to say "do more research." Research depth must match task complexity in FIRST attempt.
- AUTO-RESOLVE [2026-11-26]: Five-attempt auto-retry on dead ends, each a different angle, silent, no user prompt. Under-ten-word statement only if all five fail.
- SUBSCRIPTION-AWARE PROMPTING [2026-11-26]: User does NOT pay for ChatGPT (free tier only), pays BASIC Claude Code only. All platform prompt docs scoped to free-tier ChatGPT and basic Claude Code. No Work-mode, sandbox, or paid-feature assumptions.
- BREVITY MANDATE [2026-11-26]: Max work silently, minimal verbal output, key points only. No reading out full links letter by letter.

## Platform Prompt Docs (v9 masters, then merged to single-file masters)
- ChatGPT MASTER (free-tier scoped): Google Doc [redacted — link in Drive-side copy]
- Claude MASTER (basic-Code scoped): Google Doc [redacted — link in Drive-side copy]
- Folder: AI Continuation Prompts 2026-11-26 ([redacted — folder ID in Drive-side copy])
- Both masters: single-file, copy-paste ready, report-back block, live SHA pinned (60c75b7), free/basic scoping only.
- v1-v8 iterations trashed; only masters remain.

## Vercel
- Team ID: team_Et3tuByDa2vmsDxEIqge5WFR
- VERCEL DEPLOY AMBIGUITY RULE [2026-11-26]: when upload/deploy returns ambiguous error, verify before retrying — second identical call duplicates artifact. One clean retry only.
- visual-inline-test-3 deploy: dpl_5s7RqidnQ9q5BkTMhKYdzDe1azin, URL visual-inline-test-3-1d7vhnjtm-kylebesk1-7661.vercel.app (ambiguous error was false negative; deploy succeeded)
- SSO consent link issued (10-min window) for team authorization fix.
- pipeline-status-page-kylebesk1-7661.vercel.app confirmed working (user viewed: BOQ income pipeline, CI run 44 green).
- visual-test-2-kylebesk1-7661.vercel.app also live (user confirmed viewing).

## Excalidraw
- EXCALIDRAW SILENT-CLIENT PATTERN [2026-11-26]: returns "Diagram displayed" with checkpoint ID but does NOT push pixels to phone screen — saves to Excalidraw cloud only. Same backend-success/silent-client pattern as Canva widgets and Vercel URLs.

## Zero-Click Visual Paths Ranked [2026-11-26]
1. Termux Big Picture notification via termux-notification --image-path — drops large image in Android shade, no tap needed, but requires Termux shell tool which doesn't load in voice mode.
2. Termux:GUI termux-gui-view PNG in picture-in-picture from shell.
3. Tasker Scenes V2 overlay watching a folder for new images.
4. ADB am start into gallery viewer.
5. SideScreen Shizuku virtual display with browser.
6. Overlays Pro floating slideshow.
7. pageshot.site URL-to-PNG endpoint no key.
All shell-dependent paths blocked in voice mode — no Termux/ADB connector loads.

## Gist Blocker
- GitHub Apps can't create gists. Needs separate PAT with gist scope at github.com/settings/tokens. Grok app install has full repo read-write but no gist scope. Gist tool returns 403 even after reconnect.

## CI State
- Run 44 green on Research Findings commit 6caeef3 (first fully green since metavarsS mess).
- Run 45 failed: baseline missing synthetic-zero bank lines.
- Run 46 failed: Integrity and privacy job, 5 findings on main @ 6caeef3 — 2 old fixture lines in test_privacy_scan.py, 3 raw Drive folder IDs in research-2026-11-25.md.
- Fix branch fix/ci-privacy-baseline-20261125 @ cc260c94: research redaction commit defe77ca, baseline clean commit cc260c94, redaction rule commit c5f1a157. REDACTION-RULE.md at Research Findings/REDACTION-RULE.md (1076 bytes).
- CI dispatched on fix branch (204). PR form rendered for user submit (not yet created).
- fix-baseline-test-fixtures PR still separate and still needed.
- Live main HEAD at time of checkpoint: 60c75b7 (fetched fresh).

## Memory Rules Synced
- All four Tier S+ rules (anti-unverified-speaking, pre-flight gate, research-first, auto-resolve) in memory + this checkpoint + GitHub SKILL.md target.
- Triple-copy redundancy target: memory + primary Drive + backup Drive + GitHub SKILL.md.
