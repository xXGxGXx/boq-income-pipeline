# Fanning tasks out to several AI models

A multi-model orchestrator routes tasks to Claude Code (repository work), Grok via the xAI API (current events), and a creative model ("Muse"), with rate limits, retries and a JSON + Markdown report. A tested version lives in the user's repository as `orchestrator/orchestrator.py` (18 tests with fake providers: `python3 -m unittest orchestrator/test_orchestrator.py`).

## Safe defaults (keep them)
- **Claude Code read-only by default:** `--allowedTools Read,Grep,Glob`. Widen it (`Read,Edit,Write,Bash`) only for task files the user wrote, and only in an isolated repository, worktree or container: whoever can edit `tasks.json` decides what runs on that machine. Never use `--dangerously-skip-permissions` in it.
- Subprocess with `stdin=DEVNULL` (no waiting on input) and a hard timeout; treat Claude's `is_error: true` as a failure even when the exit code is 0.
- API keys from the environment only; never in task files, reports or logs.
- Don't send library contents to cloud models. If the user wants help with descriptions or tags, send only metadata they choose, never media.

## Bugs to look for in drafts (all seen in real drafts)
- A dataclass field and a read-only `@property` with the same name: the class can't be instantiated. Use a field `provider` plus a method `resolved_provider()` (or a field `provider_override`).
- `float(Retry-After)` crashes on the HTTP-date form; `parse(v) or backoff` ignores a legitimate `0`. Parse seconds or dates, cap the wait (e.g. 120 s).
- A run that ends on 429 reports "failed" with no error text; malformed replies escape as unhandled exceptions and lose attempt counts.
- `isinstance(result, Exception)` misses `CancelledError` (a `BaseException`); check `BaseException`.
- `priority` accepted but never used; results sorted alphabetically instead of in file order.
- Report fences broken by output that contains ``` (use four backticks); two runs in the same second overwrite each other's reports (add a random suffix).

## Testing without keys
`httpx.MockTransport` for the HTTP providers; a tiny executable script standing in for `claude` that prints the JSON shape; set `<PROVIDER>_RETRY_BASE_DELAY=0` so retries are instant.
