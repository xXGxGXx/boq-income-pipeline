"""Model routing by task type and sensitivity (plan section 7).

Routes are data (routing.json). Private data never leaves the phone: a task
tagged private always gets the on-device tier, whatever its type. Keeping each
route fixed (same model, same system prompt, same tools) lets prompt caching work.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

HERE = Path(__file__).resolve().parent
DEFAULT_ROUTES = HERE / "routing.json"


@dataclass
class Route:
    task: str
    tier: str
    models: list[str]       # first available wins; later entries are fallbacks
    on_device: bool


def load(path: Path | str = DEFAULT_ROUTES) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def choose(task: str, sensitivity: str = "normal", table: dict | None = None,
           available: set[str] | None = None) -> Route:
    """sensitivity: 'normal' or 'private'. `available` = models currently reachable (Module B)."""
    table = table or load()
    routes = table["routes"]
    key = "private" if sensitivity == "private" else (task if task in routes else table["default"])
    r = routes[key]
    models = [m for m in r["models"] if available is None or m in available]
    if not models and r.get("on_device"):
        models = []                     # on-device tier unavailable: caller must refuse, not fall back to cloud
    elif not models:
        models = r["models"][:1]
    return Route(task=task, tier=key, models=models, on_device=bool(r.get("on_device")))
