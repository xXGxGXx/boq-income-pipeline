# Device Orchestration Stack — Design Doc
**Locked:** 2026-11-23 | **Status:** Design phase, pre-build (optimized + extended + code interpreter + voice-to-chat overlay + screen grid input + single-grant architecture + semantic memory + auto-fail-resolution + AI-side watchdog + meta-improvement engine)

> **2026-11-27:** the user-facing product built on this stack, the "AI User Extension", is planned in [`AI-USER-EXTENSION-PLAN.md`](AI-USER-EXTENSION-PLAN.md), with sourced research in [`research/`](research/ai-user-extension-research-2026-11-27.md). Its §11 proposes changes to this document (Module D, F and H, the auto-continue loop); none are applied here yet.

## Goal
A voice-first, minimal-fail-point orchestration layer combining the best non-conflicting parts of Termux, PyDroid, Media Commander, Voice Commander, Desktop Commander, Base44, and user-made designs into one system. Not a literal merge of every feature — only the parts that work well together and fill each other's gaps. Hypothetical master name: **Master Orchestrator**.

## Single-Grant Architecture (LOCKED 2026-11-23 — STANDING RULE)
**Principle:** Treat the entire stack as ONE application with ONE permission grant surface. Minimize access restrictions, maximize use potential, zero per-feature permission prompts.

- **One grant covers everything:** A single Shizuku authorization (preferred) or ADB authorization covers Layers 1–7 and Modules A–I. No layer may request its own separate runtime permission.
- **No repeated prompts:** The user grants once at setup. After that, every feature runs under that same grant without re-asking.
- **Each layer declares its subset:** Every layer and module must document exactly which subset of the single grant it consumes. This is documentation, not a permission request.
- **Rework or drop anything needing a separate grant:** If a proposed addition would require a new runtime permission, it must be reworked to operate within the existing single grant or dropped entirely.
- **Future additions inherit this rule automatically:** Any new layer, module, or refinement added to this design must comply with single-grant architecture by default. No exceptions without explicit user override.
- **Security model:** The single grant IS the security boundary. Instead of per-feature allowlists and permission checks, the boundary is: (1) the user's one-time grant, (2) Module F's chat-surface allowlist for destructive injections, (3) Module E's sandbox for code execution. Everything else runs open under the grant.
- **Rationale:** Permission fatigue kills adoption. One grant means the stack feels like one app, not seven tools fighting for access. Minimal friction, maximal capability.

## Core Stack (non-conflicting layers)

### Layer 1 — Base: Termux + Termux Replication (fallback)
- Termux: already installed, proven. Shell, package manager, background execution.
- **Replication**: proot distro (UserLAnd/Andronix) replicating Termux's three functions — Linux userspace, package manager, background processes. Claude Code one-time bootstrap scaffold. AI Termux instructions map via static search-and-replace table (termux-setup-storage → storage mount, pkg → apt). Auto-degrading: Termux primary, proot secondary, silent fallback, never hard-fail. Shares existing Shizuku/ADB grants. Independently restartable.

### Layer 2 — AI Bridge: termux-mcp (wujie272)
- 120+ tools. Shizuku > ADB > Termux tiered privileges, auto-degrading. Zero-second core load.
- **Proot bridge**: same MCP tool surface works against proot backend — one interface, two backends.

### Layer 3 — File/Terminal: Desktop Commander Remote (already paired)
- Can target proot filesystem path as working directory.

### Layer 4 — Screen Vision & Input
- DeVA accessibility-service pattern. droid-agent (numbered UI refs, external adb). Shizuku screenshot path (no MediaProjection prompt).
- **Grid overlay (Module G)**: coarse grid with coded cells as coordinate fallback when UI tree misses custom-drawn content.

### Layer 5 — Voice: Vox Commander triple-layer routing
- Regex first, local LLM second, offline fallback third. Swappable plugin interface.

### Layer 6 — Cloud Builder: Base44 Superagent
- Voice chat, WhatsApp/Telegram control, published MCP tools.

### Layer 7 — Orchestration: Hermes-style flat multi-agent
- Parallel workstreams that respawn if one dies. No single point of failure.

### Wildcard: ARGUS
- Pattern worth stealing — details TBD on deeper inspection.

## Extension Modules (2026-11-23 addition)

### Module A — Session Replay Buffer
- Every voice command and AI response logged with timestamps
- Rewind and re-run any past interaction as a macro
- Turns one-off successes into reusable automations without re-describing them
- Storage: append-only log in Drive checkpoint folder, indexed by session ID

