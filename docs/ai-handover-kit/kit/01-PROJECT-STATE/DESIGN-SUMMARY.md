# Design summary (full plan: `07-REFERENCE/AI-USER-EXTENSION-PLAN.md`)

## Principles, in priority order

1. Private stays private.
2. API before pixels: use an app's API, intent or deep link first, the accessibility tree second, vision last.
3. Verify every action: re-read the screen or resource after each step.
4. Same brain for every input: voice, text, share sheet, notification and schedule all become one `InputEvent`.
5. Earn autonomy: new procedures ask first; only proven, reversible ones run unattended.
6. Measure, then improve: changes ship only when the owner's own eval set says they help.

## Architecture

```
Inputs (panel text, push-to-talk voice, share sheet, tile, notification reply, schedule)
  → InputEvent {text, alternatives, confidence, modality, screen snapshot at speech start}
  → Router: FastMap rules (every speech alternative) → on-device model → cloud planner
  → Planner fixes a plan over allowlisted tools (plan-then-execute)
  → Gatekeeper: risk tier T0–T4, budget, taint, pinned tool hash
  → Tool broker (MCP): Hands (phone, browser, Windows) · Finder (local, connectors, web) · media lane
  → Verify → Respond (short text or speech) → Record (evidence ledger + episode log) → nightly learning
```

## Where things run

| Machine | Runs |
|---|---|
| Phone: companion app (Automation Forge, `com.automationforge.v4`) | **Default digital assistant** (summon by long-press home/power or corner swipe; reads the screen through Android's Assist API without accessibility), mic, push-to-talk, speech recognition, TTS, panel, confirmations, kill switch, on-device model (LiteRT-LM) |
| Phone: Termux | Phone MCP server and Hands (through Shizuku `rish`), local Finder index, FastMap |
| Phone: Mobilerun Portal (`com.mobilerun.portal`) | Live accessibility tree, numbered overlays, Unicode keyboard; reached through its ContentProvider via `rish`. Its HTTP/WebSocket servers stay **off** (they listen on every network) |
| PC (Windows) | Orchestrator (gatekeeper, router, ledger), Playwright MCP with a separate agent Chrome profile, Windows-MCP, Desktop Commander, larger index, n8n (optional) |
| Between them | Tailscale only; servers bind to loopback or the tailnet address; mcp-proxy as the gateway |
| Cloud | Model APIs, Google Workspace MCP, GitHub MCP, web search APIs. Only redacted or approved data |

## The single grant

Shizuku (official build) as the one permission the owner grants. A script (`bootstrap/grant_all.sh`) then makes every other grant through it: assistant role, restricted settings, Portal's accessibility service and keyboard, notification listener, overlay, microphone, notifications, battery and phantom-process exemptions.

## Finder (search everything)

- **Privacy router first:** a personal query (my files, photos, mail…) never reaches a web search API. Mixed queries send the web a scrubbed version. Secrets, bank or card numbers and private terms block the web part entirely.
- **Sources:** a 24-source adapter catalogue: local index (SQLite FTS5 + vectors, EmbeddingGemma), Drive, Gmail, Calendar, GitHub, Brave and Parallel web search, Google-backed fallback for multi-hop questions, Wikipedia, Wayback, YouTube transcripts (run on the phone), xAI `x_search`, Hacker News, Reddit, RSS, OpenAlex, Crossref, podcasts, weather, Translink, places, Australian government data, licensed images. Never face-recognition services.
- **Depths:** quick, check (two engines, cross-checked), research (planner, parallel searchers, claim-by-claim verifier, cited write-up).

## Voice and typing parity

Push-to-talk default (wake word optional). Android on-device recogniser with name biasing now; Moonshine v2 or sherpa-onnx streaming next; Kokoro TTS. One name list feeds both the recogniser and the router. FastMap checks every alternative. Spoken corrections edit the pending action. Targets: rule-matched command acts within 600 ms; voice reaches the same intent as typing at least 98% as often.

## Brain (model routing)

Private data: on-device only. Routing and short summaries: Haiku-class. Tool loops: Sonnet-class. Planning, code, high-stakes checks: Opus-class. Second opinion: another vendor's top model. Real-time social: Grok. Cited answers: Perplexity.

## Learning loop

Episodes → candidate macros (L1, ask every time) → verified skills (L2, 5+ passing replays, owner approves a fingerprint) → trusted (L3, 10+ real successes, reversible only, may run unattended). Any undo demotes to L1. Skills in the open `SKILL.md` format, never from a marketplace. Weekly personal eval set with a hidden held-out part; a change ships only if nothing regresses. The optimiser can never see or edit its own evaluator.

## Safety

| Tier | Examples | Rule |
|---|---|---|
| T0 read | read, search, open | runs, logged |
| T1 reversible write | tap, type, draft, edit with history | runs, undo available |
| T2 external send | send message/email, post, share, push to main | confirm each time |
| T3 irreversible | delete, uninstall, change settings or permissions | confirm + biometric + dry run + cooldown |
| T4 financial/identity | pay, transfer, passwords, 2FA | **never executed**; draft only |

Plus: plan-then-execute, a quarantined reader for untrusted content, taint tracking, pinned tool definitions, banking and password apps denied to Hands, kill switch, OpenClaw's lessons (loopback by default, fail-closed auth, device pairing, security audit).
