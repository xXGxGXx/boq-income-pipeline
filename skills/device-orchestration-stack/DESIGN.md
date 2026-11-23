# Device Orchestration Stack — Design Doc
**Locked:** 2026-11-23 | **Status:** Design phase, pre-build (optimized)

## Goal
A voice-first, minimal-fail-point orchestration layer combining the best non-conflicting parts of Termux, PyDroid, Media Commander, Voice Commander, Desktop Commander, Base44, and user-made designs into one system. Not a literal merge of every feature — only the parts that work well together and fill each other's gaps.

## Core Stack (non-conflicting layers)

### Layer 1 — Base: Termux
- Already installed and proven on this device
- Provides shell, package management, background execution
- No additional install burden
- **Termux Replication (OPTIMIZED ADDITION)**: proot-based fallback (UserLAnd/Andronix) replicating Termux's three core functions — Linux userspace, package manager, background processes — without Termux dependency. Bootstrap via Claude Code one-time scaffold script. AI-generated Termux instructions map via automated search-and-replace (termux-setup-storage → storage mount, pkg → apt). Positioned as auto-degrading fallback: Termux primary, proot secondary, never hard-fail.

### Layer 2 — AI Bridge: termux-mcp (wujie272)
- 120+ tools exposed to AI clients
- Three-tier privilege ladder: Shizuku first, ADB second, direct Termux third, auto-degrading
- Layered loading: core tools start in zero seconds
- Slots directly into existing Termux setup
- **Proot bridge**: same MCP tool surface works against proot session when Termux unavailable — one interface, two backends

### Layer 3 — File/Terminal: Desktop Commander Remote
- Already running (paired via Termux npx)
- File ops, terminal, process control
- Remote MCP endpoint: https://mcp.desktopcommander.app/mcp
- **Proot compatibility**: Desktop Commander can target proot filesystem path as working directory

### Layer 4 — Screen Vision & Input
- **DeVA accessibility-service pattern**: sees and taps UI elements
- **droid-agent (PyPI)**: zero on-device install, adb from outside, dumps UI tree into numbered refs so the model taps "element 3" instead of guessing coordinates
- **Shizuku-based screenshot path**: replaces AutoX — kills the MediaProjection prompt entirely, stays inside the existing ADB/Shizuku security model already built 2026-11-12

### Layer 5 — Voice: Vox Commander triple-layer routing
- Fast regex first, local LLM second, offline fallback third
- **Swappable router**: regex/local-LLM/cloud-fallback as plugins behind one interface — hot-swap any layer without touching core

### Layer 6 — Cloud Builder: Base44 Superagent
- Voice chat, WhatsApp/Telegram control, published MCP tools
- Cloud-side complement to on-device layers

### Layer 7 — Orchestration: Hermes-style flat multi-agent
- Parallel workstreams that respawn if one dies
- No single point of failure

### Wildcard: ARGUS
- Pattern worth stealing — details TBD on deeper inspection

## Locked Refinements
1. **Shizuku screenshot path** over AutoX — no MediaProjection prompt, inside existing permission stack
2. **Swappable voice router** — plugin interface, hot-swap layers
3. **Dead-man's switch** — if the orchestrator stalls or loses heartbeat, auto-recover or alert
4. **termux-mcp integration** — 120+ tools, tiered privileges, zero-second core load
5. **droid-agent** — external adb, numbered UI refs, no on-device install
6. **Termux replication via proot** — UserLAnd/Andronix fallback, Claude Code bootstrap, automated instruction mapping, auto-degrading to proot when Termux unavailable
7. **Unified MCP surface** — termux-mcp and Desktop Commander expose one tool interface across Termux and proot backends

## Optimization Notes (2026-11-23)
- Proot layer is fallback-only: never preferred over native Termux, activates only on Termux absence or failure
- Bootstrap script is one-time: Claude Code generates it, device runs it, no ongoing Claude dependency
- Instruction mapping is a static lookup table, not runtime AI inference — zero extra cost per command
- Proot session shares the same Shizuku/ADB permission grants as Termux — no new security surface
- All layers remain independently restartable; proot restart is a single command
- Dead-man's switch monitors proot heartbeat separately from Termux heartbeat

## Design Principles
- Minimal fail points: every added tool must justify its failure surface
- Auto-degrading privileges: Shizuku > ADB > direct, never hard-fail
- Voice-first: all control reachable by voice
- Zero manual install steps for the end user where possible
- Each layer independently restartable
- Fallbacks are silent: user never sees which backend is active

## Open Questions
- ARGUS deeper inspection needed
- Base44 MCP tool exposure specifics
- Dead-man's switch trigger thresholds
- Whether droid-agent and termux-mcp conflict on adb sessions
- Proot vs Termux performance delta on media-heavy workloads (media viewer use case)
- Whether Base44 Superagent can target proot backend directly or needs termux-mcp relay
