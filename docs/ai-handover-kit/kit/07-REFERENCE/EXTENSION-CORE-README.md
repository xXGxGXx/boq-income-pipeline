# Extension core (Phase 0 of the AI User Extension)

Every input, typed or spoken, takes the same decision path here before any tool runs:

```
InputEvent ─► FastMap (tries every speech alternative) ─► risk gate (T0–T4)
           ─► privacy route (for searches) ─► model route (when no rule matches)
```

It is the part of [`../AI-USER-EXTENSION-PLAN.md`](../AI-USER-EXTENSION-PLAN.md) that needs no phone. **Standard library only**, so it runs unchanged in Termux and in CI. Nothing here touches a device, the network or a model; it decides, and the tool broker (later phases) acts.

**Status:** 82 unit tests pass (`python3 skills/device-orchestration-stack/extension_core/test_extension_core.py`). Not yet wired to Module F, the orchestrator or any phone tool.

## Try it

From `skills/device-orchestration-stack/`:

```bash
python3 -m extension_core plan "choose Australia from the country dropdown"
python3 -m extension_core plan "send Sam saying running late press send"     # -> confirm (T2)
python3 -m extension_core plan "tap the pay now button"                       # -> refused, draft only (T4)
python3 -m extension_core plan --voice "oven fire fox" "open firefox"         # rescued from the 2nd transcript
python3 -m extension_core route "how to back up my photos to drive"           # web gets a scrubbed query
python3 -m extension_core route "find my tax receipts from last year"         # never reaches the web
python3 -m extension_core sources --scope public
python3 -m extension_core tiers
```

## Files

| File | What it decides |
|---|---|
| `events.py` | `InputEvent`, the one shape every input becomes. Removes fillers, applies spoken self-corrections ("open chrome, no I mean Firefox" → "open Firefox"), splits commit words ("press send") and cancel words. Voice keeps its n-best alternatives and the screen snapshot from when speech *started* |
| `fastmap.py` + `rules.json` | Regex rules tried against every alternative, best first; a miss goes to a model. `resolve_name` matches heard names to known ones (sound-alike + fuzzy) and reports when two are too close, so the assistant asks "Jon Smith or John Smith?" instead of guessing. The same name list should go to the recogniser as biasing strings |
| `policy.py` | Risk tiers and the gate. Unknown actions count as T3. Tap targets escalate ("Pay now" → T4, "Squash and merge" → T3, "Send" → T2); typing tops out at a confirmation; search text never escalates. Banking, payment, wallet and password-manager apps are denied to Hands. Untrusted content forces a fresh confirmation at T2+. Unattended runs can't confirm, so they can't do T2+. `ToolPins` blocks an MCP tool whose definition changed after approval |
| `privacy.py` | Classifies a query as personal, public or mixed. Personal queries never reach a web API. Mixed queries send the web a scrubbed version (no "my …" items, emails, device paths, phone numbers, long digit runs). Secrets, bank or card numbers and private terms block the web part entirely. Reuses `scripts/privacy_scan.py`'s patterns when the repository is present |
| `ledger.py` | Episode log (Module A): append-only and hash-chained, with an optional HMAC (`ORCHESTRATOR_EVIDENCE_KEY`). Hashes cover each record's *data hash*, so `forget` can erase content and the chain still verifies. Refuses to live inside a git tree |
| `skills.py` | The skill ladder L0 → L3 with promotion, demotion on undo, fingerprint approval (any edit voids it), and refusal to compile a risky step whose parameters aren't fixed and typed. Only reversible skills can reach L3 and run unattended |
| `evals.py` | Personal eval set with a stable 1-in-5 held-out split the optimiser can't read (`OptimizerView` raises), deterministic checks, and the ship gate: no category may drop by more than noise |
| `routing.py` + `routing.json` | Task type → model tier. A private task always gets the on-device tier; if no on-device model is available it returns nothing rather than falling back to the cloud |
| `sources.py` + `sources.json` | Finder's source catalogue (24 sources): content types, key needed (environment variable name only), cost, rate limit, terms-of-service flags, where it runs, priority. Personal and public sources never mix; personal sources are never shareable |
| `pipeline.py` | Puts the above together and returns a plan with the next step |

## Rules this code enforces (and the tests that prove them)

- A personal search never produces a web query: `test_personal_never_reaches_web`.
- Voice and typing reach the same plan: `test_voice_and_typing_reach_same_plan`.
- Payments are never executed: `test_financial_never_executed`, `test_pay_refused_with_draft`.
- A changed tool definition is blocked: `test_rug_pull_blocked`.
- Forgetting erases content without breaking the log: `test_forget_keeps_chain_valid`.
- The optimiser can't read held-out evals: `test_optimizer_cannot_see_held_out`.
- A skill that sends something never runs unattended: `test_external_send_never_unattended`.

## Not built yet

The tool broker (phone Hands, Finder adapters), the companion app, the on-device model, the nightly learning pass, and wiring this gate into `orchestrator/`'s preflight. See the plan's build phases.
