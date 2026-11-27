---
name: clip-desk
description: "Find a moment in K's private local clip library by text or voice, then cut it frame-accurately, stitch, make a 9:16 vertical and a GIF preview, all on the box with originals untouched. Also intake new files (saved as files, not links) and log feedback."
---
# Clip Desk

Clip Desk is a set of local tools on K's box. This connector only serves these instructions: the tools, the library,
the catalog, the index and the rules live on the box, never in this repository or connector.

## When to use
- "Find the moment where ...", "cut that", "make it vertical", "join these", "show me a preview".
- "Add these files to the Vault", "save this, not the link".
- "Keep / pass / rank / re-cut that one" (feedback).
Text and voice requests are handled the same way: turn the request into one of the commands below.

## Commands (run on the box)
Front door: `/workspace/clip-desk/clipdesk <command>`. It uses its own local Python environment.

| Request | Command |
|---|---|
| find a moment | `clipdesk find "plain description of what is on screen" --top 5` |
| one-step result | `clipdesk make "description" [--pick N] [--len 6] [--mode blur\|crop]` (find, cut, 9:16, GIF) |
| cut | `clipdesk cut SRC START END` (frame-accurate); `--copy` for a lossless keyframe cut |
| join | `clipdesk stitch A.mp4 B.mp4 ...` |
| vertical | `clipdesk vertical SRC --mode blur\|crop [--x 0.5]` (1080x1920) |
| preview | `clipdesk preview SRC` (GIF) |
| feedback | `clipdesk feedback CODE keep\|pass\|rank\|recut --note "..." --query "..."` |
| add files | `clipdesk intake --from FOLDER --permission "..."`, or `--urls links.tsv --hosts hosts.txt --allow-network` |
| catalog | `clipdesk catalog build` / `clipdesk catalog verify` |
| health | `clipdesk test` (end-to-end tests on real clips) |

`find` prints JSON lines: code, path, peak time, suggested start/end and scores. Describe what is visible
(objects, setting, framing, motion); the model matches pictures, not titles.

## Rules (non-negotiable)
1. Originals are never modified, moved, renamed or deleted. Every operation hashes each source before and after and
   compares it with the catalog; on any mismatch it stops and writes to Failure Memory. Work on copies only.
2. Keep the source's own audio. Never strip it. Silence is added only where a source has no audio stream at all.
3. Trims are short (about 5 to 10 s) and the requested moment must actually be in frame for most of the trim.
   Verify with the moving preview (MP4 or GIF), not a still or a description.
4. Items in `_held/` and items the preferences exclude are never offered. Holds are judged item by item on each
   item's own title, tags and framing, using the private preferences file on the box. Adults only and clearly
   consensual only; no leaked material and no edited images of real people. When that can't be told, hold or skip it.
5. Save files, not links. Intake writes the bytes plus a manifest, and skips anything whose SHA-256 is already known.
   Intake is source-agnostic: local folders or https links from hosts the owner lists. Never add site-specific scrapers.
6. Never send frames, clips, catalog entries or file names to a hosted AI model. Search runs on the box CPU.
7. Never copy library data, file names, paths, catalog entries or rule wording into any shared repository, issue or chat.
8. Learning: record K's verdicts with `feedback`; they re-rank later searches. Add a Failure Memory entry (date,
   what was attempted, what blocked it, what was done instead) when something fails; never delete entries.

## Reporting back
Give the output MP4 and GIF paths from `renders/`, the source code and the time window, and one line on why it
matched. Offer the next two picks from the same search. Ask for a keep/pass so the ranking improves.

## Limits
- Tools act only on the box's own files. Phone control is a later phase.
- Search quality improves with feedback; treat the first pick as a suggestion and show the preview.
