"""Source adapters: one interface for every kind of content Finder can search.

Each adapter declares what it costs, which key it needs (by environment
variable NAME only, never a value), its rate limits, its terms-of-service
flags and where it can run. The broker uses these declarations to pick
sources, enforce budgets and keep personal-only content out of anything shared.

The catalogue (sources.json) is data; real adapters implement `Adapter`.
"""
from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

HERE = Path(__file__).resolve().parent
DEFAULT_CATALOGUE = HERE / "sources.json"

TOS_FLAGS = {"personal_only", "no_download", "attribution", "no_ai_training", "approval_needed", "paid_per_item"}
RUNS_ON = {"termux", "pc", "cloud"}


@dataclass
class Hit:
    source: str
    id: str
    title: str
    url: str
    snippet: str = ""
    published: str | None = None
    score: float = 0.0
    sensitivity: str = "public"        # public | personal
    retrieved_at: float = field(default_factory=time.time)


class Adapter(Protocol):
    id: str

    def search(self, query: str, since: str | None = None, limit: int = 10) -> list[Hit]: ...
    def fetch(self, hit_id: str) -> dict: ...


@dataclass
class SourceSpec:
    id: str
    content: list[str]
    needs_key: str | None
    cost: str
    rate_limit: str
    tos: list[str]
    runs_on: list[str]
    priority: int
    scope: str                          # personal | public

    def available(self, env: dict | None = None) -> bool:
        env = os.environ if env is None else env
        return self.needs_key is None or bool(env.get(self.needs_key))


def load(path: Path | str = DEFAULT_CATALOGUE) -> list[SourceSpec]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    specs = []
    for s in data["sources"]:
        bad_tos = set(s["tos"]) - TOS_FLAGS
        bad_run = set(s["runs_on"]) - RUNS_ON
        if bad_tos or bad_run:
            raise ValueError(f"{s['id']}: unknown flags {sorted(bad_tos | bad_run)}")
        specs.append(SourceSpec(**s))
    ids = [s.id for s in specs]
    if len(ids) != len(set(ids)):
        raise ValueError("duplicate source ids")
    return specs


def pick(specs: list[SourceSpec], *, content: str | None = None, scope: str = "public",
         where: str = "termux", env: dict | None = None) -> list[SourceSpec]:
    """Sources usable right now for this content type and privacy scope, best first.

    A public query never gets personal sources' results mixed into a web call;
    a personal query never gets public web sources (the privacy router decides scope).
    """
    out = [s for s in specs
           if s.scope == scope
           and (content is None or content in s.content)
           and (where in s.runs_on or "cloud" in s.runs_on)
           and s.available(env)]
    return sorted(out, key=lambda s: (s.priority, s.id))


def may_share(spec: SourceSpec) -> bool:
    """Whether content from this source may appear in something shared or published."""
    return spec.scope == "public" and "personal_only" not in spec.tos
