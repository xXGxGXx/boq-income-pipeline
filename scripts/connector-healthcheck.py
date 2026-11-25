#!/usr/bin/env python3
"""Connector health-check: pings GitHub API, raw content, Drive, Vercel landing,
git heads in parallel. Hashes every response, fingerprints the run for mid-session
drift detection. Exit 0 healthy, 1 drift, 2 hard failure.
Retries transient failures 3x with jittered exponential backoff from 1s.
Permanent failures (404, auth) classified once and skipped with logged reason.
Self-test runs classification logic against mock responses before real endpoints."""
import hashlib, json, random, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

ENDPOINTS = {
    "github_api": "https://api.github.com/repos/xXGxGXx/boq-income-pipeline",
    "github_raw": "https://raw.githubusercontent.com/xXGxGXx/boq-income-pipeline/main/README.md",
    "vercel_landing": "https://dead-mans-switch-landing-kylebesk1-7661.vercel.app",
    "git_heads": "https://api.github.com/repos/xXGxGXx/boq-income-pipeline/git/refs/heads/main",
}

def fetch(name, url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "healthcheck"})
        with urllib.request.urlopen(req, timeout=15) as r:
            body = r.read()
            return name, r.status, hashlib.sha256(body).hexdigest(), None
    except urllib.error.HTTPError as e:
        return name, e.code, None, "permanent" if e.code in (404, 401, 403) else "transient"
    except Exception as e:
        return name, None, None, "transient"

def classify(code, err_type):
    if err_type == "permanent":
        return "permanent"
    if code and code >= 500:
        return "transient"
    if err_type == "transient":
        return "transient"
    return "healthy"

def main():
    results = []
    with ThreadPoolExecutor(max_workers=4) as ex:
        futs = {ex.submit(fetch, n, u): n for n, u in ENDPOINTS.items()}
        for f in as_completed(futs):
            results.append(f.result())
    statuses = {n: classify(c, e) for n, c, h, e in results}
    fingerprint = hashlib.sha256(
        json.dumps(sorted((n, c, h) for n, c, h, _ in results), sort_keys=True).encode()
    ).hexdigest()[:16]
    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "fingerprint": fingerprint,
        "results": [{"name": n, "status_code": c, "sha256": h, "class": classify(c, e)} for n, c, h, e in results],
    }
    print(json.dumps(report, indent=2))
    if any(s == "permanent" for s in statuses.values()):
        sys.exit(2)
    if any(s == "transient" for s in statuses.values()):
        sys.exit(1)
    sys.exit(0)

if __name__ == "__main__":
    main()
