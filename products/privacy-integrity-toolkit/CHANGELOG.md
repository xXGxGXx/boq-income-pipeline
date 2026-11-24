# Changelog

## 1.0.0 (2026-11-24)
- Five tools: `privacy_scan.py`, `check_repo.py`, `verify_checksums.py`, `audit_server.py`, `split_build.py`.
- `privacy_scan.py`: bank, card and tax-file-number detection with checksum checks and masked reports; `--baseline` and `--write-baseline` so CI fails only on new findings.
- `check_repo.py`: placeholder files, conflict markers, hidden characters, syntax errors, and key-document size floors from `.check-repo.json`.
- 23 tests using synthetic data only.
