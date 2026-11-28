# Handover Protocol v4

**Date:** 2026-11-28 | **Overseer:** Grok | **Human final judge:** the owner
Keeps every v3 rule. Items marked **NEW** are additions in v4.

## Standing principles

1. **Human is final judge.** AIs propose; the owner decides what merges into originals, the repository, or the design.
2. **Private stays private.** Nothing personal goes into a public place (the GitHub repository is public). See `02-SHARED-RULES/PRIVACY-AND-SAFETY.md`. This beats every other goal.
3. **Verify before you claim.** No completion or fact claim without a fresh check in the same session. Say "unverified" when you couldn't check.
4. **Zero manual input where possible** (v3). Rank every action: AI-native → command-driven → owner-prompted. Use the owner only when no avenue exists, and then give a direct link plus one line of instruction.
5. **Continue, don't restart** (v3). Read STATE.md; pick up the single next action recorded there.
6. **One writer merges** (v3). Grok merges; others propose.

## Rules for every platform

1. **Immutability.** Never edit originals (`01-PROJECT-STATE/`, `02-SHARED-RULES/`, `03-PROTOCOLS/`, `07-REFERENCE/`) or another platform's folder. Write only in your `04-PLATFORMS/<PLATFORM>/THOUGHTS/` and append to `06-SHARED-BOARDS/`.
2. **Dynamic subfolders** (v3). You may create subfolders inside your own THOUGHTS folder for new categories. Log each in MERGE-LOG.md.
3. **One improvement per proposal**, scored with the rubric in P7.
4. **Unique IDs** (v3, extended **NEW**):
   - Errors: `ERR-YYYYMMDD-<PLATFORM>-NNN` (platform added so IDs never collide)
   - Ideas: `IDEA-YYYYMMDD-<PLATFORM>-NNN`
   - Requests to other AIs: `REQ-YYYYMMDD-<FROM>-<TO>-NNN`
   - Retrieval finds: `RET-YYYYMMDD-<PLATFORM>-NNN`
   - Verifications: `VER-YYYYMMDD-<PLATFORM>-NNN`
5. **Version stamp** (v3). Every contribution opens with `REVIEWED-AGAINST: kit v4.0 / plan 2026-11-27`.
6. **Log everything** (v3). One line in MERGE-LOG.md per contribution and per new folder.
7. **Receipt on arrival** (v3). Fill a Handover Receipt before working. An incomplete kit is reported, not silently worked around.
8. **State before you leave** (v3). Update STATE.md: platform, time, what you did, what remains, the single next action.

## NEW in v4

1. **Capability self-report (P2).** Every platform states, before working, exactly which tools it has in this account right now (web search, memory, file access, Drive, GitHub, code execution, scheduled tasks). No paid-feature assumptions; ChatGPT is free tier.
2. **Retrieval sweep (P3).** Every platform searches its own memory, past conversations, projects, libraries, uploaded files and connected sources for anything useful to this project, records each find in a Retrieval Ledger, and adds the best to the shared RETRIEVAL-INDEX.
3. **Cross-AI requests (P5).** Platforms can't message each other, so they post requests on REQUEST-BOARD.md; the owner or Grok relays them. Each platform must post at least two requests and answer any addressed to it.
4. **Red team duty (P6).** Every platform names at least three ways the current design could fail.
5. **Kit self-improvement (P7).** Every platform proposes at least one improvement to this kit itself; Grok merges approved ones into the next kit version.
6. **Scoreboard.** SCOREBOARD.md tracks each platform's accepted proposals, confirmed errors and verified claims, so the owner can see which platform is best at what and route work accordingly.
7. **Integrity check.** `08-TOOLS/MANIFEST.sha256` lists every original file's hash. Platforms that can run code check it with `verify_kit.py`; others compare file counts with KIT-INDEX.md.

## One-writer merge (Grok, when the kit returns)

1. Read MERGE-LOG.md for contribution order, ERROR-AGGREGATOR.md for errors several platforms found, REQUEST-BOARD.md for open requests, and STATE.md.
2. Compare each platform's THOUGHTS against the originals. Resolve conflicts with P9.
3. Propose merges in one summary for the owner: accept / reject / needs-test, with evidence.
4. Nothing changes until the owner approves. Approved items go to Claude to build and test in the repository.
5. Record approved changes in VERSION-TRACKER (top of MERGE-LOG.md), bump the kit version, regenerate KIT-INDEX.md.
