"""Command line for the extension core.

    python3 -m extension_core plan "close this tab"
    python3 -m extension_core plan --voice "open fire fox" "open firefox"
    python3 -m extension_core route "latest pixel security update for my phone"
    python3 -m extension_core verify-log ~/.ai-extension/episodes.jsonl
    python3 -m extension_core sources --scope public
    python3 -m extension_core tiers
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict

from . import events, ledger, pipeline, policy, privacy, sources


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="extension_core")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("plan", help="show the decision path for one input")
    p.add_argument("text", nargs="+", help="typed text, or with --voice the n-best transcripts, best first")
    p.add_argument("--voice", action="store_true")
    p.add_argument("--package", help="foreground app package a screen action would touch")
    p.add_argument("--untrusted", action="store_true", help="the text came from a page, email or screen")

    r = sub.add_parser("route", help="where a search may go (privacy router)")
    r.add_argument("query")

    v = sub.add_parser("verify-log", help="check an episode log's hash chain")
    v.add_argument("path")

    s = sub.add_parser("sources", help="list Finder sources usable now")
    s.add_argument("--scope", default="public", choices=["public", "personal"])
    s.add_argument("--content")
    s.add_argument("--where", default="termux", choices=sorted(sources.RUNS_ON))

    sub.add_parser("tiers", help="list every known action and its base risk tier")

    a = ap.parse_args(argv)
    if a.cmd == "plan":
        if a.voice:
            ev = events.from_voice(a.text, [0.0] * len(a.text))
        else:
            ev = events.from_text(" ".join(a.text), source="untrusted" if a.untrusted else "owner")
        print(json.dumps(asdict(pipeline.plan(ev, target_package=a.package)), indent=2, default=str))
    elif a.cmd == "route":
        print(json.dumps(asdict(privacy.route(a.query)), indent=2))
    elif a.cmd == "verify-log":
        problems = ledger.EpisodeLog(a.path).verify()
        print("intact" if not problems else "\n".join(problems))
        return 1 if problems else 0
    elif a.cmd == "sources":
        for spec in sources.pick(sources.load(), content=a.content, scope=a.scope, where=a.where):
            print(f"{spec.priority}  {spec.id:20} {spec.cost}")
    elif a.cmd == "tiers":
        for name, tier in sorted(policy.ACTION_TIERS.items(), key=lambda kv: (kv[1], kv[0])):
            print(f"{tier.name}  {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
