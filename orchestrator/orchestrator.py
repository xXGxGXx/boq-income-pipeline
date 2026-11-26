#!/usr/bin/env python3
"""Async multi-model orchestrator: Claude Code, Grok (xAI) and Muse.

    python3 orchestrator.py tasks.json [--concurrency 8] [--output-dir reports]

Routes each task to one provider (explicit "provider", else "task_type", else keyword scoring), runs them concurrently
with a global limit, a per-provider concurrency limit and a per-provider token bucket, retries 429 / 502-504 / network
errors with exponential backoff and jitter (honouring Retry-After), and writes a JSON + Markdown report.

Claude Code runs read-only by default (CLAUDE_ALLOWED_TOOLS=Read,Grep,Glob). Give it more tools only for task files you
wrote yourself: whoever can edit tasks.json decides what Claude Code is asked to do on this machine.

Environment: XAI_API_KEY, GROK_API_URL, GROK_MODEL · MUSE_API_URL, MUSE_API_KEY, MUSE_MODEL (Muse's request/response
fields are placeholders: adapt them to your Muse deployment) · CLAUDE_BIN, CLAUDE_WORKDIR, CLAUDE_TIMEOUT,
CLAUDE_ALLOWED_TOOLS · <PROVIDER>_RPS, _BURST, _CONCURRENCY, _MAX_ATTEMPTS, _RETRY_BASE_DELAY · ORCHESTRATOR_LOG_LEVEL.
Exit code 0 when every task succeeded, 1 otherwise, 2 for an unusable tasks file.
"""
from __future__ import annotations

import argparse
import asyncio
import email.utils
import json
import logging
import os
import random
import re
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import httpx

# ----------------------------- configuration ------------------------------

GROK_API_URL = os.getenv("GROK_API_URL", "https://api.x.ai/v1/chat/completions")
GROK_API_KEY = os.getenv("XAI_API_KEY", "")
GROK_MODEL = os.getenv("GROK_MODEL", "grok-4-fast")          # check the model names your xAI account offers

MUSE_API_URL = os.getenv("MUSE_API_URL", "")
MUSE_API_KEY = os.getenv("MUSE_API_KEY", "")
MUSE_MODEL = os.getenv("MUSE_MODEL", "muse-default")

# OpenAI model is deliberately required from the environment; do not guess a model name.
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "")
OPENAI_API_URL = "https://api.openai.com/v1/responses"

CLAUDE_BIN = os.getenv("CLAUDE_BIN", "claude")
CLAUDE_WORKDIR = os.getenv("CLAUDE_WORKDIR", os.getcwd())
CLAUDE_TIMEOUT = int(os.getenv("CLAUDE_TIMEOUT", "900"))
CLAUDE_ALLOWED_TOOLS = os.getenv("CLAUDE_ALLOWED_TOOLS", "Read,Grep,Glob")

LOG_LEVEL = os.getenv("ORCHESTRATOR_LOG_LEVEL", "INFO").upper()
PROVIDERS = ("claude", "grok", "muse", "openai")
MAX_RETRY_AFTER = 120.0                                        # never sleep longer than this on one Retry-After

# ------------------------------- data models ------------------------------


@dataclass
class Task:
    id: str
    prompt: str
    task_type: str | None = None
    provider: str | None = None          # explicit choice; None = route automatically
    context: dict[str, Any] = field(default_factory=dict)
    timeout: int = 300
    priority: int = 5                    # lower starts first

    def resolved_provider(self) -> str:
        return self.provider if self.provider in PROVIDERS else route_task(self)


@dataclass
class TaskResult:
    task_id: str
    provider: str
    status: str = "queued"
    output: str = ""
    error: str | None = None
    started_at: str | None = None
    finished_at: str | None = None
    duration_seconds: float = 0.0
    attempts: int = 0
    retries: int = 0
    rate_limited: bool = False
    input_tokens: int | None = None
    output_tokens: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

# --------------------------------- routing --------------------------------


CODE = r"\b(code|bug|refactor|tests?|repo|repository|git|github|pull request|deploy|debug|implementation)\b"
WEB = r"\b(real[- ]time|latest|news|trending|trends|social media|twitter|x|reddit|current events|market sentiment|breaking)\b"
CREATIVE = r"\b(creative|image|video|audio|music|design|brand|campaign|storyboard|copywriting|visual|multimedia|illustration)\b"


