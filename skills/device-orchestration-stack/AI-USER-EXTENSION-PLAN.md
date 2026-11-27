# AI User Extension: design plan

**Date:** 2026-11-27 | **Status:** Plan, pre-build | **Extends:** [`DESIGN.md`](DESIGN.md) and [`MASTER-ORCHESTRATOR-REFERENCE.md`](../../MASTER-ORCHESTRATOR-REFERENCE.md) (Layers 1–7, Modules A–I)
**Evidence:** [`research/ai-user-extension-research-2026-11-27.md`](research/ai-user-extension-research-2026-11-27.md). Every tool choice below is backed there with a source; claims the research couldn't confirm are marked there.

---

## 1. What we are building

An assistant that works like an extension of the owner: one panel on the phone (and a matching one on the PC) that can do most things the owner can do with their hands, and find things faster than the owner can.

| The owner asked for | What that means in this design |
|---|---|
| Search, source, pull and provide from local, permitted and online sources | **Finder**: one `search` tool across the phone, PC, Drive, Gmail, GitHub and the web, with citations, a privacy router and a verifier (§6) |
| Press the screen: open dropdowns, open/close tabs, type, write in text bars, open files and folders, select on-screen items | **Hands**: one action vocabulary (`tap`, `type`, `open`, `select`, `scroll`, `close`) that works on the phone, the browser and Windows, choosing the most reliable way to do each (§5) |
| Typed and voice commands equally effective and efficient | **One intent pipeline**: voice becomes the same `InputEvent` as typing before anything else happens, and parity is measured (§4) |
| Searches and other requests done better than the owner could | Parallel multi-engine search, claim checking, and a stopwatch: every task type is timed against the owner's own baseline (§10) |
| Always learn and improve at finding, storing, moving and providing | **Learning loop**: episodes become macros, macros become tested skills, weekly evals decide what ships (§8) |
| Use every tool, agent, connector, MCP server and skill available | Everything is an MCP tool behind one broker, discovered through the Module B capability registry, so new tools plug in without redesign (§3, §7) |

**Design principles (in priority order):**
1. **Private stays private.** Personal data never reaches a public place or an unvetted cloud. This beats every other goal.
2. **API before pixels.** Use an app's API, intent or deep link first; the accessibility tree second; vision only when nothing else works. Pixel tapping is the least reliable way to act.
3. **Verify every action.** Re-read the screen or the resource after each step. No step counts as done until its check passes.
4. **Same brain for every input.** Voice, text, share-sheet, notification and schedule all enter one pipeline.
5. **Earn autonomy.** A new procedure asks before running; it runs unattended only after it has proven itself, and never for irreversible actions.
6. **Measure, then improve.** Changes ship only when the owner's own eval set says they help.

## 2. How it fits the existing design

This plan doesn't replace the Master Orchestrator. It is the user-facing product on top of it, and it updates some earlier choices that the research overtook.

