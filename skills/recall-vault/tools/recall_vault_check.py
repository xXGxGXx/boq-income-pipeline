#!/usr/bin/env python3
"""Read-only Recall Vault catalog relationship checker (Python standard library only)."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

CHILD_ROLES = {"poster", "playable"}
PARENT_ROLES = {"original", "plate", "loop", "note", "client"}
ALLOWED_ROLES = CHILD_ROLES | PARENT_ROLES


def _items_from(data: Any) -> list[dict[str, Any]]:
    if isinstance(data, list):
        raw = data
    elif isinstance(data, dict) and isinstance(data.get("items"), list):
        raw = data["items"]
    else:
        raise ValueError("catalog must be a list or an object with an 'items' list")
    if not raw:
        raise ValueError("catalog contains no items")
    if any(not isinstance(item, dict) for item in raw):
        raise ValueError("every catalog item must be an object")
    return raw


def check_catalog(data: Any, strict_links: bool = False) -> dict[str, Any]:
    """Validate IDs and parent links without touching referenced files."""
    items = _items_from(data)
    findings: list[dict[str, str]] = []
    by_code: dict[str, list[dict[str, Any]]] = {}

    for index, item in enumerate(items, 1):
        code, role = item.get("code"), item.get("role")
        if not isinstance(code, str) or not code or code.strip() != code:
            findings.append({"severity": "error", "code": str(code or f"item-{index}"),
                             "issue": "invalid_code", "detail": "code must be a non-empty trimmed string"})
            continue
        if any(ch in code for ch in ("/", "\\", "\x00")):
            findings.append({"severity": "error", "code": code, "issue": "invalid_code",
                             "detail": "code must be an identifier, not a path"})
            continue
        by_code.setdefault(code, []).append(item)
        if role not in ALLOWED_ROLES:
            findings.append({"severity": "error", "code": code, "issue": "invalid_role",
                             "detail": f"role must be one of {', '.join(sorted(ALLOWED_ROLES))}"})

    for code, matches in by_code.items():
        if len(matches) > 1:
            findings.append({"severity": "error", "code": code, "issue": "duplicate_code",
                             "detail": f"code appears {len(matches)} times"})

    for item in items:
        code, role = item.get("code"), item.get("role")
        if not isinstance(code, str) or not code or role not in ALLOWED_ROLES:
            continue
        if role in CHILD_ROLES:
            suffix = f"-{role}"
            if not code.endswith(suffix):
                findings.append({"severity": "error", "code": code, "issue": "invalid_child_suffix",
                                 "detail": f"{role} records must end with {suffix}"})
                continue
            parent_code = code.rsplit("-", 1)[0]
            declared_parent = item.get("parent")
            if declared_parent is not None and declared_parent != parent_code:
                findings.append({"severity": "error", "code": code, "issue": "parent_mismatch",
                                 "detail": f"derived parent is {parent_code}, but declared parent differs"})
                continue
            parents = by_code.get(parent_code, [])
            if len(parents) != 1 or parents[0].get("role") not in PARENT_ROLES:
                findings.append({"severity": "error", "code": code, "issue": "missing_parent",
                                 "detail": f"expected exactly one non-derivative parent record: {parent_code}"})
        if role == "client" and not (isinstance(item.get("link"), str) and item["link"].strip()):
            findings.append({"severity": "error" if strict_links else "warning", "code": code,
                             "issue": "client_link_missing", "detail": "client record has no link"})

    errors = sum(f["severity"] == "error" for f in findings)
    warnings = sum(f["severity"] == "warning" for f in findings)
    return {"ok": errors == 0, "checked": len(items), "errors": errors,
            "warnings": warnings, "findings": findings}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("catalog", type=Path, help="local catalog JSON; read-only")
    parser.add_argument("--strict-links", action="store_true",
                        help="treat missing client links as errors")
    parser.add_argument("--report", type=Path,
                        help="write a JSON report to a new file (never overwrites)")
    args = parser.parse_args(argv)
    try:
        if args.catalog.is_symlink() or not args.catalog.is_file():
            raise ValueError("catalog must be an existing regular file, not a symlink")
        data = json.loads(args.catalog.read_text(encoding="utf-8"))
        report = check_catalog(data, strict_links=args.strict_links)
        if args.report:
            if args.report.exists():
                raise ValueError(f"report already exists; refusing to overwrite: {args.report}")
            args.report.parent.mkdir(parents=True, exist_ok=True)
            with args.report.open("x", encoding="utf-8") as handle:
                json.dump(report, handle, indent=2, ensure_ascii=False)
                handle.write("\n")
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    print(f"{report['checked']} checked: {report['errors']} errors, {report['warnings']} warnings")
    for finding in report["findings"]:
        print(f"{finding['severity'].upper():7} {finding['code']}: {finding['issue']} ({finding['detail']})")
    return 1 if report["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
