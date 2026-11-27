"""Device backends for Module F.

TermuxDroidBackend drives the phone with two real tools:

- droid-agent (PyPI, needs adb; works from Termux over wireless debugging):
  `droid-agent --json state`, `--json dump`, `tap <ref>`, `type <text>`, `key <name|code>`.
  Command shapes checked against droid-agent 0.2.0's cli.py.
- termux-api: `termux-tts-speak`, `termux-speech-to-text`, `termux-clipboard-set`,
  `termux-notification`. Usage checked against termux-api-package's scripts.

Not yet run on a phone. Every call goes through `runner`, so tests swap it out.
"""
from __future__ import annotations

import json
import shlex
import subprocess

KEYCODE_PASTE = 279   # Android KeyEvent.KEYCODE_PASTE; droid-agent accepts numeric codes


INSTALL_HINT = {
    "droid-agent": "pip install droid-agent, then pair adb over wireless debugging (droid-agent pair HOST:PORT CODE)",
    "termux-tts-speak": "pkg install termux-api, plus the Termux:API app",
}


def run(argv: list[str], stdin: str | None = None, timeout: float = 30) -> str:
    try:
        p = subprocess.run(argv, input=stdin, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError:
        hint = INSTALL_HINT.get(argv[0], INSTALL_HINT["termux-tts-speak"] if argv[0].startswith("termux-") else "")
        raise RuntimeError(f"{argv[0]} is not installed" + (f". Install: {hint}" if hint else ""))
    except subprocess.TimeoutExpired:
        raise RuntimeError(f"{argv[0]} did not finish within {timeout:.0f}s")
    if p.returncode != 0:
        raise RuntimeError(f"{shlex.join(argv)} exited {p.returncode}: {p.stderr.strip()[:300]}")
    return p.stdout


class TermuxDroidBackend:
    def __init__(self, runner=run, droid: str = "droid-agent", serial: str | None = None):
        self.runner = runner
        self.droid = [droid] + (["-s", serial] if serial else [])

    # ---- screen (droid-agent)
    def foreground(self) -> tuple[str, str]:
        st = json.loads(self.runner(self.droid + ["--json", "state"]))
        return st.get("foreground_package", ""), st.get("foreground_activity", "")

    def dump(self) -> list[dict]:
        data = json.loads(self.runner(self.droid + ["--json", "dump"]))
        return data if isinstance(data, list) else []

    def tap(self, ref: int) -> None:
        self.runner(self.droid + ["tap", str(ref)])

    def key(self, name: str) -> None:
        self.runner(self.droid + ["key", name])

    def inject(self, text: str) -> None:
        """Plain ASCII without newlines goes through `adb input text`; anything else
        (emoji, accents, multi-line) goes via the clipboard and a paste key,
        because `input text` cannot type non-ASCII and turns newlines into Enter."""
        if text.isascii() and "\n" not in text and "%s" not in text:
            self.runner(self.droid + ["type", text])
        else:
            self.runner(["termux-clipboard-set"], stdin=text)
            self.runner(self.droid + ["key", str(KEYCODE_PASTE)])

    # ---- voice and notification (termux-api)
    def speak(self, line: str) -> None:
        self.runner(["termux-tts-speak", line])

    def listen(self) -> str:
        return self.runner(["termux-speech-to-text"], timeout=60).strip()

    def show_stop_button(self, stop_path: str) -> None:
        """Ongoing notification with a Stop button that creates the stop flag file."""
        self.runner(["termux-notification", "--id", "module-f", "--ongoing",
                     "--title", "Module F listening", "--content", "Tap Stop to halt sends",
                     "--button1", "Stop", "--button1-action", f"touch {shlex.quote(stop_path)}"])

    def hide_stop_button(self) -> None:
        self.runner(["termux-notification-remove", "module-f"])
