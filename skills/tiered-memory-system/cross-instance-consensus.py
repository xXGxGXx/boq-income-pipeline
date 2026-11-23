#!/usr/bin/env python3
"""Cross-Instance Consensus — Tiered Memory System v2, Module: Consensus.

If two separate AI sessions both surface the same memory unprompted in
different contexts, that is a stronger promotion signal than any single
access count, because the fact earned relevance independently.

Telemetry: each session logs unprompted memory surfacing events to a
shared Drive file consensus-events-YYYY-MM-DD.jsonl (append-only).
A background job reads the day's events, groups by memory hash, and
flags any memory appearing in 2+ independent sessions.

Privacy boundary: only memory text (truncated) and session IDs are logged.
No conversation content, no credentials.
"""
import json, hashlib, datetime

def log_unprompted_surface(memory_text, session_id, context_domain):
    event = {
        "ts": datetime.datetime.utcnow().isoformat() + "Z",
        "memory_hash": hashlib.sha256(memory_text.encode()).hexdigest()[:16],
        "memory_preview": memory_text[:120],
        "session_id": session_id,
        "domain": context_domain
    }
    return event

def detect_consensus(events):
    from collections import defaultdict
    groups = defaultdict(list)
    for e in events:
        groups[e["memory_hash"]].append(e)
    consensus = []
    for h, evs in groups.items():
        sessions = {e["session_id"] for e in evs}
        if len(sessions) >= 2:
            consensus.append({
                "memory_hash": h,
                "memory_preview": evs[0]["memory_preview"],
                "independent_sessions": len(sessions),
                "signal": "CONSENSUS_PROMOTION_CANDIDATE"
            })
    return consensus
