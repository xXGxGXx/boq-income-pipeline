#!/usr/bin/env python3
"""
Auto-continue improvement loop wrapper.

Sends a prompt to an AI model API, then automatically continues with
refinement steps up to a user-set cap. Each step:
- Restates the original goal verbatim
- Proposes exactly ONE improvement
- Includes a one-line summary of what improved / what stayed same
- Feeds the FULL current artifact as clean-slate context (no diff-patching)
- Scores the artifact 1-10 against the goal; only proceeds if score rises
- Terminates early only if no improvement can be named (goal is a baseline, not a ceiling)

Multi-pathway mode: runs N parallel branches from the same version,
keeps the highest-scoring branch, discards the rest.

Tiered models: cheap model handles scoring and NO_IMPROVEMENT checks;
premium model does the actual improvement steps. Minimizes spend.

Prior versions are never overwritten — each is saved as
output-NNN.md for rollback.

Usage:
  python auto_continue_loop.py --prompt "Build X" --cap 5
  python auto_continue_loop.py --prompt "Build X" --cap 7 --branches 3
  python auto_continue_loop.py --prompt-file goal.txt --cap 5 --api openai
  python auto_continue_loop.py --prompt "Build X" --cheap-model gpt-4o-mini --premium-model gpt-4o
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import traceback
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DEFAULT_CAP = 5
DEFAULT_BRANCHES = 1
DEFAULT_TIMEOUT = 300
DEFAULT_API = os.getenv("AUTO_LOOP_API", "openai")  # openai | anthropic | xai

API_URLS = {
    "openai": "https://api.openai.com/v1/chat/completions",
    "anthropic": "https://api.anthropic.com/v1/messages",
    "xai": "https://api.x.ai/v1/chat/completions",
}

API_KEYS = {
    "openai": os.getenv("OPENAI_API_KEY", ""),
    "anthropic": os.getenv("ANTHROPIC_API_KEY", ""),
    "xai": os.getenv("XAI_API_KEY", "") or os.getenv("GROK_API_KEY", ""),
}

# Tiered models: cheap for scoring/checks, premium for improvement steps
DEFAULT_CHEAP_MODEL = os.getenv("AUTO_LOOP_CHEAP_MODEL", "gpt-4o-mini")
DEFAULT_PREMIUM_MODEL = os.getenv("AUTO_LOOP_PREMIUM_MODEL", "gpt-4o")

# Rough per-1k-token cost estimates (USD) for budget tracking
MODEL_COST_PER_1K = {
    "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
    "gpt-4o": {"input": 0.0025, "output": 0.01},
    "grok-4": {"input": 0.003, "output": 0.015},
    "grok-3": {"input": 0.003, "output": 0.015},
    "claude-sonnet-4-20250514": {"input": 0.003, "output": 0.015},
    "claude-opus-4-20250514": {"input": 0.015, "output": 0.075},
}

OUTPUT_DIR = Path(os.getenv("AUTO_LOOP_OUTPUT_DIR", "auto_loop_outputs"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

@dataclass
class StepResult:
    step: int
    branch: int
    score: float
    improvement: str
    summary: str
    artifact: str
    raw_response: str
    duration_seconds: float
    model_used: str = ""
    estimated_cost_usd: float = 0.0
    stopped_reason: str = ""


# ---------------------------------------------------------------------------
# API layer
# ---------------------------------------------------------------------------

def call_model(
    system_prompt: str,
    user_prompt: str,
    api: str = DEFAULT_API,
    model: str = DEFAULT_PREMIUM_MODEL,
    max_tokens: int = 16000,
    temperature: float = 0.2,
) -> Tuple[str, int, int]:
    """Returns (text, input_tokens, output_tokens)."""
    key = API_KEYS.get(api, "")
    if not key:
        raise RuntimeError(f"No API key set for {api}. Export {api.upper()}_API_KEY.")

    url = API_URLS[api]

    if api == "anthropic":
        body = {
            "model": model,
            "max_tokens": max_tokens,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}],
            "temperature": temperature,
        }
        headers = {
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
    else:
        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        headers = {
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        }

    req = urllib.request.Request(
        url, data=json.dumps(body).encode(), headers=headers, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=DEFAULT_TIMEOUT) as resp:
            data = json.loads(resp.read().decode())
    except Exception as exc:
        raise RuntimeError(f"{api} API call failed: {exc}") from exc

    if api == "anthropic":
        text = data["content"][0]["text"]
        usage = data.get("usage", {})
        return text, usage.get("input_tokens", 0), usage.get("output_tokens", 0)
    text = data["choices"][0]["message"]["content"]
    usage = data.get("usage", {})
    return text, usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0)


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    rates = MODEL_COST_PER_1K.get(model)
    if not rates:
        # Unknown model — use gpt-4o as a conservative default
        rates = MODEL_COST_PER_1K["gpt-4o"]
    return (input_tokens / 1000) * rates["input"] + (output_tokens / 1000) * rates["output"]


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------

def build_system_prompt(goal: str) -> str:
    return f"""You are an autonomous improvement engine. Your ONLY job is to make the
