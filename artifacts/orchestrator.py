#!/usr/bin/env python3
"""
Multi-model orchestration system.

Routes:
- Coding / repository tasks -> Claude Code CLI
- Real-time web / social synthesis -> Grok Plus API
- Creative / multimedia tasks -> Muse

Features:
- Concurrent execution with ThreadPoolExecutor
- Automatic task classification and routing (whole-word matching)
- Retry with exponential backoff
- Token-bucket rate limiting
- Structured JSON + Markdown execution reports
- Detailed error capture and execution metrics
"""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
import traceback
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import requests

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DEFAULT_TIMEOUT_SECONDS = 180
DEFAULT_MAX_RETRIES = 3
DEFAULT_BACKOFF_BASE = 2.0
DEFAULT_MAX_WORKERS = 6

GROK_API_URL = os.getenv("GROK_API_URL", "https://api.x.ai/v1/chat/completions")
GROK_MODEL = os.getenv("GROK_MODEL", "grok-4")
GROK_API_KEY = os.getenv("GROK_API_KEY", "")

MUSE_API_URL = os.getenv("MUSE_API_URL", "")          # no guessed default
MUSE_API_KEY = os.getenv("MUSE_API_KEY", "")
MUSE_MODEL = os.getenv("MUSE_MODEL", "muse-default")

CLAUDE_CODE_BIN = os.getenv("CLAUDE_CODE_BIN", "claude")

REPORT_DIR = Path(os.getenv("ORCHESTRATOR_REPORT_DIR", "orchestrator_reports"))


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

@dataclass
class Task:
    task_id: str
    prompt: str
    task_type: Optional[str] = None
    repo_path: Optional[str] = None
    attachments: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TaskResult:
    task_id: str
    task_type: str
    provider: str
    status: str
    output: str = ""
    error: str = ""
    attempts: int = 0
    started_at: str = ""
    finished_at: str = ""
    duration_seconds: float = 0.0
    rate_limited: bool = False
    retries_used: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Routing
# ---------------------------------------------------------------------------

CODING_KEYWORDS = [
    "code", "coding", "repository", "repo", "git", "github", "bug", "debug",
    "refactor", "unit test", "test", "python", "javascript", "typescript",
    "rust", "golang", "java", "api", "database", "sql", "docker", "deploy",
    "ci", "cd", "build", "compile", "architecture", "implementation",
]

WEB_SOCIAL_KEYWORDS = [
    "web", "website", "internet", "news", "latest", "current", "real-time",
    "realtime", "social", "twitter", "x", "reddit", "trending", "viral",
    "search", "research", "market", "stock", "crypto", "competitor",
    "sentiment", "public opinion", "breaking", "headline", "trend",
]

CREATIVE_KEYWORDS = [
    "image", "images", "video", "audio", "music", "song", "lyrics", "design",
    "logo", "brand", "story", "script", "screenplay", "creative", "art",
    "illustration", "animation", "photo", "edit", "thumbnail", "poster",
    "campaign", "copywriting", "marketing", "media", "multimedia", "voice",
    "sound", "render", "visual", "concept art",
]

EXPLICIT_ROUTE_MAP = {
    "claude": "claude_code",
    "claude_code": "claude_code",
    "coding": "claude_code",
    "code": "claude_code",
    "repo": "claude_code",
    "repository": "claude_code",
    "grok": "grok_plus",
    "grok_plus": "grok_plus",
    "web": "grok_plus",
    "social": "grok_plus",
    "research": "grok_plus",
    "muse": "muse",
    "creative": "muse",
    "media": "muse",
    "multimedia": "muse",
}


def _word_patterns(terms):
    return [re.compile(r"(?<![a-z0-9])" + re.escape(t) + r"(?![a-z0-9])") for t in terms]


_CODING_RX, _WEB_RX, _CREATIVE_RX = _word_patterns(CODING_KEYWORDS), _word_patterns(WEB_SOCIAL_KEYWORDS), _word_patterns(CREATIVE_KEYWORDS)


