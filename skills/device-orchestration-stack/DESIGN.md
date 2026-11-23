# Device Orchestration Stack — Design Doc
**Locked:** 2026-11-23 | **Status:** Design phase, pre-build (optimized + extended)

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
