"""FastMap: regex rules tried against EVERY transcript alternative, best first.

Rules live in rules.json (data, not code), so adding a command is one line.
A miss returns None and the caller hands the input to a model.
"""
from __future__ import annotations

import difflib
import json
import re
from dataclasses import dataclass, field
from pathlib import Path

from .events import InputEvent

HERE = Path(__file__).resolve().parent
DEFAULT_RULES = HERE / "rules.json"


@dataclass
class Rule:
    intent: str
    action: str
    patterns: list[re.Pattern]


@dataclass
class Match:
    intent: str
    action: str
    slots: dict[str, str] = field(default_factory=dict)
    transcript: str = ""
    alternative_index: int = 0       # 0 = the top transcript; >0 = rescued from an alternative


def load_rules(path: Path | str = DEFAULT_RULES) -> list[Rule]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    rules = []
    for r in data["rules"]:
        pats = [re.compile(p, re.I) for p in r["patterns"]]
        rules.append(Rule(intent=r["intent"], action=r["action"], patterns=pats))
    return rules


def _clean(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip(" .!?,").strip()


def match(event: InputEvent, rules: list[Rule]) -> Match | None:
    """First rule that fully matches the best transcript that matches anything.

    Rules are tried in file order for each transcript, so more specific rules go
    first in rules.json. Trying every alternative rescues commands the recogniser
    ranked second ("open fire fox" top, "open firefox" second).
    """
    if event.cancelled:
        return None
    for i, text in enumerate(event.candidates()):
        t = _clean(text)
        for rule in rules:
            for p in rule.patterns:
                m = p.fullmatch(t)
                if m:
                    slots = {k: _clean(v) for k, v in m.groupdict().items() if v}
                    return Match(rule.intent, rule.action, slots, t, i)
    return None


# ------------------------------------------------------------ names

def sound_key(s: str) -> str:
    """Rough sound-alike key: lowercase letters and digits, vowels dropped after the first letter,
    repeats collapsed. "Firefox" and "fire fox" share a key; so do "Jon" and "John"."""
    s = re.sub(r"[^a-z0-9]", "", s.lower())
    if not s:
        return ""
    key = s[0] + re.sub(r"[aeiouyhw]", "", s[1:])
    return re.sub(r"(.)\1+", r"\1", key)


@dataclass
class NameChoice:
    best: str | None
    candidates: list[str]
    ambiguous: bool          # true -> ask "A or B?" instead of guessing


def resolve_name(heard: str, names: list[str], cutoff: float = 0.72) -> NameChoice:
    """Match a heard name against known names (contacts, apps, folders).

    The same list should also be given to the recogniser as biasing strings:
    one list, two jobs. Exact and sound-alike matches win; otherwise fuzzy
    ratio. Two close candidates make the result ambiguous.
    """
    if not heard or not names:
        return NameChoice(None, [], False)
    h = heard.strip().lower()
    exact = [n for n in names if n.lower() == h]
    if exact:
        return NameChoice(exact[0], exact, False)
    hk = sound_key(heard)
    scored = []
    for n in names:
        ratio = difflib.SequenceMatcher(None, h, n.lower()).ratio()
        if hk and sound_key(n) == hk:
            ratio = max(ratio, 0.95)
        if ratio >= cutoff:
            scored.append((ratio, n))
    scored.sort(key=lambda x: (-x[0], x[1]))
    if not scored:
        return NameChoice(None, [], False)
    cands = [n for _, n in scored[:3]]
    ambiguous = len(scored) > 1 and scored[0][0] - scored[1][0] < 0.05
    return NameChoice(None if ambiguous else scored[0][1], cands, ambiguous)