def route_task(task: Task) -> str:
    if task.task_type in {"coding", "repository", "code", "repo"}:
        return "claude"
    if task.task_type in {"web", "social", "research", "realtime"}:
        return "grok"
    if task.task_type in {"creative", "multimedia", "design", "content"}:
        return "muse"
    if task.task_type in {"openai", "openai_responses"}:
        return "openai"
    text = f"{task.prompt} {json.dumps(task.context, default=str)}"
    scores = {
        "claude": len(re.findall(CODE, text, re.I)) * 1.25,   # coding signals weigh most
        "grok": len(re.findall(WEB, text, re.I)),
        "muse": len(re.findall(CREATIVE, text, re.I)),
    }
    winner = max(scores, key=scores.get)
    return winner if scores[winner] else "grok"

# ------------------------- async rate limiting ----------------------------


class AsyncTokenBucket:
    """Token bucket that waits without blocking the event loop."""

    def __init__(self, rate: float, burst: int):
        self.rate = max(rate, 0.01)
        self.capacity = max(burst, 1)
        self.tokens = float(self.capacity)
        self.updated = time.monotonic()
        self.lock = asyncio.Lock()

    async def acquire(self, tokens: int = 1) -> None:
        while True:
            async with self.lock:
                now_ = time.monotonic()
                self.tokens = min(self.capacity, self.tokens + (now_ - self.updated) * self.rate)
                self.updated = now_
                if self.tokens >= tokens:
                    self.tokens -= tokens
                    return
                wait = (tokens - self.tokens) / self.rate
            await asyncio.sleep(min(wait, 5))


class RateLimiter:
    DEFAULTS = {"claude": (".5", "2", "2"), "grok": ("1", "3", "5"), "muse": ("1", "3", "5"),
                "openai": ("1", "3", "5")}

    def __init__(self):
        self.buckets, self.semaphores = {}, {}
        for p, (rps, burst, conc) in self.DEFAULTS.items():
            P = p.upper()
            self.buckets[p] = AsyncTokenBucket(float(os.getenv(f"{P}_RPS", rps)), int(os.getenv(f"{P}_BURST", burst)))
            self.semaphores[p] = asyncio.Semaphore(int(os.getenv(f"{P}_CONCURRENCY", conc)))

    async def acquire(self, provider: str) -> None:
        await self.buckets[provider].acquire()


def retry_after_seconds(value: str | None) -> float | None:
    """Retry-After is either seconds or an HTTP date; anything else is ignored."""
    if not value:
        return None
    try:
        return min(max(float(value), 0.0), MAX_RETRY_AFTER)
    except ValueError:
        pass
    try:
        when = email.utils.parsedate_to_datetime(value)
        if when.tzinfo is None:
            when = when.replace(tzinfo=timezone.utc)
        return min(max((when - datetime.now(timezone.utc)).total_seconds(), 0.0), MAX_RETRY_AFTER)
    except (TypeError, ValueError):
        return None

# ------------------------------ orchestration -----------------------------


