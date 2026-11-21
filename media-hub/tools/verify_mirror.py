#!/usr/bin/env python3
"""Re-hash every file in a mirror and compare with manifest.json. Exit 0 = all byte-identical.
Usage: python3 verify_mirror.py MIRROR_DIR"""
import hashlib, json, os, sys
root = sys.argv[1]; m = json.load(open(os.path.join(root, "manifest.json"), encoding="utf-8")); ok = bad = miss = 0
for r in m["items"]:
    p = r.get("mirror_path")
    if not p: continue
    fp = os.path.join(root, p)
    if not os.path.exists(fp): miss += 1; print("MISSING", p); continue
    if hashlib.sha256(open(fp, "rb").read()).hexdigest() != r["sha256"]: bad += 1; print("CHANGED", p)
    else: ok += 1
print("verified: %d ok, %d changed, %d missing" % (ok, bad, miss)); sys.exit(1 if bad or miss else 0)
