#!/usr/bin/env python3
"""Mirror a "downloadable library" HTML page to a plain folder tree, byte-for-byte.

The page embeds every file as a data: URI inside a JS array
(`var ITEMS = [ {id, title, file, asset, mime, size, path, ...}, ... ]`).
Each asset is decoded VERBATIM (nothing re-encoded or recompressed), written under
<out>/files/, hashed, and recorded in <out>/manifest.json so originals can be verified later.

Usage: python3 mirror_extract.py LIBRARY.html OUT_DIR [--array ITEMS]
Needs python3 + node. Node evaluates the array literal in a bare VM context; only run on pages you trust.
"""
import argparse, base64, collections, hashlib, json, os, re, subprocess, sys, tempfile

NODE_EVAL = r"""
const fs = require('fs'), vm = require('vm');
const s = fs.readFileSync(process.argv[2], 'utf8');
const name = process.argv[3];
const a = s.indexOf('"use strict";');
const i = s.indexOf('var ' + name, a < 0 ? 0 : a);
if (i < 0) { console.error('array not found: ' + name); process.exit(2); }
const j = s.indexOf('\n];', i) + 3;
let code = (a >= 0 ? s.slice(a, j) : s.slice(i, j)).replace('"use strict";', '');
code = code.replace(/^var (\w+)\s*=/gm, 'this.$1 =');
const ctx = {}; vm.createContext(ctx); vm.runInContext(code, ctx);
fs.writeFileSync(process.argv[4], JSON.stringify(ctx[name]));
"""
MAGIC = [(b"\xff\xd8\xff", "image/jpeg"), (b"\x89PNG\r\n\x1a\n", "image/png"), (b"GIF8", "image/gif"), (b"%PDF", "application/pdf")]

def sniff(d):
    for sig, m in MAGIC:
        if d.startswith(sig): return m
    if d[:4] == b"RIFF" and d[8:12] == b"WEBP": return "image/webp"
    if d[4:8] == b"ftyp": return "video/mp4"
    if d[:4] == b"\x1a\x45\xdf\xa3": return "video/webm"
    return None

def load_items(html, array):
    with tempfile.TemporaryDirectory() as td:
        js, out = os.path.join(td, "e.js"), os.path.join(td, "o.json")
        open(js, "w").write(NODE_EVAL)
        r = subprocess.run(["node", js, html, array, out], capture_output=True, text=True)
        if r.returncode: sys.exit("node failed: " + r.stderr[:500])
        return json.load(open(out))

def safe_rel(p):
    p = re.sub(r"^workspace/", "", p or "").replace("\\", "/").lstrip("/")
    return "/".join(x for x in p.split("/") if x not in ("", ".", ".."))

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("html"); ap.add_argument("out"); ap.add_argument("--array", default="ITEMS")
    a = ap.parse_args()
    items = load_items(a.html, a.array)
    os.makedirs(os.path.join(a.out, "files"), exist_ok=True); os.makedirs(os.path.join(a.out, "notes"), exist_ok=True)
    manifest, by_hash, used = [], collections.defaultdict(list), set()
    for it in items:
        rec = {k: it.get(k) for k in ("id","title","file","mime","size","type","collection","tags","note","path","filed","dims","url")}
        m = re.match(r"data:([^;,]*)(;base64)?,(.*)$", it.get("asset") or "", re.S)
        if m:
            raw = base64.b64decode(m.group(3)) if m.group(2) else m.group(3).encode()
            rel = safe_rel(it.get("path")) or (it.get("file") or "item-%s" % it["id"])
            if rel in used: rel = "%s__id%s" % (rel, it["id"])
            used.add(rel)
            dest = os.path.join(a.out, "files", rel); os.makedirs(os.path.dirname(dest), exist_ok=True)
            open(dest, "wb").write(raw)
            h = hashlib.sha256(raw).hexdigest(); sn = sniff(raw); dm = it.get("mime")
            rec.update(mirror_path="files/" + rel, sha256=h, bytes=len(raw), size_matches_declared=(it.get("size") in (None, len(raw))),
                       sniffed_mime=sn, mime_mismatch=bool(sn and dm and sn != dm and dm != "application/octet-stream"))
            by_hash[h].append(it["id"])
        elif it.get("body"):
            rel = "notes/%03d-%s.txt" % (it["id"], re.sub(r"[^A-Za-z0-9]+", "-", it.get("title") or "note").strip("-")[:60])
            raw = it["body"].encode("utf-8"); open(os.path.join(a.out, rel), "wb").write(raw)
            rec.update(mirror_path=rel, sha256=hashlib.sha256(raw).hexdigest(), bytes=len(raw))
        else:
            rec.update(mirror_path=None, note_only=True)
        manifest.append(rec)
    dups = {h: ids for h, ids in by_hash.items() if len(ids) > 1}
    json.dump({"source_html": os.path.basename(a.html), "source_sha256": hashlib.sha256(open(a.html, "rb").read()).hexdigest(),
               "count": len(manifest), "items": manifest, "duplicates": dups}, open(os.path.join(a.out, "manifest.json"), "w"), indent=1, ensure_ascii=False)
    print("items: %d | files: %d | notes: %d | duplicate groups: %d | type mismatches: %d" % (len(manifest),
          sum(1 for r in manifest if (r.get("mirror_path") or "").startswith("files/")),
          sum(1 for r in manifest if (r.get("mirror_path") or "").startswith("notes/")), len(dups), sum(1 for r in manifest if r.get("mime_mismatch"))))

if __name__ == "__main__": main()
