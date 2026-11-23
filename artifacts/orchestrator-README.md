# Multi-Model Orchestrator

Routes tasks to Claude Code CLI (coding/repo), Grok Plus API (web/social), and Muse (creative/multimedia). Parallel execution, token-bucket rate limits, exponential-backoff retries, structured JSON + Markdown reports.

```bash
pip install -r requirements.txt
export GROK_API_KEY=...
export MUSE_API_KEY=...
python orchestrator.py --tasks example_tasks.json
```

Reports land in `orchestrator_reports/`.
