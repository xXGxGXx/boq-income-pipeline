# Testing

## The suites (Media Hub: `bash tests/run_all.sh` runs them all)
| Suite | Covers | Needs |
|---|---|---|
| `python3 -m unittest tests/test_range.py tests/test_optimize.py tests/test_library.py tests/test_checksums.py` | server path safety, Host/Origin, Range, optimizer ladder, phone-folder mount, checksums | Python 3, ffmpeg |
| `python3 -m pytest tests/test_media_serve.py` | the server's public interface case by case | pytest |
| `node tests/e2e_smoke.js dist` | desktop, Pixel 7 profile and single-file runs with the CSP **enforced**; fails on any page error, console error or CSP violation | Node Playwright + Chromium |
| `python3 tests/checklist.py --report r.md` | the 40-line checklist with a Markdown report | Python Playwright |

Build the synthetic demo first (`tools/make_demo.py`, then `tools/build.py`). Never use the user's own media in a test you look at.

## Environment facts that cost time
- Pre-installed Chromium matches one Playwright version. Python Playwright must be pinned to the same version as Node's (`node -e "console.log(require('playwright/package.json').version)"`, then `pip install playwright==<that>`); never run `playwright install`.
- Playwright Chromium has no H.264: use VP9/WebM for clips you play; MP4 tests only check that the app reports the failure well.
- `python3 -I` drops the script's folder from `sys.path`: run test files directly (`python3 -I test_x.py`) or without `-I` from a clean folder.
- A module named like its folder (`orchestrator/orchestrator.py`) can't be imported from the repo root by name; load it by path with `importlib.util.spec_from_file_location` and register it in `sys.modules` before `exec_module` (dataclasses need it).

## Test hygiene (each of these produced a false failure once)
- Count what you mean: a demo item and a shared phone-folder item both land in the grid, so wait for the specific item (`imported.some(...)`), not for "N+1 cards".
- Pages with `scroll-behavior: smooth` need `scrollTo({top, behavior:'instant'})` in tests.
- Esc Esc within 350 ms is the panic gesture: space Esc presses further apart; blur focus before single-key shortcuts; wait for the palette input to focus before typing.
- `page.reload()` keeps the query string; navigate to a clean URL between app-link tests.
- Opening a second page hides the first, which correctly fires the hide-cover.
- When the demo grows, update every hard-coded count at once.
- A test that passes alone and fails in the full run is usually a race with background work (server probes, service-worker install): find the race before touching the app.

## Writing a fix
1. Reproduce it in a small script first (it may not be a bug: a 5 s resume guard on a 6 s demo clip is the design working).
2. Write the regression check so it fails before the fix (prove it, e.g. by running it against the old build).
3. Fix, then rerun the whole suite, not just the new check.
4. Run flaky-looking tests three times before calling them stable.
5. Report the numbers you saw and which side (app or test) a failure was on.