| Existing piece | Role here | Change |
|---|---|---|
| Layer 1 Termux (+ proot) | Phone runtime for the broker and Finder | none |
| Layer 2 termux-mcp | Replaced by our own small phone MCP server | wujie272 repo has no LICENSE file and is early; borrow its Shizuku→ADB fallback idea only |
| Layer 3 Desktop Commander Remote | PC files and shell | Treated as optional, behind T2 confirmation: it relays through a hosted endpoint |
| Layer 4 DeVA / droid-agent / Shizuku | Phone Hands | **AccessDroid (404) → Mobilerun Portal**; droid-agent kept, upgraded to 0.3.0, given a Shizuku (`rish`) backend |
| Layer 5 Vox Commander | Router (FastMap → local model → cloud) | Now reads all speech alternatives, not just the top one |
| Layer 6 Base44 Superagent | Optional cloud extra | Not core: hosts private data, untrusted content and an outbound channel together (the "lethal trifecta") |
| Layer 7 Hermes-style multi-agent | Parallel searchers and workers inside the orchestrator | Hermes's self-rewriting skills are not adopted; skills change only through the §8 gate |
| ARGUS pattern | Approval for learned skills (§8) | Pattern adopted; code not copied (GPL-3.0) |
| Module A replay buffer | Episode log, the raw material for learning | Hash-chained; **stored privately, never in this repository** |
| Module B capability registry | Tool discovery and liveness | Also records each tool's pinned definition hash |
| Module C media hook | Media lane in Finder (§6.5) | none |
| Module D sync spine | Private Drive sync of settings, skills and memory | **GitHub only for code and synthetic data**; see §11 |
| Module E code interpreter | Sandbox for skill tests | none |
| Module F voice-to-chat | The first Hands skill; becomes one consumer of the pipeline | Recogniser fixed: on-device mode, name biasing, all alternatives |
| Module G grid | Last-resort vision fallback | Zoomable; used only when the tree is empty |
| Module H semantic memory | Memory (§8.1) | Adds provenance, trust tiers and negation-aware dedup |
| Module I auto-fail-resolution | Recovery inside each step | A repair creates a new skill version, never an in-place edit |
| `orchestrator/` (preflight, risk and budget gates, evidence ledger) | **The gatekeeper**: every action passes its gates and is recorded in its ledger | Gains the T0–T4 risk tiers (§9) |
| `automation-forge/` | Host for the companion app (mic, push-to-talk, confirmations, kill switch, overlay panel) | New screens, still webhooks off |
| Single-grant rule | Kept at the operating-system level | Inside the system, each skill gets only the scopes it declares (§9) |

## 3. Architecture

```
            ┌──────────── Inputs ────────────┐
 typed text │ voice (push-to-talk, optional  │ share-sheet, notification,
 in panel   │ wake word)                     │ schedule, PC side panel
            └───────────────┬────────────────┘
                            ▼
               InputEvent {text, alternatives[], confidence,
                           modality, t_start, t_end, screen_ref}
                            ▼
   Router:  FastMap rules ─► on-device model ─► cloud planner
            (≤20 ms)         (intent, sensitivity)  (plans multi-step tasks)
                            ▼
   Planner writes a fixed plan over allowlisted tools (plan-then-execute)
                            ▼
   Gatekeeper (orchestrator): risk tier, budget, taint, pinned tool hash
                            ▼
   ┌──────────── Tool broker (MCP) ─────────────────────────────┐
   │ Hands: phone · browser · Windows   Finder: local · connectors · web │
   │ Media lane · Office skills · Automation hub (long tail)     │
   └────────────────────────────────────────────────────────────┘
                            ▼
   Verify (re-read state) ─► Respond (short text or speech + sound)
                            ▼
   Record: evidence ledger + episode log ─► nightly learning loop
```

**Where each part runs:**

| Machine | Runs | Why there |
|---|---|---|
| Phone: companion app (Automation Forge) | Mic and push-to-talk, VAD and speech recognition, TTS, the floating panel, confirmation prompts, the kill switch | Needs Android permissions and a UI; keeps raw audio on the phone |
| Phone: Termux | Phone MCP server (Hands for the phone), local Finder index, FastMap, on-device model calls | Already installed; Shizuku gives it shell-level reach |
| Phone: Mobilerun Portal APK | Live accessibility tree, numbered overlays, Unicode keyboard | Faster and more complete than `uiautomator dump` |
| PC (Windows) | Orchestrator (gatekeeper, router, ledger, job store), Playwright MCP, Windows-MCP, Desktop Commander, the larger Finder index, Claude Agent SDK workers | More CPU, always-on option, browser and Windows control |
| Network between them | Tailscale only; nothing bound to public interfaces | Phone and PC reach each other privately |
| Cloud | Model APIs, Google Workspace MCP, GitHub MCP, web search APIs, optional realtime voice | Only redacted or owner-approved data goes here |

