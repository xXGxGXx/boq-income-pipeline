"""The decision path every input takes, before any tool runs.

InputEvent -> FastMap (every alternative) -> risk gate -> privacy route (for
searches) -> model route (when FastMap misses). Returns a plan; executing it is
the job of the tool broker (Hands, Finder), which this module never calls.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field

from . import fastmap, policy, privacy, routing
from .events import InputEvent


@dataclass
class Plan:
    event: dict
    intent: str | None = None
    action: str | None = None
    slots: dict = field(default_factory=dict)
    rescued_from_alternative: int = 0
    decision: dict | None = None
    search_route: dict | None = None
    model_route: dict | None = None
    next_step: str = ""              # what the caller should do now


def plan(event: InputEvent, rules: list | None = None, *, terms: tuple[str, ...] = (),
         target_package: str | None = None, unattended: bool = False) -> Plan:
    rules = rules if rules is not None else fastmap.load_rules()
    p = Plan(event=asdict(event))
    if event.cancelled:
        p.next_step = "cancelled by the owner: do nothing"
        return p
    if not event.text.strip():
        p.next_step = "nothing to do"
        return p

    m = fastmap.match(event, rules)
    if m is None:
        sens = "private" if privacy.classify(event.text, terms) == "personal" else "normal"
        r = routing.choose("intent", sens)
        p.model_route = asdict(r)
        p.next_step = ("no rule matched: ask the on-device model" if r.on_device
                       else "no rule matched: ask the intent model")
        return p

    p.intent, p.action, p.slots = m.intent, m.action, m.slots
    p.rescued_from_alternative = m.alternative_index
    tainted = event.source != "owner"
    d = policy.decide(m.action, m.slots, tainted=tainted, target_package=target_package,
                      unattended=unattended)
    p.decision = {"verdict": d.verdict, "tier": d.tier.name, "requires": d.requires, "reasons": d.reasons}

    if m.action.startswith("search.") and "query" in m.slots:
        rp = privacy.route(m.slots["query"], terms)
        p.search_route = asdict(rp)

    if d.verdict == "deny":
        p.next_step = "refuse and say why" + (" (offer a draft)" if "owner_acts" in d.requires else "")
    elif d.verdict == "confirm":
        p.next_step = "ask the owner: " + ", ".join(d.requires)
    else:
        p.next_step = "run it, then verify the result"
    return p
