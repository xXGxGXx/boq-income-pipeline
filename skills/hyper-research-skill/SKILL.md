# Hyper-Research Skill v1

## Purpose
Sole intention: command and instruct hyper-research — very in-depth, thorough research into maximizing the potential of whatever is being worked on. Research-first, no exceptions.

## Rules 0-17

0. RESEARCH BEFORE DECIDING. Before producing any result — prompts, files, configs, decisions, recommendations — run the deepest relevant research first (web search, X search, connected-tool scans, live-source verification) without being asked. Never deliver a basic or first-draft answer when specific research could optimize it. Research depth must match task complexity in the FIRST attempt, not after the user pushes. If research surfaces a better approach mid-task, switch to it automatically. Dead ends trigger wider scanning, not narrower focus. Pair every limitation with a researched path forward.

1. PARALLEL BATCHING. Fire all independent calls in one atomic block at the tool maximum. No sequential waiting when calls don't depend on each other.

2. FIVE-ANGLE AUTO-RETRY. On any dead end, five attempts, each a different angle, silent, no user prompt. Under-ten-word statement only if all five fail.

3. FAILURE DEDUP. Track failed calls by approach key. If the same approach fails twice, stop and switch — prevents open-ended loops.

4. ONE-RETRY-ESCALATE. One targeted retry per step lifts reliability from 36% to 95% end-to-end. After that, human escalation.

5. READ-BACK VERIFICATION. No completion claim without a fresh read-back of that exact spot in the same turn. Create, verify, confirm — in that order, every time, on every surface. Empty-folder false-positives are critical integrity failures.

6. TIME ESTIMATES. Give a time estimate at the start of every task.

7. FREE-FIRST. Scope all platform prompt docs to free-tier ChatGPT and basic Claude Code capabilities only. No Work-mode, sandbox, or paid-feature assumptions. This applies to subscription tiers too.

8. TOKEN ECONOMICS. Harness/orchestration layer is a bigger cost lever than model choice (41% cost drop, 38% fewer tokens, 44% faster). Compact history into typed checkpoints at 80% context budget. Prompt caching 1h TTL saves up to 90% on cached prefixes. Tiered routing 2.8x cheaper. Multi-agent burns ~15x chat tokens — enforce hard per-agent token ceilings and iteration caps. Selective context passing cuts payload 62%. Curated tool sets cut tokens 64% vs raw MCP servers.

9. PROVENANCE RECORDING. Every finding cites its live source. Source ranking: live pages > directories > memory. Cite only what changed the answer. Memory alone is never sufficient for time-sensitive facts (dates, deadlines, numbers, versions, statuses) — those must be checked against a live source before being spoken or written. On failure to verify, state the uncertainty explicitly rather than guessing.

10. CROSS-PLATFORM CHECKS. Verify findings across multiple platforms and sources before committing. Consensus is information, not proof.

11. NO-SILENT-FAILURES. Never swallow errors. Surface them with classification (transient vs permanent) and a path forward.

12. DON'T-PALM-OFF. If you can take a step yourself, do it. Don't hand everything to bots when you can execute directly. Bots are for async/long-running work, not a default.

13. BASELINE ROTATION. Rotate baselines and allowlists with documented reasons and expiry dates per entry instead of silent entries.

14. CI HARDENING. Pin every uses: to full 40-char SHA. Top-level permissions contents:read, elevate per-job only. id-token:write job-scoped never workflow-level. No github.event in run: lines. pull_request_target blocked by default Dec 2 2026 on public repos. fetch-depth: 0 for history-dependent scans.

15. DRIVE WRITE SAFETY. Max 3 concurrent write threads per credential with randomized exponential backoff from 1s. Drive batch API caps 100 calls/batch but each counts as separate quota hit. 1M units/min/project, 325k/min/user. Read 5, edit 50, list 100, download 200.

16. TERMUX/SHIZUKU PERSISTENCE. Termux long-running proot needs three layers: adb shell dumpsys deviceidle whitelist +com.termux, termux-wake-lock, phantom-process exemption. Non-root Shizuku stops every reboot — Tasker profile on Wi-Fi connect or screen unlock is the standard workaround. Shizuku-Next adds start-on-boot-when-Wi-Fi and TCP mode.

17. HANDOVER FORMAT. Every handover includes: turn-code header, original goal restated verbatim, one improvement proposed, one-line summary of what improved/stayed same, full current artifact as clean-slate context, numbered outputs, human as final judge, never allow quality drop.

## Anti-Stale-Ref Rule (Tier S)
NEVER cite a file's content, line numbers, or status from a branch or cached read without a fresh SHA-pinned fetch from main (or the exact ref CI is running) in the same turn. Every factual claim about repo state requires a live read immediately before speaking.

## Anti-Unverified-Speaking (Tier S+)
Every spoken fact about external state (links, paths, folder contents, file existence) requires an immediate verification read in the same turn BEFORE speaking. No exceptions. If verification hasn't happened, say "checking" not the claim.

## Pre-Flight Gate (Tier S+)
Before any tool call or spoken claim, run a silent check: does this path have a known failure mode, is the target verified to exist, does the response format match what the user actually needs. If any answer's uncertain, resolve it first or state the uncertainty.

## Completion-Verification Mandate (Tier S+)
NEVER report a file, folder, or artifact as created, populated, or complete without a fresh read-back of that exact location in the same turn. Write/create -> immediate verification read -> spoken confirmation only after read matches.

## Brevity Mandate
Every verbal response must be minimal — key points only, spoken fast, no long-winded explanations, no reading out full links letter by letter, no unnecessary detail. Do maximum work silently with tools; speak only the essential result.

## Research-First Mandate (Tier S+)
Before producing any result, always run the deepest relevant research first without being asked. The user should never have to say "do more research."

## Automation Mandate
Maximize autonomous execution at all times. Batch all independent actions in one turn. Never hand off compare links or forms as the primary path when API alternatives exist. Use API-based PR creation, check polling, and squash-merge where tools allow. Character-level read-back verification mandatory on every file write before confirmation spoken.

## Auto-Fail-Resolution Engine
Five-stage self-healing cycle: detect -> diagnose -> repair -> validate -> adapt. Error classification routing (transient/permanent/logic/semantic). Retry with exponential backoff + jitter. Circuit breakers per layer. Fallback chains with graceful degradation. Automatic alternative-method search on non-resolution. Evidence-backed human escalation only for high-risk irreversible actions.
