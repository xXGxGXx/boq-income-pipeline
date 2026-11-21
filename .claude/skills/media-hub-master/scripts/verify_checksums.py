#!/usr/bin/env python3
"""verify_checksums.py - check files against a checksum list, and check or rebuild split archives. Read-only by default.

Check a folder against a manifest (format detected automatically):
    python3 verify_checksums.py MANIFEST [--root DIR] [--extra] [--report report.json]
      sha256sum text     "<hex>  name"  or  "<hex> *name"          (sha256sum, shasum -a 256)
      BSD style          "SHA256 (name) = <hex>"
      JSON               a list, or {"media"|"files"|"items"|"entries": [...]}, entries with sha256 + name/path/relativePath/file,
                         optional size/bytes (Media Hub's media-manifest.json, recovered-media manifests, ...)
    --root defaults to the manifest's folder. Entries are looked up by their path, then by file name alone.
    --extra also lists files in the folder that the manifest does not mention.

Split archives (e.g. vault.zip.part000 ... vault.zip.part263):
    python3 verify_checksums.py --join "vault.zip.part*" --expect <sha256 of the original>          # check only: writes nothing
    python3 verify_checksums.py --join "vault.zip.part*" --out vault.zip [--expect <sha256>]         # rebuild
    Parts are ordered by their number and must run without gaps. Checking needs no extra disk space: the parts are hashed
    in order exactly as `cat parts > file` would join them. Rebuilding writes to a temporary file and keeps it only if
    the hash matches --expect (when given); an existing --out is never overwritten. Add --parts-manifest LIST to also
    check every part against its own checksum.

Exit code 0 when everything matches, 1 when something is missing or different, 2 for unusable input.
"""
import argparse, glob, hashlib, json, os, re, sys

HEX = re.compile(r"^[0-9a-fA-F]{64}$")
CHUNK = 1 << 20


def sha256(path, h=None):
    h = h or hashlib.sha256()
    with open(path, "rb") as f:
        for c in iter(lambda: f.read(CHUNK), b""):
            h.update(c)
    return h


def safe_rel(name):
    """Manifest names come from elsewhere: refuse absolute paths and anything that climbs out of the root."""
    name = str(name).replace("\\", "/")
    parts = [p for p in name.split("/") if p not in ("", ".")]
    if not parts or name.startswith("/") or re.match(r"^[A-Za-z]:", name) or any(p == ".." for p in parts) or "\x00" in name:
        return None
    return "/".join(parts)


def parse_manifest(path):
    """Return [{'name', 'sha256', 'size'?}] from any supported format."""
    with open(path, encoding="utf-8-sig", errors="replace") as f:
        text = f.read()
    s = text.lstrip()
    if s[:1] in "[{":
        data = json.loads(text)
        if isinstance(data, dict):
            data = next((data[k] for k in ("media", "files", "items", "entries") if isinstance(data.get(k), list)), None)
            if data is None:
                raise ValueError("JSON manifest has no list of files (media / files / items / entries)")
        out = []
        for e in data:
            if not isinstance(e, dict):
                continue
            digest = str(e.get("sha256") or e.get("hash") or "")
            name = next((e[k] for k in ("relativePath", "path", "name", "file", "filename") if isinstance(e.get(k), str) and e.get(k)), None)
            if HEX.match(digest) and name:
                size = e.get("size", e.get("bytes"))
                out.append({"name": name, "sha256": digest.lower(), "size": size if isinstance(size, int) else None,
                            "alt": [e[k] for k in ("name", "file", "filename") if isinstance(e.get(k), str) and e.get(k) != name]})
        return out
    out = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r"^SHA256 \((.+)\) = ([0-9a-fA-F]{64})$", line)
        if m:
            out.append({"name": m.group(1), "sha256": m.group(2).lower(), "size": None, "alt": []}); continue
        m = re.match(r"^([0-9a-fA-F]{64}) [ *](.+)$", line)
        if m:
            out.append({"name": m.group(2), "sha256": m.group(1).lower(), "size": None, "alt": []})
    return out


def find(root, entry, by_name):
    for cand in [entry["name"]] + entry.get("alt", []):
        rel = safe_rel(cand)
        if rel is None:
            continue
        p = os.path.join(root, *rel.split("/"))
        if os.path.isfile(p) and not os.path.islink(p):
            return p
    hits = by_name.get(os.path.basename(str(entry["name"]).replace("\\", "/")), [])
    return hits[0] if len(hits) == 1 else None


def verify(manifest, root, extra=False):
    entries = parse_manifest(manifest)
    if not entries:
        raise ValueError("no checksum entries found in %s" % manifest)
    by_name, all_files = {}, set()
    for dp, dns, fns in os.walk(root, followlinks=False):
        dns[:] = [d for d in dns if not d.startswith(".")]
        for f in fns:
            p = os.path.join(dp, f)
            if os.path.islink(p) or f.startswith("."):
                continue
            by_name.setdefault(f, []).append(p); all_files.add(os.path.abspath(p))
    rows, used = [], {os.path.abspath(manifest)}
    for e in entries:
        if safe_rel(e["name"]) is None and not e.get("alt"):
            rows.append({"name": e["name"], "status": "refused", "detail": "unsafe path in manifest"}); continue
        p = find(root, e, by_name)
        if not p:
            rows.append({"name": e["name"], "status": "missing"}); continue
        used.add(os.path.abspath(p))
        size = os.path.getsize(p)
        if e["size"] is not None and size != e["size"]:
            rows.append({"name": e["name"], "status": "different", "detail": "size %d, expected %d" % (size, e["size"]), "path": p}); continue
        got = sha256(p).hexdigest()
        rows.append({"name": e["name"], "status": "ok" if got == e["sha256"] else "different", "path": p,
                     **({} if got == e["sha256"] else {"detail": "sha256 %s…, expected %s…" % (got[:12], e["sha256"][:12])})})
    if extra:
        for p in sorted(all_files - used):
            rows.append({"name": os.path.relpath(p, root), "status": "extra"})
    return rows


