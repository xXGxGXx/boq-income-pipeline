# Multi-model orchestrator

Routes a list of tasks to **Claude Code** (repository work), **Grok** via the xAI API (current events and social synthesis) or **Muse** (creative work), runs them concurrently with rate limits and retries, and writes a JSON + Markdown report.

```
pip install httpx
export XAI_API_KEY=...                                   # only for Grok tasks
export MUSE_API_URL=... MUSE_API_KEY=...                 # only for Muse tasks
export CLAUDE_WORKDIR=/path/to/repo                      # where Claude Code works
python3 orchestrator.py tasks.example.json --concurrency 4 --output-dir reports
python3 -m unittest test_orchestrator.py                 # 18 tests, fake providers: no keys, no network
```

- **Routing:** an explicit `provider` wins; else `task_type` (coding / realtime / creative …); else keyword scoring, with Grok as the fallback.
- **Order:** lower `priority` starts first; the report keeps your file order.
- **Retries:** 429, 502–504 and network errors, with exponential backoff and jitter; `Retry-After` is honoured in seconds or as a date (capped at 120 s). Other 4xx errors aren't retried.
- **Claude Code is read-only by default** (`CLAUDE_ALLOWED_TOOLS=Read,Grep,Glob`). Widen it (e.g. `Read,Edit,Write,Bash`) only for task files you wrote yourself, and run it in an isolated repository, worktree or container: whoever can edit `tasks.json` decides what Claude Code is asked to do on that machine. Its `is_error` result counts as a failure.
- **Muse** request and response fields are placeholders; adapt `run_muse` / `parse_muse_response` to your deployment. Check the Grok model names your xAI account offers (`GROK_MODEL`).
- **Exit code:** 0 when every task succeeded, 1 otherwise, 2 when the tasks file can't be used (it names the problem: missing prompt, unknown provider, duplicate id).

Fixed from the draft it came from: `Task` couldn't be created (a `provider` field and a read-only `provider` property shared one name, and the loader passed a nonexistent `_provider`); an HTTP-date `Retry-After` crashed the retry loop; malformed replies escaped as unhandled errors; a run that ended on a rate limit reported no error; `priority` was ignored; the Claude subprocess could wait for keyboard input; report output containing ``` could break the Markdown.


## Optional OpenAI Responses API provider

Set \`OPENAI_API_KEY\` and \`OPENAI_MODEL\` to a model enabled for your project. The model name is deliberately not guessed.

Use \`"provider": "openai"\` on a task or \`"task_type": "openai"\`. Set \`"web_search": true\` in that task's context to enable the Responses API \`web_search\` tool; it is off by default. The adapter sends \`store: false\`, parses output text and URL citations, and records response ID/model/token usage in the report.

Example task:
\`\`\`json
{
  "id": "research-current",
  "provider": "openai",
  "prompt": "Research the current state of the topic and cite primary sources.",
  "context": {"web_search": true, "reasoning_effort": "high", "max_output_tokens": 3000}
}
\`\`\`

### Data handling gate

Tasks with \`context.data_classification\` set to \`private\`, \`client\`, \`financial\`, \`health\`, \`sensitive\` or \`restricted\` are blocked before any provider call unless that task also sets \`allow_external_processing: true\`. This is an operator policy switch, **not** an automatic content scanner. Classify tasks accurately and keep private records out of task files. The gate applies to every provider, not only OpenAI. Reports record the classification and whether the override was explicitly set.

OpenAI states API data is not used for model training by default, but abuse-monitoring logs may be retained for up to 30 days. Responses application-state retention depends on \`store\` and endpoint/features; this adapter sets \`store: false\`, which is not a promise of zero retention. Zero Data Retention requires eligible account configuration. See [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data).
