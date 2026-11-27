"""Episode log (Module A): append-only, hash-chained, and forgettable.

Each record's hash covers the SHA-256 of its data, not the data itself, so a
record's content can be forgotten (replaced by a tombstone) without breaking
the chain. "Forget" therefore reaches the log too, and `verify` still proves
nothing else was edited, moved, added or removed.

The log holds private material. It refuses to live inside a git working tree,
because this repository is public.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
from pathlib import Path

DEFAULT_HOME = Path(os.environ.get("AI_EXTENSION_HOME", Path.home() / ".ai-extension"))
SCHEME = ("sha256 over canonical JSON (sorted keys, no spaces, UTF-8) of "
          "{seq, ts, kind, data_sha256, prev}; data_sha256 = sha256 of canonical JSON of data")


def canonical(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def sha(obj) -> str:
    return hashlib.sha256(canonical(obj)).hexdigest()


class InsideRepository(Exception):
    pass


def inside_git_tree(path: Path) -> Path | None:
    for parent in [path, *path.parents]:
        if (parent / ".git").exists():
            return parent
    return None


class EpisodeLog:
    def __init__(self, path: Path | str | None = None, key: bytes | None = None):
        self.path = Path(path) if path else DEFAULT_HOME / "episodes.jsonl"
        repo = inside_git_tree(self.path.resolve().parent)
        if repo is not None:
            raise InsideRepository(f"the episode log holds private data and must not live in a git tree ({repo})")
        self.key = key if key is not None else (os.environ.get("ORCHESTRATOR_EVIDENCE_KEY") or "").encode() or None

    def _records(self) -> list[dict]:
        if not self.path.exists():
            return []
        return [json.loads(line) for line in self.path.read_text(encoding="utf-8").splitlines() if line.strip()]

    def _seal(self, rec: dict) -> dict:
        head = {k: rec[k] for k in ("seq", "ts", "kind", "data_sha256", "prev")}
        rec["sha256"] = sha(head)
        if self.key:
            rec["hmac"] = hmac.new(self.key, rec["sha256"].encode(), hashlib.sha256).hexdigest()
        return rec

    def append(self, kind: str, data: dict, ts: str | None = None) -> dict:
        recs = self._records()
        prev = recs[-1]["sha256"] if recs else "0" * 64
        rec = {"seq": len(recs), "ts": ts or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
               "kind": kind, "data": data, "data_sha256": sha(data), "prev": prev}
        rec = self._seal(rec)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        return rec

    def forget(self, predicate) -> int:
        """Replace the data of every record where predicate(data) is true with a tombstone.

        The chain still verifies (it covers data_sha256, which is kept). Returns
        how many records were forgotten.
        """
        recs = self._records()
        n = 0
        for r in recs:
            if r.get("data") is not None and predicate(r["data"]):
                r["data"] = None
                r["forgotten"] = True
                n += 1
        if n:
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in recs), encoding="utf-8")
            tmp.replace(self.path)
        return n

    def verify(self) -> list[str]:
        """Every problem found; empty means the log is intact."""
        problems = []
        prev = "0" * 64
        for i, r in enumerate(self._records()):
            where = f"record {i}"
            if r.get("seq") != i:
                problems.append(f"{where}: sequence number {r.get('seq')} (records removed, added or moved)")
            if r.get("prev") != prev:
                problems.append(f"{where}: does not follow the previous record")
            head = {k: r.get(k) for k in ("seq", "ts", "kind", "data_sha256", "prev")}
            if sha(head) != r.get("sha256"):
                problems.append(f"{where}: header changed after it was written")
            if not r.get("forgotten") and sha(r.get("data")) != r.get("data_sha256"):
                problems.append(f"{where}: data changed after it was written")
            if self.key and r.get("hmac") != hmac.new(self.key, str(r.get("sha256")).encode(), hashlib.sha256).hexdigest():
                problems.append(f"{where}: signature does not match the key")
            prev = r.get("sha256")
        return problems

    def __iter__(self):
        return iter(self._records())
