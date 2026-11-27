"""One input pipeline: typed text and speech become the same InputEvent.

Everything after `InputEvent` (rules, gates, tools, logs, tests) is shared, so a
fix for typing is a fix for voice and the reverse. Standard library only.
"""
from __future__ import annotations

import re
import time
from dataclasses import dataclass, field

# Spoken filler words removed before matching. Kept small on purpose: removing a
# real word ("like" in "find files like this") is worse than leaving a filler.
FILLERS = ("um", "umm", "uh", "uhh", "erm", "er", "hmm", "you know")

# Words that mean "replace what I just said". The text after the LAST marker is
# the correction. "no" alone is too common to be a marker, so it needs a follow-up word.
REPAIR_MARKERS = (
    "no i mean", "no wait", "i mean", "sorry i mean", "actually make that",
    "scratch that", "correction",
)

# Commit words end dictation explicitly, so a long message is never cut off.
COMMIT_WORDS = ("press send", "send it", "press enter", "go ahead")
CANCEL_WORDS = ("cancel", "never mind", "nevermind", "cancel that")


@dataclass
class InputEvent:
    """What every input becomes. Typed input has confidence 1 and one alternative."""
    text: str                                   # best transcript, or what was typed
    modality: str = "text"                      # text | voice | share | notification | schedule
    alternatives: list[str] = field(default_factory=list)   # n-best transcripts, best first
    confidence: float = 1.0                     # recogniser confidence of `text` (0..1)
    t_start: float = 0.0                        # when input started (screen context is taken here)
    t_end: float = 0.0
    screen_ref: str | None = None               # id of the screen snapshot taken at t_start
    commit: str | None = None                   # commit word that ended dictation, if any
    cancelled: bool = False
    repaired: bool = False                      # a self-correction was applied
    source: str = "owner"                       # owner | untrusted (text that came from a page, email, etc.)

    def candidates(self) -> list[str]:
        """Every transcript to try, best first, no duplicates, `text` always first."""
        seen, out = set(), []
        for t in [self.text, *self.alternatives]:
            key = t.strip().lower()
            if key and key not in seen:
                seen.add(key)
                out.append(t.strip())
        return out


def _squash(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def strip_fillers(text: str) -> str:
    out = text
    for f in sorted(FILLERS, key=len, reverse=True):
        out = re.sub(r"(?i)(?<![\w'])" + re.escape(f) + r"(?![\w'])[,.]?", " ", out)
    return _squash(out)


def apply_repair(text: str) -> tuple[str, bool]:
    """Apply a spoken self-correction.

    Returns (text, repaired). Only the clear case is handled by rule: a repair
    marker followed by a replacement for the LAST word or short phrase before it.
    "open chrome no i mean firefox" -> "open firefox".
    Anything less clear is left alone and flagged, for the model to resolve.
    """
    low = text.lower()
    best = None
    for m in REPAIR_MARKERS:
        for hit in re.finditer(r"(?:^|[\s,]+)" + re.escape(m) + r"(?:[\s,]+|$)", low):
            # the last marker wins; of markers ending together, the longest
            # ("no i mean" beats the "i mean" inside it)
            if best is None or (hit.end(), -hit.start()) > (best[1], -best[0]):
                best = (hit.start(), hit.end(), m)
    if best is None:
        return text, False
    start, end, _ = best
    before = text[:start].rstrip(" ,")
    after = text[end:].strip(" ,")
    if not after:                         # "scratch that" at the end: drop everything
        return "", True
    after_words = after.split()
    before_words = before.split()
    first = after_words[0].lower()
    anchor = max((i for i, w in enumerate(before_words) if w.lower() == first), default=None)
    if anchor is not None:
        # The correction repeats an earlier word: restart from there.
        # "flight to new york no i mean to chicago" -> "flight to chicago"
        kept = before_words[:anchor]
    else:
        # Otherwise it replaces the same number of trailing words.
        # "open chrome no i mean firefox" -> "open firefox"; "7 am, i mean 8 am" -> "8 am"
        kept = before_words[:max(0, len(before_words) - len(after_words))]
    return _squash(" ".join(kept + after_words)), True


def split_commit(text: str) -> tuple[str, str | None, bool]:
    """Split a trailing commit or cancel word. Returns (body, commit_word, cancelled)."""
    low = text.lower().rstrip(" .!?")
    for w in sorted(CANCEL_WORDS, key=len, reverse=True):
        if low == w or low.endswith(" " + w):
            return "", None, True
    for w in sorted(COMMIT_WORDS, key=len, reverse=True):
        if low == w or re.search(r"(?:^|[\s,]+)" + re.escape(w) + r"$", low):
            idx = low.rfind(w)
            return text[:idx].strip(" ,;"), w, False
    return text.strip(), None, False


def normalize(text: str) -> tuple[str, bool]:
    """Fillers out, self-corrections applied. Returns (text, repaired)."""
    t = strip_fillers(text)
    t, repaired = apply_repair(t)
    return t, repaired


def from_text(text: str, *, source: str = "owner", now: float | None = None) -> InputEvent:
    """Typed input. Same normalisation as speech, so behaviour can't drift between them."""
    now = time.time() if now is None else now
    body, commit, cancelled = split_commit(text)
    body, repaired = normalize(body)
    return InputEvent(text=body, modality="text", alternatives=[body], confidence=1.0,
                      t_start=now, t_end=now, commit=commit, cancelled=cancelled,
                      repaired=repaired, source=source)


def from_voice(alternatives: list[str], confidences: list[float] | None = None, *,
               t_start: float | None = None, t_end: float | None = None,
               screen_ref: str | None = None) -> InputEvent:
    """Speech input: the recogniser's n-best list, best first.

    Each alternative gets the same normalisation as typed text. `screen_ref`
    must be the snapshot taken when speech STARTED, so "this" means what was on
    screen when the owner began talking.
    """
    alts = [a for a in alternatives if a and a.strip()]
    if not alts:
        return InputEvent(text="", modality="voice", alternatives=[], confidence=0.0, cancelled=True)
    now = time.time()
    normed, commit, cancelled, repaired_any = [], None, False, False
    for i, a in enumerate(alts):
        body, c, cx = split_commit(a)
        body, rep = normalize(body)
        if i == 0:
            commit, cancelled, repaired_any = c, cx, rep
        normed.append(body)
    conf = confidences[0] if confidences else 0.0
    return InputEvent(text=normed[0], modality="voice", alternatives=normed[1:],
                      confidence=float(conf), t_start=t_start or now, t_end=t_end or now,
                      screen_ref=screen_ref, commit=commit, cancelled=cancelled,
                      repaired=repaired_any)