current artifact better against the user's goal. You never regress. You never
pad. You never repeat an idea already present.

USER'S ORIGINAL GOAL (restate verbatim in your reply):
{goal}

RULES:
1. Restate the original goal verbatim at the top of your reply.
2. Propose EXACTLY ONE improvement. Not two, not a list — one.
3. Include a one-line summary: "IMPROVED: <what changed>. UNCHANGED: <what stayed>."
4. If you cannot name a genuine improvement, reply with exactly: NO_IMPROVEMENT
5. The original goal is a BASELINE, not a ceiling. Improvements beyond the stated
   requirements are welcome and encouraged — do not stop merely because the
   baseline is satisfied. Only stop when no further improvement exists.
6. Output the COMPLETE new artifact (full file/code/text), not a diff.
7. Before the artifact, give it a quality score 1-10 against the goal on its own line: SCORE: <n>
"""


def build_step_prompt(goal: str, current_artifact: str, step: int, cap: int) -> str:
    return f"""STEP {step} of {cap}.

ORIGINAL GOAL:
{goal}

CURRENT ARTIFACT (version from previous step — treat as clean slate, rebuild fully):
---
{current_artifact}
---

Produce the next improved version following all system rules."""


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------

def parse_response(text: str) -> Dict[str, Any]:
    score_match = re.search(r"SCORE:\s*(\d+(?:\.\d+)?)", text, re.IGNORECASE)
    score = float(score_match.group(1)) if score_match else 0.0

    if re.search(r"NO_IMPROVEMENT", text):
        return {"score": score, "stopped": "no_improvement", "artifact": "", "improvement": "", "summary": ""}
    # GOAL_MET removed: baseline is a floor, not a ceiling. Loop continues
    # past original requirements unless no improvement can be named.

    imp_match = re.search(r"IMPROVED:\s*(.+)", text)
    improvement = imp_match.group(1).strip() if imp_match else ""
    sum_match = re.search(r"UNCHANGED:\s*(.+)", text)
    summary = sum_match.group(1).strip() if sum_match else ""

    # Artifact: everything after the last --- marker, or after SCORE/IMPROVED lines
    artifact = text
    for marker in ["SCORE:", "IMPROVED:", "UNCHANGED:"]:
        idx = artifact.upper().rfind(marker)
        if idx != -1:
            nl = artifact.find("\n", idx)
            if nl != -1:
                artifact = artifact[nl + 1 :]
    artifact = artifact.strip()
    if artifact.startswith("---"):
        artifact = artifact[3:].strip()
    if artifact.endswith("---"):
        artifact = artifact[:-3].strip()

    return {
        "score": score,
        "stopped": "",
        "artifact": artifact,
        "improvement": improvement,
        "summary": summary,
    }


# ---------------------------------------------------------------------------
# Single branch execution
# ---------------------------------------------------------------------------

def run_branch(
    branch_id: int,
    goal: str,
    initial_artifact: str,
    cap: int,
    api: str,
    cheap_model: str,
    premium_model: str,
    max_tokens: int,
    cost_ceiling: Optional[float],
    total_cost: List[float],
) -> List[StepResult]:
    results: List[StepResult] = []
    current = initial_artifact
    last_score = 0.0

    # Score the initial artifact with the CHEAP model
    try:
        t0 = time.monotonic()
        raw, inp, out = call_model(
            build_system_prompt(goal),
            f"Score this artifact 1-10 against the goal. Reply with only: SCORE: <n>\n\nGOAL:\n{goal}\n\nARTIFACT:\n---\n{current}\n---",
            api=api, model=cheap_model, max_tokens=256, temperature=0.0,
        )
        t1 = time.monotonic()
        cost = estimate_cost(cheap_model, inp, out)
        total_cost[0] += cost
        sm = re.search(r"SCORE:\s*(\d+(?:\.\d+)?)", raw, re.IGNORECASE)
        last_score = float(sm.group(1)) if sm else 0.0
        results.append(StepResult(
            step=0, branch=branch_id, score=last_score, improvement="(initial)",
            summary="baseline", artifact=current, raw_response=raw,
            duration_seconds=round(t1 - t0, 2), model_used=cheap_model,
            estimated_cost_usd=round(cost, 6),
        ))
    except Exception as exc:
        results.append(StepResult(
            step=0, branch=branch_id, score=0.0, improvement="", summary="",
            artifact=current, raw_response=f"ERROR: {exc}",
            duration_seconds=0.0, stopped_reason=f"init_error: {exc}",
        ))
        return results

    for step in range(1, cap + 1):
        # Cost ceiling check before spending on a premium call
        if cost_ceiling is not None and total_cost[0] >= cost_ceiling:
            results.append(StepResult(
                step=step, branch=branch_id, score=last_score, improvement="",
                summary="", artifact=current, raw_response="",
                duration_seconds=0.0, stopped_reason="cost_ceiling_reached",
                model_used=cheap_model,
            ))
            break

        t0 = time.monotonic()
        try:
            # PREMIUM model does the actual improvement work
            raw, inp, out = call_model(
                build_system_prompt(goal),
                build_step_prompt(goal, current, step, cap),
                api=api, model=premium_model, max_tokens=max_tokens,
            )
        except Exception as exc:
            results.append(StepResult(
                step=step, branch=branch_id, score=last_score, improvement="",
                summary="", artifact=current, raw_response=f"ERROR: {exc}",
                duration_seconds=round(time.monotonic() - t0, 2),
                stopped_reason=f"api_error: {exc}", model_used=premium_model,
            ))
            break

        t1 = time.monotonic()
        cost = estimate_cost(premium_model, inp, out)
        total_cost[0] += cost
        parsed = parse_response(raw)

        if parsed["stopped"]:
            results.append(StepResult(
                step=step, branch=branch_id, score=parsed["score"],
                improvement="", summary="", artifact=current, raw_response=raw,
                duration_seconds=round(t1 - t0, 2), stopped_reason=parsed["stopped"],
                model_used=premium_model, estimated_cost_usd=round(cost, 6),
            ))
            break

        if parsed["score"] <= last_score and parsed["score"] > 0:
            results.append(StepResult(
                step=step, branch=branch_id, score=parsed["score"],
                improvement=parsed["improvement"], summary=parsed["summary"],
                artifact=current, raw_response=raw,
                duration_seconds=round(t1 - t0, 2),
                stopped_reason="score_did_not_rise", model_used=premium_model,
                estimated_cost_usd=round(cost, 6),
            ))
            break

        last_score = parsed["score"]
        current = parsed["artifact"] if parsed["artifact"] else current
        results.append(StepResult(
            step=step, branch=branch_id, score=parsed["score"],
            improvement=parsed["improvement"], summary=parsed["summary"],
            artifact=current, raw_response=raw,
            duration_seconds=round(t1 - t0, 2), model_used=premium_model,
            estimated_cost_usd=round(cost, 6),
        ))

        out_path = OUTPUT_DIR / f"branch{branch_id:02d}-step{step:03d}.md"
        out_path.write_text(current, encoding="utf-8")

    return results


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

def write_reports(all_results: List[StepResult], goal: str, cap: int, branches: int,
                  total_cost: float) -> Path:
    ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    report_dir = OUTPUT_DIR / f"run-{ts}"
    report_dir.mkdir(parents=True, exist_ok=True)

    best = max(all_results, key=lambda r: (r.score, r.step))
    (report_dir / "BEST.md").write_text(best.artifact, encoding="utf-8")

    metrics = {
        "goal": goal,
        "cap": cap,
        "branches": branches,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_steps": len(all_results),
        "best_score": best.score,
        "best_branch": best.branch,
        "best_step": best.step,
        "total_estimated_cost_usd": round(total_cost, 6),
        "stopped_reasons": {},
        "results": [
            {
                "step": r.step, "branch": r.branch, "score": r.score,
                "improvement": r.improvement, "summary": r.summary,
                "duration_seconds": r.duration_seconds,
                "stopped_reason": r.stopped_reason,
                "model_used": r.model_used,
                "estimated_cost_usd": r.estimated_cost_usd,
                "artifact_chars": len(r.artifact),
            }
            for r in all_results
        ],
    }
    for r in all_results:
        if r.stopped_reason:
            metrics["stopped_reasons"][r.stopped_reason] = metrics["stopped_reasons"].get(r.stopped_reason, 0) + 1
    (report_dir / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")

    lines = [
        "# Auto-Continue Loop Report", "",
        f"**Generated:** {metrics['generated_at']}",
        f"**Goal:** {goal[:300]}",
        f"**Cap:** {cap} | **Branches:** {branches}",
        f"**Best score:** {best.score} (branch {best.branch}, step {best.step})",
        f"**Total estimated cost:** ${total_cost:.4f} USD",
        "", "## Step Log", "",
    ]
    for r in all_results:
        lines.append(f"### Branch {r.branch} — Step {r.step}")
        lines.append(f"- Score: **{r.score}**")
        lines.append(f"- Model: `{r.model_used}`")
        lines.append(f"- Improved: {r.improvement or 'n/a'}")
        lines.append(f"- Unchanged: {r.summary or 'n/a'}")
        lines.append(f"- Duration: {r.duration_seconds}s")
        lines.append(f"- Est. cost: ${r.estimated_cost_usd:.4f}")
        if r.stopped_reason:
            lines.append(f"- Stopped: `{r.stopped_reason}`")
        lines.append("")

    best_branch_results = [r for r in all_results if r.branch == best.branch and r.step > 0]
    if len(best_branch_results) >= 2:
        lines.extend(["## Diff Summary (best branch)", ""])
        prev = None
        for r in best_branch_results:
            if prev:
                prev_lines = set(prev.artifact.splitlines())
                curr_lines = set(r.artifact.splitlines())
                added = curr_lines - prev_lines
                removed = prev_lines - curr_lines
                lines.append(f"**Step {prev.step} → {r.step}:** +{len(added)} lines, -{len(removed)} lines")
            prev = r
        lines.append("")

    (report_dir / "report.md").write_text("\n".join(lines), encoding="utf-8")
    return report_dir


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Auto-continue improvement loop")
    parser.add_argument("--prompt", type=str, help="The user's goal/prompt")
    parser.add_argument("--prompt-file", type=str, help="File containing the goal")
    parser.add_argument("--initial", type=str, default="", help="Path to initial artifact file")
    parser.add_argument("--cap", type=int, default=DEFAULT_CAP, help="Max steps per branch")
    parser.add_argument("--branches", type=int, default=DEFAULT_BRANCHES, help="Parallel pathways")
    parser.add_argument("--api", type=str, default=DEFAULT_API, choices=list(API_URLS))
    parser.add_argument("--cheap-model", type=str, default=DEFAULT_CHEAP_MODEL,
                        help="Model for scoring and checks (cheap)")
    parser.add_argument("--premium-model", type=str, default=DEFAULT_PREMIUM_MODEL,
                        help="Model for actual improvement steps (premium)")
    parser.add_argument("--max-tokens", type=int, default=16000)
    parser.add_argument("--cost-ceiling", type=float, default=None,
                        help="Stop when estimated spend reaches this USD amount")
    args = parser.parse_args()

    if args.prompt_file:
        goal = Path(args.prompt_file).read_text(encoding="utf-8").strip()
    elif args.prompt:
        goal = args.prompt.strip()
    else:
        parser.error("Provide --prompt or --prompt-file")

    initial = ""
    if args.initial:
        initial = Path(args.initial).read_text(encoding="utf-8")

    print(f"Goal: {goal[:120]}...")
    print(f"Cap: {args.cap} | Branches: {args.branches} | API: {args.api}")
    print(f"Cheap model: {args.cheap_model} | Premium model: {args.premium_model}")
    if args.cost_ceiling:
        print(f"Cost ceiling: ${args.cost_ceiling}")
    print(f"Outputs: {OUTPUT_DIR}")
    print()

    t_start = time.monotonic()
    total_cost = [0.0]

    if args.branches <= 1:
        all_results = run_branch(
            1, goal, initial, args.cap, args.api, args.cheap_model,
            args.premium_model, args.max_tokens, args.cost_ceiling, total_cost,
        )
    else:
        all_results = []
        with ThreadPoolExecutor(max_workers=args.branches) as ex:
            futs = {
                ex.submit(
                    run_branch, b, goal, initial, args.cap, args.api,
                    args.cheap_model, args.premium_model, args.max_tokens,
                    args.cost_ceiling, total_cost,
                ): b
                for b in range(1, args.branches + 1)
            }
            for fut in as_completed(futs):
                b = futs[fut]
                try:
                    all_results.extend(fut.result())
                    print(f"Branch {b} done.")
                except Exception as exc:
                    print(f"Branch {b} failed: {exc}")

    wall = time.monotonic() - t_start
    report_dir = write_reports(all_results, goal, args.cap, args.branches, total_cost[0])

    best = max(all_results, key=lambda r: (r.score, r.step))
    print()
    print(f"Best score: {best.score} (branch {best.branch}, step {best.step})")
    print(f"Total estimated cost: ${total_cost[0]:.4f} USD")
    print(f"Total wall time: {wall:.1f}s")
    print(f"Report: {report_dir / 'report.md'}")
    print(f"Best artifact: {report_dir / 'BEST.md'}")
    print(f"Metrics: {report_dir / 'metrics.json'}")


if __name__ == "__main__":
    main()
