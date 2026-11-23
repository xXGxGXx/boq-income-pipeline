# MASTER ORCHESTRATOR — Complete Reference Document

**Date:** 2026-11-23 | **Owner:** Kyle Beskin-Clark (xXGxGXx) | **Status:** Design locked, pre-build
**Purpose:** Single pasteable handoff document. Any AI platform reading this can continue the project without prior context.

---

## HOW TO USE THIS DOCUMENT

Paste this entire file into any AI chat (Claude, ChatGPT, Gemini, Perplexity, Grok) with a prompt like: "Continue this project from where it left off." The document contains the full design, all decisions, all modules, all scripts, and all open questions. Do not restart from scratch — build on what exists.

**Canonical sources (in priority order):**
1. This file (GitHub: xXGxGXx/boq-income-pipeline)
2. Drive primary: Ara Memory Backups folder
3. Drive backup: Ara Memory Backups folder (second copy)
4. Memory file (auto-loaded in Grok sessions)

---

## PROJECT OVERVIEW

**Hypothetical master name:** Master Orchestrator

A voice-first, minimal-fail-point orchestration layer combining the best non-conflicting parts of Termux, PyDroid, Media Commander, Voice Commander, Desktop Commander, Base44, Hermes, ARGUS, and user-made designs into one system. Not a literal merge of every feature — only parts that work well together and fill each other's gaps.

**Core philosophy:**
- One permission grant = one app (single-grant architecture, STANDING RULE)
- Minimal fail points, maximal capability, zero per-feature prompts
- Autonomous execution default: fire parallel approaches without asking
- On any failure: auto-search alternatives, never stop at "that didn't work"
- Always pair limitations with a path forward
- Always scan wider, never limit options
- Human is final judge; never allow quality drop

---

## SINGLE-GRANT ARCHITECTURE (LOCKED — STANDING RULE)

**Principle:** Treat the entire stack as ONE application with ONE permission grant surface.

- One Shizuku (preferred) or ADB authorization covers Layers 1–7 and Modules A–I
- No layer may request its own separate runtime permission
- No repeated prompts after initial grant
- Each layer documents which subset of the grant it consumes (documentation, not a request)
- Anything needing a separate grant gets reworked or dropped
- Future additions inherit automatically
- Security boundary = (1) one-time user grant, (2) Module F chat-surface allowlist, (3) Module E sandbox
- Rationale: permission fatigue kills adoption; one grant = one app feeling

---

## CORE STACK — SEVEN LAYERS

### Layer 1 — Base: Termux + Proot Replication
- Termux: installed, proven. Shell, package manager, background execution.
- **Replication layer:** proot distro (UserLAnd/Andronix) replicating Termux's three functions — Linux userspace, package manager, background processes. Claude Code one-time bootstrap scaffold. Static instruction-mapping table (termux-setup-storage → storage mount, pkg → apt). Silent auto-degrade Termux→proot, never hard-fail. Shares existing Shizuku/ADB grants. Zero-runtime-cost static mapping. Optimization: proot fallback-only, one-time bootstrap.

### Layer 2 — AI Bridge: termux-mcp (wujie272)
- 120+ tools. Shizuku > ADB > Termux tiered privileges, auto-degrading. Zero-second core load. Layered loading.
- **Proot bridge:** same MCP tool surface works against proot backend — one interface, two backends. Desktop Commander can target proot path.

### Layer 3 — File/Terminal: Desktop Commander Remote
- Already paired (Termux npx run completed 2026-11-23). Endpoint: https://mcp.desktopcommander.app/mcp. Account-managed at mcp.desktopcommander.app. Can target proot filesystem path.
- Windows equivalent: npx.cmd @wonderwhy-er/desktop-commander@latest remote (Node 22.12+). Browser pairing with verify code.
- Keep Termux session open, acquire wakelock, disable battery optimization. Re-run npx after reboot.

### Layer 4 — Screen Vision & Input
- DeVA accessibility-service pattern. droid-agent (PyPI, zero on-device install, numbered UI refs, own MCP server, pure stdlib). Shizuku screenshot path (no MediaProjection prompt — kills the permission prompt entirely).
- **Module G grid overlay:** coarse grid with coded cells as coordinate fallback for custom-drawn content.

