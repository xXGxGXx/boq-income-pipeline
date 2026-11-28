"""Personal eval set and the ship gate for self-improvement.

Items are the owner's real past tasks (kept privately, never in this public
repository), each with a deterministic check. About 20% are held out: the
optimiser never sees them, and only the ship gate scores them. A change ships
only when no category regresses beyond noise on the held-out items.
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path

CATEGORIES = ("find", "store", "move", "provide", "act", "memory")
HELD_OUT_EVERY = 5          # 1 in 5 items, chosen by hash, so the split is stable


@dataclass
class EvalItem:
    id: str
    category: str
    prompt: str
    check: dict              # {"type": "equals"|"contains"|"regex"|"sha256"|"one_of", "expected": ...}

    @property
    def held_out(self) -> bool:
        return int(hashlib.sha256(self.id.encode()).hexdigest(), 16) % HELD_OUT_EVERY == 0


def load(path: Path | str) -> list[EvalItem]:
    items = []
    for n, line in enumerate(Path(path).read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        d = json.loads(line)
        if d.get("category") not in CATEGORIES:
            raise ValueError(f"line {n}: category must be one of {CATEGORIES}")
        items.append(EvalItem(d["id"], d["category"], d["prompt"], d["check"]))
    ids = [i.id for i in items]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate eval ids")
    return items


def passes(item: EvalItem, output: str) -> bool:
    c, exp = item.check, item.check.get("expected")
    kind = c.get("type")
    out = output if isinstance(output, str) else json.dumps(output, sort_keys=True)
    if kind == "equals":
        return out.strip() == str(exp).strip()
    if kind == "contains":
        return str(exp).lower() in out.lower()
    if kind == "regex":
        return re.search(str(exp), out) is not None
    if kind == "sha256":
        return hashlib.sha256(out.encode()).hexdigest() == exp
    if kind == "one_of":
        return out.strip() in [str(e).strip() for e in exp]
    raise ValueError(f"unknown check type {kind!r}")


class OptimizerView:
    """What the improvement process may see: training items only.

    Asking for a held-out item raises, so a bug can't quietly leak the test set
    into the thing being tested.
    """

    def __init__(self, items: list[EvalItem]):
        self._train = {i.id: i for i in items if not i.held_out}
        self._held = {i.id for i in items if i.held_out}

    def items(self) -> list[EvalItem]:
        return list(self._train.values())

    def get(self, item_id: str) -> EvalItem:
        if item_id in self._held:
            raise PermissionError("held-out items are not visible to the optimiser")
        return self._train[item_id]


def score(items: list[EvalItem], outputs: dict[str, str], *, held_out: bool) -> dict[str, tuple[int, int]]:
    """Per category: (passed, total) over the chosen split. Missing output = fail."""
    res: dict[str, list[int]] = {}
    for it in items:
        if it.held_out != held_out:
            continue
        p, t = res.setdefault(it.category, [0, 0])
        ok = it.id in outputs and passes(it, outputs[it.id])
        res[it.category] = [p + int(ok), t + 1]
    return {k: (v[0], v[1]) for k, v in res.items()}


@dataclass
class ShipDecision:
    ship: bool
    regressions: list[str]
    improvements: list[str]


def gate(before: dict[str, tuple[int, int]], after: dict[str, tuple[int, int]],
         noise: float = 0.05) -> ShipDecision:
    """Ship only if no category drops by more than noise (5 points, or one item on small sets)."""
    regressions, improvements = [], []
    for cat in sorted(set(before) | set(after)):
        bp, bt = before.get(cat, (0, 0))
        ap, at = after.get(cat, (0, 0))
        if bt == 0 or at == 0:
            if bt and not at:
                regressions.append(f"{cat}: no longer measured")
            continue
        b, a = bp / bt, ap / at
        allowance = max(noise, 1 / at)
        if a < b - allowance + 1e-9:
            regressions.append(f"{cat}: {b:.0%} -> {a:.0%}")
        elif a > b:
            improvements.append(f"{cat}: {b:.0%} -> {a:.0%}")
    return ShipDecision(ship=not regressions, regressions=regressions, improvements=improvements)
