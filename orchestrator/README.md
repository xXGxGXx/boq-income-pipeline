# Multi-model orchestrator

Routes a list of tasks to **Claude Code** (repository work), **Grok** via the xAI API (current events and social synthesis), **Muse** (creative work) or the **OpenAI Responses API**, runs them concurrently with rate limits and retries behind preflight, risk and budget gates, and writes a JSON + Markdown report with a verifiable evidence ledger.

```
pip install httpx
export XAI_API_KEY=...                                   # only for Grok tasks
export MUSE_API_URL=... MUSE_API_KEY=...                 # only for Muse tasks
export CLAUDE_WORKDIR=/path/to/repo                      # where Claude Code works
python3 orchestrator.py tasks.example.json --concurrency 4 --output-dir reports
python3 orchestrator.py --verify reports/orchestration-….json --expect-head <head>   # check a report later
python3 -m unittest test_orchestrator.py                 # 42 tests, fake providers: no keys, no network
```

- **Routing:** an explicit `provider` wins; else `task_type` (coding / realtime / creative …); else keyword scoring, with Grok as the fallback.
- **Order:** lower `priority` starts first; the report keeps your file order.
- **Retries:** 429, 502–504 and network errors, with exponential backoff and jitter; `Retry-After` is honoured in seconds or as a date (capped at 120 s). Other 4xx errors aren't retried.
- **Claude Code is read-only by default** (`CLAUDE_ALLOWED_TOOLS=Read,Grep,Glob`). Widen it (e.g. `Read,Edit,Write,Bash`) only for task files you wrote yourself, and run it in an isolated repository, worktree or container: whoever can edit `tasks.json` decides what Claude Code is asked to do on that machine. Its `is_error` result counts as a failure.
- **Muse** request and response fields are placeholders; adapt `run_muse` / `parse_muse_response` to your deployment. Check the Grok model names your xAI account offers (`GROK_MODEL`).
- **Exit code:** 0 when every task succeeded, 1 otherwise, 2 when the tasks file can't be used (it names the problem: missing prompt, unknown provider, duplicate id).

Fixed from the draft it came from: `Task` couldn't be created (a `provider` field and a read-only `provider` property shared one name, and the loader passed a nonexistent `_provider`); an HTTP-date `Retry-After` crashed the retry loop; malformed replies escaped as unhandled errors; a run that ended on a rate limit reported no error; `priority` was ignored; the Claude subprocess could wait for keyboard input; report output containing ``` could break the Markdown.


## Gates: checks before and during each task

Every task passes a **preflight** before any provider is contacted. The report records each check as `ALLOW` or `BLOCK`, and a blocked task makes no call at all.

| Gate | Blocks when | Set per task (`context`) or per run |
|---|---|---|
| Data classification | `data_classification` is private, client, financial, health, sensitive or restricted | `allow_external_processing: true` (see below) |
| Write tools (risk) | Claude Code would run with Edit, Write, MultiEdit, NotebookEdit or Bash in `CLAUDE_ALLOWED_TOOLS` | `allow_write_tools: true` on that task |
| Call budget | the run has used its provider calls (each retry counts) | `--max-calls N` |
| Attempts | stops retrying after this many attempts | `max_attempts` (lowers `<PROVIDER>_MAX_ATTEMPTS`) |
| Time budget | the task, retries and waits included, runs past its budget; a retry wait that would cross it isn't started | `budget_seconds`, or `--task-budget SECONDS` for every task (the smaller wins) |

A tripped gate is named in the report (`Gates tripped: …`) and in the evidence, so a stopped task explains itself instead of retrying forever.

## Evidence: reports you can check later

The JSON report ends with an `evidence` section: one record per task, in report order. Each record holds:
- the provider, preflight decision, gates tripped, status, attempts and times;
- SHA-256 hashes of the task (prompt and context, not the text itself), the output and the error;
- `prev_sha256`, the previous record's hash, so the records form a chain.

The exact hashing rule is written into every report (`evidence.scheme`), so anyone can recompute the hashes with any SHA-256 tool. No trust in this script is needed.

`python3 orchestrator.py --verify REPORT.json` re-checks everything and names each problem. It catches:
- an output, status or error edited after the run;
- a record changed, removed, moved or added.

It exits 0 when verified, 1 when anything doesn't match, and 2 when the file isn't a usable report.

Two limits, stated plainly:
- **Unsigned evidence only proves the report matches itself.** Someone who edits a result could recompute every hash. Save the **head** hash somewhere the report can't change, such as a commit, a message to yourself or a note. Then check with `--expect-head <head>`: a regenerated or shortened report fails.
- **Signing:** set `ORCHESTRATOR_EVIDENCE_KEY` (a secret, kept out of this repository) when running, and each record also gets an HMAC-SHA256. Verify with the same key set. A report edited and re-hashed by someone without the key fails, and so does one with its signatures stripped. Without the key, a signed report reports itself as unverifiable rather than passing.

## Optional OpenAI Responses API provider

Set `OPENAI_API_KEY` and `OPENAI_MODEL` to a model enabled for your project. The model name is deliberately not guessed.

Use `"provider": "openai"` on a task or `"task_type": "openai"`. Set `"web_search": true` in that task's context to enable the Responses API `web_search` tool; it is off by default. The adapter sends `store: false`, parses output text and URL citations, and records response ID/model/token usage in the report.

Example task:
```json
{
  "id": "research-current",
  "provider": "openai",
  "prompt": "Research the current state of the topic and cite primary sources.",
  "context": {"web_search": true, "reasoning_effort": "high", "max_output_tokens": 3000}
}
```

### Data handling gate

Tasks with `context.data_classification` set to `private`, `client`, `financial`, `health`, `sensitive` or `restricted` are blocked before any provider call unless that task also sets `allow_external_processing: true`. This is an operator policy switch, **not** an automatic content scanner. Classify tasks accurately and keep private records out of task files. The gate applies to every provider, not only OpenAI. Reports record the classification and whether the override was explicitly set.

OpenAI states API data is not used for model training by default, but abuse-monitoring logs may be retained for up to 30 days. Responses application-state retention depends on `store` and endpoint/features; this adapter sets `store: false`, which is not a promise of zero retention. Zero Data Retention requires eligible account configuration. See [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).