class Orchestrator:
    def __init__(self, concurrency: int = 8, client: httpx.AsyncClient | None = None):
        self.concurrency = max(1, concurrency)
        self.limiter = RateLimiter()
        self.global_semaphore = asyncio.Semaphore(self.concurrency)
        self.client = client or httpx.AsyncClient(timeout=httpx.Timeout(300.0))

    async def run(self, tasks: list[Task]) -> list[TaskResult]:
        ordered = sorted(tasks, key=lambda t: t.priority)            # stable: equal priorities keep file order
        results = await asyncio.gather(*(self._guarded_execute(t) for t in ordered), return_exceptions=True)
        normalized: list[TaskResult] = []
        for task, result in zip(ordered, results):
            if isinstance(result, BaseException):
                normalized.append(self.failure(task, task.resolved_provider(), f"Unhandled error: {result!r}"))
            else:
                normalized.append(result)
        position = {t.id: i for i, t in enumerate(tasks)}
        return sorted(normalized, key=lambda r: position.get(r.task_id, 0))   # report in file order

    async def _guarded_execute(self, task: Task) -> TaskResult:
        provider = task.resolved_provider()
        async with self.global_semaphore:
            try:
                async with self.limiter.semaphores[provider]:
                    classification = str(task.context.get("data_classification", "public")).strip().lower()
                    restricted = {"private", "client", "financial", "health", "sensitive", "restricted"}
                    if classification in restricted and task.context.get("allow_external_processing") is not True:
                        return self.failure(
                            task, provider,
                            f"Blocked before provider call: data_classification={classification!r} requires "
                            "explicit allow_external_processing=true. This policy flag does not inspect prompt contents."
                        )
                    runner = {"claude": self.run_claude, "grok": self.run_grok, "muse": self.run_muse,
                              "openai": self.run_openai}[provider]
                    return await runner(task)
            except asyncio.CancelledError:
                return self.failure(task, provider, "Task cancelled during shutdown.")
            except Exception as exc:                                  # a provider bug must not sink the whole run
                return self.failure(task, provider, f"Provider execution error: {exc!r}")

    async def run_claude(self, task: Task) -> TaskResult:
        result = self.start(task, "claude")
        prompt = (
            f"{task.prompt}\n\nWork in the current repository. Inspect files before editing, make the smallest safe "
            "change, run or recommend tests, and summarize changes, risks, and verification.\n\nContext:\n"
            f"{json.dumps(task.context, indent=2, default=str)}"
        )
        command = [CLAUDE_BIN, "-p", prompt, "--output-format", "json", "--allowedTools", CLAUDE_ALLOWED_TOOLS]
        limit = min(task.timeout, CLAUDE_TIMEOUT)
        try:
            await self.limiter.acquire("claude")
            process = await asyncio.create_subprocess_exec(
                *command, cwd=CLAUDE_WORKDIR, stdin=asyncio.subprocess.DEVNULL,   # never wait for keyboard input
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        except FileNotFoundError:
            return self.finish(result, "failed", error=f"Claude executable '{CLAUDE_BIN}' not found.")
        result.attempts = 1
        try:
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=limit)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            return self.finish(result, "timeout", error=f"Claude Code timed out after {limit}s")
        out, err = stdout.decode(errors="replace"), stderr.decode(errors="replace")
        meta = {"workdir": CLAUDE_WORKDIR, "returncode": process.returncode, "allowed_tools": CLAUDE_ALLOWED_TOOLS}
        if process.returncode != 0:
            return self.finish(result, "failed", error=(err or out).strip()[:4000] or f"exit code {process.returncode}", metadata=meta)
        try:
            payload = json.loads(out or "{}")
        except json.JSONDecodeError:
            result.output = out
            return self.finish(result, "success", metadata=meta)
        if not isinstance(payload, dict):
            result.output = out
            return self.finish(result, "success", metadata=meta)
        result.output = str(payload.get("result", ""))
        usage = payload.get("usage") or {}
        result.input_tokens, result.output_tokens = usage.get("input_tokens"), usage.get("output_tokens")
        meta.update({k: payload.get(k) for k in ("session_id", "subtype", "num_turns", "total_cost_usd") if k in payload})
        if payload.get("is_error"):                                   # Claude Code exits 0 for some failures and says so here
            return self.finish(result, "failed", error=result.output or str(payload.get("subtype") or "Claude Code reported an error"), metadata=meta)
        return self.finish(result, "success", metadata=meta)

    async def run_grok(self, task: Task) -> TaskResult:
        if not GROK_API_KEY:
            return self.failure(task, "grok", "Missing XAI_API_KEY.")
        payload = {
            "model": GROK_MODEL,
            "messages": [
                {"role": "system", "content": (
                    "You are a real-time research and social-synthesis assistant. Prioritize current, verifiable "
                    "sources; separate facts from inference; state uncertainty and conflicting evidence.")},
                {"role": "user", "content": (
                    f"{task.prompt}\n\nProvide key findings, source-backed claims, conflicts, recency assessment, and "
                    f"practical implications.\n\nContext:\n{json.dumps(task.context, indent=2, default=str)}")},
            ],
            "temperature": task.context.get("temperature", 0.3),
            "max_tokens": task.context.get("max_tokens", 2000),
        }
        return await self.http_with_retry(task, "grok", GROK_API_URL, payload,
                                          {"Authorization": f"Bearer {GROK_API_KEY}"}, self.parse_openai_response)

    async def run_muse(self, task: Task) -> TaskResult:
        if not MUSE_API_URL or not MUSE_API_KEY:
            return self.failure(task, "muse", "MUSE_API_URL and MUSE_API_KEY are required.")
        payload = {"model": MUSE_MODEL, "input": task.prompt, "mode": task.context.get("mode", "creative"),
                   "media": task.context.get("media", "text"), "metadata": task.context}
        return await self.http_with_retry(task, "muse", MUSE_API_URL, payload,
                                          {"Authorization": f"Bearer {MUSE_API_KEY}"}, self.parse_muse_response)

    async def run_openai(self, task: Task) -> TaskResult:
        """Call the OpenAI Responses API; web search is opt-in per task."""
        if not OPENAI_API_KEY:
            return self.failure(task, "openai", "Missing OPENAI_API_KEY.")
        if not OPENAI_MODEL:
            return self.failure(task, "openai", "Missing OPENAI_MODEL; set a model available to your project.")
        input_text = (
            "You are a careful assistant. Separate sourced facts from inference, state uncertainty, "
            "and do not invent citations.\n\n"
            f"Task:\n{task.prompt}\n\nContext:\n{json.dumps(task.context, indent=2, default=str)}"
        )
        payload: dict[str, Any] = {"model": OPENAI_MODEL, "input": input_text, "store": False}
        if task.context.get("web_search") is True:
            payload["tools"] = [{"type": "web_search"}]
        if isinstance(task.context.get("max_output_tokens"), int):
            payload["max_output_tokens"] = max(16, min(task.context["max_output_tokens"], 16384))
        effort = task.context.get("reasoning_effort")
        if effort in {"low", "medium", "high", "xhigh"}:
            payload["reasoning"] = {"effort": effort}
        return await self.http_with_retry(
            task, "openai", OPENAI_API_URL, payload,
            {"Authorization": f"Bearer {OPENAI_API_KEY}"}, self.parse_responses_response
        )

    async def http_with_retry(self, task: Task, provider: str, url: str, payload: dict, headers: dict,
                              parser: Callable[[dict], dict]) -> TaskResult:
        result = self.start(task, provider)
        attempts = max(1, int(os.getenv(f"{provider.upper()}_MAX_ATTEMPTS", "4")))
        base_delay = float(os.getenv(f"{provider.upper()}_RETRY_BASE_DELAY", "2"))
        for attempt in range(1, attempts + 1):
            result.attempts = attempt
            try:
                await self.limiter.acquire(provider)
                response = await self.client.post(url, json=payload, headers=headers, timeout=task.timeout)
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                result.error = f"Network error: {exc!r}"
                if attempt < attempts:
                    await asyncio.sleep(self.backoff(base_delay, attempt))
                    continue
                break
            if response.status_code == 429:
                result.rate_limited = True
                result.error = f"Rate limited (429) on attempt {attempt} of {attempts}"
                if attempt < attempts:
                    delay = retry_after_seconds(response.headers.get("Retry-After"))
                    delay = self.backoff(base_delay, attempt) if delay is None else delay
                    logging.warning("%s rate-limited task %s; waiting %.1fs", provider, task.id, delay)
                    await asyncio.sleep(delay)
                continue
            if response.status_code in (502, 503, 504):
                result.error = f"Server error {response.status_code}: {response.text[:300]}"
                if attempt < attempts:
                    await asyncio.sleep(self.backoff(base_delay, attempt))
                continue
            if response.status_code >= 400:
                result.error = f"HTTP {response.status_code}: {response.text[:500]}"      # not retryable
                break
            try:
                parsed = parser(response.json())
            except (ValueError, KeyError, IndexError, TypeError, AttributeError) as exc:
                result.error = f"Unexpected {provider} response: {exc!r}; body starts {response.text[:200]!r}"
                break
            result.output = parsed["output"]
            result.input_tokens = parsed.get("input_tokens")
            result.output_tokens = parsed.get("output_tokens")
            result.metadata.update(parsed.get("metadata", {}))
            result.error = None
            return self.finish(result, "success")
        return self.finish(result, "failed")

    @staticmethod
    def parse_openai_response(data: dict) -> dict:
        usage = data.get("usage") or {}
        return {"output": data["choices"][0]["message"]["content"].strip(),
                "input_tokens": usage.get("prompt_tokens"), "output_tokens": usage.get("completion_tokens"),
                "metadata": {"model": data.get("model")}}

    @staticmethod
    def parse_muse_response(data: dict) -> dict:
        if not isinstance(data, dict):
            raise TypeError("expected a JSON object")
        output = next((data[k] for k in ("output", "content", "text", "result", "response") if k in data), data)
        return {"output": output if isinstance(output, str) else json.dumps(output, ensure_ascii=False)}

    @staticmethod
    def parse_responses_response(data: dict) -> dict:
        """Parse text and URL citation annotations from a Responses API JSON response."""
        if not isinstance(data, dict):
            raise TypeError("expected a JSON object")
        chunks: list[str] = []
        citations: list[dict[str, str]] = []
        direct_text = data.get("output_text")
        if isinstance(direct_text, str) and direct_text:
            chunks.append(direct_text)
        for item in data.get("output", []) or []:
            if not isinstance(item, dict) or item.get("type") != "message":
                continue
            for part in item.get("content", []) or []:
                if not isinstance(part, dict):
                    continue
                if part.get("type") in {"output_text", "text"} and isinstance(part.get("text"), str):
                    if not direct_text:
                        chunks.append(part["text"])
                    for annotation in part.get("annotations", []) or []:
                        if not isinstance(annotation, dict) or annotation.get("type") != "url_citation":
                            continue
                        citation = annotation.get("url_citation", annotation)
                        if isinstance(citation, dict) and isinstance(citation.get("url"), str):
                            entry = {"url": citation["url"]}
                            if isinstance(citation.get("title"), str):
                                entry["title"] = citation["title"]
                            if entry not in citations:
                                citations.append(entry)
        output = "\n\n".join(chunks).strip()
        if not output:
            raise ValueError("Responses API returned no output text")
        usage = data.get("usage") or {}
        return {
            "output": output,
            "input_tokens": usage.get("input_tokens"),
            "output_tokens": usage.get("output_tokens"),
            "metadata": {"model": data.get("model"), "response_id": data.get("id"), "citations": citations},
        }

    def start(self, task: Task, provider: str) -> TaskResult:
        return TaskResult(task_id=task.id, provider=provider, status="running", started_at=now(),
                          metadata={
                              "routed_by": "provider" if task.provider in PROVIDERS else (task.task_type or "keywords"),
                              "data_classification": str(task.context.get("data_classification", "public")).strip().lower(),
                              "external_processing_approved": task.context.get("allow_external_processing") is True,
                          })

    def finish(self, result: TaskResult, status: str, error: str | None = None, metadata: dict | None = None) -> TaskResult:
        result.status = status
        result.error = error or result.error
        result.finished_at = now()
        result.duration_seconds = round(duration(result.started_at), 3)
        result.retries = max(result.attempts - 1, 0)
        if metadata:
            result.metadata.update(metadata)
        return result

    def failure(self, task: Task, provider: str, error: str) -> TaskResult:
        return self.finish(self.start(task, provider), "failed", error=error)

    @staticmethod
    def backoff(base: float, attempt: int) -> float:
        return base * (2 ** (attempt - 1)) + random.uniform(0, 0.5 if base else 0)