### Layer 5 — Voice: Vox Commander triple-layer routing
- Regex first (FastMap), local LLM second, offline fallback third. Swappable plugin interface behind one contract — hot-swap any layer without touching core.

### Layer 6 — Cloud Builder: Base44 Superagent
- Voice chat, WhatsApp/Telegram/iMessage control, published MCP tools, screen/camera sharing during live voice calls.

### Layer 7 — Orchestration: Hermes-style flat multi-agent
- Parallel workstreams that respawn if one dies. No single point of failure. /goal command auto-continues until judge declares done (capped by max turns) — proven production pattern matching our auto-continue loop.

### Wildcard: ARGUS (JackRushante)
- LLM compiles natural language into a typed rule; user approves a byte-stable SHA fingerprint; deterministic engine runs it forever after — no LLM in the execution loop. Safety pattern worth stealing for high-risk actions.

---

## EXTENSION MODULES A–I (ALL LOCKED 2026-11-23)

### Module A — Session Replay Buffer
- Every voice command and AI response logged with timestamps
- Rewind and re-run any past interaction as a macro
- Turns one-off successes into reusable automations
- Storage: append-only log in Drive checkpoint folder, indexed by session ID

### Module B — Capability Registry
- Live inventory of every tool, permission, backend available
- Auto-updated on connect/drop; heartbeat-based; stale entries auto-expire
- Orchestrator reads registry before acting — never commands dead layers

### Module C — Media Pipeline Hook
- Dedicated lane for active media viewer project (media-hub-local, media_serve.py)
- Watches library folder, auto-indexes new files, exposes via same MCP surface
- No separate server to maintain

### Module D — Cross-Device Sync Spine
- Syncs session state, capability registry, replay buffer across devices
- Drive folders as transport (primary + backup); GitHub as canonical versioned copy
- Conflict resolution: last-write-wins per module, manual override flag
- **Global allowlist policy:** Module F chat-surface allowlist is global (synced via D), not per-device

### Module E — Code Interpreter & Self-Verification Loop
Built from Claude Code's 39-item reliability checklist, Daisy Hollman's objective/check/stop framework, E2B Firecracker sandboxing (150ms boot, Apache-2.0), Modal gVisor GPU support.

**Core loop:** generate → static-analysis pre-pass (Semgrep/CodeQL/AI-Lint as gate, not post-failure loop — under 2x baseline tokens vs 24x for full repair) → sandboxed execution (proot preferred; subprocess+ulimit fallback) → capture stdout/stderr/exit/traceback → feed real tracebacks back (verifier-generator asymmetry: checking is easier than solving) → iterate.

**Guardrails:** three-failure cap before human escalation; every loop has objective + code-verifiable check + stop condition; round limit + cost budget; seeded randomness + frozen clocks (flaky tests poison agents into retry-instead-of-fix); fresh-context verifier at end catches confirmation bias; reasoning models improve across 10 iterations, non-reasoning plateau after 1–2.

**Sandboxing:** no network default, no filesystem escape, killed on timeout, non-root, read-only root FS, egress denied, credentials never inside.

**Integrates with:** Layer 1 (execution backend), Layer 2 (invocation), Layer 3 (artifact I/O), Module B (sandbox check), Module A (cycle logging), auto-continue score gate, cost ceiling.

### Module F — Voice-to-Chat Injection Overlay
Built from DeVA, Handy AI, voice-droid, PhoneClaw, AccessDroid/amctl, BiBi-Keyboard, termux-api #828.

**Core:** Vox FastMap catches "press send" → foreground-app check (termux-api app_foreground / droid-agent state) → ACTION_SET_TEXT injection (primary, atomic) → clipboard-paste fallback → custom-IME tertiary → IME key event for send (survives dynamic layouts) → droid-agent type_into for ADB path.

**Termux bridge:** AccessDroid APK + amctl CLI (yashas-13): type, tapref, key, snap, tree. Zero root. termux-api accessibility not merged; AccessDroid is cleaner interim.

