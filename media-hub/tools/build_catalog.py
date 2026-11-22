#!/usr/bin/env python3
"""Build the Media Hub catalog from the files you already have. Nothing is modified; media is only READ.

Inputs
  --mirror DIR   a folder made by mirror_extract.py (has manifest.json and files/)
  --tsv FILE     media_catalog.tsv (code,title,type,category,source,resolution,tags,link)  [default: found inside the mirror]
  --vault FILE   a hub .html that holds `VAULT_FOLDERS = [...]`                            [optional]
  --descriptions FILE  a scrollable library .html (<li><a href=LINK>code</a><span class="d">text</span>)  [optional]
                 adds long descriptions + audio notes to matching codes, and any codes the TSV lacks
  --codes FILE   JSON {"title prefix": "CODE"} for mirrored files whose titles don't start with their code  [optional, keep it private]
                 (titles like "M1001 — Beach" or "AI-M2001 — Render" are matched automatically)
Output
  --out DIR      catalog.json (+ media_plan.json: which original file feeds which item, with SHA-256)

Rules
  * Originals are never altered. Media is matched to catalog rows by code, then recorded with its SHA-256.
  * The real file type is sniffed from the bytes; a mismatch with the declared type is noted, never "fixed" in place.
  * Workspace index items that belong to the third-party image-transformation bot are left out of the app.
"""
import argparse, csv, hashlib, html, json, os, re, sys, time

EXCLUDE = re.compile(r"nud\.to|nudify|\bbot\b", re.I)          # matched against title, tags and collection only
EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "video/mp4": "mp4", "video/webm": "webm"}


def sniff(b):
    if b[:3] == b"\xff\xd8\xff": return "image/jpeg"
    if b[:8] == b"\x89PNG\r\n\x1a\n": return "image/png"
    if b[:4] == b"GIF8": return "image/gif"
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP": return "image/webp"
    if b[4:8] == b"ftyp": return "video/mp4"
    if b[:4] == b"\x1a\x45\xdf\xa3": return "video/webm"
    return ""


def sha256_file(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""): h.update(chunk)
    return h.hexdigest()