# -------------------------------- reporting -------------------------------


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def duration(started: str | None) -> float:
    return (datetime.now(timezone.utc) - datetime.fromisoformat(started)).total_seconds() if started else 0.0


def metrics(results: list[TaskResult]) -> dict:
    providers: dict[str, dict] = {}
    for r in results:
        s = providers.setdefault(r.provider, {"tasks": 0, "success": 0, "failed": 0, "timeout": 0, "rate_limited": 0,
                                              "retries": 0, "total_seconds": 0.0, "input_tokens": 0, "output_tokens": 0})
        s["tasks"] += 1
        s["total_seconds"] += r.duration_seconds
        s["retries"] += r.retries
        s["rate_limited"] += int(r.rate_limited)
        s[r.status if r.status in ("success", "failed", "timeout") else "failed"] += 1
        s["input_tokens"] += r.input_tokens or 0
        s["output_tokens"] += r.output_tokens or 0
    for s in providers.values():
        s["avg_seconds"] = round(s["total_seconds"] / s["tasks"], 3) if s["tasks"] else 0
        s["total_seconds"] = round(s["total_seconds"], 3)
    return {"total": len(results),
            "success": sum(r.status == "success" for r in results),
            "failed": sum(r.status not in ("success", "timeout") for r in results),
            "timeout": sum(r.status == "timeout" for r in results),
            "rate_limited": sum(r.rate_limited for r in results),
            "retries": sum(r.retries for r in results),
            "providers": providers}


