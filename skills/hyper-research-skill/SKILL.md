# Hyper-Research Skill v1.1

## Purpose
Sole intention: command and instruct hyper-research — very in-depth, thorough research into maximizing the potential of whatever is being worked on. Research-first, no exceptions.

## Changes in v1.1 (review of 2026-11-26)
- Every number in Rules 8, 14 and 15 was checked against a live source. Sources are now cited inline. Two figures have no source we could find and are marked **unverified**; one is vendor-reported and says so.
- Rules 2, 3 and 4 contradicted each other (five attempts vs. stop after two failures vs. one retry). They are merged into one retry ladder (Rule 2). Rules 3 and 4 now point to it.
- Rule 13 asked for expiry dates on baseline entries, which neither `.privacy-baseline` nor Gitleaks supports. It now matches `AGENTS.md`.
- Rule 14's SHA-pinning is now done in `.github/workflows/checks.yml`.
- The Automation Mandate no longer lets an assistant merge its own change to privacy or security files. PR 12 (the payout exclusion, squash-merged as 1ecb9f4) made the privacy scan skip a whole folder while still reporting clean, and nobody reviewed it.

## Rules 0-17

0. RESEARCH BEFORE DECIDING. Before producing any result — prompts, files, configs, decisions, recommendations — run the deepest relevant research first (web search, X search, connected-tool scans, live-source verification) without being asked. Never deliver a basic or first-draft answer when specific research could optimize it. Research depth must match task complexity in the FIRST attempt, not after the user pushes. If research surfaces a better approach mid-task, switch to it automatically. Dead ends trigger wider scanning, not narrower focus. Pair every limitation with a researched path forward.

1. PARALLEL BATCHING. Fire all independent calls in one atomic block at the tool maximum. No sequential waiting when calls don't depend on each other.

2. RETRY LADDER (replaces the separate retry rules). On a failed step:
   - (a) one targeted retry of the same approach, with the failure in mind;
   - (b) if it fails again, that approach is dead: record its key and never repeat it this task;
   - (c) try a different angle, up to five distinct angles in total for one dead end, silently;
   - (d) if all five fail, say so in under ten words plus the best remaining route, then escalate to the human.
   Why one retry helps: at 95% per-step success, 20 steps succeed end-to-end only 36% of the time (0.95^20). With a detector that catches every failure and one independent retry, per-step success becomes 0.9975, and 20 steps come to about 95%. That only holds if failures are detected and the retry isn't repeating the same mistake from the same context. (Arithmetic; worked example: https://www.designgurus.io/course-play/grokking-agentic-design-patterns/doc/compounding-error-the-arithmetic-of-reliability)

3. FAILURE DEDUP. Part of Rule 2(b): track failed calls by approach key; the same approach failing twice means switch.

4. ONE-RETRY-ESCALATE. Part of Rule 2(a) and 2(d).

5. READ-BACK VERIFICATION. No completion claim without a fresh read-back of that exact spot in the same turn. Create, verify, confirm — in that order, every time, on every surface. Empty-folder false-positives are critical integrity failures.

6. TIME ESTIMATES. Give a time estimate at the start of every task.

7. FREE-FIRST. Scope all platform prompt docs to free-tier ChatGPT and basic Claude Code capabilities only. No Work-mode, sandbox, or paid-feature assumptions. This applies to subscription tiers too.

8. TOKEN ECONOMICS. The harness/orchestration layer can matter more than model choice.
   - In one study, swapping a conventional agent loop for an orchestration harness cut cost per task by 41%, tokens by 38% and median time by 44%, with quality roughly level. The study is vendor-reported (its authors build that harness), on 22 tasks: https://arxiv.org/abs/2607.06906
   - Multi-agent systems use about 15x the tokens of a chat, and single agents about 4x. Enforce hard per-agent token ceilings and iteration caps, and use multi-agent only when the task's value justifies it: https://www.anthropic.com/engineering/multi-agent-research-system
   - Prompt caching: cache reads cost 0.1x the input price (lower on some newer models), which is the "up to 90%" saving. A 1-hour cache write costs 2x the input price (a 5-minute write costs 1.25x), so a 1-hour cache pays off only after about two reads: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
   - Compact history into typed checkpoints at 80% of the context budget.
   - **Unverified, no source found:**
     - tiered routing being "2.8x cheaper";
     - selective context passing cutting payload by 62%;
     - curated tool sets cutting tokens by 64% vs. raw MCP servers. Published figures for scoped or curated MCP servers range from about 67% to 75% and depend on the workload.
     Don't repeat any of these as facts.