def part_number(path):
    m = re.search(r"(\d+)(?!.*\d)", os.path.basename(path))
    return int(m.group(1)) if m else None


def join(pattern, out=None, expect=None, parts_manifest=None):
    parts = [p for p in glob.glob(pattern) if os.path.isfile(p)]
    if not parts:
        raise ValueError("no files match %r" % pattern)
    nums = [part_number(p) for p in parts]
    if None in nums:
        raise ValueError("every part needs a number in its name: %s" % parts[nums.index(None)])
    parts = [p for _, p in sorted(zip(nums, parts))]; nums = sorted(nums)
    gaps = [n for n in range(nums[0], nums[-1] + 1) if n not in set(nums)]
    if gaps or len(set(nums)) != len(nums):
        raise ValueError("parts are not a complete run: missing %s" % (gaps[:10] or "none, but numbers repeat"))
    part_sums = {}
    if parts_manifest:
        part_sums = {os.path.basename(e["name"]): e["sha256"] for e in parse_manifest(parts_manifest)}
    if out and os.path.exists(out):
        raise ValueError("%s already exists; it is never overwritten" % out)
    whole, bad_parts, total = hashlib.sha256(), [], 0
    tmp = (out + ".partial-%d" % os.getpid()) if out else None
    sink = open(tmp, "xb") if tmp else None
    try:
        for p in parts:
            ph = hashlib.sha256()
            with open(p, "rb") as f:
                for c in iter(lambda: f.read(CHUNK), b""):
                    whole.update(c); ph.update(c); total += len(c)
                    if sink:
                        sink.write(c)
            want = part_sums.get(os.path.basename(p))
            if want and ph.hexdigest() != want:
                bad_parts.append(os.path.basename(p))
        if sink:
            sink.flush(); os.fsync(sink.fileno()); sink.close(); sink = None
        digest = whole.hexdigest()
        ok = (not expect or digest == expect.lower()) and not bad_parts
        if tmp:
            if ok:
                os.link(tmp, out); os.unlink(tmp)          # link fails if out appeared meanwhile: still never overwrites
            else:
                os.unlink(tmp)
        return {"parts": len(parts), "first": os.path.basename(parts[0]), "last": os.path.basename(parts[-1]), "bytes": total,
                "sha256": digest, "expected": expect, "matches": ok, "bad_parts": bad_parts, "written": out if (out and ok) else None}
    finally:
        if sink:
            sink.close()
        if tmp and os.path.exists(tmp):
            os.unlink(tmp)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Check files against a checksum list, or check / rebuild split archives (read-only by default).")
    ap.add_argument("manifest", nargs="?"); ap.add_argument("--root"); ap.add_argument("--extra", action="store_true")
    ap.add_argument("--report", help="also write the results as JSON")
    ap.add_argument("--join", metavar="GLOB"); ap.add_argument("--out"); ap.add_argument("--expect", metavar="SHA256")
    ap.add_argument("--parts-manifest", metavar="LIST")
    a = ap.parse_args(argv)
    try:
        if a.join:
            if a.expect and not HEX.match(a.expect):
                raise ValueError("--expect must be a 64-character SHA-256")
            r = join(a.join, a.out, a.expect, a.parts_manifest)
            print("%d parts (%s … %s), %.1f MB, sha256 %s" % (r["parts"], r["first"], r["last"], r["bytes"] / 1048576, r["sha256"]))
            if a.expect:
                print("matches the original" if r["sha256"] == a.expect.lower() else "DOES NOT match the expected sha256 %s" % a.expect)
            if r["bad_parts"]:
                print("parts that differ from their checksums:", ", ".join(r["bad_parts"]))
            print("written: %s" % r["written"] if r["written"] else ("nothing written (check only)" if not a.out else "nothing written: it did not match"))
            if a.report:
                with open(a.report, "w") as f:
                    json.dump(r, f, indent=1)
            return 0 if r["matches"] else 1
        if not a.manifest:
            ap.error("give a manifest, or --join GLOB")
        root = a.root or os.path.dirname(os.path.abspath(a.manifest))
        rows = verify(a.manifest, root, a.extra)
    except (OSError, ValueError) as exc:
        print("error:", exc, file=sys.stderr); return 2
    counts = {}
    for r in rows:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
        if r["status"] != "ok":
            print("  %-9s %s%s" % (r["status"].upper(), r["name"], ("  (" + r["detail"] + ")") if r.get("detail") else ""))
    print("%d checked: %s" % (len(rows), ", ".join("%d %s" % (n, k) for k, n in sorted(counts.items()))))
    print("Original files were only read." if rows else "")
    if a.report:
        with open(a.report, "w") as f:
            json.dump({"manifest": a.manifest, "root": root, "counts": counts, "files": rows}, f, indent=1)
    return 0 if all(r["status"] in ("ok", "extra") for r in rows) else 1


if __name__ == "__main__":
    sys.exit(main())
