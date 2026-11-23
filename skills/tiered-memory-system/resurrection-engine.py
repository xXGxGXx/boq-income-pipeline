#!/usr/bin/env python3
"""Resurrection Engine — Tiered Memory System v2, Module: Resurrection Logging.

When a faded (tier-2 or lower) memory is mentioned again in conversation,
this module records WHY it mattered: load-bearing vs noise.
The system learns which dormant facts deserve revival.

Usage: called at end of each durable turn. Pass the memory text and the
context in which it resurfaced. Output: a resurrection log entry appended
to Drive primary + backup as resurrection-log-YYYY-MM-DD.md.
"""
import json, datetime

def log_resurrection(memory_text, context, tier_before, surfaces):
    entry = {
        "ts": datetime.datetime.utcnow().isoformat() + "Z",
        "memory": memory_text[:200],
        "context": context[:200],
        "tier_before": tier_before,
        "surfaces_checked": surfaces,
        "classification": None  # filled by scoring pass
    }
    # Scoring pass (cheap model): classify as LOAD_BEARING or NOISE
    # based on whether the resurfacing context matches the memory's
    # original topic domain. Mismatch → NOISE, no promotion.
    # Match → LOAD_BEARING → propose promotion to tier 1.
    return entry

def propose_promotion(entry):
    if entry["classification"] == "LOAD_BEARING":
        return {"action": "PROMOTE", "memory": entry["memory"], "to_tier": 1}
    return {"action": "NOOP"}
