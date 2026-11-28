# P7 · Improvement loop

## Proposals

One improvement per proposal (`05-TEMPLATES/IDEA-PROPOSAL.md`), scored 1–10 on each of these, then a total:

| Criterion | Question |
|---|---|
| Impact | How much closer does this get the owner to "an extension of me"? |
| Evidence | How strong is the support (tested > primary source > reasoning > hunch)? |
| Effort (inverted) | 10 = trivial, 1 = weeks of work |
| Risk (inverted) | 10 = no privacy, safety or breakage risk |
| Fit | Does it respect locked decisions and the single-grant rule? |

Date every score (undated scores are rejected, v3 rule). Proposals that exceed the original requirements are welcome: the owner's requirements are a floor, not a ceiling.

## Improving the kit itself

Every platform proposes **at least one change to this kit** (structure, a protocol, a template, a prompt) that would have made its own pass faster or better. Prefix the ID with `KIT-`. Grok merges approved ones into the next version.

## The scoreboard

After each round Grok updates `06-SHARED-BOARDS/SCOREBOARD.md`: per platform, proposals made / accepted, errors found / confirmed, verifications done, retrieval finds used. It's for routing work to whoever does it best, not for ranking for its own sake.

## Cadence (suggested; only with the owner's OK)

- **Each handover round:** full pass by every platform, then Grok merges.
- **Weekly radar:** a scheduled task on a platform that has one (Grok Automations, Gemini scheduled actions) checks the watchlist (Portal, droid-agent, Shizuku, termux-api #840, Android ADB changes, key prices) and appends changes to RETRIEVAL-INDEX.md.
