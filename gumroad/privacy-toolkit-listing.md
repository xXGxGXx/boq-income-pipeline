# Gumroad Listing: Privacy and Integrity Toolkit

**Price:** $19 AUD (one-time)
**Category:** Software Development > Developer Tools
**Tags:** Python, privacy, security audit, checksums, CI/CD, stdlib, no-install

---

## Title
Privacy and Integrity Toolkit — Four stdlib Python Scripts for AI Builders

## Subtitle
Scan for leaked secrets. Audit servers. Verify checksums. Split builds. Zero dependencies.

## Description

### The problem

AI-assisted projects move fast, and fast means secrets end up in commits, builds ship without integrity checks, and you find out when something breaks in production. Most privacy and audit tools want a subscription, a cloud account, or a dozen pip installs. This toolkit is four scripts, pure Python standard library, that run anywhere Python runs.

### What's inside

**privacy_scan.py** — Recursively scans a directory tree for API keys, tokens, passwords, private keys, and other secret patterns. Flags staged and unstaged git changes too. Reports file, line, and pattern type.

**audit_server.py** — Lightweight HTTP server audit: checks response headers for security misconfigurations (missing HSTS, CSP, X-Frame-Options), exposed admin paths, and basic TLS posture. Point it at any URL.

**verify_checksums.py** — Generate or verify SHA-256 checksums for a file set. Useful for release artifacts, backup integrity, and confirming a download wasn't tampered with.

**split_build.py** — Splits a large build artifact or directory into sized chunks with checksums for each part. Handy for transferring or uploading large files through size-limited channels.

### Why stdlib-only matters

No pip install. No virtualenv. No supply-chain risk from third-party packages. Copy the scripts, run them, done. They've been tested across the projects in this repo.

### Who it's for

Solo developers, AI-agent operators, and anyone shipping builds who wants a privacy and integrity pass without adopting a platform.

### What's NOT included

No GUI, no dashboard, no hosted service. Command-line scripts you run locally. If you want managed monitoring, that's a different product.

### Updates

Bug fixes and new scan patterns as needed. MIT licensed.

### Links

- Scripts: github.com/xXGxGXx/boq-income-pipeline/tree/main/scripts
- LICENSE: github.com/xXGxGXx/boq-income-pipeline/blob/main/LICENSE

---

## Cover image brief (for Canva)

Dark background. Monospace terminal aesthetic. One line: "No secrets in this commit." Below: "Four scripts. Zero dependencies." Minimal. No stock photos.
