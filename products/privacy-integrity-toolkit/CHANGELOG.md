# Changelog

## 1.1.0 (2026-11-26)
- `check_repo.py`: new `generated` check fails when release zips (`release-out/`), APK or AAB builds, signing keystores, `.env` files or `local.properties` are committed, even if `.gitignore` lost its rule.
- `privacy_scan.py`: new `payout` category. Any file inside a `Payout & Receiving Details` folder always fails; `--allow`, `privacy-scan: ok`, ignore-file headers and baselines can't accept it, and `--write-baseline` refuses to record it. Add your own folder names to `NEVER_PUBLISH_DIRS`.
- 25 tests using synthetic data only.

## 1.0.0 (2026-11-24)
- Five tools: `privacy_scan.py`, `check_repo.py`, `verify_checksums.py`, `audit_server.py`, `split_build.py`.
- `privacy_scan.py`: bank, card and tax-file-number detection with checksum checks and masked reports; `--baseline` and `--write-baseline` so CI fails only on new findings.
- `check_repo.py`: placeholder files, conflict markers, hidden characters, syntax errors, and key-document size floors from `.check-repo.json`.
- 23 tests using synthetic data only.
