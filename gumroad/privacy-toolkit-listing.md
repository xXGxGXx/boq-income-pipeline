# Gumroad Listing: Privacy and Integrity Toolkit

**Price:** A$19 (one-time)
**Files to upload:** `privacy-integrity-toolkit-1.0.0.zip` from `python3 products/build_releases.py --out release-out privacy-integrity-toolkit`
**Catalogue place:** Standalone SKU between the A$5 Micro-Pack and the A$49 Governance Bundle
**Category:** Software Development > Developer Tools
**Tags:** Python, privacy, checksums, local server audit, stdlib, AI builders, no-install

---

## Title
Privacy and Integrity Toolkit — Stdlib Python Scripts for AI Builders

## Subtitle
Five no-install, stdlib-only Python tools. Find keys, bank details and private links before you publish, catch broken and placeholder files, verify checksums, and audit a local server.

## Description

### Who it's for

AI builders and solo operators who ship scripts, local tools, or single-file web apps — and need a pre-publish check that does not require a package install.

### What's inside
Five Python 3 tools plus 23 tests. Standard library only: no pip. Run them with `python3`.

**privacy_scan.py:** finds private material before you commit, push or publish.
- Scans paths, or git's `--staged`, `--tracked` or `--history` files.
- Finds API keys and tokens; bank details (BSB and account numbers, IBANs, card numbers, Australian tax file numbers, each checksum-checked); email addresses; Google Drive and other cloud links; device paths; personal media and catalogs.
- Matches are masked: bank numbers show only their last 2 digits.
- `--baseline` makes CI fail only on new findings.

**check_repo.py:** catches files that broke on the way into git.
- Files saved as an unexpanded `$(cat …)` command, which AI assistants writing through APIs produce.
- Merge-conflict leftovers.
- Invisible and bidirectional characters ("Trojan Source").
- Python, JSON, shell and JavaScript syntax errors.
- Key documents that were truncated.

**verify_checksums.py:** checks files against sha256sum, BSD or JSON checksum lists, and checks or rebuilds split archives (`--join`). Check-only mode writes nothing, and an existing output file is never overwritten.

**audit_server.py:** a read-only audit (GET and HEAD only) of a local web server you run yourself. It checks:
- foreign Host headers (DNS rebinding) and cross-site Origin;
- security headers;
- path traversal and dotfiles;
- directory listings;
- HTTP Range handling;
- whether a loopback port is also open on all interfaces.

**split_build.py:** recovers CSS and JS source from a built single-file HTML page, or `--check`s that a source folder rebuilds it byte for byte. It refuses to write a split that wouldn't be lossless.

**Also included:**
- a git pre-commit hook;
- a GitHub Actions workflow;
- a config example;
- a buyer README with honest limits.

### What's NOT included

No hosted service, no dashboard, no auto-install into your repo. These are scripts you run locally. `audit_server.py` is a defensive check of your own server, not a general-purpose scanner for other people's systems.

### Requirements

Python 3.8 or newer (tested on 3.11, 3.12 and 3.13). No third-party packages. `git` for the repository modes.

---

## Cover image brief (for Canva)

Dark charcoal background. Left: five short monospace filenames stacked (`privacy_scan.py`, `check_repo.py`, `verify_checksums.py`, `audit_server.py`, `split_build.py`). Right, one line: "Stdlib only. No install." Below: "Privacy and Integrity Toolkit — A$19." Accent in a single muted green or amber. No stock photos, no lock icons, no shields.
