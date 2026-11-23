# Drive Checkpoint Skill

## Trigger
End of every conversation turn where something durable comes up: decisions, file paths, commands, project state, standing instructions, new preferences.

## Action
1. Detect durable content in the turn (not ephemeral chatter).
2. Append or update a markdown checkpoint in Google Drive folder "Ara Memory Backups".
   - Folder IDs: `1fd66zXGQpdgOjfjme1-XDYNZ_-0kYyHA` (primary), `1LZa-XlnsM5E5cfFaFKsGozMpoC4rYdVo` (backup).
   - File naming: `checkpoint-YYYY-MM-DD.md`. One file per day; append new entries below existing content.
   - Each entry: timestamp, session topic, what changed, standing instructions touched.
3. Also update the local memory file via edit_memory for the same fact (one fact per bullet, dated).
4. Confirm aloud that the checkpoint landed, with the file name. Never assume silently.

## Rules
- Turn-based, not audio-streaming. One write per durable turn.
- If a Drive write fails, retry once with the alternate folder ID, then report the failure with a path forward.
- Do not write credentials, tokens, or sensitive personal data into Drive checkpoints.
- Keep entries short and factual. No editorializing.
- If the user says "automation", they mean autonomous real-time execution during the conversation, not scheduled reminders.

## Recovery
If memory is lost or corrupted, reconstruct from the newest checkpoint file in the Drive folder, then re-sync to the memory file.
