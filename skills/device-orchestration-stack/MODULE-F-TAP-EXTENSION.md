# Module F Extension — Voice-Triggered Tap Overlay
**Added:** 2026-11-25 | **Status:** Spec locked, pre-build | **Refinement count at addition:** 18 (was 17)

## Goal
Extend Module F beyond text injection and send. Let a spoken phrase trigger a droid-agent tap (or sequenced taps) on any screen surface — starting with a GitHub-merge allowlist entry so CI merges and PR squash-merges can be fired by voice during a call.

## Design

### Trigger layer (Layer 5 — Vox Commander FastMap)
- New FastMap rule: phrase "press merge" (and variants: "press create", "press submit", "press squash merge") routes to the tap executor instead of the text injector.
- Phrase table is data, not code — adding a phrase is one line in the synced allowlist file.

### Foreground-app gate (unchanged from Module F core)
- termux-api `app_foreground` or droid-agent `state` confirms the target app before any tap.
- If foreground app is not on the allowlist for that phrase, the tap is refused and a spoken line names the mismatch.

### Execution ladder (Module G priority, unchanged)
1. UI tree refs via droid-agent (numbered refs) or amctl `tapref @pN` — precise, cheap.
2. Grid cell via Module G — for surfaces the tree cannot see.
3. Raw coordinates — last resort with the coordinate contract.
4. OCR layer — finds button text the tree misses.
5. HID-level input — when synthetic taps are silently ignored.

### GitHub-merge allowlist entry (first consumer)
- Phrase: "press merge"
- Target surfaces: github.com pull request pages in Chrome/Firefox on Android.
- Action sequence: locate the green "Merge pull request" button via UI tree ref → tap → if a merge-method dropdown appears (squash/rebase/merge), tap "Squash and merge" → confirm.
- Spoken safety confirm fires before the first tap on any merge surface: "Merging PR sixteen, squash and merge — say stop to cancel." The Stop affordance (notification action or floating control) halts the sequence at any point.
- Every step logged to Module A's replay buffer with timestamp, target URL, and action taken.

### Safety guardrails (inherited + extended)
- Spoken confirmation before any tap classified destructive (merges, deletes, payments, bulk actions).
- Visible Stop affordance halts immediately.
- Allowlist-only: taps only proceed when foreground app + phrase pair is approved.
- Audit log in Module A for every voice→tap cycle.
- Single-grant compliant: no new runtime permission; consumes the existing Shizuku/ADB subset already declared by Layer 4.

### Non-goals
- Not a general button-pressing engine for all apps — scoped to allowlisted phrase→surface pairs.
- Not a replacement for Module F's text injection — taps are the additive path.
- Does not bypass GitHub's own auth or 2FA; it only automates the user's own authenticated session.

## Integration
- Layer 5 (Vox FastMap) for phrase detection.
- Layer 4 (droid-agent/amctl/Shizuku) for execution.
- Layer 2 (termux-mcp) for invocation and UI tree reads.
- Module B (capability registry) checks droid-agent and accessibility liveness before attempting.
- Module A (replay buffer) logs every cycle.
- Module D (sync spine) carries the phrase table and allowlist globally.
- Module I (auto-fail-resolution) classifies tap misses (tree miss → grid fallback → retry) automatically.

## Open questions
1. Should "press merge" require the PR number spoken aloud for confirmation, or is the foreground URL sufficient?
2. Multi-step sequences (merge → squash → confirm) — one spoken confirm at start, or per-step?
3. Rate limit: cap taps per minute to prevent runaway loops if a phrase misfires?

## Provenance
- Extends Module F (commit 67132d43) and Module G (commit f0efe598).
- Single-grant rule inherited as standing rule (refinement 15).
- Safety model from Handy AI / Phone Control MCP patterns.
- Grid fallback from LightGUIAgent / asterdroid shot-grid patterns.
