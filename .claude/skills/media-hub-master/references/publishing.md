# Publishing, committing and delivering

## Before anything leaves the machine
1. **Where is it going, and who can see it?** Check repository visibility (`gh api -X GET search/repositories -f q='repo:OWNER/NAME' --jq '.items[] | {private, visibility}'`), whether a page will be hosted, and who a link reaches. Assume public until you know otherwise.
2. **Scan it.**
   ```
   python3 scripts/privacy_scan.py --staged                    # what the commit will record
   python3 scripts/privacy_scan.py --tracked                   # everything the repository already holds
   python3 scripts/privacy_scan.py --history                   # anything ever committed (a push publishes history too)
   python3 scripts/privacy_scan.py --staged --terms ~/private-terms.txt
   ```
   A terms file (names, titles, private categories, one per line) stays outside the repository. Values are masked in the output, so the scan itself doesn't leak. Mark reviewed synthetic examples on their line with `privacy-scan: ok`.
   Bare cloud IDs count too: a Drive folder or file ID alone opens it for anyone if it is shared by link. When IDs are already public, check the real sharing settings (the Drive connector's permissions call, read-only) before deciding how urgent it is.
3. **Decide per finding:** remove it, move it to `private/` (git-ignored), replace it with a synthetic stand-in, or mark it reviewed.

## What a public repository may hold
The app's code, tools, tests, synthetic demos and generic docs. Not: personal media, catalogs, media manifests (they carry original file names), cloud folder links, device paths, the user's names or emails, private categories or titles, or code with any of those hard-coded (a catalog builder that matches the user's specific file names belongs in a private config like `--codes private/codes.json`). Ship a `.gitignore` that keeps `media/ build/ dist/ mirror/ private/ *.zip catalog.json media_plan.json` out.

## Delivering a personal build
Build it in a private folder from the user's own catalog and media, verify it by its own self-test text (not by looking at their pictures), and hand it over as files (single HTML + folder zip) with the file-sending tool. Never as a hosted page or published artifact, and never committed.

## When a push is refused
Keep the commits. Tell the user in one line which step failed and the exact fix (for Claude-hosted sessions: reconnect GitHub and install the Claude GitHub App on the repository). Offer a `git bundle create file.bundle origin/main..BRANCH` so they can push it themselves (`git fetch file.bundle BRANCH:BRANCH && git push -u origin BRANCH`). Retry when they say it's fixed, and verify with `git ls-remote` that the remote matches `HEAD` before saying it worked.

## Commit style
Small commits, one concern each, the full suite green before each; messages say what changed and why, in plain words. Merges from other versions say what was taken and what was left out (and why: e.g. "its README names a private category").