**Safety:** spoken confirm before destructive sends; visible Stop affordance; allowlist-only injection; every injection logged to Module A.

**Allowlist:** GLOBAL (locked 2026-11-23) — single list synced via Module D Drive spine; adding a platform once updates all devices; per-device rejected as duplicate maintenance.

### Module G — Screen Grid Input Overlay
Built from LightGUIAgent (10×20 chess grid A–J × 1–20), asterdroid shot-grid, scrcpy-agent, Robot Actions, ghost-in-the-droid, AdbPhoneAgent, DEV Community coordinate-contract analysis.

**Design:** 10×20 grid, auto cell-size from resolution, model outputs "E5" not pixels. Targeting ladder: UI refs → grid → raw coords (with resize-contract) → OCR → HID. Zoom-crop precision (shot grid cell/range). Tap verification (--verify signature compare). Keypress replication: droid-agent key / amctl key for back/home/enter/tab/del/power; type for text; sequenced combos supported. Ephemeral overlay — drawn on screenshot only, never on device screen.

### Module H — Semantic Memory Layer
Built from Parallel four-tier hierarchy, Mem0, XERJ model-free dedup, SynapCores, Agent Memory Field Guide.

**Design:** vector embeddings alongside flat-text checkpoints; hybrid search (vector + keyword + metadata); selective write (ADD/UPDATE/INVALIDATE/NOOP); cosine dedup on write path (0.95 threshold, zero-LLM lexical default); four timestamps per fact (valid_at, invalid_at, created_at, expired_at); decay + consolidation background jobs; raw episodes preserved (verbatim beats extraction 16–22 points in ablations); local embedder in proot (single-grant compliant, no cloud API).

**Integrates with:** Module D (vector index replication), Module A (episodic source), Module B (embedder check), auto-continue loop (retrieved memories as grounding context).

### Module I — Auto-Fail-Resolution Engine
Built from AI Advances self-healing patterns, Copyl, CXAS SCRAPI, NathanMaine/self-healing-agentic-workflows, production fault-tolerance (retry/circuit-breaker/fallback).

**Five-stage cycle:** detect → diagnose → repair → validate → adapt.
- **Detection:** every tool call/heartbeat/action wrapped; failures as structured events
- **Diagnosis:** error classification routes recovery — transient (429/503/jitter: retry w/ exponential backoff + jitter, lifts success ~55%→96%) vs permanent (401/400: never retry) vs logic (ValueError: fix input) vs semantic (wrong answer: escalate w/ evidence)
- **Repair:** classified retry/repair/fallback chains
- **Validate:** post-repair check confirms fix before proceeding
- **Adapt:** successful repairs logged; patterns feed Module H consolidation and refinement 19 meta-engine

**Circuit breakers** per layer. **Fallback chains** with graceful degradation. **Automatic alternative-method search** on non-resolution. **Evidence-backed human escalation** only for high-risk irreversible actions. Integrates with dead-man's switch, Module E, Module H, cost ceiling, auto-continue gate.

---

## REFINEMENTS (19 LOCKED)

1. Shizuku screenshots (no MediaProjection)
2. Swappable router plugins
3. Dead-man's switch (Termux + proot heartbeats)
4. Session replay buffer
5. Capability registry
6. Media pipeline hook
7. Cross-device sync spine
8. Code interpreter & self-verification (Module E)
9. Voice-to-chat injection (Module F)
10. Screen grid input (Module G)
11. Semantic memory (Module H)
12. Auto-fail-resolution (Module I)
13. AI-side watchdog (pings model; auto-restart/fallback on silence)
14. Proot replication layer (optimized)
15. Single-grant architecture (STANDING RULE)
16. Global Module F allowlist (resolved open question)
17. Termux→proot silent fallback mapping table
18. AI-side dead-man's switch refinement
19. Meta-improvement engine (reads Module H/I data, proposes architecture swaps w/ evidence, scored by auto-continue gate, human approval for critical changes)

---

## AUTO-CONTINUE LOOP (v2 — LOCKED 2026-11-23)

