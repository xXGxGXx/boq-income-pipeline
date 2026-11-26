# Git hooks

This repository keeps its hooks in `.githooks/`. Git doesn't install hooks on clone, so run this once in each clone:

```bash
git config core.hooksPath .githooks
```

## pre-push

Runs before every `git push` and blocks the push if either check finds something:

1. `scripts/privacy_scan.py --tracked --baseline .privacy-baseline`: private material in what the repository holds
   (bank details, Drive links and IDs, device paths, emails, media, catalogs, keys). Findings already reviewed in
   `.privacy-baseline` pass. A file inside a `Payout & Receiving Details` folder always blocks; nothing can accept it.
2. `gitleaks git` with `.gitleaks.toml`, if Gitleaks is installed on this computer: secrets in any commit.

A `.privacy-baseline` line is `category<TAB>path<TAB>masked detail`. Add one only after checking that the finding is
safe to publish, never to get a push through.

## Notes

- The hook must stay executable (`git ls-files -s .githooks/pre-push` shows `100755`). Git skips a hook that isn't.
- `git push --no-verify` skips hooks. CI (`.github/workflows/checks.yml`) runs the same scan and Gitleaks on every
  pull request and every push to `main`, so a skipped check still turns the commit red.
