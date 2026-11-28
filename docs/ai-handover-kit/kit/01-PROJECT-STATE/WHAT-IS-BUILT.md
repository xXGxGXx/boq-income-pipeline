# What is built (and what is not)

All on branch `claude/ai-user-extension-tntyy8` of `xXGxGXx/boq-income-pipeline`. Nothing merged to `main`. Checked 2026-11-28.

| Commit | What |
|---|---|
| `7bd1f6a` | Design plan + research digest (round 1) |
| `415b92e` | Research round 2, Phase 0 core (`extension_core/`), grant script, setup steps |
| `f407617` | CI step to run the core's tests (needs the owner's OK before merging) |
| `4f5c1c0` | Termux feasibility findings folded in |

## Built and tested

`skills/device-orchestration-stack/extension_core/`: standard library only, 82 unit tests passing (`python3 skills/device-orchestration-stack/extension_core/test_extension_core.py`).

| Module | Does |
|---|---|
| `events.py` | One `InputEvent` for typed and spoken input; removes fillers; applies spoken corrections ("open chrome no I mean firefox" → "open firefox"); commit and cancel words; keeps speech alternatives and the screen snapshot from when speech started |
| `fastmap.py` + `rules.json` | Command rules tried against every alternative; sound-alike name matching that asks "A or B?" when two names are too close |
| `policy.py` | T0–T4 gate; escalation by tap target ("Pay now" → T4); banking/password apps denied; untrusted content forces confirmation; unattended runs can't do T2+; tool-definition pins |
| `privacy.py` | Personal / public / mixed classifier; web-query scrubber reusing the repository's `privacy_scan.py` patterns |
| `ledger.py` | Hash-chained, signable episode log that can forget content without breaking the chain; refuses to live in a git folder |
| `skills.py` | Skill ladder L0–L3 with fingerprint approval and demotion |
| `evals.py` | Eval set with a stable hidden held-out split and a ship gate |
| `routing.py` + `routing.json` | Task → model tier; private stays on device or nothing |
| `sources.py` + `sources.json` | 24-source catalogue with cost, key name, limits, terms flags |
| `pipeline.py`, `__main__.py` | The decision path end to end, and a command line (`python3 -m extension_core plan "..."`) |

`skills/device-orchestration-stack/bootstrap/grant_all.sh`: every phone grant through Shizuku in one run. Dry run by default, `--apply`, `--undo`. Discovers package and service names on the phone; keeps existing accessibility services; never switches the keyboard. Tested against a simulated `rish`. **Never run on a real phone.**

## Existing pieces from before this project

Module F (voice-to-chat injection, 45+ tests, not yet run on a phone), the multi-model orchestrator (`orchestrator/`, gates and evidence ledger), Automation Forge 4.2.1 (Android app, builds, not yet tested on a phone), Media Hub, recall vault, tiered memory, dead-man's switch spec.

## Not built yet

Phone tool broker and Hands (Phase 1), Finder adapters (Phase 2), companion app as default assistant (Phase 3), PC and browser control (Phase 4), nightly learning pass (Phase 5), panel UI and media lane (Phase 6), wiring the gate into `orchestrator/`.
