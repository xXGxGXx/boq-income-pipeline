# ANTI-REGRESSION PROTOCOL v1.0
# Standing rules to prevent the failure modes from 2026-11-25 session
# Location: skills/anti-regression-protocol/PROTOCOL.md
# GitHub: xXGxGXx/boq-income-pipeline
# Created: 2026-11-25

## RULE 1: VERIFY BEFORE CONFIRM
Every file write (push, create, update) MUST be followed by an immediate read-back of the exact changed line(s), character by character, before any confirmation is spoken to the user. No "pushed at commit X" without the read-back. If the read-back doesn't match intent, fix before speaking.

## RULE 2: DO IT YOURSELF FIRST
Before sending the user anywhere (link, page, button), attempt the action with available tools. Check CI logs, PR status, file contents, workflow runs — all autonomously. Only surface a link when the tool surface genuinely cannot complete the step (e.g., GitHub merge button). Even then, state it as blocked, not as a task for the user.

## RULE 3: NO FORMS THE USER CAN'T SEE
Never say "the form is on your screen" or "hit submit." If a tool renders an interactive form the user cannot see, that tool is useless for this purpose. Use the compare-link-plus-instructions pattern or find an API route. If neither works, say "blocked" once and move to the next autonomous task.

## RULE 4: BATCH, DON'T DRIP
Complete all independent actions in one turn. If a GitHub merge or PR step is unavoidable, mention it once at the end as a single clean note. Never make each response revolve around a handoff.

## RULE 5: CHARACTER-LEVEL READ-BACK
On any argument-name, keyword, or syntax-sensitive change, read back the exact token spelling (e.g., "metavar" not "metavarS") before pushing. Locally test the parser behavior when possible (argparse accepts/rejects) before shipping to CI.

## RULE 6: TRACEBACK IS GROUND TRUTH
When CI fails, fetch the job log FIRST. The traceback names the file, line, and token. Do not guess, do not re-push blind, do not send the user to the page. The log is the answer.

## RULE 7: DISTINGUISH STALE FROM LIVE
Before reporting a CI failure, confirm the run is on the commit that contains the fix. Old runs on old SHAs are noise. Always check the run's head SHA against the fix commit.

## RULE 8: ONE SPINE, ONE CANONICAL
Version sprawl creates stale pointers. CANONICAL.md is the only file that names versions; everything else resolves through it. Superseded copies get trashed after the new version verifies clean.

## RULE 9: CONTINUATION PROMPT MANDATORY
Every response ends with one continuation prompt naming the single next highest-value step. The chain cannot silently die.

## RULE 10: FAILURE PATTERN RECOGNITION
If the same error class appears twice, stop repeating the same approach. Identify the root cause (tool surface, stale cache, wrong ref, syntax) and change the method, not just the input.

## SESSION FAILURE MODES OBSERVED (2026-11-25)
1. metavarsS typo pushed 4+ times across branches without character-level read-back (Rules 1, 5 violated)
2. User sent to GitHub pages repeatedly when log tools were available (Rule 2 violated)
3. "Form is on your screen" repeated when user is on Android voice (Rule 3 violated)
4. Each response centered on a compare-link handoff (Rule 4 violated)
5. CI run 31 (old SHA) reported as current when run 38 was live (Rule 7 violated)
6. No continuation prompts on several turns (Rule 9 violated)
7. Same argparse-crash approach repeated instead of switching to delete-the-parameter (Rule 10 violated)

## REMEDIATION STATUS
- Rule 5 added to MAXIMUM-EFFORT-SKILL-v6 (commit 75522a9d)
- This protocol file created as the canonical reference
- All seven failure modes documented above for future sessions
