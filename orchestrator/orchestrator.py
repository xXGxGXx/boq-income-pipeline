#!/usr/bin/env python3
"""Async multi-model orchestrator: Claude Code, Grok (xAI), Muse and the OpenAI Responses API.

    python3 orchestrator.py tasks.json [--concurrency 8] [--output-dir reports] [--max-calls N] [--task-budget SECONDS]
    python3 orchestrator.py --verify reports/orchestration-....json [--expect-head SHA256]

Routes each task to one provider (explicit "provider", else "task_type", else keyword scoring), runs them concurrently
with a global limit, a per-provider concurrency limit and a per-provider token bucket, retries 429 / 502-504 / network
errors with exponential backoff and jitter (honouring Retry-After), and writes a JSON + Markdown report.

Claude Code runs read-only by default (CLAUDE_ALLOWED_TOOLS=Read,Grep,Glob). Give it more tools only for task files you
wrote yourself: whoever can edit tasks.json decides what Claude Code is asked to do on this machine.

Every task passes a preflight before any provider is called (data classification, write tools, the run's call budget)
and runs inside budget gates (attempts, time). The report carries an evidence ledger: one record per task, each with a
SHA-256 over a stated canonical form and chained to the record before it, optionally signed with HMAC-SHA256
(ORCHESTRATOR_EVIDENCE_KEY). --verify re-checks a report and names any record or result that changed.

Environment: XAI_API_KEY, GROK_API_URL, GROK_MODEL · MUSE_API_URL, MUSE_API_KEY, MUSE_MODEL (Muse's request/response
fields are placeholders: adapt them to your Muse deployment) · CLAUDE_BIN, CLAUDE_WORKDIR, CLAUDE_TIMEOUT,
CLAUDE_ALLOWED_TOOLS · OPENAI_API_KEY, OPENAI_MODEL · <PROVIDER>_RPS, _BURST, _CONCURRENCY, _MAX_ATTEMPTS,
_RETRY_BASE_DELAY · ORCHESTRATOR_LOG_LEVEL · ORCHESTRATOR_EVIDENCE_KEY (signs the evidence; keep it out of the repository).
Task context keys for the gates: max_attempts, budget_seconds, allow_write_tools, data_classification,
allow_external_processing.
Exit code 0 when every task succeeded, 1 otherwise, 2 for an unusable tasks file. With --verify: 0 verified,
1 changed or unverifiable, 2 not a usable report.
"""
from __future__ import annotations

