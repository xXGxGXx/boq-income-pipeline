# Privacy and Integrity Toolkit

Five small Python tools that stop private data and broken files from reaching a public repository, a shared folder or a published page. Standard library only: nothing to install.

- **Requirements:** Python 3.8 or newer (tested on 3.11, 3.12 and 3.13), plus `git` for the repository modes. Linux, macOS, Windows and Android (Termux) all work.
- **Licence:** MIT (see `LICENSE.txt`).

## Start in two minutes

```bash
cd privacy-integrity-toolkit-1.1.0
python3 test_scripts.py        # 12 tests, synthetic data only
python3 test_check_repo.py     # 11 tests
cd /path/to/your/repo
python3 /path/to/privacy-integrity-toolkit-1.1.0/privacy_scan.py --staged
```

Each tool prints what it found and exits with 0 when everything is clean, so it slots straight into scripts, git hooks and CI.

## The tools

### `privacy_scan.py`: find private material before it's published
Scans files, folders, or git's staged, tracked or historical files. It looks for:

| Category | What it finds |
|---|---|
| `secret` | API keys and tokens (Anthropic, OpenAI, xAI, GitHub, AWS, Google, Slack), private keys, bearer tokens |
| `bank` | BSB and account numbers, IBANs (checksum-checked), payment card numbers (Luhn-checked), Australian tax file numbers (checksum-checked) |
| `email` | Email addresses (reserved example domains and noreply addresses are ignored) |
| `cloud` | Google Drive, Docs and Photos, Dropbox, OneDrive, iCloud and MEGA share links, and bare Drive IDs next to the word "drive" or "folder" |
| `device` | Paths from phones and computers, such as `/storage/emulated/0`, `content://` and `C:\Users\name` |
| `media`, `catalog`, `large` | Personal photos, video and audio, media catalogs, and oversized files |
| `payout` | Any file inside a folder named `Payout & Receiving Details`. It always fails: no flag, comment or baseline can accept it. Add your own folder names to `NEVER_PUBLISH_DIRS` |
| `term` | Your own private words (names, places, project names) from a list you keep outside the repository |

Matches are always masked: bank and card numbers show only their last 2 digits. That means reports and CI logs never republish what they found.

```bash
python3 privacy_scan.py --staged                         # before every commit
python3 privacy_scan.py --tracked                        # everything a push would publish
python3 privacy_scan.py --history                        # every file ever committed on this branch
python3 privacy_scan.py ./export --terms ~/private-words.txt
python3 privacy_scan.py --tracked --write-baseline .privacy-baseline   # accept today's reviewed findings
python3 privacy_scan.py --tracked --baseline .privacy-baseline         # then fail only on new ones
```

You can accept a reviewed line by adding `privacy-scan: ok` to it.

### `check_repo.py`: catch broken, truncated or placeholder files
- Finds files saved as an unexpanded shell command, such as `$(cat /tmp/notes.md)`. AI assistants writing through an API or connector do this.
- Finds leftover merge-conflict markers.
- Finds invisible characters: form feeds, zero-width spaces, and the bidirectional overrides used in "Trojan Source" attacks.
- Finds Python, JSON, shell and JavaScript syntax errors.
- Finds files that must never be committed, even if `.gitignore` lost its rule: release zips in `release-out/`, APK and AAB builds, signing keystores, `.env` files and `local.properties`.
- Finds key documents that were deleted or cut short. List them in `.check-repo.json` (see `examples/check-repo.json`).

```bash
python3 check_repo.py                     # the files git tracks, as they are on disk
python3 check_repo.py --rev origin/main   # any branch or commit, without checking it out
```

### `verify_checksums.py`: prove files arrived intact
- Checks files against `sha256sum`, BSD-style or JSON checksum lists.
- Checks or rebuilds split archives (`--join "backup.zip.part*"`).
- In check-only mode it writes nothing, and it never overwrites an existing output file.

### `audit_server.py`: audit a local web server you run
Makes read-only checks (GET and HEAD only) of a server on your own machine:
- DNS rebinding (foreign Host headers) and cross-site requests;
- security headers;
- path traversal and dotfiles;
- directory listings;
- HTTP Range handling;
- whether a "local" port is also open to your whole network.

Point it only at servers you operate.

### `split_build.py`: get source back from a single-file web page
- Recovers the CSS and JavaScript from a built single-file HTML page.
- `--check` proves a source folder rebuilds the page byte for byte.
- It refuses to write anything if the split would not be lossless.

## Run it automatically

- **Before every commit:** copy `examples/pre-commit` to `.git/hooks/pre-commit` and make it executable (`chmod +x .git/hooks/pre-commit`).
- **On every push (GitHub):** copy `examples/github-privacy-check.yml` to `.github/workflows/privacy-check.yml`.
- **An existing repository with known, accepted findings:** run `--write-baseline` once, review the file it writes, commit it, and use `--baseline` in CI.

## Limits, honestly

- The scans match patterns. They catch the common shapes of keys, account numbers and links, but no scanner finds everything. Review what you publish.
- `--history` shows files in old commits. Removing them from history needs a history rewrite (for example `git filter-repo`) or making the repository private.
- `audit_server.py` is a defensive check of your own server, not a scanner for other people's systems.

## Updates and support
Updates for 1.x are free: download them again from the same purchase page. For questions, use the contact option on the purchase page.