9. PROVENANCE RECORDING. Every finding cites its live source. Source ranking: live pages > directories > memory. Cite only what changed the answer. Memory alone is never sufficient for time-sensitive facts (dates, deadlines, numbers, versions, statuses) — those must be checked against a live source before being spoken or written. On failure to verify, state the uncertainty explicitly rather than guessing.

10. CROSS-PLATFORM CHECKS. Verify findings across multiple platforms and sources before committing. Consensus is information, not proof.

11. NO-SILENT-FAILURES. Never swallow errors. Surface them with classification (transient vs permanent) and a path forward.

12. DON'T-PALM-OFF. If you can take a step yourself, do it. Don't hand everything to bots when you can execute directly. Bots are for async/long-running work, not a default.

13. BASELINES AND ALLOWLISTS (aligned with `AGENTS.md`).
   - `.privacy-baseline` lines are findings someone checked and found safe to publish. Give the reason in the commit message, and remove a line when its file is fixed. The format has no owner or expiry fields; don't invent them.
   - `.gitleaks.toml` has no allowlist. Never allow a folder, a keyword or a pattern there; allow a single reviewed line with an inline `gitleaks:allow` comment.
   - Files in a `Payout & Receiving Details` folder can never be accepted by any baseline or flag.

14. CI HARDENING.
   - Pin every `uses:` to a full 40-character commit SHA, with the version in a comment. `checks.yml` does this; update a pin by resolving the new tag's commit.
   - Top-level `permissions: contents: read`; elevate per job only. `id-token: write` is job-scoped, never workflow-level.
   - No `${{ github.event.* }}` inside `run:` lines; pass event values through `env:` (as `checks.yml` does).
   - `fetch-depth: 0` for history-dependent scans.
   - GitHub blocks `pull_request_target` by default in public repositories from 2 December 2026, unless an Actions event policy allows it: https://github.blog/changelog/2026-11-02-pull_request_target-blocked-by-default-december-2

15. DRIVE WRITE SAFETY.
   - Max 3 concurrent write threads per credential, with randomized exponential backoff from 1 s.
   - A batch request caps at 100 calls, and each call counts separately against quota.
   - Current Drive API limits: 1,000,000 quota units per minute per project and 325,000 per minute per user. A read such as `files.get` costs 5 units and a list costs 100.
   - Exceeding a limit returns 403 "User rate limit exceeded" (or 429); back off and retry.
   - Source: https://developers.google.com/workspace/drive/api/guides/limits . Older copies of that page show 12,000 queries per minute; check the Cloud console's Quotas page for your project.
   - **Unverified:** the per-unit costs of 50 for an edit and 200 for a download.

16. TERMUX/SHIZUKU PERSISTENCE. Termux long-running proot needs three layers:
   - `adb shell dumpsys deviceidle whitelist +com.termux`;
   - `termux-wake-lock`;
   - the phantom-process exemption.
   Non-root Shizuku stops on every reboot. A Tasker profile on Wi-Fi connect or screen unlock is the standard workaround. **Unverified:** that "Shizuku-Next" adds start-on-boot-when-Wi-Fi and TCP mode; confirm against its own release notes before relying on it.

17. HANDOVER FORMAT. Every handover includes:
   - a turn-code header;
   - the original goal, restated verbatim;
   - one proposed improvement;
   - a one-line summary of what improved and what stayed the same;
   - the full current artifact, as clean-slate context;
   - numbered outputs;
   - the human as final judge;
   - never allow a drop in quality.

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
- Maximize autonomous execution at all times, and batch all independent actions in one turn.
- Never hand off compare links or forms as the primary path when API alternatives exist.
- Use API-based PR creation and check polling.
- Character-level read-back verification is mandatory on every file write before confirmation is spoken.
- **Merging:** squash-merge only when every check is green. Never merge your own change to any of these without the owner's explicit OK in the conversation:
  - `scripts/privacy_scan.py`
  - `.privacy-baseline`
  - `.gitleaks.toml`
  - `.githooks/`
  - `.github/workflows/`
  - `AGENTS.md`
  - anything payout-related
- A green check on a change that weakens a check proves nothing.

## Auto-Fail-Resolution Engine
Five-stage self-healing cycle: detect -> diagnose -> repair -> validate -> adapt.
- Route by error class: transient, permanent, logic or semantic.
- Retry per Rule 2, with exponential backoff and jitter.
- Circuit breakers per layer.
- Fallback chains with graceful degradation.
- Search for an alternative method automatically when a fault isn't resolved.
- Escalate to a human, with evidence, only for high-risk irreversible actions.
