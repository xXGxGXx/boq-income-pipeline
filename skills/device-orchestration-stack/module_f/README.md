# Module F: voice-to-chat injection (first build)

Say a message ending in **"press send"** and Module F types it into the chat box of the app on screen and taps Send. Built to the Module F design in `MASTER-ORCHESTRATOR-REFERENCE.md` and `../DESIGN.md`, with the changes listed under [Differences from the design](#differences-from-the-design).

**Status:** 45 unit tests pass, and CI runs them on every PR. Also run end to end against the real droid-agent 0.2.0 code with a stand-in for the phone (fake `adb`, fake termux-api). **Not yet run on a real phone.**

## What happens when you speak

1. **Parse.** The trigger must *end* what you said: "tell me a joke, press send" sends "tell me a joke". "press send" alone sends what's already in the box. Anything without a trigger is ignored and never typed.
2. **Stop check.** If the stop flag is up (Stop button, or you said "stop"), nothing happens.
3. **Limits.** At most 6 sends a minute and 2,000 characters (both set in `allowlist.json`).
4. **Allowlist.** The foreground app must be in `allowlist.json` (or added on this phone with `learn`). Otherwise it refuses before reading the screen. If the package looks like a known chat app, it tells you to run `learn`.
5. **Find the box.** It picks an editable, enabled, non-password field. Search boxes are skipped, message-like names are preferred, and the lowest on screen wins.
6. **Type.** Plain ASCII uses `droid-agent type`. Emoji, accents and multi-line text go via `termux-clipboard-set` and a paste key, because `adb input text` can't type them.
7. **Check it landed.** It re-reads the screen and only continues if a field now holds the text. If not, it says so and doesn't send. Set `"verify": false` on an app that hides its field text.
8. **Confirm if risky.** If the text contains a word like delete, merge, pay or transfer, it asks out loud and needs "confirm". Any other answer cancels and leaves the text in the box.
9. **Send.** It taps the app's Send button, matched by label (`"send"`, `"send message"`…), or presses Enter for apps set to `"send": "enter"`.
10. **Log.** Every outcome goes to `~/.module-f/audit.jsonl` with the time, app, step, length and a 12-character fingerprint. **The text itself is never logged.**

Every refusal is spoken, so you know nothing was sent.

## Setup on the phone (Termux)

```bash
pkg install python android-tools termux-api      # plus the Termux:API app from the same source as Termux
pip install droid-agent
# Settings > Developer options > Wireless debugging > Pair device with pairing code:
droid-agent pair 127.0.0.1:PAIR_PORT CODE
droid-agent connect 127.0.0.1:CONNECT_PORT
droid-agent state                                  # should print the foreground app
```

Wireless debugging switches off when the phone changes Wi-Fi network or restarts. Re-run `droid-agent connect` when that happens.

## Use

Run from `skills/device-orchestration-stack/`:

```bash
python3 -m module_f check                                # shows app, box, Send button
python3 -m module_f learn ChatGPT                        # saves the real package name for this app
python3 -m module_f --dry-run say "hello press send"     # finds everything, types nothing
python3 -m module_f say "hello press send"               # one message, no microphone
python3 -m module_f listen                               # speak repeatedly; say "stop" or tap Stop to end
python3 -m module_f clear-stop                           # lower the stop flag after a stop
```

`check`, `learn` and `say` count down 6 seconds before reading the screen (`--wait N` to change). Use that time to switch from Termux to the chat app. Otherwise they read Termux itself, and `learn` refuses that.

`listen` shows an ongoing notification with a **Stop** button. Tapping it creates `~/.module-f/STOP`, which halts all sends until `clear-stop`.

**First thing to do on the phone:** for each chat app, run `learn <Name>` (for example `learn Claude`) and switch to that app during the countdown. That saves its real package name to `~/.module-f/allowlist.local.json`, which overrides the guesses in `allowlist.json`. Then run `check` to confirm it finds the box and the Send button. The Play Store couldn't be reached from the build session, so the shipped package names are unconfirmed.

## Files

| File | What it is |
|---|---|
| `core.py` | Phrase parsing, allowlist, field and Send matching, stop flag, rate limit, audit log, the send pipeline |
| `backends.py` | The phone side: droid-agent and termux-api command calls |
| `__main__.py` | The `check` / `say` / `listen` / `clear-stop` commands |
| `allowlist.json` | Apps, trigger phrases, risky words, vendor hints and limits. Edit this, not the code. Module D syncs it later |
| `~/.module-f/allowlist.local.json` | On the phone only: apps added with `learn`. Overrides `allowlist.json` |
| `test_module_f.py` | Tests: `python3 skills/device-orchestration-stack/module_f/test_module_f.py` |

## Differences from the design

- **AccessDroid / amctl is not used.** The design's Termux bridge (yashas-13/AccessDroid) returned 404 on GitHub on 2026-11-27, so it couldn't be verified. droid-agent (PyPI 0.2.0, MIT, needs adb) is used instead, with command shapes checked against its source.
- **No `ACTION_SET_TEXT`.** That needs an accessibility service, and termux-api's accessibility support (issue #828, PR #840) is still unreleased. Typing goes through adb (`input text`), or clipboard plus paste for text adb can't type. Both use the ADB grant the design already counts as the single grant.
- **Send taps the Send button by default** instead of an IME Enter key, because Enter adds a new line in most AI chat apps. Per app, `"send": "enter"` switches to Enter.
- **Foreground check** uses `droid-agent state`. termux-api has no foreground-app command.

## Decisions made for the open questions

From `../MODULE-F-TAP-EXTENSION.md`, applied to text sends. Change them in `allowlist.json` or say so:

- **Confirmation:** spoken "confirm" required only when the text contains a risky word. Ordinary chat messages send without a prompt.
- **Rate limit:** 6 sends a minute.
- **Multi-step confirm:** one confirmation per send, asked after typing and before Send, so you can see what will go.

## Not built yet

- Voice-triggered taps ("press merge"; see `../MODULE-F-TAP-EXTENSION.md`).
- Syncing `allowlist.json` across devices (Module D).
- Feeding the audit log into the replay buffer (Module A). The JSONL format is ready for it.