### Module B — Capability Registry
- Live inventory of every tool, permission, and backend currently available
- Auto-updated when something connects or drops
- Orchestrator reads registry before acting — never issues commands to dead layers
- Heartbeat-based: each layer pings in, stale entries auto-expire

### Module C — Media Pipeline Hook
- Dedicated lane for the active media viewer project
- Watches library folder, auto-indexes new files
- Exposes indexed media through the same MCP surface — no separate server
- Integrates with existing media-hub-local and media_serve.py work

### Module D — Cross-Device Sync Spine
- Syncs session state, capability registry, and replay buffer across devices
- Drive folders as the transport layer (already have primary + backup)
- GitHub as the canonical versioned copy
- Conflict resolution: last-write-wins per module, with manual override flag

### Module E — Code Interpreter & Self-Verification Loop (2026-11-23 addition)
Built from research into Claude Code's internal verification practices, Daisy Hollman's agentic-loop framework, and E2B sandboxing patterns. Closes the gap between writing code and proving it works.

**Core loop:**
1. Generate code from the task spec
2. Static analysis pre-pass (syntax, imports, obvious type errors) — catches cheap bugs without burning a runtime cycle
3. Execute in a sandboxed environment (proot container or isolated subprocess with resource caps: CPU, memory, wall-clock timeout)
4. Capture stdout, stderr, exit code, and full traceback
5. Feed real execution output back to the model — verifier-generator asymmetry means checking is far easier than solving, so real tracebacks beat model self-diagnosis
6. Iterate: regenerate, re-run, re-capture

