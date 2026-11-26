#!/usr/bin/env python3
"""Preview or create the empty Recall Vault directory map. Never creates files or moves media."""
from __future__ import annotations

import argparse
from pathlib import Path
import sys

FOLDERS = (
    "Shelf/Plates", "Shelf/Loops", "Shelf/Notes", "Shelf/Clients",
    "Derivatives/Posters", "Derivatives/Playables", "Bench/Reports",
    "Backups/Metadata", "private",
)


def plan(root: Path) -> list[Path]:
    return [root / relative for relative in FOLDERS]


def create(root: Path) -> list[Path]:
    root = root.expanduser()
    if root.exists() and not root.is_dir():
        raise ValueError("target root exists and is not a directory")
    for path in plan(root):
        for candidate in (path, *path.parents):
            if candidate == root.parent:
                break
            if candidate.exists() and not candidate.is_dir():
                raise ValueError(f"refusing to replace existing file: {candidate}")
    made = []
    for path in plan(root):
        existed = path.is_dir()
        path.mkdir(parents=True, exist_ok=True)
        if not existed:
            made.append(path)
    return made


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="list directories without creating them")
    mode.add_argument("--create", action="store_true", help="create directories only")
    args = parser.parse_args(argv)
    try:
        paths = plan(args.root.expanduser()) if args.dry_run else create(args.root)
    except (OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    for path in paths:
        print(path)
    print(f"{len(paths)} {'planned' if args.dry_run else 'created'} directories")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
