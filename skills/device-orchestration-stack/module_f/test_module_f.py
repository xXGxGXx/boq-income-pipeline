#!/usr/bin/env python3
"""Module F tests. No phone needed. Run: python3 skills/device-orchestration-stack/module_f/test_module_f.py"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from module_f.backends import KEYCODE_PASTE, TermuxDroidBackend  # noqa: E402
from module_f.core import (AuditLog, Config, Injector, RateLimiter, StopFlag,  # noqa: E402
                           is_confirmation, is_destructive, parse, pick_field, pick_send)

CFG = Config.load()

FIELD = {"ref": 7, "label": "Message", "editable": True, "enabled": True, "clickable": True, "center": [540, 2200]}
SEARCH = {"ref": 2, "label": "Search chats", "editable": True, "enabled": True, "clickable": True, "center": [540, 150]}
SEND = {"ref": 8, "label": "", "desc": "Send message", "editable": False, "enabled": True, "clickable": True, "center": [1000, 2200]}
SCREEN = [SEARCH, FIELD, SEND]


class FakeBackend:
    def __init__(self, pkg="com.openai.chatgpt", screen=SCREEN, answer="confirm"):
        self.pkg, self.screen, self.answer = pkg, list(screen), answer
        self.calls, self.spoken = [], []

    def foreground(self):
        return self.pkg, ".MainActivity"

    def dump(self):
        self.calls.append(("dump",))
        return self.screen

    def tap(self, ref):
        self.calls.append(("tap", ref))

    def inject(self, text):
        self.calls.append(("inject", text))

    def key(self, name):
        self.calls.append(("key", name))

    def speak(self, line):
        self.spoken.append(line)

    def listen(self):
        self.calls.append(("listen",))
        return self.answer

    def actions(self):
        return [c for c in self.calls if c[0] in ("tap", "inject", "key")]


def make(backend, **kw):
    d = Path(tempfile.mkdtemp())
    stop = StopFlag(d / "STOP")
    log = AuditLog(d / "audit.jsonl")
    return Injector(CFG, backend, stop=stop, log=log, **kw), stop, log


class Parse(unittest.TestCase):
    def test_text_then_trigger(self):
        c = parse("Tell me a joke, press send.", CFG)
        self.assertEqual((c.action, c.text), ("send", "Tell me a joke"))

    def test_trigger_alone_sends_existing_text(self):
        self.assertEqual(parse("press send", CFG).action, "send")
        self.assertEqual(parse("press send", CFG).text, "")

    def test_trigger_must_end_the_utterance(self):
        self.assertEqual(parse("press send me the file later", CFG).action, "none")
        self.assertEqual(parse("how do I press sending", CFG).action, "none")

    def test_no_trigger_is_never_injected(self):
        self.assertEqual(parse("just thinking out loud", CFG).action, "none")
        self.assertEqual(parse("   ", CFG).action, "none")

    def test_stop_wins(self):
        self.assertEqual(parse("Stop", CFG).action, "stop")
        self.assertEqual(parse("ok cancel everything", CFG).action, "stop")

    def test_keeps_original_case_and_punctuation(self):
        self.assertEqual(parse("What's 2+2? hit send", CFG).text, "What's 2+2?")


class Rules(unittest.TestCase):
    def test_destructive_words_are_whole_words(self):
        self.assertTrue(is_destructive("please delete my old chats", CFG))
        self.assertTrue(is_destructive("Merge PR 28", CFG))
        self.assertFalse(is_destructive("what does deleted mean", CFG))
        self.assertFalse(is_destructive("tell me a joke", CFG))

    def test_confirmation(self):
        self.assertTrue(is_confirmation("Confirm", CFG))
        self.assertTrue(is_confirmation("yes send it", CFG))
        self.assertFalse(is_confirmation("no", CFG))
        self.assertFalse(is_confirmation("", CFG))

    def test_pick_field_prefers_message_box_over_search(self):
        self.assertEqual(pick_field(SCREEN)["ref"], 7)

    def test_pick_field_skips_search_and_ignores_package_in_id(self):
        # shapes taken from a real droid-agent 0.2.0 --json dump
        search = {"ref": 1, "label": "Search chats", "desc": "Search chats", "id": "com.openai.chatgpt:id/search",
                  "editable": True, "enabled": True, "center": [540, 2300]}
        composer = {"ref": 2, "label": "edittext", "desc": "", "id": "com.openai.chatgpt:id/composer",
                    "editable": True, "enabled": True, "center": [470, 2205]}
        self.assertEqual(pick_field([search, composer])["ref"], 2)
        self.assertEqual(pick_field([search])["ref"], 1)   # only field on screen: still usable

    def test_pick_field_skips_passwords_and_disabled(self):
        pw = dict(FIELD, ref=9, password=True)
        off = dict(FIELD, ref=10, enabled=False)
        self.assertIsNone(pick_field([pw, off]))

    def test_pick_field_falls_back_to_lowest(self):
        a = {"ref": 1, "label": "", "editable": True, "center": [0, 100]}
        b = {"ref": 2, "label": "", "editable": True, "center": [0, 1900]}
        self.assertEqual(pick_field([a, b])["ref"], 2)

    def test_pick_send_matches_desc_and_ignores_fields(self):
        self.assertEqual(pick_send(SCREEN, ["send"])["ref"], 8)
        self.assertIsNone(pick_send([FIELD, SEARCH], ["send"]))
        self.assertIsNone(pick_send([{"ref": 3, "label": "Resend code", "clickable": True}], ["send"]))

    def test_rate_limiter(self):
        t = [0.0]
        rl = RateLimiter(2, clock=lambda: t[0])
        self.assertTrue(rl.allow()); self.assertTrue(rl.allow()); self.assertFalse(rl.allow())
        t[0] = 61
        self.assertTrue(rl.allow())

    def test_allowlist_file_is_valid(self):
        self.assertGreaterEqual(len(CFG.surfaces), 1)
        for s in CFG.surfaces.values():
            self.assertIn(s.send, ("button", "enter"))


class Pipeline(unittest.TestCase):
    def test_happy_path_types_then_taps_send(self):
        b = FakeBackend()
        inj, _, log = make(b)
        r = inj.handle("tell me a joke press send")
        self.assertTrue(r.ok, r)
        self.assertEqual(b.actions(), [("tap", 7), ("inject", "tell me a joke"), ("tap", 8)])
        self.assertEqual(b.spoken[-1], "Sent.")

    def test_audit_log_never_holds_the_text(self):
        b = FakeBackend()
        inj, _, log = make(b)
        inj.handle("my secret plan press send")
        raw = log.path.read_text()
        self.assertNotIn("secret", raw)
        ev = json.loads(raw.splitlines()[-1])
        self.assertEqual((ev["step"], ev["chars"], len(ev["fp"])), ("sent", 14, 12))

    def test_unlisted_app_is_refused_before_any_action(self):
        b = FakeBackend(pkg="com.android.messaging")
        inj, _, _ = make(b)
        r = inj.handle("hi mum press send")
        self.assertEqual((r.ok, r.step), (False, "allowlist"))
        self.assertEqual(b.actions(), [])
        self.assertNotIn(("dump",), b.calls)

    def test_no_trigger_does_nothing_and_says_nothing(self):
        b = FakeBackend()
        inj, _, _ = make(b)
        r = inj.handle("hello there")
        self.assertEqual(r.step, "parse")
        self.assertEqual((b.calls, b.spoken), ([], []))

    def test_destructive_needs_spoken_confirm(self):
        b = FakeBackend(answer="no")
        inj, _, _ = make(b)
        r = inj.handle("delete all my chats press send")
        self.assertEqual((r.ok, r.step), (False, "confirm"))
        self.assertIn(("listen",), b.calls)
        self.assertNotIn(("tap", 8), b.calls)   # typed, never sent

    def test_destructive_confirmed_is_sent(self):
        b = FakeBackend(answer="confirm")
        inj, _, _ = make(b)
        self.assertTrue(inj.handle("delete all my chats press send").ok)
        self.assertIn(("tap", 8), b.calls)

    def test_stop_flag_blocks_everything(self):
        b = FakeBackend()
        inj, stop, _ = make(b)
        stop.raise_()
        r = inj.handle("hello press send")
        self.assertEqual((r.ok, r.step), (False, "stop"))
        self.assertEqual(b.actions(), [])

    def test_saying_stop_raises_the_flag(self):
        b = FakeBackend()
        inj, stop, _ = make(b)
        inj.handle("stop")
        self.assertTrue(stop.raised())

    def test_rate_limit(self):
        b = FakeBackend()
        inj, _, _ = make(b, limiter=RateLimiter(1, clock=lambda: 0.0))
        self.assertTrue(inj.handle("one press send").ok)
        self.assertEqual(inj.handle("two press send").step, "rate")

    def test_too_long_is_refused(self):
        b = FakeBackend()
        inj, _, _ = make(b)
        self.assertEqual(inj.send("x" * (CFG.max_chars + 1)).step, "length")
        self.assertEqual(b.actions(), [])

    def test_missing_field(self):
        b = FakeBackend(screen=[SEND])
        inj, _, _ = make(b)
        self.assertEqual(inj.handle("hi press send").step, "field")
        self.assertEqual(b.actions(), [])

    def test_missing_send_button_leaves_text_in_box(self):
        b = FakeBackend(screen=[FIELD])
        inj, _, _ = make(b)
        r = inj.handle("hi press send")
        self.assertEqual((r.ok, r.step), (False, "send"))
        self.assertEqual(b.actions(), [("tap", 7), ("inject", "hi")])

    def test_enter_surface_uses_enter_key(self):
        cfg = Config.load()
        cfg.surfaces["com.openai.chatgpt"].send = "enter"
        b = FakeBackend()
        d = Path(tempfile.mkdtemp())
        inj = Injector(cfg, b, stop=StopFlag(d / "S"), log=AuditLog(d / "a"))
        self.assertTrue(inj.handle("hi press send").ok)
        self.assertEqual(b.actions()[-1], ("key", "enter"))

    def test_dry_run_touches_nothing(self):
        b = FakeBackend()
        inj, _, _ = make(b, dry_run=True)
        r = inj.handle("hi press send")
        self.assertEqual((r.ok, r.step), (True, "dry-run"))
        self.assertEqual(b.actions(), [])


class BackendCommands(unittest.TestCase):
    """Command shapes sent to droid-agent and termux-api."""

    def setUp(self):
        self.seen = []

        def runner(argv, stdin=None, timeout=30):
            self.seen.append((argv, stdin))
            if argv[-1] == "state":
                return json.dumps({"foreground_package": "com.anthropic.claude", "foreground_activity": ".Main"})
            if argv[-1] == "dump":
                return json.dumps(SCREEN)
            if argv[0] == "termux-speech-to-text":
                return "confirm\n"
            return ""
        self.b = TermuxDroidBackend(runner=runner, serial="abc")

    def test_state_and_dump(self):
        self.assertEqual(self.b.foreground(), ("com.anthropic.claude", ".Main"))
        self.assertEqual(self.b.dump()[1]["ref"], 7)
        self.assertEqual(self.seen[0][0], ["droid-agent", "-s", "abc", "--json", "state"])

    def test_ascii_types_directly(self):
        self.b.inject("hello world")
        self.assertEqual(self.seen, [(["droid-agent", "-s", "abc", "type", "hello world"], None)])

    def test_non_ascii_and_multiline_go_through_clipboard(self):
        for text in ("café ☕", "line one\nline two", "50%s off"):
            self.seen.clear()
            self.b.inject(text)
            self.assertEqual(self.seen[0], (["termux-clipboard-set"], text))
            self.assertEqual(self.seen[1][0][-2:], ["key", str(KEYCODE_PASTE)])

    def test_voice_and_stop_button(self):
        self.b.speak("Sent.")
        self.assertEqual(self.b.listen(), "confirm")
        self.b.show_stop_button("/data/x/STOP")
        note = self.seen[-1][0]
        self.assertEqual(note[0], "termux-notification")
        self.assertIn("--button1-action", note)
        self.assertEqual(note[note.index("--button1-action") + 1], "touch /data/x/STOP")
        self.assertEqual(self.seen[0][0], ["termux-tts-speak", "Sent."])

    def test_failed_command_raises(self):
        from module_f.backends import run
        with self.assertRaises(RuntimeError):
            run([sys.executable, "-c", "import sys; sys.exit(3)"])

    def test_missing_tool_gives_install_hint(self):
        from module_f.backends import run
        with self.assertRaises(RuntimeError) as cm:
            run(["droid-agent-definitely-missing"])
        self.assertIn("not installed", str(cm.exception))
        with self.assertRaises(RuntimeError) as cm:
            run(["termux-no-such-tool"])
        self.assertIn("termux-api", str(cm.exception))


if __name__ == "__main__":
    unittest.main(verbosity=1)
