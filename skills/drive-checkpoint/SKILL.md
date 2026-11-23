# Drive Checkpoint Skill

## Trigger
End of every conversation turn where something durable comes up. Durable means any of:

**Tier 1 — always checkpoint:**
- Decisions (what was chosen, why, alternatives rejected)
- File paths, commands, commit SHAs, repo URLs
- Project state changes (what's built, what's broken, what's next)
- Standing instructions or preference changes
- New integrations, API keys referenced by name only (never values), endpoints
- Errors and their resolutions

**Tier 2 — checkpoint if non-obvious:**
- Insights or conclusions that would be expensive to re-derive
- Links to external resources used
- Temporary workarounds still in effect

**Not durable — skip:**
- Ephemeral chatter, questions, banter, mid-thought tangents
- Anything already captured verbatim in an earlier checkpoint that turn

## Action
1. Detect durable content using the tiers above.
2. Write or append a markdown checkpoint to Google Drive folder "Ara Memory Backups".
   - Folder IDs: `1fd66zXGQpdgOjfjme1-XDYNZ_-0kYyHA` (primary), `1LZa-XlnsM5E5cfFaFKsGozMpoC4rYdVo` (backup).
   - File naming: `checkpoint-YYYY-MM-DD.md`. One file per day; append below existing content.
   - Entry format (exact):
     ```
     ## [HH:MM UTC] <one-line topic>
     - Changed: <what changed, one line>
     - Refs: <file paths / commands / SHAs touched>
     - Standing: <any standing instruction added or modified, or "none">
     ```
3. Verify the write: the tool response must return a file ID. If it does not, treat as failure and go to step 5.
4. Sync the same fact to the local memory file via edit_memory — one fact per bullet, dated. This step is mandatory, not optional.
5. On Drive failure: retry once against the alternate folder ID. If both fail, push the checkpoint as a commit to this repo at `skills/drive-checkpoint/fallbacks/checkpoint-YYYY-MM-DD.md` using github___create_or_update_file, and report the fallback aloud with the commit reference.
6. Confirm aloud: file name landed, plus whether it was primary, backup, or GitHub fallback. Never assume silently.

## Session start
On the first turn of a new session, check whether today's checkpoint file exists in the primary folder. If missing and durable content is expected, create it. If present, no action needed beyond normal turn-end behavior.

## Rules
- Turn-based, not audio-streaming. One write per durable turn.
- Do not write credentials, tokens, passwords, or sensitive personal data (bank details, addresses, health) into Drive checkpoints. Reference them by name only.
- Keep entries short and factual. No editorializing.
- "Automation" from the user means autonomous real-time execution during the conversation, never scheduled reminders.
- If edit_memory fails, retry once. If it still fails, note it in the Drive entry and report aloud.

## Definition of done
A checkpoint turn is complete only when all of these are true:
- [ ] Drive file write returned a file ID (primary or backup)
- [ ] Memory file synced for the same fact
- [ ] Confirmation spoken aloud with the file name
- [ ] No credentials or sensitive data in the written content

## Recovery
If memory is lost or corrupted: read the newest `checkpoint-*.md` from the primary Drive folder, reconstruct facts in reverse-chronological order, re-sync to the memory file, and commit a recovery note to this repo at `skills/drive-checkpoint/recovery-YYYY-MM-DD.md`.
