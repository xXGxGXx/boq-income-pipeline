#!/usr/bin/env python3
"""Fetch skill instruction text (markdown/json only) at pinned commits into skills-data/.
No media, zips, images, scripts or evals are fetched."""
import json, hashlib, urllib.request, os, pathlib

SOURCES = [
  # (skill name, repo, commit, dir, files, description_override, kind)
  ("recall-vault", "xXGxGXx/boq-income-pipeline", "6806ab9744cf3f5a74f3f96551698811245f9e0b", "skills/recall-vault",
   ["SKILL.md", "README.md", "BLUEPRINT.md", "schemas/catalog.schema.json"], "own"),
  ("media-hub-master", "xXGxGXx/boq-income-pipeline", "6806ab9744cf3f5a74f3f96551698811245f9e0b", ".claude/skills/media-hub-master",
   ["SKILL.md", "references/app.md", "references/merging.md", "references/orchestrator.md", "references/originals.md",
    "references/other-skills.md", "references/publishing.md", "references/server.md", "references/testing.md"], "own"),
  ("clip-desk", "xXGxGXx/boq-income-pipeline", "fb372e372431b37172afc6dbfaa172c4be218a17", "skills/clip-desk",
   ["SKILL.md"], "own"),
  ("skill-creator", "anthropics/skills", "e4bb5d960d87126ff3b3a8af1a104b7db67560ba", "skills/skill-creator",
   ["SKILL.md", "LICENSE.txt", "references/schemas.md", "agents/analyzer.md", "agents/comparator.md", "agents/grader.md"], "upstream"),
]

def blob_sha(b):
    return hashlib.sha1(b"blob %d\0" % len(b) + b).hexdigest()

out = pathlib.Path("skills-data"); manifest = []
for name, repo, commit, d, files, kind in SOURCES:
    entry = {"name": name, "repo": repo, "commit": commit, "dir": d, "kind": kind, "files": []}
    for f in files:
        url = f"https://raw.githubusercontent.com/{repo}/{commit}/{d}/{f}"
        b = urllib.request.urlopen(url, timeout=30).read()
        p = out / name / f; p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(b)
        entry["files"].append({"path": f, "repoPath": f"{d}/{f}", "size": len(b), "gitBlobSha": blob_sha(b),
                               "sha256": hashlib.sha256(b).hexdigest()})
    manifest.append(entry)
(out / "manifest.json").write_text(json.dumps(manifest, indent=2))
for e in manifest:
    for f in e["files"]: print(e["name"], f["repoPath"], f["size"], f["gitBlobSha"])