def classify_task(task: Task) -> str:
    """
    Determine the best provider for a task.

    Priority:
    1. Explicit task_type
    2. Explicit metadata.route
    3. Repository path presence
    4. Keyword scoring (whole words only)
    5. Fallback to Claude Code
    """
    explicit = (task.task_type or "").strip().lower()
    if explicit in EXPLICIT_ROUTE_MAP:
        return EXPLICIT_ROUTE_MAP[explicit]

    metadata_route = str(task.metadata.get("route", "")).strip().lower()
    if metadata_route in EXPLICIT_ROUTE_MAP:
        return EXPLICIT_ROUTE_MAP[metadata_route]

    if task.repo_path:
        return "claude_code"

    text = task.prompt.lower()

    coding_score = sum(1 for rx in _CODING_RX if rx.search(text))
    web_score = sum(1 for rx in _WEB_RX if rx.search(text))
    creative_score = sum(1 for rx in _CREATIVE_RX if rx.search(text))

    if creative_score and creative_score >= max(coding_score, web_score):
        return "muse"
    if web_score and web_score >= max(coding_score, creative_score):
        return "grok_plus"
    if coding_score:
        return "claude_code"

    return "claude_code"


# ---------------------------------------------------------------------------
# Rate limiting
# ---------------------------------------------------------------------------

class TokenBucketRateLimiter:
    """Thread-safe token-bucket limiter for provider-specific request control."""

    def __init__(self, requests_per_minute: float, burst: Optional[int] = None):
        self.capacity = float(burst if burst is not None else max(1, int(requests_per_minute)))
        self.tokens = self.capacity
        self.refill_rate = requests_per_minute / 60.0
        self.last_refill = time.monotonic()
        self.lock = threading.Lock()

    def acquire(self, timeout: float = 120.0) -> bool:
        deadline = time.monotonic() + timeout

        while True:
            with self.lock:
                now = time.monotonic()
                elapsed = now - self.last_refill
                self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_rate)
                self.last_refill = now

                if self.tokens >= 1:
                    self.tokens -= 1
                    return True

                wait_time = (1 - self.tokens) / self.refill_rate

            if time.monotonic() + wait_time > deadline:
                return False

            time.sleep(max(0.05, wait_time))


RATE_LIMITERS: Dict[str, TokenBucketRateLimiter] = {
    "claude_code": TokenBucketRateLimiter(float(os.getenv("CLAUDE_RPM", "30"))),
    "grok_plus": TokenBucketRateLimiter(float(os.getenv("GROK_RPM", "30"))),
    "muse": TokenBucketRateLimiter(float(os.getenv("MUSE_RPM", "20"))),
}


# ---------------------------------------------------------------------------
# Provider adapters
# ---------------------------------------------------------------------------

class ProviderError(Exception):
    pass


class RateLimitError(ProviderError):
    pass


def run_claude_code(task: Task) -> str:
    """
    Execute a coding or repository task through the Claude Code CLI.

    Claude Code is invoked non-interactively with:
      claude -p "PROMPT"
    """
    if shutil.which(CLAUDE_CODE_BIN) is None:
        raise ProviderError(
            f"Claude Code CLI not found. Install it or set CLAUDE_CODE_BIN. "
            f"Current binary: {CLAUDE_CODE_BIN}"
        )

    command = [CLAUDE_CODE_BIN, "-p", task.prompt]

    if task.repo_path:
        repo = Path(task.repo_path).expanduser().resolve()
        if not repo.exists():
            raise ProviderError(f"Repository path does not exist: {repo}")
        command.extend(["--add-dir", str(repo)])

    process = subprocess.run(
        command,
        capture_output=True,
        text=True,
        timeout=DEFAULT_TIMEOUT_SECONDS,
        cwd=task.repo_path or os.getcwd(),
    )

    if process.returncode != 0:
        message = process.stderr.strip() or process.stdout.strip() or "Unknown Claude Code error"
        raise ProviderError(f"Claude Code exited with code {process.returncode}: {message}")

    return process.stdout.strip()


