# Gumroad Listing: Privacy and Integrity Toolkit

**Price:** A$19 (one-time)
**Catalogue place:** Standalone SKU between the A$5 Micro-Pack and the A$49 Governance Bundle
**Category:** Software Development > Developer Tools
**Tags:** Python, privacy, checksums, local server audit, stdlib, AI builders, no-install

---

## Title
Privacy and Integrity Toolkit — Stdlib Python Scripts for AI Builders

## Subtitle
Four no-install, stdlib-only Python scripts. Scan for secrets, audit a local server, verify checksums, and split a built page back into source.

## Description

### Who it's for

AI builders and solo operators who ship scripts, local tools, or single-file web apps — and need a pre-publish check that does not require a package install.

### What's inside

Four Python 3 scripts plus a test file. Standard library only. No pip. Run with `python3`.

**privacy_scan.py** — Find private material before you commit, push, or publish. Scans paths, or git `--staged` / `--tracked` / `--history`, for secrets and tokens, email addresses, Google Drive and other cloud links, device paths, personal media, and catalog files. Matches are masked. Exit 0 if clean.

**audit_server.py** — Read-only audit of a local media server you run yourself (GET and HEAD only). Checks foreign Host (DNS rebinding), cross-site Origin, security headers, path traversal and dotfiles, directory listings, HTTP Range handling, and whether a loopback port is also bound on all interfaces. Point it only at servers you operate.

**verify_checksums.py** — Check files against a checksum list (sha256sum, BSD, or JSON manifests). Also check or rebuild split archives (`--join`). Check-only mode writes nothing. An existing `--out` file is never overwritten.

**split_build.py** — Recover CSS/JS source from a built single-file HTML page, or `--check` that a source folder rebuilds the page's JS/CSS byte for byte. Refuses to write if the split would not be lossless, and will not overwrite existing source files.

**test_scripts.py** — Bundled unittest suite covering all four scripts, using synthetic data only.

### What's NOT included

No hosted service, no dashboard, no auto-install into your repo. These are scripts you run locally. `audit_server.py` is a defensive check of your own server, not a general-purpose scanner for other people's systems.

### Requirements

Python 3. No third-party packages.

---

## Cover image brief (for Canva)

Dark charcoal background. Left: four short monospace filenames stacked (`privacy_scan.py`, `audit_server.py`, `verify_checksums.py`, `split_build.py`). Right, one line: "Stdlib only. No install." Below: "Privacy and Integrity Toolkit — A$19." Accent in a single muted green or amber. No stock photos, no lock icons, no shields.