If the PC is off, the phone runs a reduced mode: phone Hands, the phone index, connectors and web search, with the planner called directly from Termux.

**Protocols:** MCP (2026-07-28 revision, streamable HTTP) for every tool boundary; AGENTS.md and SKILL.md for instructions shared across assistants; native Android notifications for approvals. A2A and AG-UI are skipped until there are outside agents to talk to.

## 4. Inputs: voice and typing at parity

### 4.1 One pipeline
Typing produces `InputEvent{confidence: 1, alternatives: [text]}`. Voice produces the same object with the recogniser's alternatives and confidence. Everything after that point (normaliser, router, gates, tools, logs, tests) is shared, so a FastMap rule or a fix works for both.

### 4.2 Voice stack

| Stage | Default (on the phone) | Cloud option | Target |
|---|---|---|---|
| Trigger | Push-to-talk: notification button, quick-settings tile, headset button, home-screen widget | — | listening within 150 ms |
| Wake word (optional, off by default) | sherpa-onnx keyword spotting (no training, Apache-2.0) | — | — |
| Voice activity | Silero VAD; Smart Turn v3 to decide the owner has finished | — | end detected 200–300 ms after speech stops |
| Recognition | **Now:** Android on-device recogniser with name biasing (`EXTRA_BIASING_STRINGS`) and all alternatives. **Next:** Moonshine v2 streaming, or sherpa-onnx streaming with weighted hotwords when names matter | GPT-Realtime-Whisper ($0.017/min) | partial text every 200 ms |
| Second pass (optional) | Parakeet TDT v3 on the final utterance, off the critical path | — | ≤300 ms |
| Speech out | Kokoro installed as the system TTS engine (so `termux-tts-speak` uses it), plus short sounds instead of words where possible | — | first audio ≤150 ms |
| Full conversation mode (optional) | — | Gemini 3.8 Live, tools mapped to the same router | — |

End-to-end targets: a FastMap command acts within **600 ms** of the owner stopping speaking; a model-routed command within **1.2 s**.