def drive_id(link):
    m = re.search(r"/d/([\w-]{10,})", link or "")
    return m.group(1) if m else ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mirror", required=True); ap.add_argument("--tsv"); ap.add_argument("--vault"); ap.add_argument("--descriptions", action="append", default=[]); ap.add_argument("--viewer"); ap.add_argument("--playable"); ap.add_argument("--out", required=True)
    ap.add_argument("--version", default="1.0")
    ap.add_argument("--cloud", help="JSON list of {name, url} cloud folders shown as clickable library locations")
    ap.add_argument("--codes", help='JSON {"title prefix": "CODE"} for files whose titles do not start with their code')
    a = ap.parse_args()
    man = json.load(open(os.path.join(a.mirror, "manifest.json"), encoding="utf-8"))
    tsv = a.tsv or os.path.join(a.mirror, "files/workspace/termux-catalog/media_catalog.tsv")
    rows = list(csv.DictReader(open(tsv, encoding="utf-8"), delimiter="\t"))

    # ---- map media files in the mirror to catalog codes ----
    mitems = {i["id"]: i for i in man["items"]}
    local = {}   # code -> (abs path, manifest item)
    prefixes = json.load(open(a.codes, encoding="utf-8")) if a.codes else {}
    for i in man["items"]:
        if not i.get("mirror_path"): continue
        p = os.path.join(a.mirror, i["mirror_path"])
        if not os.path.isfile(p): continue
        t = i["title"]
        hit = next((c for pre, c in prefixes.items() if t.startswith(pre)), None)
        if hit: local[hit] = (p, i); continue
        m = re.match(r"^([A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*)\s+[\u2014\u2013-]\s", t)   # "CODE — title"
        if m and i.get("type") in ("IMAGE", "VIDEO", "AUDIO", None): local.setdefault(m.group(1), (p, i)); continue
        m = re.match(r"^.*\bstill\b.*?[\u2014\u2013-]\s*(\d+)\s*$", t, re.I)                   # "… preview still — 12345" -> STILL-12345
        if m: local["STILL-" + m.group(1)] = (p, i)

    # ---- items ----
    items, plan, seen = [], [], set()
    def add(code, title, kind, category, source, res, tags, link):
        it = {"id": code, "code": code, "title": title, "kind": kind, "category": category, "source": source, "res": res, "tags": tags, "link": link}
        d = drive_id(link)
        if d: it["driveId"] = d
        if code in local:
            p, mi = local[code]
            b = open(p, "rb").read(64); real = sniff(b)
            if not real: print("  ! could not sniff", code, file=sys.stderr)
            ext = EXT.get(real, "bin"); dest = "media/%s.%s" % (code, ext)
            it["local"] = dest; it["mime"] = real or mi.get("mime"); it["bytes"] = os.path.getsize(p); it["sha256"] = sha256_file(p)
            declared = (mi.get("mime") or "").lower()
            if real and declared and declared != real: it["mimeNote"] = "Declared as %s, but the bytes are %s. Shown as the real type; the file itself is unchanged." % (declared, real)
            plan.append({"code": code, "src": os.path.relpath(p, a.mirror), "dest": dest, "sha256": it["sha256"], "bytes": it["bytes"], "mime": it["mime"]})
        seen.add(code); items.append(it)

    for r in rows:
        kind = "image" if r["type"].strip().lower() == "image" else "video"
        add(r["code"].strip(), r["title"].strip(), kind, r["category"].strip(), r["source"].strip(), r["resolution"].strip(),
            [t.strip() for t in r["tags"].split(",") if t.strip()], r["link"].strip())
    by_code0 = {it["code"]: it for it in items}
    for code, (p, mi) in local.items():                                 # gallery numbering in the file title, e.g. "clip — … (G1234)" -> alias G1234
        al = re.search(r"\(([A-Z]{1,4}-?\d{3,6})\)", mi["title"])
        if al and al.group(1) != code and code in by_code0: by_code0[code]["aliases"] = [al.group(1)]
    for code, (p, mi) in sorted(local.items()):                         # extracted stills the list did not name
        if code in seen: continue
        still = code.startswith("STILL-")
        add(code, ("Preview still " + code.split("-", 1)[1]) if still else mi["title"], "image", "Extracted stills" if still else "Gallery", "Gallery (uploaded)",
            (mi.get("dims") or "").replace(" × ", "×"), ["preview", "extracted"] if still else ["extracted"], "")

    # ---- long descriptions + audio notes from a scrollable library page ----
    added_from_desc = []
    for desc_file in a.descriptions:
        s = open(desc_file, encoding="utf-8", errors="replace").read()
        rows_d = re.findall(r'<li><a href="([^"]+)"[^>]*>([^<]+)</a><span class="d">(.*?)</span></li>', s, re.S)
        by_code = {it["code"]: it for it in items}
        for link, code, d in rows_d:
            code = html.unescape(code).strip(); d = html.unescape(re.sub(r"<[^>]+>", "", d)).strip()
            m = re.search(r"\s*\[audio: ([^\]]+)\]\s*$", d); audio = m.group(1).strip() if m else ""
            if m: d = d[:m.start()].rstrip()
            link = html.unescape(link)
            if code in by_code:
                it = by_code[code]; it["desc"] = d
                if audio: it["audio"] = audio
                if not it.get("link") and link.startswith("http"): it["link"] = link
            elif link.startswith("http") and code not in by_code:
                host = re.sub(r"^www\.", "", re.sub(r"^https?://", "", link).split("/")[0]).split(".")[0].lower()
                title, _, rest = d.partition(" — ")
                add(code, title.strip() or code, "video", "New Additions", host.capitalize(), "", [], link)
                items[-1]["desc"] = d; added_from_desc.append(code); by_code[code] = items[-1]
                if audio: items[-1]["audio"] = audio
        print("descriptions: %d rows, %d matched, %d new codes added %s" % (len(rows_d), len(rows_d) - len(added_from_desc), len(added_from_desc), added_from_desc))

    # ---- Media Viewer downloadable: added dates, missing sizes/titles, poster frames (metadata + clearly derived files only) ----
    if a.viewer:
        import base64
        s = open(a.viewer, encoding="utf-8", errors="replace").read()
        i0 = s.index("var ITEMS = ") + len("var ITEMS = "); j0 = s.index("}];", i0) + 2
        vitems = json.loads(s[i0:j0]); by_code = {it["code"]: it for it in items}; n_dates = n_res = n_title = 0
        pdir = os.path.join(a.out, "posters"); os.makedirs(pdir, exist_ok=True)
        for v in vitems:
            it = by_code.get(v.get("code"))
            if not it:
                if v.get("url", "").startswith("http"):
                    add(v["code"], v.get("title") or v["code"], "image" if v.get("kind") == "image" else "video", v.get("category") or "New Additions", v.get("site") or ("Google Drive" if v.get("driveId") else ""), "", v.get("tags") or [], v["url"])
                    it = items[-1]; it["desc"] = v.get("description") or ""; by_code[v["code"]] = it; print("  viewer: new code", v["code"])
                else: continue
            if v.get("addedAt"): it["added"] = int(v["addedAt"]); n_dates += 1
            if not it.get("res") and v.get("width") and v.get("height"): it["res"] = "%d×%d" % (v["width"], v["height"]); n_res += 1
            if it["title"].startswith("Preview still ") and v.get("title"): it["title"] = v["title"]; n_title += 1
            if not it.get("desc") and v.get("description"): it["desc"] = v["description"]
            m = re.match(r"data:(image/[a-z]+);base64,(.*)$", v.get("poster") or "", re.S)
            if m and it.get("kind") == "video":                                     # a still frame for the grid; the video itself stays the original
                raw = base64.b64decode(m.group(2)); ext = EXT.get(m.group(1), "jpg"); fp = os.path.join(pdir, it["code"] + "." + ext)
                open(fp, "wb").write(raw); dest = "media/posters/%s.%s" % (it["code"], ext); it["poster"] = dest
                plan.append({"code": it["code"] + "-poster", "src": os.path.relpath(fp, a.mirror), "dest": dest, "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw), "mime": m.group(1), "derived": True})
        print("viewer: %d added dates, %d sizes, %d titles, %d posters" % (n_dates, n_res, n_title, sum(1 for p_ in plan if p_.get("derived") and p_["code"].endswith("-poster"))))

    # ---- playable copies made by optimize_media.py (originals stay the source of truth) ----
    if a.playable:
        rep = json.load(open(os.path.join(a.playable, "playable-report.json")))
        by_sha = {it.get("sha256"): it for it in items if it.get("sha256")}
        for e in rep.get("files", []):
            it = by_sha.get(e.get("source_sha256"))
            if it and e.get("output"):
                outp = os.path.join(a.playable, os.path.basename(e["output"]))
                if os.path.isfile(outp):
                    dest = "media/playable/" + os.path.basename(e["output"])
                    it["playable"] = dest
                    plan.append({"code": it["code"] + "-playable", "src": os.path.relpath(outp, a.mirror), "dest": dest, "sha256": sha256_file(outp), "bytes": os.path.getsize(outp), "mime": "video/mp4", "derived": True})

    # ---- workspace index (neutral file index; bot material omitted) ----
    ws, excluded = [], []
    for i in man["items"]:
        blob = " ".join([i.get("title") or "", i.get("collection") or "", " ".join(i.get("tags") or [])])
        if EXCLUDE.search(blob): excluded.append(i["id"]); continue
        w = {"id": i["id"], "title": i["title"], "collection": i.get("collection") or "Other", "type": i.get("type") or "FILE", "size": i.get("size") or 0,
             "file": i.get("file") or "", "path": i.get("path") or "", "filed": i.get("filed") or "", "note": i.get("note") or "", "tags": i.get("tags") or [], "sha256": i.get("sha256") or ""}
        if i.get("type") == "NOTE" and i.get("mirror_path"):
            try: w["text"] = open(os.path.join(a.mirror, i["mirror_path"]), encoding="utf-8").read()[:2400]
            except Exception: pass
        ws.append(w)

    # ---- vault folders from a hub page ----
    vault = []
    if a.vault:
        s = open(a.vault, encoding="utf-8", errors="replace").read()
        m = re.search(r"VAULT_FOLDERS\s*=\s*(\[.*?\])\s*;", s, re.S)
        if m: vault = json.loads(m.group(1))
        else: print("  ! VAULT_FOLDERS not found in", a.vault, file=sys.stderr)

    meta = {"version": a.version, "built": time.strftime("%Y-%m-%d"), "count": len(items), "local": sum(1 for p_ in plan if not p_.get("derived")), "mirrorSource": man.get("source_html", ""),
            "workspaceSource": "%s (%d items shown, %d left out)" % (os.path.basename(man.get("source_html", "") or "workspace index"), len(ws), len(excluded)),
            "vaultSnapshot": "from %s" % os.path.basename(a.vault) if a.vault else ""}
    os.makedirs(a.out, exist_ok=True)
    if a.cloud:
        cl = json.load(open(a.cloud, encoding="utf-8"))
        meta["cloud"] = [{"name": str(c["name"])[:80], "url": str(c["url"])} for c in cl if str(c.get("url", "")).startswith("https://")]
    json.dump({"meta": meta, "items": items, "vault": vault, "workspace": {"items": ws}}, open(os.path.join(a.out, "catalog.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump({"mirror": os.path.abspath(a.mirror), "media": plan}, open(os.path.join(a.out, "media_plan.json"), "w"), indent=1)
    print("catalog: %d items (%d with local media), %d vault folders, %d workspace items (%d left out)" % (len(items), len(plan), len(vault), len(ws), len(excluded)))
    for it in items:
        if it.get("mimeNote"): print("  note:", it["code"], it["mimeNote"])
    print("  excluded workspace ids:", excluded)


if __name__ == "__main__":
    main()
