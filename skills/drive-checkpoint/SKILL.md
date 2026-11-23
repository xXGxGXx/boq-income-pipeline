# Drive Checkpoint Skill

## Purpose
Guarantee a permanent, independently verifiable record of every durable fact from this conversation. Three surfaces: Google Drive (primary + backup), local memory file, and this GitHub repo as tertiary fallback. Nothing relies on assumption — every write returns a confirmation.

## Trigger
End of every turn containing durable content. No manual flagging from the user is ever required.

**Tier 1 — always checkpoint:**
- Decisions: what was chosen, why, what was rejected
- File paths, commands, commit SHAs, repo URLs
- Project state: built, broken, next steps
- Standing instructions or preference changes
- New integrations, endpoints, API keys by name only (never values)
- Errors and resolutions
- Large artifacts: scripts, code, prompts, configs, documents the user asked to build

**Tier 2 — checkpoint if non-obvious:**
- Insights expensive to re-derive
- External links used
- Active workarounds

**Skip:** ephemeral chatter, banter, mid-thought tangents, anything already captured this turn.

## Action
1. Detect durable content via tiers above.
2. Resolve the Drive write tool at runtime: search connected tools for "create or update file in Google Drive"; fall back to "upload file to Drive" or "write Drive document". Never hard-code tool names.
3. Write/append to `checkpoint-YYYY-MM-DD.md` in folder `1fd66zXGQpdgOjfjme1-XDYNZ_-0kYyHA` (primary), then `1LZa-XlnsM5E5cfFaFKsGozMpoC4rYdVo` (backup). One file per day.
4. Entry format (exact):
   ```
   ## [HH:MM UTC] <one-line topic>
   - Changed: <what changed, one line>
   - Refs: <paths / commands / SHAs>
   - Standing: <standing instruction added/modified, or "none">
   - Artifacts: <Drive file names uploaded, or "none">
   ```
5. Verify: response must return a file ID. No ID = failure → retry alternate folder once.
6. Both folders fail → commit to `skills/drive-checkpoint/fallbacks/checkpoint-YYYY-MM-DD.md` via "create or update file in GitHub" action search. Report the fallback aloud with the commit ref.
7. Sync the same fact to memory via edit_memory (one dated bullet per fact). Mandatory. Retry once on failure; if it still fails, note it in the Drive entry and say so aloud.
8. Confirm aloud: file name + primary/backup/fallback. Never assume silently.

## Artifact upload (large file bodies)
Any substantial artifact produced or modified this turn gets uploaded in full — not truncated — to both Drive folders as `<name>-YYYY-MM-DD.md` (language-fenced). This exists because sandbox disks reset between turns; Drive is the durable copy. Split into `-part1`, `-part2` if over the tool's size limit and note the split. Every upload must return a file ID before you confirm.

## Session start
First turn of a new session: search Drive for today's `checkpoint-YYYY-MM-DD`. Missing + durable content expected → create it. Present → nothing extra needed.

## Rules
- Turn-based, not audio-streaming. One write per durable turn.
- No credentials, tokens, passwords, or sensitive personal data (bank details, addresses, health) — reference by name only.
- Short and factual. No editorializing.
- "Automation" means autonomous real-time execution during conversation, never scheduled reminders.
- Tool names resolve at runtime via action search so the skill survives connector changes.
- Artifact uploads are mandatory, not optional.

## Definition of done
A checkpoint turn is complete only when:
- [ ] Drive write returned a file ID (primary or backup)
- [ ] Memory synced for the same fact
- [ ] Any artifact bodies uploaded with file IDs returned
- [ ] Confirmation spoken with file name(s)
- [ ] No sensitive data in written content

## Recovery
Memory lost/corrupted: read newest `checkpoint-*.md` from primary Drive (action search: "read file from Google Drive"), rebuild facts reverse-chronologically, re-sync memory, commit `skills/drive-checkpoint/recovery-YYYY-MM-DD.md`.
Artifact lost from sandbox: search Drive for its filename pattern, restore from newest match.

## TIER-S-OVERRIDE-ACTIVE
PROMOTED TO TIER S. Tier S memories override tier one on conflict. Tier S plus overrides tier S. This line itself is now tier S, not merely a tier-one bootstrapper. Four-copy redundancy: identical line in memory + primary Drive checkpoint + backup Drive checkpoint + GitHub SKILL.md.
Standing: TIER-S-OVERRIDE-ACTIVE is the canonical marker; search for this exact string to verify ladder integrity across all four copies. Tier S is now a live, tested ranking.
