"""Skill ladder: one-off trace -> candidate macro -> verified skill -> trusted.

L0 trace      every run is logged
L1 candidate  same intent succeeded 2+ times, or a demonstration the owner saved; asks before every run
L2 verified   5+ passing sandbox/dry-run replays; if it has side effects, the owner approved its fingerprint
L3 trusted    10+ real successes with no undo since promotion; reversible (T0/T1) steps only; may run unattended

Any undo or failed postcondition sends a skill back to L1. Any change to its
definition changes its fingerprint, which voids the owner's approval.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field

from .policy import ACTION_TIERS, Tier

L0, L1, L2, L3 = 0, 1, 2, 3
PROMOTE_L1_SUCCESSES = 2
PROMOTE_L2_REPLAYS = 5
PROMOTE_L3_REAL = 10


class CompileRefused(Exception):
    """A step that is irreversible or sends something out has a parameter nobody fixed."""


def _canon(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


@dataclass
class Skill:
    name: str
    intent: str
    steps: list[dict]                      # [{"action": "screen.tap", "args": {"target": "{recipient}"}}, ...]
    params: dict[str, dict] = field(default_factory=dict)   # {"recipient": {"type": "contact", "required": true}}
    precondition: dict = field(default_factory=dict)        # {"package": "...", "screen": "..."}
    postcondition: dict = field(default_factory=dict)       # deterministic check run after
    level: int = L0
    successes: int = 0
    replays_passed: int = 0
    real_successes_since_promotion: int = 0
    demonstrated_and_saved: bool = False
    approved_fingerprint: str | None = None
    history: list[str] = field(default_factory=list)

    def definition(self) -> dict:
        return {"name": self.name, "intent": self.intent, "steps": self.steps, "params": self.params,
                "precondition": self.precondition, "postcondition": self.postcondition}

    def fingerprint(self) -> str:
        return hashlib.sha256(_canon(self.definition())).hexdigest()

    def max_tier(self) -> Tier:
        return max((ACTION_TIERS.get(s["action"], Tier.T3) for s in self.steps), default=Tier.T0)

    def has_side_effects(self) -> bool:
        return self.max_tier() >= Tier.T1

    def approved(self) -> bool:
        return self.approved_fingerprint == self.fingerprint()

    # -- compile check -------------------------------------------------
    def check_compilable(self) -> None:
        """Refuse a skill whose risky steps depend on a value nobody pinned down.

        A T2+ step may only use parameters that are declared, required and typed,
        so the owner sees and confirms them at run time; it may not use free
        placeholders.
        """
        import re
        for i, s in enumerate(self.steps):
            tier = ACTION_TIERS.get(s["action"], Tier.T3)
            if tier < Tier.T2:
                continue
            for v in (s.get("args") or {}).values():
                for p in re.findall(r"\{(\w+)\}", str(v)):
                    spec = self.params.get(p)
                    if not spec or not spec.get("required") or not spec.get("type"):
                        raise CompileRefused(f"step {i} ({s['action']}) uses '{p}', which is not a required, typed parameter")
                if str(v).strip() in ("", "?", "*"):
                    raise CompileRefused(f"step {i} ({s['action']}) has an empty or wildcard argument")

    # -- outcomes ------------------------------------------------------
    def record(self, outcome: str, *, replay: bool = False) -> None:
        """outcome: 'success' | 'failure' | 'undo' (undo includes a failed postcondition)."""
        if outcome == "success":
            if replay:
                self.replays_passed += 1
            else:
                self.successes += 1
                if self.level >= L2:
                    self.real_successes_since_promotion += 1
        elif outcome in ("undo", "failure") and not replay:
            if self.level > L1:
                self._set(L1, f"demoted after {outcome}")
            self.replays_passed = 0
            self.real_successes_since_promotion = 0
        elif outcome == "failure" and replay:
            self.replays_passed = 0
        self.promote()

    def approve(self, fingerprint: str) -> bool:
        """The owner approves exactly what they were shown. A stale fingerprint is refused."""
        if fingerprint != self.fingerprint():
            return False
        self.approved_fingerprint = fingerprint
        self.promote()
        return True

    def _set(self, level: int, why: str) -> None:
        self.history.append(f"L{self.level}->L{level}: {why}")
        self.level = level
        if level >= L2:
            self.real_successes_since_promotion = 0

    def promote(self) -> None:
        # a definition change voids approval; a skill with side effects then falls back
        if self.level >= L2 and self.has_side_effects() and not self.approved():
            self._set(L1, "definition changed since approval")
        if self.level == L0 and (self.successes >= PROMOTE_L1_SUCCESSES or self.demonstrated_and_saved):
            self._set(L1, "repeated success" if self.successes >= PROMOTE_L1_SUCCESSES else "saved demonstration")
        if self.level == L1 and self.replays_passed >= PROMOTE_L2_REPLAYS:
            try:
                self.check_compilable()
            except CompileRefused as e:
                self.history.append(f"stays L1: {e}")
                return
            if not self.has_side_effects() or self.approved():
                self._set(L2, f"{self.replays_passed} replays passed")
        if (self.level == L2 and self.real_successes_since_promotion >= PROMOTE_L3_REAL
                and self.max_tier() <= Tier.T1):
            self._set(L3, f"{self.real_successes_since_promotion} real successes, no undo")

    # -- running -------------------------------------------------------
    def may_run_unattended(self) -> bool:
        return self.level == L3 and self.max_tier() <= Tier.T1 and (not self.has_side_effects() or self.approved())

    def needs_confirmation(self) -> bool:
        return not self.may_run_unattended()