def write_reports(results: list[TaskResult], output_dir: Path) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]   # two runs in one second don't collide
    json_path, md_path = output_dir / f"orchestration-{stamp}.json", output_dir / f"orchestration-{stamp}.md"
    m = metrics(results)
    json_path.write_text(json.dumps({"report_id": str(uuid.uuid4()), "generated_at": now(), "metrics": m,
                                     "results": [asdict(r) for r in results]}, indent=2, ensure_ascii=False), encoding="utf-8")
    md = ["# Multi-Model Orchestration Report", "", f"**Generated:** {now()}", "", "## Metrics", "",
          f"- Tasks: **{m['total']}** | Success: **{m['success']}** | Failed: **{m['failed']}** | Timeouts: **{m['timeout']}** | "
          f"Rate-limited: **{m['rate_limited']}** | Retries: **{m['retries']}**", "", "## Providers", "",
          "| Provider | Tasks | Success | Failed | Timeouts | Rate-limited | Retries | Avg seconds |",
          "|---|---:|---:|---:|---:|---:|---:|---:|"]
    for name, s in m["providers"].items():
        md.append(f"| {name} | {s['tasks']} | {s['success']} | {s['failed']} | {s['timeout']} | {s['rate_limited']} | {s['retries']} | {s['avg_seconds']} |")
    md.extend(["", "## Results", ""])
    fence = lambda text: ["", "````text", text, "````"]                    # 4 backticks: output containing ``` can't break out
    for r in results:
        md.extend([f"### {r.task_id}", "", f"- Provider: `{r.provider}`", f"- Status: `{r.status}`",
                   f"- Duration: `{r.duration_seconds}s`",
                   f"- Attempts: `{r.attempts}` | Retries: `{r.retries}` | Rate-limited: `{r.rate_limited}`"])
        if r.error:
            md.extend(fence(r.error))
        if r.output:
            md.extend(fence(r.output[:10000]))
        md.append("")
    md_path.write_text("\n".join(md), encoding="utf-8")
    return json_path, md_path