### 4.3 Rules that close the gap between voice and typing
1. **One name list, two jobs.** Contacts, app names, folder names and command verbs feed both the recogniser's biasing and the router's sound-alike matching. Most voice-only failures are misheard names.
2. **FastMap checks every alternative**, not just the top transcript.
3. **Repairs edit, not restart.** "No, I mean Chicago" changes the pending action's field. Fillers are removed by rules; the on-device model is used only when a repair word appears.
4. **Ask a choice, not "repeat that".** Low confidence on a risky action gets "Sam Lee or Pam Li?".
5. **"This" and "that" mean what was on screen when the owner started speaking** (`t_start`), not when they finished.
6. **Commit words for dictation** (Module F's "press send", plus "cancel" and "scratch that") so long messages are never cut off.
7. **Hands-free continuous listening only for dictation** that needs a commit word; never for T2+ actions.

## 5. Hands: acting on screens

### 5.1 One action vocabulary
`open(target)`, `tap(target)`, `type(target, text)`, `select(target, option)`, `scroll(direction, until)`, `close(target)`, `back()`, `read(target)`, `wait_for(condition)`. Each surface implements it differently; the planner never sees pixels unless it has to.

### 5.2 How each action is done: the targeting ladder
Tried in order, cheapest and most reliable first; the first that works wins, and the choice is logged so the learning loop knows what works for each app.

1. **API or connector** (Drive, Gmail, GitHub through MCP).
2. **Intent, deep link or AppFunction** (`am start -a VIEW -d <url>`, share intents, Android AppFunctions where an app offers them).
3. **Accessibility-tree reference** (Portal or droid-agent numbered refs, matched by text, role and position).
4. **Set-of-Mark screenshot**: numbered boxes drawn on a screenshot, chosen by a vision model.
5. **Grid zoom** (Module G): coarse cell, then zoom into the cell for precision.
6. **Raw coordinates** with the resize contract.

### 5.3 Phone

| Need | How |
|---|---|
| The single grant | **Shizuku** (official, or the `thedjchi` fork for start-on-boot and a watchdog). Wireless debugging only to start Shizuku |
| Run actions | `rish -c "input …"`, `am start`, `cmd package` |
| Read the screen | Mobilerun Portal's local API (live tree, overlays); fallback `rish -c "uiautomator dump"` and `screencap` (no MediaProjection prompt) |
| Type any text, including emoji and accents | Portal's keyboard (base64 Unicode) → `ACTION_SET_TEXT` → clipboard + paste |
| Agent tool layer | droid-agent 0.3.0's tool design (`tap_text`, `type_into`, `wait_for`, `scroll_until`, `--confirm` mode) with a new `rish` backend |
| Open and close tabs and apps | Intents and `am` first; recents and close buttons through the tree second |
| Dropdowns | Tap to open, re-read the tree, tap the option, re-read to confirm the value changed |
| Files and folders | Termux file access under `/sdcard`; `am start` with a content URI to open in the right app; SAF picker for user-granted folders |

Portal needs Accessibility and overlay permission. Shizuku's shell access can switch these on without a Settings visit, so the owner still grants once. That is the first thing to test (§12, Phase 1).

### 5.4 Browser

| Use | Tool |
|---|---|
| Orchestrator-driven web tasks (open/close tabs, fill forms, native dropdowns, upload files) | **Playwright MCP** on the PC, attached to a **separate agent Chrome profile** with no banking or password-manager logins |
| Personal, logged-in browsing the owner starts | Claude in Chrome on the PC (strongest published injection defences); from the phone via Dispatch |
| Token-cheap scripted browsing | agent-browser CLI |
| Browser on the phone | Through phone Hands (Chrome is just another app); Gemini auto browse only where available (US, AI Pro) |

### 5.5 Windows

| Use | Tool |
|---|---|
| Native app GUI | **Windows-MCP** (UI Automation tree, screenshot fallback, tool allowlist), reachable only over Tailscale |
| Files and shell | Desktop Commander (local mode preferred over the hosted relay) |
| Apps UI Automation can't read | Claude desktop computer use as a vision fallback |
| Containment | Microsoft Execution Containers or a VM for anything unattended |

### 5.6 Every step is verified
After each action the tool re-reads the tree, page or resource and compares it with the expected change (text present, value selected, tab count changed, file exists with the right hash). Waiting is by "screen stopped changing for 300–500 ms", never fixed sleeps. Two failed checks: back off, try the next rung of the ladder, then relaunch the app. Three: stop and tell the owner what was tried (Module I).

## 6. Finder: search everything

### 6.1 One tool
`search(query, scopes, since, depth)` sends the query in parallel to the sources allowed for it, normalises every hit to `{title, snippet, uri, source, modified, sensitivity, retrieved_at}`, merges them by reciprocal rank fusion, reranks, and returns an answer with a citation on each claim.

### 6.2 Privacy router (runs first, on the phone)
1. The on-device model tags the query: **personal** (mentions "my", a contact, a file, a place in the owner's life, media), **public**, or **mixed**.
2. Personal queries go to the local index and connectors only. **They never reach a web search API.**
3. Mixed queries run local and connectors first; then an **egress scrubber** (built on `scripts/privacy_scan.py`'s rules) strips names, emails, paths and private terms from the web part. If it can't be cleaned, the web part is skipped and the owner is told.
4. Private results and web results are merged inside the broker, never by sending private snippets to a web provider.

### 6.3 Sources

| Source | Stack |
|---|---|
| Phone files | SQLite FTS5 + sqlite-vec index of `/sdcard` (Documents, Download, DCIM), EmbeddingGemma embeddings at 256 dimensions, re-indexed incrementally while charging; ripgrep-all as the no-index fallback |
| Photos and video | MobileCLIP-style image embeddings (or PicQuery), keyframes every few seconds for video; transcripts from whisper.cpp or Moonshine with timestamps |
| PC files | Same index format, larger; Everything (`es.exe`) for instant file names |
| Cloud accounts | Google Workspace MCP (Drive, Gmail, Calendar), GitHub MCP, Box MCP, read-only scopes |
| Web | **Primary:** Brave Search (own index, freshness) and Parallel Search (cheap, accurate). **Multi-hop fallback:** Google-backed results (Gemini grounding or SerpApi). **Inside Claude:** Anthropic web search and web fetch for citations |
| Past answers | Search history, stored locally and checked first; re-checked when older than the topic's shelf life (about 7 days for prices, 90 days for docs) |

### 6.4 Depth levels

| Depth | Does | Typical cost (search fees only) |
|---|---|---|
| `quick` | 1–2 searches, top results read | $0.001–0.02 |
| `check` | 2 engines, 3–5 searches, 2–3 pages read, claims cross-checked | $0.02–0.07 |
| `research` | Planner splits into sub-questions → parallel searchers on two engines → dedup and credibility scoring → reader → **claim-by-claim verifier** → cited write-up; budget cap set per run | $0.15–0.60 plus model tokens |

The verifier is not optional at `research` depth: published deep-research systems cite sources that don't support the claim 20–60% of the time.

### 6.5 Media lane
The owner's notes ask for finding specific scenes, segments and moments by text or voice, and trimming or piecing clips together. This runs inside the existing Media Hub rules:
- Scene search uses the keyframe embeddings and timestamped transcripts above, **on the owner's own devices only**.
- Edits (trim, join, re-encode for playback) always write **new files**; originals are never changed, and SHA-256 hashes prove it (`media-hub-master` skill).
- Nothing from the library is committed, uploaded to a public place, or sent to a cloud model.

### 6.6 Providing results
Answer first in two to four sentences, a citation on each claim, "unverified" where sources didn't agree, a comparison table when sources conflict, and one tap to save the result (with its sources and timestamp) to the owner's private Drive.

## 7. Brain: models and routing

Route by task type and sensitivity, not per prompt, and keep each route's system prompt and tool list byte-stable so prompt caching keeps working.

| Task | Model tier |
|---|---|
| Sensitivity tagging, PII redaction, notification triage, anything touching raw private data | On the phone: Gemma 4 E2B on LiteRT-LM, or Gemini Nano where available |
| FastMap misses, intent extraction, short summaries of redacted text | Haiku 5.5 (or Gemini Flash-Lite) |
| Tool-using loops: phone, browser and Windows tasks | Sonnet 5.5 (or Gemini 3.5 Flash) |
| Planning multi-step tasks, code, high-stakes checks | Opus 5.5 |
| Second opinion on a disputed or high-stakes result | Fable 5.2, or another vendor's top model |
| Real-time social / X content | Grok (existing orchestrator route) |
| Cited web answers when Finder is unavailable | Perplexity |

The existing orchestrator stays the gatekeeper. Pydantic AI is the suggested library for typed tools and model-agnostic calls inside it; the Claude Agent SDK runs sandboxed code and file workers on the PC; a SQLite job table with idempotency keys (or DBOS) gives durability without running a server.

## 8. Learning loop: always improving

### 8.1 Memory (Module H, revised)
- **Layers:** raw episodes (kept verbatim) → facts → a small always-loaded profile (about 200 lines, owner-reviewed) → everything else retrieved on demand.
- **Every fact carries:** source episode, source type (`user_said`, `user_confirmed`, `inferred`, `tool_output`, `external_content`), confidence, sensitivity, and the four timestamps already in Module H.
- **Content from web pages, screens or other chats can never write instructions,** create skills, or enter the always-loaded profile. This is the defence against memory poisoning.
- **Dedup checks for negation.** Cosine ≥0.95 → no-op only if neither statement negates the other; 0.80–0.95 goes to the model to decide.
- **Exact values are quoted verbatim** (amounts, paths, names).
- **Forget means everywhere:** facts, embeddings, skills, eval items and Drive backups.
- **Writes during a task:** only explicit "remember this" and corrections. Everything else waits for the nightly pass.

### 8.2 Skill ladder

| Level | How a procedure gets here | How it runs |
|---|---|---|
| L0 trace | Every run is logged (Module A) | — |
| L1 candidate macro | Same intent succeeded 2–3 times, or one demonstration plus "save this". Slots parametrised, precondition (app + screen signature) and postcondition recorded | Asks before every run |
| L2 verified skill | Passes 5+ varied sandbox or dry-run replays with deterministic postconditions. Exported as SKILL.md plus script. If it has side effects, the owner approves a summary generated from its typed definition, frozen with a SHA-256 fingerprint (ARGUS pattern). An irreversible step with under-determined parameters is refused | Runs on request; any edit needs re-approval |
| L3 trusted | 10+ real successes with no undo, reversible actions only | May run unattended. Irreversible actions always ask |
| Demotion | Any undo or failed postcondition | Back to L1 |

Lessons in plain language ("this app hides Send until text is typed") are stored separately with vote counts and expire when unused.

### 8.3 Nightly pass
Consolidate facts and fix contradictions; reflect on the day's failures and propose prompt or skill changes (GEPA-style); nominate L1 candidates; re-index changed files; refresh the capability registry.

### 8.4 Router learning
Replace the auto-continue loop's decaying weights with a Thompson-sampling bandit per task category, rewarded by real outcomes (postcondition passed, no undo), not by a model's own score.

### 8.5 Measuring improvement (weekly)
- **Personal eval set:** 50–150 of the owner's real past tasks, split across find / store / move / provide / act, with a **hidden held-out part** the optimiser never sees. Checked deterministically where possible (right file, right hash, right field value).
- **Memory probes** from confirmed facts, including "has this changed?" and "you don't know this" questions.
- **Live metrics:** first-try success, corrections and undos per task, abandonment, time to result against the owner's own baseline, cost per success, macro replay success, voice/typed parity.
- **Weekly report** to the owner's private Drive, plus a 10-item spot check by the owner.
- **Shipping rule:** a change ships only if no category regresses beyond noise; it goes to about 10% of matching tasks first, the previous version is kept, and rollback is automatic.

### 8.6 Who approves self-changes

| Tier | Approval | Covers |
|---|---|---|
| S0 | Automatic | Explicit memory writes, router weight updates within bounds |
| S1 | Automatic with canary and rollback | Prompt changes that pass the held-out set; new L1 macros (still confirm each run) |
| S2 | One tap, with the diff and eval evidence shown | L2/L3 promotions with side effects; changes to the always-loaded profile; new tools or models |
| S3 | Explicit owner approval (AGENTS.md rule 5) | The evaluator, judge prompts, eval set, privacy scanner, allowlists, sandbox, grant scope, architecture swaps (Refinement 19) |

The optimiser can never read or edit its own evaluator: self-improving systems have been caught gaming checks they could see.

The auto-continue loop's stop rule changes from "no improvement named" to "no improvement measured", because a model asked to name an improvement will always find one.

## 9. Safety and privacy

### 9.1 Action risk tiers

| Tier | Examples | Confirmation | Extra controls |
|---|---|---|---|
| T0 read | Read files, Drive, email, screen; search | None, logged | Becomes T2 if the data is about to leave the device |
| T1 reversible write | Draft, edit in an allowlisted folder, commit to a branch, edit a Drive file with history | None per action; daily digest; one-tap undo | Allowlisted paths; undo window |
| T2 external send | Send a message or email, post, share a link, push to `main`, submit a form | Per action, on the phone, showing exact recipient and content; cancels by default after a few seconds of silence | Blocked if the plan contains untrusted ("tainted") data unless re-confirmed; egress allowlist |
| T3 irreversible or privileged | Delete, force-push, uninstall, change settings or permissions, install an APK or MCP server | Confirmation + biometric + a dry-run diff; short cooldown | Pinned tool hashes; snapshot first |
| T4 financial or identity | Payments, transfers, bank or payout details, passwords, 2FA codes | **Never executed by the assistant**; at most a draft for the owner | Banking and payment apps hard-denied to Hands; credentials never in model context |

### 9.2 Prompt-injection defence
- **Plan, then execute:** the planner sees the owner's request and typed summaries, and fixes the plan before reading untrusted content.
- **Quarantined reader:** a separate model call reads raw web pages, screens and emails and returns only schema-checked values; it has no tools.
- **Taint tracking:** anything derived from untrusted content is tagged; tagged data can't reach a T2+ action without a fresh confirmation.
- **Break the lethal trifecta:** no single session holds private data, untrusted content and an unconfirmed outbound channel at once.
- **Pinned tools:** each MCP tool's definition is hashed when approved; a changed definition is blocked until re-approved (stops "rug pulls").
- **Third-party skills and MCP servers** are reviewed before install, never auto-installed.

### 9.3 Device and account hygiene
- Keep the phone's security patch level current (a wireless-ADB remote-code bug was patched in May 2026). Turn wireless debugging off when Shizuku doesn't need it.
- Shizuku access only for the Termux broker and the companion app.
- Android Advanced Protection blocks unverified apps from the Accessibility API. The owner has to choose: leave it off, or rely on Shizuku paths without Portal. Recorded as an open decision (§13).
- Secrets live in the Android keystore, environment variables or an egress proxy, never in prompts, logs or this repository (names only, per AGENTS.md).
- **Kill switch:** one notification action stops the broker, revokes Shizuku for the session, cancels queued jobs and logs out tool tokens.

### 9.4 Data rules
- Raw audio, screen contents, notifications, contacts, photos and location stay on the owner's devices.
- PII is redacted on the phone before any cloud call (Presidio plus per-source field allowlists); reversible placeholders only where the reply must be filled back in, with the mapping kept local.
- A per-source consent manifest records what each source may be used for, which model tiers may see it, and how long it is kept. Payout and banking folders are unreadable, matching the scanner rule.
- The ledger keeps hashes and redacted summaries, not raw content.

## 10. "Better than the owner": how it's measured

| Measure | Target by end of Phase 5 |
|---|---|
| First-try success on the personal eval set | ≥85% overall; ≥95% on find/provide |
| Time to result vs the owner doing it by hand (same tasks, timed once as a baseline) | Faster on ≥80% of task types |
| Voice vs typed: same intent chosen | ≥98% of the typed score |
| Spoken command → action (FastMap path) | ≤600 ms |
| `research`-depth claims supported by their cited source (spot-checked) | ≥95% |
| Undo or correction rate | Falling week on week |
| Private data reaching a web API or public place | **Zero**, enforced by tests, not by hope |

All numbers reported in the weekly file must come from this repository's code and name the commit that produced them.

## 11. Changes to existing documents this plan recommends

Proposed here, not yet applied; each needs the owner's OK:
1. **Module D and the Drive-checkpoint skill** name GitHub as a fallback or canonical copy for the replay buffer, sync state and checkpoints. This repository is public, so episodes, facts and macros must never go there. Proposed: fail closed (queue locally, alert the owner) when Drive is unreachable.
2. **Module F:** switch to the on-device recogniser with biasing and all alternatives (via the companion app), feed alternatives to FastMap.
3. **Layer 4 / Module F README:** record Mobilerun Portal as the replacement for AccessDroid; add the droid-agent `rish` backend.
4. **Auto-continue loop:** stop on "no measured gain"; replace decaying weights with the bandit in §8.4.
5. **Module H:** add the provenance, trust-tier and negation rules in §8.1. Two numbers in the current text ("verbatim beats extraction by 16–22 points", "~55% → 96%" in Module I) need sources or an "unverified" label.

## 12. Build plan

Each phase ends with tests that run in CI (no phone needed) plus a short on-phone checklist. Nothing is called done until its checks pass, and results are reported as the exact numbers seen.

| Phase | Builds | Exit criteria |
|---|---|---|
| **0. Foundations** | `InputEvent` schema; the T0–T4 policy engine inside the orchestrator's preflight; hash-chained episode log (private path); egress scrubber reusing `privacy_scan.py` rules; personal eval-set format with a held-out split | Unit tests for every tier decision and the scrubber; a test proving a personal query can't reach a web call |
| **1. Phone Hands** | **First task: test on the phone** that Portal answers Termux on localhost and that Shizuku can enable its accessibility service. Then: phone MCP server in Termux; droid-agent with a `rish` backend; the targeting ladder; verify-after-act; open/close apps and tabs, dropdowns, Unicode typing, open file in app | 30-task phone suite (synthetic data) runs; ≥80% first-try on the owner's phone; Module F moved onto the new Hands |
| **2. Finder** | Local index (FTS5 + sqlite-vec + EmbeddingGemma) on phone and PC; connectors; web broker (Brave + Parallel, Google-backed fallback); `quick` / `check` / `research` depths with the verifier; search history cache | Retrieval tests on synthetic documents; citation-support spot check ≥95%; zero private-data egress in tests |
| **3. Voice parity** | Companion app in Automation Forge: push-to-talk, on-device recogniser with biasing and alternatives; then Moonshine or sherpa-onnx streaming; Kokoro TTS; repairs and choice questions | Parity eval (same command set typed and spoken, synthetic voices plus real recordings) ≥98%; FastMap path ≤600 ms on the phone |
| **4. PC and browser** | Tailscale-only links; Playwright MCP with a separate agent profile; Windows-MCP with an allowlist; Desktop Commander local mode; reduced mode when the PC is off | 20-task browser suite and 10-task Windows suite pass; nothing listens on a public interface (tested) |
| **5. Learning loop** | Nightly pass; skill ladder L0–L3 with fingerprint approval; bandit router; weekly eval report to private Drive; canary and rollback | A planted regression is caught and rolled back; a planted poisoned memory from web content is rejected |
| **6. Polish** | Floating panel on the phone and a PC side panel showing the plan, each step and a Stop button; optional wake word; optional Gemini Live conversation mode; media lane scene search and trimming | Owner's acceptance checklist; §10 targets reported with the commit that produced them |

## 13. Decisions only the owner can make

The plan uses the default shown until the owner says otherwise.

| Decision | Default in this plan |
|---|---|
| Shizuku build: official (manual start after each reboot) or the `thedjchi` fork (start-on-boot, watchdog) | Fork, after reviewing its source |
| Android Advanced Protection: off (Portal works) or on (no Portal; Shizuku-only paths, slower screen reading) | Off, with patches kept current |
| PC always on, or phone-only most of the time | Both modes supported; PC preferred for heavy work |
| Monthly cloud budget cap (models + search) | Set before Phase 2; the orchestrator's budget gate enforces it |
| Web search keys to buy | Brave (free monthly credit) first, Parallel second |
| Optional cloud extras (Base44, Desktop Commander hosted relay, realtime voice) | Off until asked, and T2-gated when on |

## 14. Not in scope

- Anything at tier T4 (payments, transfers, passwords, 2FA): the assistant drafts, the owner acts.
- Solving CAPTCHAs: handed to the owner.
- Face-matching or "nudify" features (AGENTS.md).
- Publishing or hosting any personal build or personal media.
- Installing unreviewed third-party skills or MCP servers.