**Reliability guardrails (from Claude Code's 39-item checklist, adapted):**
- Cap consecutive failed repair rounds at three before escalating to human review
- Every loop has three explicit parts: an objective, a code-verifiable check, and a stop condition
- Round limit and token/cost budget per loop so it cannot burn indefinitely
- Ninety percent of generated code should pass automated verification before any human sees it

**Sandboxing:**
- E2B-style isolated execution: no network by default, no filesystem escape, killed on timeout
- Proot container as the preferred sandbox (already in Layer 1 — zero new dependencies)
- Fallback: subprocess with ulimit caps if proot unavailable

**Integration with existing layers:**
- Uses Layer 1 (proot/Termux) as the execution backend
- Uses Layer 2 (termux-mcp) to invoke runs and capture output
- Uses Layer 3 (Desktop Commander) for file read/write of generated artifacts
- Uses Module B (capability registry) to check sandbox availability before attempting
- Uses Module A (replay buffer) to log every generate-run-fix cycle for macro reuse
- Uses the auto-continue loop's score gate: a step that fails verification cannot count as an improvement
- Uses the cost ceiling: each interpreter iteration counts against the run budget

**Non-goals:**
- Not a replacement for Claude Code's file-editing agent — it's the verification engine that wraps it
- Not a general-purpose cloud sandbox (E2B) — local-first, privacy-preserving

### Module F — Voice-to-Chat Injection Overlay (2026-11-23 addition)

> **Build status (2026-11-27):** first build in [`module_f/`](module_f/README.md), not yet run on a phone. It types through droid-agent (adb) instead of AccessDroid/amctl, whose repo returned 404, and instead of `ACTION_SET_TEXT`, since termux-api's accessibility API is unreleased. The README lists every difference from this section.

Built from research into DeVA, Handy AI, voice-droid, PhoneClaw, AccessDroid/amctl, BiBi-Keyboard, and termux-api accessibility work. Gives the user full text-chat capability on any AI platform while retaining voice-chat parity — speak into any chat bar, say "press send," and it fires.

**Core capability:**
- Voice dictation captured by Vox Commander's FastMap layer (Layer 5) matching a trigger phrase like "press send"
- Foreground-app check first (termux-api `app_foreground` or droid-agent `state`) to confirm which chat is active — never injects blind
- Text injection into the focused editable field via AccessibilityService `ACTION_SET_TEXT` (primary, atomic, instant, proven across DeVA/Handy/BiBi-Keyboard)
- Clipboard-paste fallback (`ACTION_PASTE`) if SET_TEXT is rejected by the target app
- Optional custom-IME AIDL injection as tertiary path for apps that block both
- Send execution via IME key event (`key enter` / voice-droid's IME submit) which fires the field's native submit action — same as tapping the blue send button
- droid-agent's compound `type_into` workflow (focus field + type in one call) reduces round-trips when ADB path is used

**Termux-side bridge:**
- AccessDroid APK + amctl CLI (yashas-13) exposes taps/types/key events as Termux broadcasts — zero root, zero ADB cable, works alongside existing Termux grants
- termux-api accessibility addition (issue #828) is not merged; Automate workaround scripts exist as interim; AccessDroid is the cleaner path
- amctl commands: `type "text"`, `tapref @pN`, `key enter`, `snap` (UI tree with refs), `state`-equivalent via `amctl tree`

**Safety guardrails (from Handy AI and Phone Control MCP patterns):**
- Spoken confirmation before tapping Send on anything destructive (payments, deletes, bulk actions) — Handy AI's pattern
- A visible Stop affordance (floating control or notification action) that halts the injection sequence immediately
- Injection only proceeds when the foreground app matches an allowlist of chat surfaces the user has approved
- Every injection logged to Module A's replay buffer with timestamp and target app for audit

**Allowlist policy (locked 2026-11-23):**
- **Global, not per-device.** Chat surfaces are the same across devices, so one allowlist synced via Module D's Drive spine means adding a platform once updates everywhere. Per-device lists would duplicate maintenance with no benefit.
- Allowlist stored in Drive sync spine (primary + backup folders), versioned in GitHub
- Adding or removing a surface is a single edit that propagates to all devices on next sync

**Integration with existing layers:**
- Uses Layer 5 (Vox Commander) for trigger-phrase detection — the "press send" phrase routes as a FastMap rule, zero LLM latency
- Uses Layer 4 (DeVA/droid-agent/Shizuku) for the actual UI actions
- Uses Layer 2 (termux-mcp) to invoke amctl/AccessDroid commands and read UI tree state
- Uses Module B (capability registry) to verify accessibility service and foreground-app detection are alive before attempting
- Uses Module A (replay buffer) to log every voice→inject→send cycle for macro reuse
- Uses Module D (sync spine) so approved chat allowlists and trigger phrases sync across devices
- Compatible with any AI platform's text chat — Claude, ChatGPT, Gemini, Perplexity web — because it operates at the OS input level, not the app API level

**Non-goals:**
- Not a replacement for native voice mode on platforms that have it — it's the bridge for platforms that don't
- Not full phone automation — scoped to text injection and send on approved chat surfaces
- Does not bypass platform-level content policies; it only automates the user's own keystrokes

### Module G — Screen Grid Input Overlay (2026-11-23 addition)
Built from research into LightGUIAgent (ReScienceLab), asterdroid/droid (Zfinix), scrcpy-agent, Robot Actions, ghost-in-the-droid, AdbPhoneAgent, and the DEV Community analysis of why agent taps miss. Provides a coarse grid-coded screen surface so the model can target anything — including custom-drawn content the accessibility tree cannot see — without guessing raw pixels.

**Core design (from LightGUIAgent's proven pattern):**
- Screen divided into a **10×20 grid**: columns A–J (left to right), rows 1–20 (top to bottom) — chess-notation style
- Model outputs a cell code like "E5" instead of pixel coordinates — far fewer tokens, no scaling math, resolution-agnostic
- Cell size auto-calculated from device resolution (~108×120 px on a 1080×1920 screen); no hardcoded dimensions
- Grid overlay rendered onto the screenshot (grid_overlay.py pattern) so the model sees labelled cells visually
- grid_converter.py translates cell ↔ pixel bidirectionally for execution via `adb shell input tap` or amctl

**Targeting priority ladder (UI-tree-first, grid-second, raw-last):**
1. **UI tree refs** (droid-agent numbered refs, amctl tapref @pN) — precise, cheap, stable; always tried first
2. **Grid cell** (Module G) — for custom-drawn surfaces: games, WebViews, Flutter canvases, image-only widgets where the tree exposes nothing tappable
3. **Raw coordinates** — last resort; requires the DEV Community "coordinate contract": screenshot resized to exact model-visible size with labelled grid drawn, coordinates converted back to device pixels, taps outside that space rejected and model retries
4. **OCR layer** (amctl ocr, ghost-in-the-droid find_on_screen) — finds text the tree cannot see; returns bounds for tap
5. **HID-level input** (scrcpy UHID virtual touchscreen/keyboard) — when synthetic taps get silently ignored by the target app

**Precision refinements (from asterdroid's shot-grid pattern):**
- `shot grid <cell>` crops and enlarges a single cell with screen-pixel labels for fine targeting
- `shot grid <range>` (e.g., R3-S4) zooms a multi-cell region — useful when a target straddles a boundary
- Zoomed cells re-label at pixel granularity so the model can refine from "E5" to an exact point

**Verification (from amctl's tap --verify pattern):**
- Every grid tap (and ref tap) optionally runs with `--verify`: screen signature compared before and after; if unchanged, the tap is flagged as missed and retried or escalated
- Prevents silent no-ops from animations, overlays, or collapsed toolbars

**Keypress replication (user's letter/space/back requirement):**
- droid-agent `key` command by name: back, home, enter, tab, del, power
- amctl exposes the same via `amctl back`, `amctl home`, `amctl key <name>`
- Text entry: `droid-agent type "text"` (spaces handled) or amctl `type` / `paste`
- Combined: the model can emit "type H-E-L-L-O, key space, type W-O-R-L-D, key enter" as a single sequenced action

**Integration with existing layers:**
- Uses Layer 4 (DeVA/droid-agent/Shizuku) for screenshot capture and tree dumps
- Uses Layer 2 (termux-mcp) to invoke amctl/droid-agent grid and key commands
- Uses Module B (capability registry) to check screenshot and adb availability before attempting
- Uses Module A (replay buffer) to log every grid-tap and keypress sequence for macro reuse
- Uses Module F's safety model: spoken confirm before destructive grid taps, Stop affordance halts sequences
- Grid overlay is ephemeral — drawn on the screenshot sent to the model, never persisted on the device screen

**Non-goals:**
- Not a replacement for UI-tree refs — grid is strictly the fallback for tree-blind surfaces
- Not pixel-perfect targeting by default — coarse cells first, zoom-refine on demand
- Not a general gesture engine — taps, long-presses, and basic swipes only at this stage

### Module H — Semantic Memory Layer (2026-11-23 addition)
Built from research into Parallel's four-tier agent memory hierarchy, Mem0, XERJ's model-free dedup, SynapCores vector dedup, and the Agent Memory Field Guide's reference architecture. Upgrades the flat-text checkpoint store into meaning-addressable memory.

**Core design:**
- Every durable fact gets embedded (vector) alongside its text and metadata (updated_at, source_session_id, scope: user/workspace/project)
- **Targeted retrieval:** future sessions query by meaning — "what did we decide about Termux fallbacks" surfaces the right entry even without exact keywords. Hybrid search: vector + keyword + metadata filters, then rerank and pack within a token budget.
- **Selective write:** only durable facts, decisions, corrections persist — not transient chatter. Extraction step resolves ADD / UPDATE / INVALIDATE / NOOP per fact.
- **Semantic dedup on the write path:** cosine similarity check against existing memories in the same namespace/scope; default threshold 0.95 (XERJ pattern). Hits return the existing id and skip the write — no second copy. Runs with zero LLM calls using lexical feature hashing by default; optional neural embedder backend for meaning-level matching.
- **Four timestamps per fact:** valid_at, invalid_at, created_at, expired_at. Relative dates resolved at write time.
- **Decay:** periodic background job expires/archives stale entries; recency_weight biases retrieval toward recent facts.
- **Consolidation:** background job merges duplicate episodes into canonical facts and supersedes stale ones — keeps the store lean as it grows.
- **Raw episodes preserved:** verbatim retrieval beats extraction by 16–22 points in controlled ablations (Agent Memory Field Guide), so the append-only log stays intact alongside extracted facts.

**Integration with existing layers:**
- Uses Module D (sync spine) so the vector index replicates across Drive primary + backup and GitHub canonical
- Uses Module A (replay buffer) as the episodic source that consolidation reads from
- Uses Module B (capability registry) to check embedder/index availability before semantic queries
- Feeds the auto-continue loop: retrieved relevant memories inject into each step's context as grounding
- Single-grant compliant: local embedder (sentence-transformers or similar) runs in proot/Termux — no cloud API, no new permission surface

**Non-goals:**
- Not a replacement for the flat checkpoint files — those remain the human-readable, independently verifiable backup
- Not a general knowledge base / RAG over the web — scoped to the user's own durable facts and project state

### Module I — Auto-Fail-Resolution Engine (2026-11-23 addition)
Built from research into self-healing agent patterns (AI Advances, Copyl, CXAS SCRAPI, NathanMaine/self-healing-agentic-workflows) and production fault-tolerance: retry, circuit breaker, fallback chains. Goal: zero paused or stalled moments — nothing waits on something that will never happen; if one path fails, another is tried automatically.

**Core loop (five-stage self-healing cycle):**
1. **Detection** — every tool call, layer heartbeat, and module action is wrapped; failures are caught as structured events, never raw crashes
2. **Diagnosis** — errors classified before any retry: transient/retriable (429, 503, network jitter, read timeout) vs permanent/non-retriable (401, 400, auth failure, context overflow) vs logic defects (ValueError, TypeError, schema mismatch) vs semantic/quality failures (wrong answer, task drift, hallucination). Classification routes the recovery path — retrying a 401 burns quota with zero chance of success.
3. **Repair** — transient: retry with exponential backoff + jitter (proven to lift success from ~55% to 96% at 35% per-call failure rate). Permanent: do not retry; correct input or escalate with evidence. Logic: feed to Module E's interpreter loop. Semantic: verifier detects + reflection re-generates.
4. **Validation** — every repair is verified before the system proceeds: tap verification (Module G), code verification (Module E), response scoring (auto-continue gate). A repair that doesn't validate counts as another failure.
5. **Adaptation** — resolved failures deposit experience back into detection rules (Module H semantic memory logs the failure pattern + fix so future sessions recognize it faster).

**Circuit breaker:** sustained outages trip a breaker per layer/backend — stops hammering a dead system, opens a fallback path instead of piling up retries.

**Fallback chains (compose with retry + breaker):**
- Primary path (e.g., Termux) → 3 retries exhausted → secondary path (proot) → different backend/supplier to avoid correlated failure → semantic cache of prior similar resolutions → deterministic rule/preset fallback that guarantees *some* response
- The chain accepts graceful degradation in exchange for forward progress — never a hard stop

**Auto-method-switching (user's "try other methods" requirement):**
- On any non-resolution, the engine automatically searches for and tests alternative methods (web search, alternate tools, alternate backends) without asking or pausing — consistent with the user's standing autonomous-execution rule
- A wall is never a stop signal; it triggers wider scanning

**Escalation (last resort only):**
- After retries, fallbacks, and alternative methods are exhausted for a *high-risk irreversible* action, escalate to human with full evidence: what failed, what was tried, what remains
- Low-risk actions never escalate — they degrade silently and log

**Integration with existing layers:**
- Uses Module B (capability registry) as the detection substrate — stale heartbeats are failures the engine sees before any command is issued
- Uses Module A's replay buffer to log every detect→diagnose→repair→validate→adapt cycle
- Uses Module E for logic-defect repair (generate-fix-verify)
- Uses Module H to store resolved failure patterns for faster future detection
- Uses the dead-man's switch (refinement 3) as the primary detection trigger for Layer 1 backend death
- Uses the cost ceiling: repair attempts count against the run budget
- Uses the auto-continue score gate: a step whose repair fails validation cannot count as an improvement

**Non-goals:**
- Not a replacement for explicit error handling inside generated code — Module E still owns that
- Not unsupervised autonomy over irreversible high-risk actions — those still surface to the human with evidence

## Locked Refinements
1. Shizuku screenshot path over AutoX
2. Swappable voice router plugins
3. Dead-man's switch (monitors Termux and proot heartbeats separately)
4. termux-mcp 120+ tool integration
5. droid-agent external adb UI refs
6. Termux proot replication — Claude Code bootstrap, static instruction mapping, silent auto-degrade
7. Unified MCP surface across Termux and proot backends
8. Session replay buffer for macro reuse
9. Capability registry with heartbeat expiry
10. Media pipeline hook via MCP surface
11. Cross-device sync spine via Drive + GitHub
12. Code interpreter with static pre-pass, sandboxed execution, traceback feedback, three-failure cap, objective/check/stop framework
13. Voice-to-chat injection overlay — ACTION_SET_TEXT primary, clipboard fallback, IME key submit, foreground-app gating, spoken safety confirm, AccessDroid/amctl Termux bridge, replay-buffer audit logging, global allowlist synced via Drive spine
14. Screen grid input overlay — 10×20 chess-notation grid, auto cell-size from resolution, UI-tree-first targeting ladder with grid/OCR/HID fallbacks, zoom-crop precision, tap verification, keypress replication (letters/space/back/enter), ephemeral overlay
15. **Single-grant architecture** — one Shizuku/ADB authorization covers all layers and modules; no per-feature permission prompts; every layer declares its subset; anything needing a separate grant gets reworked or dropped; future additions inherit automatically; the single grant IS the security boundary alongside Module F's allowlist and Module E's sandbox
16. **Semantic memory layer** — vector embeddings alongside flat-text checkpoints; hybrid search (vector + keyword + metadata); selective write ADD/UPDATE/INVALIDATE/NOOP; cosine dedup on write path (threshold 0.95, zero-LLM lexical default); four timestamps per fact; decay + consolidation background jobs; raw episodes preserved; local embedder in proot (single-grant compliant)
17. **Auto-fail-resolution engine** — five-stage self-healing cycle (detect → diagnose → repair → validate → adapt); error classification routing (transient/permanent/logic/semantic); retry with exponential backoff + jitter; circuit breakers per layer; fallback chains with graceful degradation; automatic alternative-method search on non-resolution; evidence-backed human escalation only for high-risk irreversible actions; integrates with dead-man's switch, Module E, Module H, cost ceiling, and auto-continue gate
18. **AI-side dead-man's switch** — lightweight watchdog pings the model on a short interval; if the API hangs or the model starts looping silently, auto-restarts the session or falls back to a cached response; closes the gap where a non-responsive model looks like normal idle time; integrates with Module I's detection stage and Module B's capability registry
19. **Meta-improvement engine** — treats the stack's own architecture as an optimizable artifact; periodically reads accumulated lessons from Module H (resolved failure patterns, score trends, cost data) and Module I's adaptation deposits; proposes concrete design changes — swapping an underperforming layer, tightening a fallback chain, reordering a targeting ladder — with evidence from real usage data; each proposal is itself scored by the auto-continue gate before being surfaced; human is final approver; the engine improves the improver without unsupervised self-modification of critical paths

## Optimization Notes
- Proot is fallback-only, never preferred
- Bootstrap is one-time, no ongoing Claude dependency
- Instruction mapping is a static table — zero runtime cost
- Proot shares Termux permission grants
- All layers independently restartable
- Dead-man's switch tracks both backends
- Fallbacks are silent to the user
- Replay buffer is append-only — no rewrite cost per entry
- Capability registry uses in-memory cache with periodic Drive flush
- Media hook piggybacks existing file-watcher patterns from media_serve.py
- Sync spine batches writes to avoid Drive API throttling
- Code interpreter reuses proot sandbox — no new infrastructure
- Static analysis runs before execution — cheapest possible filter
- Traceback feedback is the highest-value signal; never skip it
- Three-failure cap prevents infinite repair loops
- Interpreter iterations count against cost ceiling
- Voice-to-chat uses FastMap for zero-latency trigger detection
- Foreground-app check is a single cheap termux-api call before any injection
- ACTION_SET_TEXT is preferred over clipboard because it preserves clipboard state
- IME key event for send is more reliable than coordinate taps on dynamic send buttons
- AccessDroid/amctl adds no new permission surface beyond the accessibility grant already needed for Layer 4
- Global allowlist avoids per-device duplication — single source of truth in Drive spine
- Grid cell codes are shorter than pixel pairs — fewer tokens per targeting action
- Auto cell-size from resolution means zero per-device configuration
- Grid is ephemeral overlay — no persistent on-screen artifact for the user to see or dismiss
- Targeting ladder prevents wasting grid attempts on tree-visible elements
- Tap verification catches silent misses before the agent proceeds on stale assumptions
- Zoom-crop turns a coarse 200-cell grid into effectively arbitrary precision on demand
- OCR and HID fallbacks cover the two hardest surfaces: canvas text and input-blocking apps
- Keypress-by-name (droid-agent/amctl) replicates physical keyboard input without coordinate guessing
- **Single-grant means zero permission-prompt latency after setup** — the stack never blocks the user for access
- Semantic dedup runs on the write path with zero LLM cost (lexical default)
- Vector index lives locally in proot — no cloud embedding API, no new grant
- Hybrid retrieval packs only top-k within a token budget — no context pollution
- Raw episodes preserved alongside extracted facts — verbatim beats extraction by 16–22 points
- Error classification prevents retrying permanent failures — saves quota and latency
- Circuit breakers stop retry amplification during sustained outages
- Fallback chains compose with retry and breaker — three layers, not three separate systems
- Adaptation deposits resolved patterns into Module H — the engine gets faster over time
- Auto-method-switching honors the standing rule: walls trigger wider scans, never narrower focus
- AI-side watchdog ping interval is short enough to catch hangs before the user notices, long enough to avoid false positives from slow-but-valid responses
- Meta-improvement proposals are evidence-backed from real usage metrics, not speculative — the engine reads data before it suggests changes
- Meta-improvement runs on a slow cadence (daily or per-N-sessions) so it doesn't compete with real-time work for compute
- Critical-path changes from meta-improvement always require human approval before commit
