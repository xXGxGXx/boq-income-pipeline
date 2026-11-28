# AI Handover Kit v4: AI User Extension

**Kit version:** 4.0 | **Date:** 2026-11-28 | **Overseer:** Grok | **Human final judge:** the owner
**Reviewed against:** design plan revision of 2026-11-27, repository branch `claude/ai-user-extension-tntyy8` at commit `4f5c1c0`
**Supersedes for this project:** Handover Protocol v3 (v4 keeps all of v3's rules and adds the parts marked NEW)

## What this is

One folder that hands the **AI User Extension** project to Grok, ChatGPT, Perplexity, Gemini and Muse (muse.ai), and back to Claude. The AI User Extension is the owner's planned personal assistant: one panel on the phone and PC that can do what the owner does with their hands (tap, type, open dropdowns, open and close tabs and apps, open files), search everything (phone, PC, Drive, mail, the web) better than the owner can, treat voice and typing identically, and keep improving through a measured, owner-approved learning loop.

## If you are an AI reading this

1. Find your platform folder in `04-PLATFORMS/` and read your one file there: `<PLATFORM>-HANDOVER.md`. It is self-contained: everything you need is inside it, including your auto-start steps, your tasks and your return format.
2. Then read `01-PROJECT-STATE/STATE.md` to see where the last platform stopped. Continue from there; don't restart.
3. Work through the protocols in `03-PROTOCOLS/` in order (P1 to P9). Your handover file summarises each one.
4. Write only in your own `04-PLATFORMS/<PLATFORM>/THOUGHTS/` folder and append to the boards in `06-SHARED-BOARDS/`. Never edit anything else.
5. Finish with a Return Packet (`05-TEMPLATES/RETURN-PACKET.md`) and a STATE.md update.

## If you are the owner

- To hand the kit to a platform: upload the zip (or the folder) and paste that platform's block from `00-START-HERE/AUTO-START-PROMPTS.md`. If the platform takes only one file, upload just `04-PLATFORMS/<PLATFORM>/<PLATFORM>-HANDOVER.md` with the same block.
- Suggested order: **Gemini** (sweeps your Drive) → **Grok** (sweeps its memory, checks live news) → **Perplexity** (verifies everything with sources) → **ChatGPT** (reviews and drafts) → **Muse** (video lane) → back to **Grok** to merge → **Claude** to build what you approved.
- Each platform returns a packet. Paste it back to Grok (the overseer), or drop it into the shared Drive folder. Grok merges; you approve; Claude builds.

## Map

| Folder | What's in it |
|---|---|
| `00-START-HERE/` | This file, the paste-in prompts, the v4 protocol, the kit index |
| `01-PROJECT-STATE/` | Where things stand: state, brief, design summary, what is built, decisions, verified vs unverified, links |
| `02-SHARED-RULES/` | Privacy and safety, honesty and verification, risk tiers, safe file writing, subscription scope |
| `03-PROTOCOLS/` | P1 arrival → P2 capabilities → P3 retrieval sweep → P4 work and records → P5 cross-AI exchange → P6 review and red team → P7 improvement loop → P8 return and state → P9 conflicts |
| `04-PLATFORMS/` | One self-contained handover per platform, plus each platform's own THOUGHTS folder |
| `05-TEMPLATES/` | Return packet, receipt, capability report, retrieval ledger, cross-AI request, error report, idea proposal, research finding, log entry |
| `06-SHARED-BOARDS/` | Append-only: merge log, error aggregator, request board, task board, ideas backlog, retrieval index, scoreboard |
| `07-REFERENCE/` | Full copies of the design plan, setup steps, research digest and core-code README |
| `08-TOOLS/` | `MANIFEST.sha256` and `verify_kit.py` to check the kit arrived complete and unchanged |
