#!/usr/bin/env python3
"""Check the kit arrived complete and unchanged. Run from the kit folder:  python3 08-TOOLS/verify_kit.py"""
import hashlib, pathlib, sys
root = pathlib.Path(__file__).resolve().parent.parent
manifest = root / "08-TOOLS" / "MANIFEST.sha256"
bad = 0
for line in manifest.read_text(encoding="utf-8").splitlines():
    if not line.strip():
        continue
    digest, rel = line.split("  ", 1)
    f = root / rel
    if not f.exists():
        print("MISSING ", rel); bad += 1
    elif hashlib.sha256(f.read_bytes()).hexdigest() != digest:
        print("CHANGED ", rel); bad += 1
print("kit intact" if not bad else f"{bad} problem(s)  (STATE.md and the shared boards are meant to change and are not listed)")
sys.exit(1 if bad else 0)
