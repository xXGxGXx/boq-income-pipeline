# Git Hooks

This repo uses custom hooks via `core.hooksPath`.

## Install

```bash
git config core.hooksPath .githooks
```

## Hooks

- **pre-push**: Runs `scripts/privacy_scan.py --tracked --baseline .privacy-baseline` before every push. Blocks push on findings. Baseline entries must document owner, reason, and expiry date per OWASP guidance.

## Notes

- Hooks are not copied by `git clone` automatically — each developer must run the install command once.
- CI runs the same scanner independently as a backstop.
