"""Module F command line.

  python3 -m module_f say "tell me a joke press send"   # one utterance, no microphone
  python3 -m module_f listen                             # loop: speech-to-text -> handle
  python3 -m module_f check                              # show foreground app and allowlist match
  python3 -m module_f clear-stop                         # lower the stop flag

Add --dry-run to find the field and send button without typing or sending.
Run from the folder that contains module_f/ (skills/device-orchestration-stack).
"""
from __future__ import annotations

import argparse
import sys

from .backends import TermuxDroidBackend
from .core import DEFAULT_ALLOWLIST, Config, Injector, StopFlag, pick_field, pick_send


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="module_f", description="Voice-to-chat injection (Module F)")
    ap.add_argument("--allowlist", default=str(DEFAULT_ALLOWLIST))
    ap.add_argument("--serial", help="adb device serial, if more than one is connected")
    ap.add_argument("--dry-run", action="store_true", help="locate the field and Send, but don't type or send")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("say", help="handle one utterance given as text")
    s.add_argument("utterance")
    sub.add_parser("listen", help="listen with termux-speech-to-text until you say stop")
    sub.add_parser("check", help="report the foreground app, its allowlist entry, field and Send button")
    sub.add_parser("clear-stop", help="remove the stop flag so sends can resume")
    a = ap.parse_args(argv)

    cfg = Config.load(a.allowlist)
    backend = TermuxDroidBackend(serial=a.serial)
    stop = StopFlag()
    inj = Injector(cfg, backend, stop=stop, dry_run=a.dry_run)

    if a.cmd == "clear-stop":
        stop.clear()
        print("stop flag cleared")
        return 0
    if a.cmd == "check":
        pkg, act = backend.foreground()
        surf = cfg.surfaces.get(pkg)
        print(f"foreground {pkg}/{act}")
        print(f"allowlist  {surf.name + ' (send by ' + surf.send + ')' if surf else 'NOT LISTED'}")
        els = backend.dump()
        f = pick_field(els)
        print(f"field      {('ref ' + str(f['ref']) + ' ' + repr(f.get('label', ''))) if f else 'none found'}")
        if surf and surf.send == "button":
            b = pick_send(els, surf.send_labels)
            print(f"send       {('ref ' + str(b['ref']) + ' ' + repr(b.get('label', ''))) if b else 'none found'}")
        print(f"stop flag  {'UP' if stop.raised() else 'down'}")
        return 0
    if a.cmd == "say":
        r = inj.handle(a.utterance)
        print(f"{'ok' if r.ok else 'refused'}: {r.step} - {r.detail}")
        return 0 if r.ok else 1

    # listen
    stop.clear()
    backend.show_stop_button(str(stop.path))
    backend.speak("Module F is listening. Say stop when you're done.")
    try:
        while not stop.raised():
            heard = backend.listen()
            if not heard:
                continue
            r = inj.handle(heard)
            print(f"{'ok' if r.ok else 'refused'}: {r.step} - {r.detail}", flush=True)
            if r.step == "stop":
                break
    finally:
        backend.hide_stop_button()
    return 0


def _entry() -> int:
    try:
        return main()
    except RuntimeError as e:
        print(f"module_f: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(_entry())
