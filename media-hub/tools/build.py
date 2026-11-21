#!/usr/bin/env python3
"""Assemble Media Hub from src/ + a catalog.

  build.py --catalog build/catalog.json --plan build/media_plan.json --out dist [--zip]

Produces
  dist/media-hub-app/            folder build: index.html, sw.js, manifest, icons/, media/ (byte-for-byte copies), tools/
  dist/media-hub-standalone.html one file with the media embedded as base64 (offline, no server needed)
Every copied media file is re-hashed after copying and the build fails if any byte differs from its source.
"""
import argparse, base64, hashlib, json, os, re, shutil, subprocess, sys, zipfile

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE); SRC = os.path.join(ROOT, "src")
JS_ORDER = ["app.core.js", "app.ui.js", "app.library.js", "app.shared.js", "app.vault.js", "app.viewer.js", "app.extras.js", "app.feed.js", "app.commands.js", "app.tools.js"]


def rd(p): return open(p, encoding="utf-8").read()
def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""): h.update(c)
    return h.hexdigest()


def jsonish(obj):
    s = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    return s.replace("<", "\\u003c").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--catalog", required=True); ap.add_argument("--plan", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--zip", action="store_true"); ap.add_argument("--no-standalone", action="store_true"); ap.add_argument("--no-precache", action="store_true")
    a = ap.parse_args()
    cat = json.load(open(a.catalog, encoding="utf-8")); plan = json.load(open(a.plan))
    css = rd(os.path.join(SRC, "style.css")); js = "\n".join(rd(os.path.join(SRC, f)) for f in JS_ORDER); tpl = rd(os.path.join(SRC, "index.template.html"))
    assert "</script" not in js.lower(), "JS contains </script"
    out = os.path.abspath(a.out); app = os.path.join(out, "media-hub-app"); shutil.rmtree(out, ignore_errors=True); os.makedirs(os.path.join(app, "icons")); os.makedirs(os.path.join(app, "media", "playable")); os.makedirs(os.path.join(app, "media", "posters")); os.makedirs(os.path.join(app, "tools"))

    # ---- media: byte-for-byte copy + verify ----
    mirror = plan["mirror"]; bad = 0; total = 0
    for m in plan["media"]:
        src = os.path.join(mirror, m["src"]); dst = os.path.join(app, m["dest"]); shutil.copyfile(src, dst); total += os.path.getsize(dst)
        if sha(dst) != m["sha256"] or sha(src) != m["sha256"]: bad += 1; print("  HASH MISMATCH", m["code"], file=sys.stderr)
    if bad: sys.exit("build aborted: %d media file(s) differ from their sources" % bad)
    print("media: %d files, %.1f MB copied, all SHA-256 identical to the sources" % (len(plan["media"]), total / 1048576))

    # ---- icons ----
    subprocess.check_call([sys.executable, os.path.join(HERE, "make_icons.py"), os.path.join(app, "icons")], stdout=subprocess.DEVNULL)

    # ---- html (folder build) ----
    cat_json = jsonish(cat)
    def page(embed):
        h = tpl.replace("{{CSS}}", css).replace("{{CATALOG}}", cat_json).replace("{{EMBED_BLOCKS}}", "").replace("{{EMBED}}", jsonish(embed) if embed else "{}").replace("{{KIT}}", "{}").replace("{{JS}}", js)
        return h
    folder_html = page(None)
    open(os.path.join(app, "index.html"), "w", encoding="utf-8").write(folder_html)

    # ---- manifest ----
    manifest = {"id": "./", "name": "Media Hub · Personal", "short_name": "Media Hub", "description": "Private, offline-first media library", "start_url": "./", "scope": "./",
                "display": "standalone", "display_override": ["standalone", "minimal-ui"], "orientation": "any", "background_color": "#0a0f18", "theme_color": "#0a0f18", "categories": ["entertainment", "photo"],
                "icons": [{"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"}, {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
                          {"src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}, {"src": "icons/icon.svg", "sizes": "any", "type": "image/svg+xml"}],
                "shortcuts": [{"name": "Scroll", "short_name": "Scroll", "url": "./?scroll=1", "icons": [{"src": "icons/icon-192.png", "sizes": "192x192"}]},
                              {"name": "Folders", "short_name": "Folders", "url": "./?tab=folders", "icons": [{"src": "icons/icon-192.png", "sizes": "192x192"}]},
                              {"name": "AI generated", "short_name": "AI", "url": "./?folder=ai%2Fgenerated", "icons": [{"src": "icons/icon-192.png", "sizes": "192x192"}]},
                              {"name": "Favourites", "short_name": "Favourites", "url": "./?filter=fav", "icons": [{"src": "icons/icon-192.png", "sizes": "192x192"}]}],
                "share_target": {"action": "./share-target", "method": "POST", "enctype": "multipart/form-data", "params": {"title": "title", "text": "text", "url": "url", "files": [{"name": "media", "accept": ["image/*", "video/*", "audio/*"]}]}}}
    json.dump(manifest, open(os.path.join(app, "manifest.webmanifest"), "w"), indent=1)

    # ---- service worker ----
    shell = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/icon.svg"]
    media = [] if a.no_precache or total > 400 * 1048576 else [m["dest"] for m in plan["media"]]
    ver = hashlib.sha256((folder_html + json.dumps(media)).encode()).hexdigest()[:10]
    sw = rd(os.path.join(SRC, "sw.template.js")).replace("{{VERSION}}", ver).replace("{{SHELL}}", json.dumps(shell)).replace("{{MEDIA}}", json.dumps(media))
    open(os.path.join(app, "sw.js"), "w").write(sw)

    # ---- tools + readme ----
    for t in ("media_serve.py", "mirror_extract.py", "verify_mirror.py", "build_catalog.py", "make_icons.py", "build.py", "optimize_media.py", "make_master_folder.py", "make_demo.py", "verify_checksums.py"): shutil.copyfile(os.path.join(HERE, t), os.path.join(app, "tools", t))
    shutil.copytree(SRC, os.path.join(app, "src")); os.makedirs(os.path.join(app, "tests"))
    for t in ("test_range.py", "test_optimize.py", "test_library.py", "e2e_smoke.js", "checklist.py", "test_checksums.py", "test_media_serve.py", "run_all.sh"): shutil.copyfile(os.path.join(ROOT, "tests", t), os.path.join(app, "tests", t))
    for sub in ("tasker", "termux"):
        if os.path.isdir(os.path.join(ROOT, "extras", sub)): shutil.copytree(os.path.join(ROOT, "extras", sub), os.path.join(app, sub))
    for f in os.listdir(os.path.join(app, "termux")) if os.path.isdir(os.path.join(app, "termux")) else []: os.chmod(os.path.join(app, "termux", f), 0o755)
    json.dump({"generated": cat["meta"]["built"], "files": [{"path": m["dest"], "sha256": m["sha256"], "bytes": m["bytes"], "from": m["src"]} for m in plan["media"]]}, open(os.path.join(app, "media-manifest.json"), "w"), indent=1)
    shutil.copyfile(os.path.join(ROOT, "README.md"), os.path.join(app, "README.md")) if os.path.exists(os.path.join(ROOT, "README.md")) else None

    # ---- standalone single file (media embedded as base64) ----
    if not a.no_standalone:
        emb, blocks = {}, []
        for n, m in enumerate(plan["media"]):                    # one inert data block per file, decoded only when the app first needs it
            eid = "emb-%d" % n; emb[m["dest"]] = {"mime": m["mime"], "id": eid}
            blocks.append('<script type="application/octet-stream" id="%s">%s</script>\n' % (eid, base64.b64encode(open(os.path.join(app, m["dest"]), "rb").read()).decode()))
        kit = {}
        for rel in ["README.md"] + ["tools/" + t for t in ("media_serve.py", "optimize_media.py", "mirror_extract.py", "verify_mirror.py", "build_catalog.py", "build.py", "make_icons.py", "make_master_folder.py", "make_demo.py", "verify_checksums.py")] + \
                ["tests/test_range.py", "tests/test_optimize.py", "tests/test_library.py", "tests/e2e_smoke.js", "tests/checklist.py", "tests/test_checksums.py", "tests/test_media_serve.py", "tests/run_all.sh"] + ["src/" + f for f in sorted(os.listdir(SRC))]:
            fp = os.path.join(ROOT, rel)
            if os.path.isfile(fp): kit[rel] = rd(fp)
        for sub in ("tasker", "termux"):
            d = os.path.join(ROOT, "extras", sub)
            for f in sorted(os.listdir(d)) if os.path.isdir(d) else []: kit[sub + "/" + f] = rd(os.path.join(d, f))
        h = tpl.replace("{{CSS}}", css).replace("{{CATALOG}}", jsonish(cat)).replace("{{EMBED}}", jsonish(emb)).replace("{{JS}}", js)
        h = h.replace("{{EMBED_BLOCKS}}", "".join(blocks), 1)
        h = h.replace("{{KIT}}", jsonish(kit), 1)        # last, so template tokens inside the kit's own files stay literal
        assert h.count('id="kit"') == 1 and "{{" not in h.split('id="kit">', 1)[0][-200:]
        print("standalone kit: %d files, %.0f KB" % (len(kit), sum(len(v) for v in kit.values()) / 1024))
        icon = "data:image/svg+xml;base64," + base64.b64encode(open(os.path.join(app, "icons", "icon.svg"), "rb").read()).decode()
        h = re.sub(r'<link rel="manifest"[^>]*>\n?', "", h); h = h.replace('href="icons/icon.svg"', 'href="%s"' % icon); h = re.sub(r'<link rel="apple-touch-icon"[^>]*>\n?', "", h)
        p = os.path.join(out, "media-hub-standalone.html"); open(p, "w", encoding="utf-8").write(h)
        print("standalone: %.1f MB" % (os.path.getsize(p) / 1048576))

    if a.zip:
        z = os.path.join(out, "media-hub-app.zip")
        with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
            for dp, _, fs in os.walk(app):
                for f in sorted(fs):
                    full = os.path.join(dp, f); zf.write(full, os.path.join("media-hub-app", os.path.relpath(full, app)))
        print("zip: %.1f MB" % (os.path.getsize(z) / 1048576))
    print("build %s ok -> %s" % (ver, out))


if __name__ == "__main__":
    main()
