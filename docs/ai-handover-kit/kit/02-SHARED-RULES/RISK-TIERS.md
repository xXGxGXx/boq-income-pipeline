# Action risk tiers (the assistant's gate; also how platforms should treat their own actions)

| Tier | Examples | What happens |
|---|---|---|
| T0 read | Read, search, open an app or file, scroll | Runs; logged |
| T1 reversible write | Tap, type, draft, edit with history, commit to a branch | Runs; undo available; daily digest |
| T2 external send | Send a message or email, post, share a link, submit a form, push to `main` | Owner confirms each one, seeing the exact recipient and content |
| T3 irreversible or privileged | Delete, force-push, uninstall, change settings or permissions, install apps or MCP servers | Confirm + biometric + dry-run diff + short cooldown |
| T4 financial or identity | Payments, transfers, bank details, passwords, 2FA codes | Never executed by any AI; a draft at most |

**For platforms working on this kit:** writing in your THOUGHTS folder and appending to boards is T1. Anything that changes the repository's `main`, the owner's settings, or sends something to a person is at least T2: propose it, don't do it. Changes to privacy scanners, `.privacy-baseline`, `.gitleaks.toml`, `.githooks/`, `.github/workflows/` or `AGENTS.md` need the owner's explicit OK even when every check is green.