**Script:** auto-continue-loop-2026-11-23-v2.py (Drive both folders + GitHub canonical: xXGxGXx/boq-income-pipeline/skills/auto-continue-loop/auto_continue_loop.py)

**Design:**
- Wrapper sends prompt to AI model; auto-appends continuation up to user-set cap (5–7)
- Each step restates original goal verbatim (anchors intent, prevents drift)
- Proposes ONE improvement per step only
- Includes one-line summary: what improved / what stayed same
- Terminates early only if no improvement named (goal is baseline/floor, not ceiling — improvements beyond requirements encouraged)
- Each step feeds FULL current artifact as clean-slate context (ChatGPT-style versioning, not diff-patching)
- Prior versions untouched for rollback; outputs numbered
- Human is final judge; never allow quality drop
- **Baseline-is-a-floor:** original requirements are minimum, not ceiling — AI additions that exceed them are wanted

**v2 additions:**
- Tiered models: cheap model (e.g. gpt-4o-mini) for scoring passes and NO_IMPROVEMENT checks; premium (e.g. gpt-4o) only for actual improvement steps
- Cost ceiling flag: halts when estimated spend hits USD cap
- Per-step token tracking + estimated cost logging in metrics
- Multi-pathway parallel branches with best-score selection (branch = separate full-strength call, same context/token budget — multiplies total compute, doesn't dilute per-path quality)
- Diff summaries between consecutive versions
- **Model router:** lightweight classifier assigns cheapest model that can handle each step (complexity, prior score delta, stall detection); escalates to top model only on high-impact flag; escalation decision itself is a cheap-model call
- **Decaying weights:** each model's running score has half-life — three wins last week count less than one win today; no cumulative leaderboard bias; routing weighs recent context against specific request
- Feedback log: router learns which model-tier choices produced score gains

---

## DRIVE-CHECKPOINT SKILL (LOCKED 2026-11-23)

**Script/skill:** skills/drive-checkpoint/SKILL.md (GitHub: commits 126bc8e9, 4099a024, 6544fabbaa3f23b8a26d78ccb875227ed04f3321)
**Drive folders:** primary 1fd66zXGQpdgOjfjme1-XDYNZ_-0kYyHA, backup 1LZa-XlnsM5E5cfFaFKsGozMpoC4rYdVo
**Pattern:** checkpoint-YYYY-MM-DD.md per day

**Full loop:** detect durable content → write to BOTH Drive folder IDs → sync memory file → confirm aloud → retry on failure → tertiary GitHub fallback if both Drive folders fail
**Priority tiers:** what counts as durable (decisions, file paths, commands, project state, design locks)
**Fixed entry template:** prevents format drift
**Mandatory read-back verification:** after every Drive write
**Session-start check:** for today's file
**Definition-of-done checklist:** must satisfy before checkpoint turn counts complete
**Runtime tool resolution:** search for action by description, no hard-coded tool names (prevents staleness on connector renames)
**Artifact upload mandate:** large file bodies (scripts etc.) uploaded to Drive on durable turns alongside short facts
**Fully automatic:** no manual flagging from user required; every durable turn saves without being asked

---

## BOX MCP INTEGRATION (RESEARCHED 2026-11-23)

**Endpoint:** https://mcp.box.com | **Protocol:** MCP | **Auth:** OAuth 2.0 | **Availability:** All Box plans (subject to entitlements)

**Capabilities:** file search (keywords/metadata), content retrieval, Box AI multi-file Q&A with citations, structured extraction, Hubs, collaboration (tasks/comments/permissions), file management (create/upload/update), document generation from templates.

**OpenAI integration:** Responses API + Agents API support remote MCP. Agents SDK for code-based workflows. **WARNING:** OpenAI Agent Builder and Evals discontinued 2026-11-30 — do NOT build on AgentKit/Agent Builder; use Responses API + Agents SDK instead. Box's AgentKit docs (last mod 2026-08-28) still reference Agent Builder — treat as stale.

**ChatGPT integration:** Settings → Plugins → Box → Connect → OAuth. Managed accounts need admin enablement.

**Security notes:** Box permissions remain authoritative; source files stay in Box unless returned in queries; MCP write access restrictable by admin; OpenAI approvals can require explicit per-operation approval; any content returned to OpenAI is shared with the model (not equivalent to keeping it in Box); recommended: read-only default, allowlisted tools, approval for writes, no unrestricted terminal, dedicated working dir, secrets server-side, separate cloud/local permission boundaries.

**Architecture recommendation (Perplexity research):** OpenAI (reasoning/orchestration) + Box MCP (cloud knowledge) + Desktop Commander (local ops) + Skills (reusable procedures) + Android-friendly mobile control interface. Phone as control surface; Desktop Commander on separate supported computer (no native Android path documented for Desktop Commander Remote).

**Slot into stack:** Box = Layer 6.5 cloud-knowledge complement to Base44; Desktop Commander Remote = Layer 3 (already active).

---

## DESKTOP COMMANDER REMOTE — SETUP NOTES

**Termux (done 2026-11-23):** npx -y @wonderwhy-er/desktop-commander@latest remote → Device ready → paired. Wakelock + battery-opt-off required. Re-run after reboot.
**Windows:** npx.cmd @wonderwhy-er/desktop-commander@latest remote (Node 22.12+) or DesktopCommander-Remote.cmd or irm .../remote-windows.ps1 | iex. Browser pairing page + terminal verify code. Endpoint https://mcp.desktopcommander.app/mcp.
**Beta status:** remote service in beta; temporarily handles tool args/results for routing; local execution and remote service are separate security boundaries. Treat as powerful optional connector, not general-purpose replacement for anything.

---

## TERMUX→PROOT INSTRUCTION MAPPING (STATIC TABLE)

| Termux | Proot equivalent |
|---|---|
| termux-setup-storage | storage mount |
| pkg | apt |
| termux-wake-lock | proot-specific wakelock or nohup wrapper |
| All other shell/apt/python commands | Identical |

Silent fallback: Termux primary → proot secondary. Never hard-fail. Zero runtime cost.

---

## AUTOMATION FORGE v4.2 (ADDED 2026-11-23)

Android-native automation app — a device-side execution layer for scripted workflows.

**Capabilities:** WorkManager scheduling (best-effort, subject to Android battery policy), SQLite audit database logging every execution event, SAF file importer for picking local files, basic webhook URL screening (hostname/IP filtering — not a complete SSRF boundary), visual workflow builder (note, delay, notification steps; raw JSON available for advanced workflows), quick workflow builder callbacks, work cancellation control, repeat scheduling.

**Manifest:** INTERNET + POST_NOTIFICATIONS permissions; cleartext traffic disabled; Material dark theme (#12121A, accent #7C5CFF); single MainActivity launcher.

**Validation (v4.2 report):** 12 passes — native-bridge.js syntax, app.js syntax, Android manifest XML parse, SQLite audit database helper, Worker execution audit event integration, Quick workflow builder callbacks, Audit bridge endpoints, Repeat scheduling integration retained, Work cancellation control retained, SAF importer integration retained, Basic webhook URL screening.

**Notes:** WorkManager is best-effort; design actions to be idempotent. Webhook screening is basic. SQLite has no auto-pruning yet. Visual builder covers note/delay/notification; JSON for advanced.

---

## DOCUMENT & OFFICE AUTOMATION PATTERNS (ADDED 2026-11-24 from Codex skill inspection)

Inspected a Codex environment with production-grade built-in skills under `~/.codex/skills/builtins/` for spreadsheets, presentations, PDF, and documents (docx).

**Key patterns worth adopting or referencing:**
- **Document tasks:** TOC generation, tracked changes management, comments extract/apply/strip, redaction/anonymization, privacy metadata scrub, watermarks, forms/content controls, accessibility audit, footnotes/endnotes, captions/cross-refs, style lint/normalize, multi-doc merge, fields materialize/update.
- **Spreadsheet/Presentation:** Google Sheets/Slides routing, charts (sparklines, data tables, quantitative gates), template following with fidelity checks, native table arithmetic, domain guidance (finance, healthcare, marketing, scientific).
- **Privacy & quality gates:** Explicit privacy scrub scripts, control-character scanning before trusting generated code, template fidelity validation, render-and-diff verification.
- **Integration note:** These align with Module E (self-verification) and the privacy_scan.py we added. Future skills can borrow the task decomposition (e.g. separate scripts for redact_docx.py, privacy_scrub.py, a11y_audit.py) and the gate pattern (static check → sandbox run → human-reviewed output).

**Actionable:** When building document or spreadsheet automation into the Master Orchestrator (e.g. for income pipeline reports, SWMS, or digital product packs), prefer modular task scripts + verification gates over monolithic generation. Codex's skill structure is a good reference for packaging reusable office workflows.

---

## ON-DEVICE RECALL (recall_master.py)

Termux-side script for local recall/vault operations with a 10-test self-test suite. Deploy via nano or one-liner, run `python3 recall_master.py self-test` expecting "Ran 10 tests in 0.001s OK". Complements the media pipeline and Module C.

---

## OPEN QUESTIONS (21 TOTAL, 1 RESOLVED)

**Resolved:** Module F allowlist global vs per-device → GLOBAL.

**Still open (20):** full list in DESIGN.md — includes proot vs Termux performance on media-heavy workloads (relevant to media viewer), ARGUS deeper inspection details, HID gesture scope expansion, Automation Forge Gradle/device validation pending, and others. Check DESIGN.md for the complete enumerated list.

---

## WHAT'S NEXT (SUGGESTED BUILD ORDER)

1. **Foundation:** Single-grant Shizuku/ADB authorization + termux-mcp + Desktop Commander Remote (Layers 1–3) — already partially live
2. **Vision/input:** DeVA + droid-agent + Shizuku screenshots + Module G grid (Layer 4)
3. **Voice:** Vox Commander routing (Layer 5) + Module F injection
4. **Verification:** Module E code interpreter on proot sandbox
5. **Resilience:** Module I fail-resolution + Module B capability registry + dead-man's switches (Layers 1/13/18)
6. **Memory:** Module H semantic layer + Module A replay buffer
7. **Sync:** Module D cross-device spine + global allowlist
8. **Cloud:** Base44 Superagent (Layer 6) + Box MCP (Layer 6.5)
9. **Orchestration:** Hermes multi-agent (Layer 7) + Module C media hook + ARGUS pattern
10. **Meta:** Refinement 19 meta-improvement engine + usage metrics dashboard (refinement 20 candidate)
11. **Device execution:** Automation Forge v4.2 Gradle build + device validation
12. **On-device recall:** recall_master.py deployed and self-tested in Termux
13. **Office automation:** Modular document/spreadsheet skills inspired by Codex patterns (privacy scrub, redaction, TOC, charts with gates)

---

## USAGE METRICS DASHBOARD (REFINEMENT 20 CANDIDATE — NOT YET SPECCED)

Module I and auto-continue loop already generate cost, score, and failure data. Nothing aggregates it into a glanceable view of which layers earn their keep. Would feed refinement 19 directly with real numbers. Spec TBD.

---

## FILE LOCATIONS

- **GitHub canonical:** xXGxGXx/boq-income-pipeline
  - skills/device-orchestration-stack/DESIGN.md (commit d7614465)
  - skills/auto-continue-loop/auto_continue_loop.py
  - skills/drive-checkpoint/SKILL.md
  - MASTER-ORCHESTRATOR-REFERENCE.md (this file)
  - scripts/privacy_scan.py
  - artifacts/orchestrator.py (whole-word routing, explicit Muse URL)
  - Automation Forge: AndroidManifest.xml, styles.xml, native-bridge.js, app.js, VALIDATION-REPORT.txt
  - recall_master.py (Termux-side)

- **Drive primary:** 1fd66zXGQpdgOjfjme1-XDYNZ_-0kYyHA
- **Drive backup:** 1LZa-XlnsM5E5cfFaFKsGozMpoC4rYdVo
- **Memory:** auto-loaded in Grok sessions (664 conversations since 2026-09-04)

*End of master reference. Paste into any AI platform to continue.*
