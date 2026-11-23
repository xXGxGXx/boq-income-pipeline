# Device Orchestration Stack — Design Doc
**Locked:** 2026-11-23 | **Status:** Design phase, pre-build

## Goal
A voice-first, minimal-fail-point orchestration layer that combines the best non-conflicting parts of existing tools (Termux, PyDroid, Media Commander, Voice Commander, Desktop Commander, Base44, and user-made designs) into one system. Not a literal merge of every feature — only the parts that work well together and fill each other's gaps.

## Core Stack (non-conflicting layers)

### Layer 1 — Base: Termux
- Already installed and proven on this device
- Provides shell, package management, background execution
- No additional install burden

### Layer 2 — AI Bridge: termux-mcp (wujie272)
- 120+ tools exposed to AI clients
- Three-tier privilege ladder: Shizuku first, ADB second, direct Termux third, auto-degrading
- Layered loading: core tools start in zero seconds
- Slots directly into existing Termux setup

### Layer 3 — File/Terminal: Desktop Commander Remote
- Already running (paired via Termux npx)
- File ops, terminal, process control
- Remote MCP endpoint: https://mcp.desktopcommander.app/mcp

### Layer 4 — Screen Vision & Input
- **DeVA accessibility-service pattern**: sees and taps UI elements
- **droid-agent (PyPI)**: zero on-device install, adb from outside, dumps UI tree into numbered refs so the model taps "element 3" instead of guessing coordinates
- **Shizuku-based screenshot path** (REFINEMENT 1): replaces AutoX — kills the MediaProjection prompt entirely, stays inside the existing ADB/Shizuku security model already built 2026-11-12

### Layer 5 — Voice: Vox Commander triple-layer routing
- Fast regex first, local LLM second, offline fallback third
- **Swappable router** (REFINEMENT 2): regex/local-LLM/cloud-fallback as plugins behind one interface — hot-swap any layer without touching core

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
3. **Dead-man's switch** — if [the orchestrator stalls/loses heartbeat], auto-recover or alert
4. **termux-mcp integration** — 120+ tools, tiered privileges, zero-second core load
5. **droid-agent** — external adb, numbered UI refs, no on-device install

## Design Principles
- Minimal fail points: every added tool must justify its failure surface
- Auto-degrading privileges: Shizuku > ADB > direct, never hard-fail
- Voice-first: all control reachable by voice
- Zero manual install steps for the end user where possible
- Each layer independently restartable

## Open Questions
- ARGUS deeper inspection needed
- Base44 MCP tool exposure specifics
- Dead-man's switch trigger thresholds
- Whether droid-agent and termux-mcp conflict on adb sessions