import argparse
import asyncio
import email.utils
import hashlib
import hmac
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
RESTRICTED_CLASSES = {"private", "client", "financial", "health", "sensitive", "restricted"}
WRITE_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit", "Bash"}   # Claude Code tools that change files or run commands
EVIDENCE_KEY_ENV = "ORCHESTRATOR_EVIDENCE_KEY"
EVIDENCE_SCHEME = (
    "sha256 is SHA-256 of the record as canonical JSON (UTF-8; keys sorted; separators ',' and ':'; non-ASCII kept "
    "as is) with its 'sha256' and 'hmac' fields left out. prev_sha256 is the previous record's sha256, '' for the "
    "first. output_sha256 / error_sha256 / task_sha256 hash the result's output text, its error text ('' when there "
    "is none) and the task's canonical JSON (id, prompt, provider, task_type, context). hmac, when present, is "
    "HMAC-SHA256 of the same bytes as sha256, keyed with ORCHESTRATOR_EVIDENCE_KEY."
)

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
    def __init__(self, concurrency: int = 8, client: httpx.AsyncClient | None = None,
                 max_calls: int | None = None, task_budget: float | None = None):
        self.concurrency = max(1, concurrency)
        self.limiter = RateLimiter()
        self.global_semaphore = asyncio.Semaphore(self.concurrency)
        self.client = client or httpx.AsyncClient(timeout=httpx.Timeout(300.0))
        self.max_calls = max_calls if max_calls is None else max(0, max_calls)   # provider calls for the whole run
        self.calls_used = 0
        self.task_budget = task_budget                                # default seconds per task; context can lower it

    # ------------------------------ gates ----------------------------------

    def take_call(self) -> bool:
        """Count one provider call against the run's budget; False once it is used up."""
        if self.max_calls is not None and self.calls_used >= self.max_calls:
            return False
        self.calls_used += 1
        return True

    def budget_for(self, task: Task) -> float | None:
        """Seconds this task may take in total, retries and waits included (None = no budget)."""
        own = task.context.get("budget_seconds")
        own = float(own) if isinstance(own, (int, float)) and not isinstance(own, bool) and own > 0 else None
        if own and self.task_budget:
            return min(own, self.task_budget)
        return own or self.task_budget

    def preflight(self, task: Task, provider: str) -> tuple[str, str | None, dict[str, str]]:
        """Checks that run before any provider is contacted: (ALLOW|BLOCK, reason, per-check results)."""
        checks: dict[str, str] = {}
        reasons: list[str] = []
        classification = str(task.context.get("data_classification", "public")).strip().lower()
        if classification in RESTRICTED_CLASSES and task.context.get("allow_external_processing") is not True:
            checks["data_classification"] = "BLOCK"
            reasons.append(f"Blocked before provider call: data_classification={classification!r} requires "
                           "explicit allow_external_processing=true. This policy flag does not inspect prompt contents.")
        else:
            checks["data_classification"] = "ALLOW"
        if provider == "claude":
            writers = [t for t in (x.strip() for x in CLAUDE_ALLOWED_TOOLS.split(",")) if t and t.split("(")[0] in WRITE_TOOLS]
            if writers and task.context.get("allow_write_tools") is not True:
                checks["write_tools"] = "BLOCK"
                reasons.append(f"Risk gate: Claude Code would run with tools that change files or run commands "
                               f"({', '.join(writers)}). Set allow_write_tools: true on this task to allow it.")
            else:
                checks["write_tools"] = "ALLOW"
        if self.max_calls is not None and self.calls_used >= self.max_calls:
            checks["call_budget"] = "BLOCK"
            reasons.append(f"Budget gate: the run's call budget ({self.max_calls} provider calls) is used up.")
        else:
            checks["call_budget"] = "ALLOW"
        return ("BLOCK", " ".join(reasons), checks) if reasons else ("ALLOW", None, checks)

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
                    decision, reason, checks = self.preflight(task, provider)
                    if decision == "BLOCK":
                        result = self.failure(task, provider, reason or "Blocked by preflight.")
                        result.metadata["preflight"] = {"decision": "BLOCK", "checks": checks}
                        result.metadata["gates"] = [k for k, v in checks.items() if v == "BLOCK"]
                        return result
                    runner = {"claude": self.run_claude, "grok": self.run_grok, "muse": self.run_muse,
                              "openai": self.run_openai}[provider]
                    budget = self.budget_for(task)
                    if budget is None:
                        result = await runner(task)
                    else:
                        try:
                            result = await asyncio.wait_for(runner(task), timeout=budget)
                        except asyncio.TimeoutError:
                            result = self.finish(self.start(task, provider), "timeout",
                                                 error=f"Budget gate: task stopped after its {budget:g}s time budget.")
                            result.metadata.setdefault("gates", []).append("time_budget")
                    result.metadata["preflight"] = {"decision": "ALLOW", "checks": checks}
                    return result
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
        if not self.take_call():
            result.metadata.setdefault("gates", []).append("call_budget")
            return self.finish(result, "failed", error=f"Budget gate: the run's call budget ({self.max_calls} provider calls) is used up.")
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
        except asyncio.CancelledError:                                # time budget or shutdown: don't leave it running
            if process.returncode is None:
                process.kill()
                await process.wait()
            raise
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
        cap = task.context.get("max_attempts")
        if isinstance(cap, int) and not isinstance(cap, bool) and cap >= 1:
            attempts = min(attempts, cap)
        base_delay = float(os.getenv(f"{provider.upper()}_RETRY_BASE_DELAY", "2"))
        loop = asyncio.get_running_loop()
        budget = self.budget_for(task)
        deadline = loop.time() + budget if budget else None

        async def wait_or_stop(delay: float) -> bool:
            """Sleep before the next attempt, unless that would pass the task's time budget."""
            if deadline is not None and loop.time() + delay >= deadline:
                result.error = (result.error or "") + f"; Budget gate: waiting {delay:.1f}s for another attempt would pass the {budget:g}s time budget"
                result.metadata.setdefault("gates", []).append("time_budget")
                return False
            await asyncio.sleep(delay)
            return True

        for attempt in range(1, attempts + 1):
            if not self.take_call():
                result.error = (f"{result.error}; " if result.error else "") + f"Budget gate: the run's call budget ({self.max_calls} provider calls) is used up"
                result.metadata.setdefault("gates", []).append("call_budget")
                break
            result.attempts = attempt
            try:
                await self.limiter.acquire(provider)
                response = await self.client.post(url, json=payload, headers=headers, timeout=task.timeout)
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                result.error = f"Network error: {exc!r}"
                if attempt < attempts and await wait_or_stop(self.backoff(base_delay, attempt)):
                    continue
                break
            if response.status_code == 429:
                result.rate_limited = True
                result.error = f"Rate limited (429) on attempt {attempt} of {attempts}"
                if attempt < attempts:
                    delay = retry_after_seconds(response.headers.get("Retry-After"))
                    delay = self.backoff(base_delay, attempt) if delay is None else delay
                    logging.warning("%s rate-limited task %s; waiting %.1fs", provider, task.id, delay)
                    if not await wait_or_stop(delay):
                        break
                continue
            if response.status_code in (502, 503, 504):
                result.error = f"Server error {response.status_code}: {response.text[:300]}"
                if attempt < attempts and not await wait_or_stop(self.backoff(base_delay, attempt)):
                    break
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
                              "task_sha256": task_fingerprint(task),
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