# ----------------------------------- CLI ----------------------------------


def load_tasks(path: Path) -> list[Task]:
    data = json.loads(path.read_text(encoding="utf-8"))
    items = data.get("tasks", []) if isinstance(data, dict) else data
    if not isinstance(items, list):
        raise ValueError("tasks file must be a list or an object with a 'tasks' list")
    tasks, seen = [], set()
    for i, item in enumerate(items):
        if not isinstance(item, dict) or not str(item.get("prompt", "")).strip():
            raise ValueError(f"task #{i + 1} needs a non-empty 'prompt'")
        tid = str(item.get("id") or f"task-{i + 1:03d}")
        if tid in seen:
            raise ValueError(f"duplicate task id {tid!r}")
        seen.add(tid)
        provider = item.get("provider")
        if provider is not None and provider not in PROVIDERS:
            raise ValueError(f"task {tid!r}: provider must be one of {', '.join(PROVIDERS)}")
        context = item.get("context") or {}
        if not isinstance(context, dict):
            raise ValueError(f"task {tid!r}: context must be an object")
        tasks.append(Task(id=tid, prompt=str(item["prompt"]), task_type=item.get("task_type"), provider=provider,
                          context=context, timeout=int(item.get("timeout", 300)), priority=int(item.get("priority", 5))))
    return tasks


async def async_main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Route tasks to Claude Code, Grok and Muse; write JSON + Markdown reports.")
    parser.add_argument("tasks_file", type=Path)
    parser.add_argument("--concurrency", type=int, default=8)
    parser.add_argument("--output-dir", type=Path, default=Path("reports"))
    args = parser.parse_args(argv)
    logging.basicConfig(level=LOG_LEVEL, format="%(asctime)s | %(levelname)s | %(message)s")
    try:
        tasks = load_tasks(args.tasks_file)
    except (OSError, ValueError) as exc:
        logging.error("Cannot use %s: %s", args.tasks_file, exc)
        return 2
    orchestrator = Orchestrator(concurrency=args.concurrency)
    try:
        results = await orchestrator.run(tasks)
    finally:
        await orchestrator.client.aclose()
    json_path, md_path = write_reports(results, args.output_dir)
    logging.info("JSON report: %s", json_path)
    logging.info("Markdown report: %s", md_path)
    m = metrics(results)
    return 0 if m["success"] == m["total"] else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(async_main()))
