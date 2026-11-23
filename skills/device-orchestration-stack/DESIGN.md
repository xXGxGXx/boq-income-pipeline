# Device Orchestration Stack — Design Doc
**Locked:** 2026-11-23 | **Status:** Design phase, pre-build (optimized + extended + code interpreter + voice-to-chat overlay + screen grid input)

## Goal
A voice-first, minimal-fail-point orchestration layer combining the best non-conflicting parts of Termux, PyDroid, Media Commander, Voice Commander, Desktop Commander, Base44, and user-made designs into one system. Not a literal merge of every feature — only the parts that work well together and fill each other's gaps. Hypothetical master name: **Master Orchestrator**.

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

## Open Questions
- ARGUS deeper inspection needed
- Base44 MCP tool exposure specifics
- Dead-man's switch trigger thresholds
- Whether droid-agent and termux-mcp conflict on adb sessions
- Proot vs Termux performance delta on media-heavy workloads
- Whether Base44 Superagent can target proot backend directly
- Replay buffer retention policy (size cap vs time cap)
- Capability registry schema versioning across updates
- Media hook indexing strategy for large libraries (incremental vs full scan)
- Cross-device conflict edge cases (simultaneous edits on two devices)
- Code interpreter: optimal sandbox isolation level (proot vs subprocess vs full VM)
- Whether static analysis should use a dedicated linter binary or model-based check
- Interpreter loop: should failed rounds trigger model escalation (cheap → premium)?
- ~~Voice-to-chat: should the allowlist of approved chat surfaces be per-device or synced?~~ **RESOLVED: global, synced via Drive spine**
- Whether termux-api accessibility merge (issue #828) will obsolete AccessDroid
- Optimal timing between SET_TEXT and IME submit to avoid dropped key events
- Whether to support multi-field forms (tab between fields) or single-field only
- Grid: optimal default resolution (10×20 vs finer) for typical phone screens
- Whether grid overlay should also render on the user's visible screen (debug mode) or model-only
- Grid vs OCR precedence when both could resolve the same target
- Whether scrcpy UHID path should be default or strictly opt-in for HID-level taps
