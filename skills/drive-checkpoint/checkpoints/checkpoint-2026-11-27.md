# Checkpoint 2026-11-27

Covers the Claude Code cloud session that ran 2026-11-26 20:11 UTC to 2026-11-27 00:05 UTC. Entry times are approximate. Every SHA and count below was read back from GitHub (API and `git ls-remote`) in that session.

## [22:00 UTC 11-26] CI privacy fix on main (superseded)
- Changed: Fixed main's 13 privacy findings (Drive IDs redacted in tiered-memory SKILL.md, the 2026-11-26 checkpoint and the research notes; bank test fixture built at runtime). Main fixed the same findings independently in #21, so the merge took main's versions and this commit added nothing net.
- Refs: ce5484c on claude/dead-mans-switch-landing-ml4tvb. fix/ci-privacy-baseline-20261125 (c5f1a15) found 2 commits behind main and never sent as a PR.
- Standing: none
- Artifacts: none

## [22:40 UTC 11-26] Launch Runway merged (PR #26)
- Changed: Added gumroad/launch-runway.html (32,413 bytes), an offline AUD payout planner for the four Gumroad products ($5 / $19 / $37 / $49): weekly sales, channel mix (own links, Discover, affiliates at 35%), fees, 26-week stacked payout chart, monthly goal. Fee defaults (10% + $0.50 Gumroad, 2.9% + $0.30 card, 30% Discover) are unverified assumptions. Sales volumes are made-up examples. Also published as a private claude.ai artifact.
- Refs: squash-merged as a694865. CI: Integrity and privacy passed, Orchestrators and Media Hub passed, Android and browser jobs skipped (paths unchanged).
- Standing: none
- Artifacts: gumroad/launch-runway.html in the repo

## [22:50 UTC 11-26] Four unmerged branches merged (PR #27)
- Changed: Merged anti-regression-protocol-v1 (skills/anti-regression-protocol/PROTOCOL.md), research-findings (Research Findings/visual-channels-2026-11-25.md), visual-status-page (visuals/ci-status-visual.html, visuals/ci-status.html) and, from ci-hardening-gitleaks-healthcheck, only scripts/connector-healthcheck.py. Kept main's .gitleaks.toml: the branch's version used the legacy [allowlist] table that Gitleaks 8.25+ refuses to load. Corrected the health-check docstring: it does one fetch per endpoint, with no retries and no self-test.
- Refs: merge commit 81d3d03. All checks green.
- Standing: none
- Artifacts: none

## [22:56 UTC 11-26] max-effort-skill-v6 merged (PR #28)
- Changed: Added skills/maximum-effort-skill/SKILL-v6.md (5,119 bytes).
- Refs: merge commit e88ba68, now main HEAD. All checks green.
- Standing: none
- Artifacts: none

## [23:59 UTC 11-26] Branch cleanup complete
- Changed: boq-income-pipeline went from 36 branches to 1 (main only), verified with the GitHub API and git ls-remote. The owner deleted 35 on github.com, including claude/media-hub-app-bsehae and forge-intelligence/preflight-core-v0.1, whose work was already on main. dead-mans-switch has only main (6b32f27) and has never had a PR.
- Refs: last commit SHA of every deleted branch was recorded in-session before deletion. All were merged, on main, or superseded by later work on main.
- Standing: Claude Code cloud sessions cannot delete branches or push to any branch except their own session branch (git push returns 403 from the egress proxy; the GitHub connector has no delete-branch tool). Branch deletes go to the owner.
- Artifacts: none

## [00:00 UTC 11-27] Lessons from the cleanup
- GitHub mobile branches page hides the bin icons (table wider than the screen). Fix: open in Chrome (not the in-app tab), tick Desktop site, or delete from each PR's page.
- On a PR page, "Delete branch" turns into "Restore branch" in the same spot. A second tap restores the branch.
- The branches page sorts by "Updated". With names cut off, rows were identified by order and age, and two "keep" rows were deleted by mistake. Read names before deleting.

## Other facts from the session
- The dead-mans-switch Vercel landing URL did not resolve from the cloud session (DNS ENOTFOUND); its content was not checked.
- Podroid v1.3.0 (ExTV/Podroid): Android Linux VM app with Docker. New experimental User-Mode Linux backend needs no root or adb grant. AVF and QEMU backends remain. Reviewed only, not installed.
- Weft Loom (a sequencer artifact) was built, rejected by the owner and deleted. Never committed.
- The uploaded gumroad-launch-plan PDF (2026-11-24) contains bank payout details. It must never be committed or quoted into the repo.

## Status of the 2026-11-25 sign-off open items
1. PR for fix/ci-privacy-baseline-20261125: superseded by #21; branch deleted.
2. fix-baseline-test-fixtures: superseded; branch deleted.
3. CI on the fix branch: moot. Main CI green on every merge this session.
4. 13 stale metavar branches: deleted, along with every other stale branch.
5. Gitleaks .toml and pre-push hook: on main (.gitleaks.toml, .githooks/pre-push).
6. Health-check script: on main as scripts/connector-healthcheck.py. Not scheduled or deployed anywhere.
7. Module F voice-to-chat injection: still not built.

## Not done this session
- No Drive memory sync tool (edit_memory) was available in the Claude Code session, so memory was not updated.
- The older Drive checkpoint docs are read-only to this connector (canEdit false), so today's entry is a new file, not an append.