# --------------------------------- evidence -------------------------------


def canonical(obj: Any) -> bytes:
    """The exact bytes every evidence hash covers (see EVIDENCE_SCHEME)."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def sha256_text(text: str | None) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def task_fingerprint(task: Task) -> str:
    """Identifies the task that ran without copying its prompt into the evidence."""
    return hashlib.sha256(canonical({"id": task.id, "prompt": task.prompt, "provider": task.provider,
                                     "task_type": task.task_type, "context": task.context})).hexdigest()


def evidence_key() -> bytes | None:
    key = os.getenv(EVIDENCE_KEY_ENV, "")
    return key.encode("utf-8") if key else None


def build_evidence(results: list[TaskResult], key: bytes | None = None) -> dict:
    """One record per result, in report order, each hashed and chained to the one before (optionally HMAC-signed)."""
    records, prev = [], ""
    for seq, r in enumerate(results, 1):
        record = {
            "seq": seq, "task_id": r.task_id, "provider": r.provider,
            "task_sha256": r.metadata.get("task_sha256", ""),
            "preflight": (r.metadata.get("preflight") or {}).get("decision", "NONE"),
            "gates": list(r.metadata.get("gates") or []),
            "status": r.status, "attempts": r.attempts,
            "started_at": r.started_at, "finished_at": r.finished_at,
            "output_sha256": sha256_text(r.output),
            "error_sha256": sha256_text(r.error) if r.error else "",
            "prev_sha256": prev,
        }
        body = canonical(record)
        record["sha256"] = hashlib.sha256(body).hexdigest()
        if key:
            record["hmac"] = hmac.new(key, body, hashlib.sha256).hexdigest()
        prev = record["sha256"]
        records.append(record)
    return {"scheme": EVIDENCE_SCHEME, "signed": bool(key), "records": records, "head_sha256": prev}


def verify_report(report: dict, key: bytes | None = None, expect_head: str | None = None) -> list[str]:
    """Every way the report no longer matches its evidence, in plain words; [] means verified.

    With a key, every record must carry a matching HMAC: a report re-hashed (or stripped of signatures) by someone
    without the key fails. Without a key, a signed report fails as unverifiable rather than passing on hashes alone.
    """
    evidence = report.get("evidence") if isinstance(report, dict) else None
    if not isinstance(evidence, dict) or not isinstance(evidence.get("records"), list):
        raise ValueError("this report has no evidence section (it was written before evidence records were added)")
    records, results = evidence["records"], report.get("results")
    results = results if isinstance(results, list) else []
    problems: list[str] = []
    must_sign = key is not None or evidence.get("signed") is True
    if must_sign and key is None:
        problems.append(f"the report is signed: set {EVIDENCE_KEY_ENV} to the key it was signed with to verify it")
    prev = ""
    for seq, record in enumerate(records, 1):
        if not isinstance(record, dict):
            problems.append(f"record #{seq}: not a record")
            prev = None
            continue
        label = f"record #{seq} ({record.get('task_id', '?')})"
        body = canonical({k: v for k, v in record.items() if k not in ("sha256", "hmac")})
        if hashlib.sha256(body).hexdigest() != record.get("sha256"):
            problems.append(f"{label}: changed after it was written (its sha256 no longer matches its contents)")
        if record.get("seq") != seq:
            problems.append(f"{label}: out of place (seq {record.get('seq')!r}, expected {seq}): a record was removed or moved")
        if prev is not None and record.get("prev_sha256") != prev:
            problems.append(f"{label}: chain broken: the record before it was removed, moved or changed")
        if key is not None:
            expected = hmac.new(key, body, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(expected, str(record.get("hmac", ""))):
                problems.append(f"{label}: signature missing or wrong (changed, re-hashed without the key, or a different key)")
        prev = record.get("sha256", "")
    head = prev or ""
    if evidence.get("head_sha256") != head:
        problems.append("head_sha256 doesn't match the last record: records were added or removed at the end")
    if expect_head and expect_head.strip().lower() != head:
        problems.append("the last record's sha256 isn't the head you saved: the report was regenerated or its end was cut")
    if len(results) != len(records):
        problems.append(f"{len(results)} results but {len(records)} evidence records")
    for record, result in zip(records, results):
        if not isinstance(record, dict) or not isinstance(result, dict):
            continue
        tid = record.get("task_id")
        if result.get("task_id") != tid:
            problems.append(f"result {result.get('task_id')!r} is where the evidence expects {tid!r}")
            continue
        if sha256_text(result.get("output")) != record.get("output_sha256"):
            problems.append(f"result {tid}: output changed after the run")
        if result.get("status") != record.get("status"):
            problems.append(f"result {tid}: status says {result.get('status')!r}, the evidence says {record.get('status')!r}")
        error = result.get("error")
        if (sha256_text(error) if error else "") != record.get("error_sha256"):
            problems.append(f"result {tid}: error text changed after the run")
    return problems


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
            "blocked": sum((r.metadata.get("preflight") or {}).get("decision") == "BLOCK" for r in results),
            "success": sum(r.status == "success" for r in results),
            "failed": sum(r.status not in ("success", "timeout") for r in results),
            "timeout": sum(r.status == "timeout" for r in results),
            "rate_limited": sum(r.rate_limited for r in results),
            "retries": sum(r.retries for r in results),
            "providers": providers}


def write_reports(results: list[TaskResult], output_dir: Path, key: bytes | None = None) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]   # two runs in one second don't collide
    json_path, md_path = output_dir / f"orchestration-{stamp}.json", output_dir / f"orchestration-{stamp}.md"
    m = metrics(results)
    evidence = build_evidence(results, key if key is not None else evidence_key())
    json_path.write_text(json.dumps({"report_id": str(uuid.uuid4()), "generated_at": now(), "metrics": m,
                                     "results": [asdict(r) for r in results], "evidence": evidence},
                                    indent=2, ensure_ascii=False), encoding="utf-8")
    md = ["# Multi-Model Orchestration Report", "", f"**Generated:** {now()}", "", "## Metrics", "",
          f"- Tasks: **{m['total']}** | Success: **{m['success']}** | Failed: **{m['failed']}** | Timeouts: **{m['timeout']}** | "
          f"Blocked by preflight: **{m['blocked']}** | Rate-limited: **{m['rate_limited']}** | Retries: **{m['retries']}**",
          "", "## Providers", "",
          "| Provider | Tasks | Success | Failed | Timeouts | Rate-limited | Retries | Avg seconds |",
          "|---|---:|---:|---:|---:|---:|---:|---:|"]
    for name, s in m["providers"].items():
        md.append(f"| {name} | {s['tasks']} | {s['success']} | {s['failed']} | {s['timeout']} | {s['rate_limited']} | {s['retries']} | {s['avg_seconds']} |")
    md.extend(["", "## Results", ""])
    fence = lambda text: ["", "````text", text, "````"]                    # 4 backticks: output containing ``` can't break out
    for r in results:
        md.extend([f"### {r.task_id}", "", f"- Provider: `{r.provider}`", f"- Status: `{r.status}`",
                   f"- Preflight: `{(r.metadata.get('preflight') or {}).get('decision', 'NONE')}`"
                   + (f" | Gates tripped: `{', '.join(r.metadata['gates'])}`" if r.metadata.get("gates") else ""),
                   f"- Duration: `{r.duration_seconds}s`",
                   f"- Attempts: `{r.attempts}` | Retries: `{r.retries}` | Rate-limited: `{r.rate_limited}`"])
        if r.error:
            md.extend(fence(r.error))
        if r.output:
            md.extend(fence(r.output[:10000]))
        md.append("")
    md.extend(["## Evidence", "",
               f"- Records: **{len(evidence['records'])}**, chained; head `{evidence['head_sha256'] or '(empty)'}`",
               f"- Signed: **{'yes (HMAC-SHA256)' if evidence['signed'] else 'no'}**"
               + ("" if evidence["signed"] else f" (set {EVIDENCE_KEY_ENV} to sign; unsigned evidence only proves the report matches itself)"),
               f"- Check it: `python3 orchestrator.py --verify {json_path.name} --expect-head {evidence['head_sha256']}`",
               "- Keep the head somewhere this report can't change (a commit, a note to yourself): it is what makes a "
               "regenerated or cut-short report fail verification.", "", f"How the hashes are made: {EVIDENCE_SCHEME}", ""])
    md_path.write_text("\n".join(md), encoding="utf-8")
    return json_path, md_path


def verify_cli(path: Path, expect_head: str | None) -> int:
    try:
        report = json.loads(path.read_text(encoding="utf-8"))
        problems = verify_report(report, evidence_key(), expect_head)
    except (OSError, ValueError) as exc:
        print(f"Can't verify {path}: {exc}")
        return 2
    evidence = report["evidence"]
    if problems:
        print(f"NOT VERIFIED: {path.name}")
        for p in problems:
            print("  - " + p)
        return 1
    n = len(evidence["records"])
    print(f"Verified: {path.name}: {n} evidence record(s), chain intact, every result matches its record.")
    print(f"Head: {evidence['head_sha256']}" + (" (matches the head you gave)" if expect_head else ""))
    if not evidence.get("signed"):
        print(f"Unsigned: this proves the report matches itself. Compare the head with one you saved elsewhere "
              f"(--expect-head), or set {EVIDENCE_KEY_ENV} when running to sign reports.")
    return 0

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
    parser = argparse.ArgumentParser(
        description="Route tasks to Claude Code, Grok, Muse and OpenAI; write JSON + Markdown reports with an evidence ledger.")
    parser.add_argument("tasks_file", type=Path, nargs="?")
    parser.add_argument("--concurrency", type=int, default=8)
    parser.add_argument("--output-dir", type=Path, default=Path("reports"))
    parser.add_argument("--max-calls", type=int, metavar="N", help="provider calls allowed for the whole run (retries count)")
    parser.add_argument("--task-budget", type=float, metavar="SECONDS",
                        help="time each task may take, retries and waits included (a task's budget_seconds can lower it)")
    parser.add_argument("--verify", type=Path, metavar="REPORT_JSON", help="check a report against its evidence and exit")
    parser.add_argument("--expect-head", metavar="SHA256", help="with --verify: the head hash you saved when the report was made")
    args = parser.parse_args(argv)
    if args.verify:
        return verify_cli(args.verify, args.expect_head)
    if args.tasks_file is None:
        parser.error("give a tasks file, or --verify REPORT_JSON")
    logging.basicConfig(level=LOG_LEVEL, format="%(asctime)s | %(levelname)s | %(message)s")
    try:
        tasks = load_tasks(args.tasks_file)
    except (OSError, ValueError) as exc:
        logging.error("Cannot use %s: %s", args.tasks_file, exc)
        return 2
    orchestrator = Orchestrator(concurrency=args.concurrency, max_calls=args.max_calls,
                                task_budget=args.task_budget if args.task_budget and args.task_budget > 0 else None)
    try:
        results = await orchestrator.run(tasks)
    finally:
        await orchestrator.client.aclose()
    json_path, md_path = write_reports(results, args.output_dir)
    logging.info("JSON report: %s", json_path)
    logging.info("Markdown report: %s", md_path)
    logging.info("Evidence head: %s (save it elsewhere; --verify --expect-head checks it)",
                 json.loads(json_path.read_text(encoding="utf-8"))["evidence"]["head_sha256"])
    m = metrics(results)
    return 0 if m["success"] == m["total"] else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(async_main()))
