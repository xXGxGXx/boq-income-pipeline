#!/usr/bin/env bash
# Every Media Hub test in one go (the habit Caffe's docs ask for: `make runtest` before any pull request).
# Builds the synthetic demo first; suites whose tools aren't installed are skipped with a note, not failed.
#   bash tests/run_all.sh
cd "$(dirname "$0")/.." || exit 2
fails=0; run() { echo; echo "== $1"; shift; "$@" || { fails=$((fails + 1)); echo "!! failed: $*"; }; }
python3 tools/make_demo.py build/demo >/dev/null && python3 tools/build.py --catalog build/demo/catalog.json --plan build/demo/media_plan.json --out dist >/dev/null || { echo "demo build failed"; exit 2; }
run "unit: server, Range, optimizer, phone folders, checksums" python3 -m unittest tests/test_range.py tests/test_optimize.py tests/test_library.py tests/test_checksums.py
if python3 -c "import pytest" 2>/dev/null; then run "server cases (pytest)" python3 -m pytest -q -p no:cacheprovider tests/test_media_serve.py
else echo; echo "== server cases: skipped (pip install pytest)"; fi
if node -e "require('playwright')" 2>/dev/null; then run "browser: desktop, phone, single file, CSP enforced" node tests/e2e_smoke.js dist
else echo; echo "== browser: skipped (needs Node Playwright)"; fi
if python3 -c "import playwright" 2>/dev/null; then run "checklist (report: dist/checklist-report.md)" python3 tests/checklist.py --report dist/checklist-report.md
else echo; echo "== checklist: skipped (pip install playwright, matching your Chromium)"; fi
echo; [ "$fails" -eq 0 ] && echo "All suites passed." || echo "$fails suite(s) failed."
exit $((fails > 0))
