"""Module F core: voice phrase -> checked text injection -> send.

Pure decision logic plus the injection pipeline. Device access goes through
a backend object (see backends.py) so every rule here is testable without a
phone. Standard library only, so it runs in Termux's Python.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import time
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_ALLOWLIST = HERE / "allowlist.json"
STATE_DIR = Path(os.environ.get("MODULE_F_HOME", Path.home() / ".module-f"))


# ---------------------------------------------------------------- config

@dataclass
class Surface:
    package: str
    name: str
    send: str = "button"          # "button": tap a Send control; "enter": press Enter
    send_labels: list[str] = field(default_factory=lambda: ["send"])


@dataclass
class Config:
    surfaces: dict[str, Surface]
    send_phrases: list[str]
    stop_phrases: list[str]
    confirm_words: list[str]
    destructive_words: list[str]
    max_sends_per_minute: int = 6
    max_chars: int = 2000

    @classmethod
    def load(cls, path: Path | str = DEFAULT_ALLOWLIST) -> "Config":
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
        surfaces = {}
        for s in raw["surfaces"]:
            surf = Surface(package=s["package"], name=s["name"], send=s.get("send", "button"),
                           send_labels=[x.lower() for x in s.get("send_labels", ["send"])])
            if surf.send not in ("button", "enter"):
                raise ValueError(f"{surf.package}: send must be 'button' or 'enter'")
            surfaces[surf.package] = surf
        p = raw["phrases"]
        return cls(
            surfaces=surfaces,
            send_phrases=[x.lower() for x in p["send"]],
            stop_phrases=[x.lower() for x in p["stop"]],
            confirm_words=[x.lower() for x in p["confirm"]],
            destructive_words=[x.lower() for x in raw.get("destructive_words", [])],
            max_sends_per_minute=int(raw.get("max_sends_per_minute", 6)),
            max_chars=int(raw.get("max_chars", 2000)),
        )


# --------------------------------------------------------------- fastmap

@dataclass
class Command:
    action: str      # "send" | "stop" | "none"
    text: str = ""   # dictated text before the trigger phrase ("" = send what is already typed)


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().lower())


def parse(utterance: str, cfg: Config) -> Command:
    """Regex-first FastMap: the trigger phrase must END the utterance.

    "tell me a joke press send" -> send "tell me a joke"
    "press send"               -> send whatever is already in the field
    "stop"                     -> stop
    anything else              -> none (never injected)
    """
    said = utterance.strip()
    low = _norm(said)
    if not low:
        return Command("none")
    for p in sorted(cfg.stop_phrases, key=len, reverse=True):
        if low == p or low.endswith(" " + p):
            return Command("stop")
    for p in sorted(cfg.send_phrases, key=len, reverse=True):
        m = re.search(r"(?:^|[\s,]+)" + re.escape(p) + r"[\s.!?]*$", said, re.I)
        if m:
            return Command("send", said[: m.start()].strip(" ,;"))
    return Command("none")


def is_destructive(text: str, cfg: Config) -> bool:
    low = _norm(text)
    return any(re.search(r"\b" + re.escape(w) + r"\b", low) for w in cfg.destructive_words)


def is_confirmation(answer: str, cfg: Config) -> bool:
    low = _norm(answer)
    return any(low == w or low.startswith(w + " ") for w in cfg.confirm_words)


# ----------------------------------------------------- screen selection

def pick_field(elements: list[dict]) -> dict | None:
    """The chat input: an enabled, editable, non-password field.

    Prefer one whose label looks like a message box; otherwise the lowest
    one on screen, since chat bars sit at the bottom.
    """
    fields = [e for e in elements if e.get("editable") and e.get("enabled", True)
              and not e.get("password")]
    if not fields:
        return None

    def words(e: dict) -> str:
        # resource ids look like "com.openai.chatgpt:id/composer"; the package part would match "chat"
        rid = str(e.get("id", "")).split(":id/")[-1]
        return f"{e.get('label', '')} {e.get('desc', '')} {rid}"

    not_search = [e for e in fields if not re.search(r"search|find|filter", words(e), re.I)]
    fields = not_search or fields
    hint = re.compile(r"message|ask|prompt|chat|type|reply|write|composer|input", re.I)
    hinted = [e for e in fields if hint.search(words(e))]
    pool = hinted or fields
    return max(pool, key=lambda e: (e.get("center") or [0, 0])[1])


def pick_send(elements: list[dict], labels: list[str]) -> dict | None:
    """An enabled, clickable control whose label/desc/id names a send action."""
    pat = re.compile(r"\b(" + "|".join(re.escape(l) for l in labels) + r")\b", re.I)
    hits = [e for e in elements if e.get("clickable") and e.get("enabled", True)
            and not e.get("editable")
            and pat.search(f"{e.get('label','')} {e.get('desc','')} {e.get('id','')}")]
    if not hits:
        return None
    return max(hits, key=lambda e: (e.get("center") or [0, 0])[1])


# ------------------------------------------------------- guards and log

class StopFlag:
    """A file the Stop button (or the word "stop") creates. Present = halt."""

    def __init__(self, path: Path | None = None):
        self.path = path or STATE_DIR / "STOP"

    def raised(self) -> bool:
        return self.path.exists()

    def raise_(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(str(time.time()), encoding="utf-8")

    def clear(self) -> None:
        if self.path.exists():
            self.path.unlink()


class RateLimiter:
    def __init__(self, per_minute: int, clock=time.monotonic):
        self.per_minute, self.clock, self.stamps = per_minute, clock, []

    def allow(self) -> bool:
        now = self.clock()
        self.stamps = [t for t in self.stamps if now - t < 60]
        if len(self.stamps) >= self.per_minute:
            return False
        self.stamps.append(now)
        return True


class AuditLog:
    """Append-only JSONL (Module A replay buffer feed). Never stores the text itself."""

    def __init__(self, path: Path | None = None):
        self.path = path or STATE_DIR / "audit.jsonl"

    def write(self, **event) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        event = {"ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **event}
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(event, ensure_ascii=False) + "\n")


def fingerprint(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


# -------------------------------------------------------------- pipeline

@dataclass
class Result:
    ok: bool
    step: str       # where it ended
    detail: str = ""


class Injector:
    """Runs one command end to end. Every exit path is spoken and logged."""

    def __init__(self, cfg: Config, backend, stop: StopFlag | None = None,
                 limiter: RateLimiter | None = None, log: AuditLog | None = None,
                 dry_run: bool = False):
        self.cfg, self.b = cfg, backend
        self.stop = stop or StopFlag()
        self.limiter = limiter or RateLimiter(cfg.max_sends_per_minute)
        self.log = log or AuditLog()
        self.dry_run = dry_run

    def _end(self, ok: bool, step: str, detail: str, say: str | None, **extra) -> Result:
        self.log.write(ok=ok, step=step, detail=detail, dry_run=self.dry_run, **extra)
        if say:
            self.b.speak(say)
        return Result(ok, step, detail)

    def handle(self, utterance: str) -> Result:
        cmd = parse(utterance, self.cfg)
        if cmd.action == "stop":
            self.stop.raise_()
            return self._end(True, "stop", "stop flag raised", "Stopped.")
        if cmd.action != "send":
            return self._end(False, "parse", "no trigger phrase", None)
        return self.send(cmd.text)

    def send(self, text: str) -> Result:
        meta = {"chars": len(text), "fp": fingerprint(text) if text else ""}
        if self.stop.raised():
            return self._end(False, "stop", "stop flag is up; clear it to resume", "Stop is on. Nothing sent.", **meta)
        if len(text) > self.cfg.max_chars:
            return self._end(False, "length", f"over {self.cfg.max_chars} chars", "That's too long to send.", **meta)
        if not self.limiter.allow():
            return self._end(False, "rate", "rate limit reached", "Too many sends this minute. Wait a moment.", **meta)

        pkg, _act = self.b.foreground()
        surf = self.cfg.surfaces.get(pkg)
        meta["package"] = pkg
        if surf is None:
            return self._end(False, "allowlist", f"{pkg} is not on the allowlist",
                             "This app isn't on the send list. Nothing sent.", **meta)

        elements = self.b.dump()
        if text:
            fld = pick_field(elements)
            if fld is None:
                return self._end(False, "field", "no editable field on screen",
                                 f"I can't find the message box in {surf.name}.", **meta)
            if self.dry_run:
                return self._end(True, "dry-run", f"would type into ref {fld['ref']} in {surf.name}", None, **meta)
            self.b.tap(fld["ref"])
            self.b.inject(text)

        if is_destructive(text, self.cfg):
            self.b.speak(f"This looks like a {self._which(text)} request. Say confirm to send, or anything else to cancel.")
            answer = self.b.listen()
            if not is_confirmation(answer, self.cfg):
                return self._end(False, "confirm", "not confirmed", "Cancelled. The text is still in the box.", **meta)

        if self.stop.raised():
            return self._end(False, "stop", "stopped before send", "Stopped before sending.", **meta)
        if self.dry_run:
            return self._end(True, "dry-run", f"would send in {surf.name}", None, **meta)

        if surf.send == "button":
            btn = pick_send(self.b.dump(), surf.send_labels)
            if btn is None:
                return self._end(False, "send", "send button not found",
                                 "I typed it but couldn't find Send. It's waiting in the box.", **meta)
            self.b.tap(btn["ref"])
        else:
            self.b.key("enter")
        return self._end(True, "sent", f"sent in {surf.name}", "Sent.", **meta)

    def _which(self, text: str) -> str:
        low = _norm(text)
        hits = [w for w in self.cfg.destructive_words if re.search(r"\b" + re.escape(w) + r"\b", low)]
        return hits[0] if hits else "sensitive"