def call_grok_plus(task: Task) -> str:
    """
    Execute a real-time web/social synthesis task through the Grok Plus API.
    """
    if not GROK_API_KEY:
        raise ProviderError("GROK_API_KEY is not set.")

    headers = {
        "Authorization": f"Bearer {GROK_API_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": GROK_MODEL,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are Grok Plus, a real-time web and social intelligence assistant. "
                    "Synthesize current information, identify sources, distinguish facts from "
                    "claims, and clearly state uncertainty when evidence is incomplete."
                ),
            },
            {"role": "user", "content": task.prompt},
        ],
        "temperature": 0.3,
    }

    response = requests.post(
        GROK_API_URL,
        headers=headers,
        json=payload,
        timeout=DEFAULT_TIMEOUT_SECONDS,
    )

    if response.status_code == 429:
        raise RateLimitError(f"Grok rate limit: {response.text[:500]}")

    if response.status_code >= 400:
        raise ProviderError(f"Grok API error {response.status_code}: {response.text[:1000]}")

    data = response.json()

    try:
        return data["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise ProviderError(f"Unexpected Grok API response structure: {exc}") from exc


def call_muse(task: Task) -> str:
    """
    Execute a creative or multimedia task through the Muse API.
    """
    if not MUSE_API_URL:
        raise ProviderError("MUSE_API_URL is not set (point it at your Muse deployment).")
    if not MUSE_API_KEY:
        raise ProviderError("MUSE_API_KEY is not set.")

    headers = {
        "Authorization": f"Bearer {MUSE_API_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": MUSE_MODEL,
        "prompt": task.prompt,
        "attachments": task.attachments,
        "metadata": task.metadata,
    }

    response = requests.post(
        MUSE_API_URL,
        headers=headers,
        json=payload,
        timeout=DEFAULT_TIMEOUT_SECONDS,
    )

    if response.status_code == 429:
        raise RateLimitError(f"Muse rate limit: {response.text[:500]}")

    if response.status_code >= 400:
        raise ProviderError(f"Muse API error {response.status_code}: {response.text[:1000]}")

    data = response.json()

    output = (
        data.get("text")
        or data.get("content")
        or data.get("output")
        or data.get("url")
        or data.get("result")
    )

    if not output:
        raise ProviderError(f"Unexpected Muse API response: {json.dumps(data)[:1000]}")

    return str(output).strip()


PROVIDERS: Dict[str, Callable[[Task], str]] = {
    "claude_code": run_claude_code,
    "grok_plus": call_grok_plus,
    "muse": call_muse,
}


# ---------------------------------------------------------------------------
# Execution engine
# ---------------------------------------------------------------------------

def execute_task(task: Task) -> TaskResult:
    route = classify_task(task)
    provider_name = route
    limiter = RATE_LIMITERS[provider_name]
    max_retries = int(task.metadata.get("max_retries", DEFAULT_MAX_RETRIES))
    backoff_base = float(task.metadata.get("backoff_base", DEFAULT_BACKOFF_BASE))

    result = TaskResult(
        task_id=task.task_id,
        task_type=task.task_type or "auto",
        provider=provider_name,
        status="pending",
        started_at=utc_now(),
    )

    for attempt in range(1, max_retries + 1):
        result.attempts = attempt
        result.retries_used = attempt - 1

        if not limiter.acquire():
            result.status = "rate_limit_timeout"
            result.error = f"Rate limiter could not acquire a token within timeout for {provider_name}."
            result.rate_limited = True
            break

        try:
            output = PROVIDERS[provider_name](task)
            result.status = "success"
            result.output = output
            break

        except RateLimitError as exc:
            result.rate_limited = True
            result.error = str(exc)
            result.status = "rate_limited"

            if attempt < max_retries:
                delay = backoff_base ** attempt
                time.sleep(delay)
                continue

        except Exception as exc:
            result.error = f"{type(exc).__name__}: {exc}"
            result.status = "failed"

            if attempt < max_retries:
                delay = backoff_base ** attempt
                time.sleep(delay)
                continue

    result.finished_at = utc_now()
    result.duration_seconds = round(
        max(0.0, iso_to_epoch(result.finished_at) - iso_to_epoch(result.started_at)), 3
    )
    result.metadata.update(task.metadata)

    return result


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def iso_to_epoch(value: str) -> float:
    try:
        return datetime.fromisoformat(value).timestamp()
    except ValueError:
        return 0.0


def run_parallel(tasks: List[Task], max_workers: int) -> List[TaskResult]:
    results: List[TaskResult] = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_map = {executor.submit(execute_task, task): task for task in tasks}

        for future in concurrent.futures.as_completed(future_map):
            task = future_map[future]
            try:
                results.append(future.result())
            except Exception as exc:
                results.append(
                    TaskResult(
                        task_id=task.task_id,
                        task_type=task.task_type or "auto",
                        provider=classify_task(task),
                        status="executor_error",
                        error=f"{type(exc).__name__}: {exc}\n{traceback.format_exc()}",
                        started_at=utc_now(),
                        finished_at=utc_now(),
                    )
                )

    order = {task.task_id: index for index, task in enumerate(tasks)}
    results.sort(key=lambda item: order.get(item.task_id, 10**9))
    return results


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------

def build_metrics(results: List[TaskResult], total_wall_time: float) -> Dict[str, Any]:
    successful = [item for item in results if item.status == "success"]
    failed = [item for item in results if item.status not in {"success", "pending"}]
    rate_limited = [item for item in results if item.rate_limited]

    provider_counts: Dict[str, int] = {}
    status_counts: Dict[str, int] = {}

    for item in results:
        provider_counts[item.provider] = provider_counts.get(item.provider, 0) + 1
        status_counts[item.status] = status_counts.get(item.status, 0) + 1

    durations = [item.duration_seconds for item in results if item.duration_seconds > 0]

    return {
        "total_tasks": len(results),
        "successful_tasks": len(successful),
        "failed_tasks": len(failed),
        "success_rate_percent": round(100 * len(successful) / len(results), 2) if results else 0.0,
        "rate_limited_tasks": len(rate_limited),
        "total_retries": sum(item.retries_used for item in results),
        "total_task_execution_seconds": round(sum(durations), 3),
        "average_task_execution_seconds": round(sum(durations) / len(durations), 3) if durations else 0.0,
        "fastest_task_seconds": round(min(durations), 3) if durations else 0.0,
        "slowest_task_seconds": round(max(durations), 3) if durations else 0.0,
        "total_wall_clock_seconds": round(total_wall_time, 3),
        "provider_counts": provider_counts,
        "status_counts": status_counts,
    }


def build_json_report(results: List[TaskResult], metrics: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "orchestrator": "multi-model-orchestrator",
        "generated_at": utc_now(),
        "metrics": metrics,
        "results": [asdict(result) for result in results],
    }


def build_markdown_report(
    results: List[TaskResult],
    metrics: Dict[str, Any],
    tasks: List[Task],
) -> str:
    task_by_id = {task.task_id: task for task in tasks}
    lines = [
        "# Multi-Model Orchestration Report",
        "",
        f"**Generated:** {utc_now()}",
        "",
        "## Execution Metrics",
        "",
        f"- Total tasks: **{metrics['total_tasks']}**",
        f"- Successful: **{metrics['successful_tasks']}**",
        f"- Failed: **{metrics['failed_tasks']}**",
        f"- Success rate: **{metrics['success_rate_percent']}%**",
        f"- Rate-limited tasks: **{metrics['rate_limited_tasks']}**",
        f"- Total retries: **{metrics['total_retries']}**",
        f"- Total task execution time: **{metrics['total_task_execution_seconds']}s**",
        f"- Average task execution time: **{metrics['average_task_execution_seconds']}s**",
        f"- Total wall-clock time: **{metrics['total_wall_clock_seconds']}s**",
        "",
        "## Provider Distribution",
        "",
    ]

    for provider, count in metrics["provider_counts"].items():
        lines.append(f"- `{provider}`: {count}")

    lines.extend(["", "## Task Results", ""])

    for result in results:
        task = task_by_id.get(result.task_id)
        prompt = task.prompt if task else "Prompt unavailable"
        prompt_preview = prompt[:500] + ("..." if len(prompt) > 500 else "")

        lines.extend(
            [
                f"### {result.task_id}",
                "",
                f"- **Route:** `{result.provider}`",
                f"- **Declared type:** `{result.task_type}`",
                f"- **Status:** `{result.status}`",
                f"- **Attempts:** {result.attempts}",
                f"- **Retries:** {result.retries_used}",
                f"- **Duration:** {result.duration_seconds}s",
                f"- **Rate limited:** {result.rate_limited}",
                f"- **Started:** {result.started_at}",
                f"- **Finished:** {result.finished_at}",
                "",
                "#### Prompt",
                "",
                "```text",
                prompt_preview,
                "```",
                "",
            ]
        )

        if result.output:
            lines.extend(
                [
                    "#### Output",
                    "",
                    "```text",
                    result.output[:10000],
                    "```",
                    "",
                ]
            )

        if result.error:
            lines.extend(
                [
                    "#### Error",
                    "",
                    "```text",
                    result.error[:5000],
                    "```",
                    "",
                ]
            )

    return "\n".join(lines)


def write_reports(
    results: List[TaskResult],
    tasks: List[Task],
    total_wall_time: float,
) -> Dict[str, str]:
    metrics = build_metrics(results, total_wall_time)
    json_report = build_json_report(results, metrics)
    markdown_report = build_markdown_report(results, metrics, tasks)

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    base = REPORT_DIR / f"orchestration-report-{stamp}"

    json_path = base.with_suffix(".json")
    markdown_path = base.with_suffix(".md")

    json_path.write_text(json.dumps(json_report, indent=2, ensure_ascii=False), encoding="utf-8")
    markdown_path.write_text(markdown_report, encoding="utf-8")

    return {"json": str(json_path), "markdown": str(markdown_path), "metrics": metrics}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_tasks(path: Path) -> List[Task]:
    raw = json.loads(path.read_text(encoding="utf-8"))

    if isinstance(raw, dict):
        raw_tasks = raw.get("tasks", [])
    elif isinstance(raw, list):
        raw_tasks = raw
    else:
        raise ValueError("Task file must be a JSON array or an object containing a 'tasks' array.")

    tasks: List[Task] = []

    for index, item in enumerate(raw_tasks, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"Task {index} must be an object.")

        tasks.append(
            Task(
                task_id=str(item.get("task_id", f"task-{index:03d}")),
                prompt=str(item.get("prompt", "")),
                task_type=item.get("task_type"),
                repo_path=item.get("repo_path"),
                attachments=list(item.get("attachments", [])),
                metadata=dict(item.get("metadata", {})),
            )
        )

    return tasks


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Route and execute tasks across Claude Code, Grok Plus, and Muse."
    )

    parser.add_argument(
        "tasks_file",
        nargs="?",
        help="JSON file containing tasks. Use '-' to read JSON tasks from stdin.",
    )

    parser.add_argument(
        "--prompt",
        help="Run one ad-hoc task from a command-line prompt.",
    )

    parser.add_argument(
        "--route",
        choices=["auto", "claude_code", "grok_plus", "muse"],
        default="auto",
        help="Force a route for the ad-hoc task.",
    )

    parser.add_argument(
        "--repo",
        help="Repository path for a Claude Code task.",
    )

    parser.add_argument(
        "--max-workers",
        type=int,
        default=DEFAULT_MAX_WORKERS,
        help=f"Maximum parallel workers. Default: {DEFAULT_MAX_WORKERS}.",
    )

    parser.add_argument(
        "--max-retries",
        type=int,
        default=DEFAULT_MAX_RETRIES,
        help=f"Maximum attempts per task. Default: {DEFAULT_MAX_RETRIES}.",
    )

    args = parser.parse_args()

    if args.prompt:
        tasks = [
            Task(
                task_id=f"adhoc-{uuid.uuid4().hex[:8]}",
                prompt=args.prompt,
                task_type=args.route if args.route != "auto" else None,
                repo_path=args.repo,
                metadata={"max_retries": args.max_retries},
            )
        ]
    elif args.tasks_file == "-":
        tasks = parse_tasks(Path(sys.stdin.read()))
    elif args.tasks_file:
        tasks = parse_tasks(Path(args.tasks_file))
    else:
        parser.error("Provide either --prompt or a tasks JSON file.")

    if not tasks:
        parser.error("No tasks were provided.")

    wall_start = time.monotonic()
    results = run_parallel(tasks, max_workers=max(1, args.max_workers))
    wall_time = time.monotonic() - wall_start

    report_paths = write_reports(results, tasks, wall_time)

    print(json.dumps(report_paths["metrics"], indent=2))
    print(f"\nMarkdown report: {report_paths['markdown']}")
    print(f"JSON report: {report_paths['json']}")

    return 0 if report_paths["metrics"]["failed_tasks"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
