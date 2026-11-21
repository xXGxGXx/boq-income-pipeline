#!/usr/bin/env python3
"""checklist.py - runs the Media Hub test checklist, one labelled result per checklist line, and writes a Markdown report.

    python3 tests/checklist.py [--app DIR] [--report checklist-report.md]

--app   a Media Hub app folder (default: this folder when it holds index.html, else dist/media-hub-app)
Everything runs on 127.0.0.1 with synthetic files made in a temporary folder and a fresh, throw-away browser profile:
your media, your app data and your browser are never touched. Needs Playwright with Chromium.
Exit code 0 when every line passes, 1 otherwise."""
import argparse, hashlib, http.client, json, os, struct, sys, tempfile, threading, time, zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools")); os.environ["MEDIA_SERVE_QUIET"] = "1"
import media_serve  # noqa: E402

SECTIONS = []


def section(title):
    SECTIONS.append((title, [])); print("\n## " + title, flush=True)


def check(label, ok, detail=""):
    SECTIONS[-1][1].append((label, bool(ok), str(detail))); print(("  PASS  " if ok else "  FAIL  ") + label + (("  (" + str(detail) + ")") if detail else ""), flush=True)
    return bool(ok)


def note(text):
    SECTIONS[-1][1].append((text, None, "")); print("  NOTE  " + text, flush=True)


def png(w, h, rgb):
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    ch = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + ch(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + ch(b"IDAT", zlib.compress(raw)) + ch(b"IEND", b"")


def sha(b): return hashlib.sha256(b).hexdigest()


def req(port, method, path, headers=None, host=None):
    c = http.client.HTTPConnection("127.0.0.1", port, timeout=15)
    c.putrequest(method, path, skip_host=True, skip_accept_encoding=True)          # the raw path, exactly as written
    for k, v in dict({"Host": host or "127.0.0.1:%d" % port}, **(headers or {})).items(): c.putheader(k, v)
    c.endheaders(); r = c.getresponse(); b = r.read(); c.close(); return r, b


def serve(directory):
    s = media_serve.make_server(directory, "127.0.0.1", 0); threading.Thread(target=s.serve_forever, daemon=True).start(); return s


# ------------------------------------------------------------------ server
DATA = bytes((i * 7 + 3) % 256 for i in range(3 * 1024 * 1024 + 123))           # crosses two 1 MiB chunk boundaries


def server_checks(tmp):
    site = tmp / "site"; out = tmp / "outside"; (site / "media" / "sub").mkdir(parents=True); out.mkdir()
    (site / "index.html").write_text("<!doctype html><title>t</title>")
    (site / "media" / "clip.mp4").write_bytes(DATA); (site / "media" / "small.webm").write_bytes(bytes(50000)); (site / "media" / "sub" / "a.mp4").write_bytes(b"A" * 10)
    (site / "media" / ".hidden.mp4").write_bytes(b"HIDDEN"); (out / "secret.mp4").write_bytes(b"TOP SECRET")
    for n, t in (("tool.py", "print(1)"), ("run.sh", "echo hi"), ("notes.txt", "NOT MEDIA"), ("secrets.env", "TOKEN=x"), ("backup.zip", "PK"), ("data.db", "SQLite"), ("README.md", "# x"), ("noext", "x")): (site / n).write_text(t)
    os.symlink(out / "secret.mp4", site / "media" / "link.mp4"); os.symlink(out, site / "linkdir")
    srv = serve(site); port = srv.server_address[1]
    leak = lambda b: b"TOP SECRET" in b or b"HIDDEN" in b
    refused = lambda paths: [(p, r.status) for p in paths for r, b in [req(port, "GET", p)] if r.status not in (400, 403, 404) or leak(b)]

    section("Server security")
    groups = [("`../`", ["/../outside/secret.mp4", "/media/../../outside/secret.mp4", "/media/sub/../../../outside/secret.mp4"]),
              ("`%2e%2e`", ["/%2e%2e/outside/secret.mp4", "/media/%2e%2e/%2e%2e/outside/secret.mp4", "/%2E%2E/outside/secret.mp4", "/media/%2e%2e%2f%2e%2e%2foutside/secret.mp4"]),
              ("double-encoded traversal", ["/%252e%252e/outside/secret.mp4", "/media/%252e%252e%252f%252e%252e%252foutside%252fsecret.mp4", "/media/%c0%ae%c0%ae/secret.mp4"]),
              ("backslashes", ["/media/..%5c..%5coutside%5csecret.mp4", "/media\\..\\..\\outside\\secret.mp4", "/media/%5c%5c..%5csecret.mp4"]),
              ("NUL bytes", ["/media/clip.mp4%00.png", "/media/%00", "/%00/etc/passwd"]),
              ("dotfiles", ["/media/.hidden.mp4", "/media/%2ehidden.mp4", "/.git/config"]),
              ("symlinks", ["/media/link.mp4", "/linkdir/secret.mp4", "/linkdir"])]
    for name, paths in groups:
        bad = refused(paths); check("Rejects " + name + " (" + str(len(paths)) + " variants, nothing leaked)", not bad, bad or "")
    bad = [(h, r.status) for h in ("evil.example", "evil.example:%d" % port, "192.168.1.5:%d" % port, "127.0.0.1.evil.example:%d" % port) for r, _ in [req(port, "GET", "/", host=h)] if r.status < 400]
    ok_host = req(port, "GET", "/", host="localhost:%d" % port)[0].status == 200
    check("Rejects non-loopback Host values (4 tried); localhost still works", not bad and ok_host, bad or "")
    r1 = req(port, "GET", "/media/clip.mp4", {"Origin": "https://evil.example"})[0].status; r2 = req(port, "GET", "/media/clip.mp4", {"Sec-Fetch-Site": "cross-site"})[0].status
    r3 = req(port, "GET", "/media/clip.mp4", {"Sec-Fetch-Site": "same-site"})[0].status; r4 = req(port, "GET", "/media/clip.mp4", {"Origin": "http://127.0.0.1:%d" % port, "Range": "bytes=0-0"})[0].status
    check("Rejects cross-origin requests (foreign Origin, cross-site, same-site); same-origin allowed", (r1, r2, r3) == (403, 403, 403) and r4 == 206, (r1, r2, r3, r4))
    meth = {m: (lambda r: (r.status, r.getheader("Allow")))(req(port, m, "/")[0]) for m in ("POST", "PUT", "DELETE", "PATCH", "OPTIONS")}
    check("Rejects non-GET/HEAD methods with 405 and Allow: GET, HEAD", all(v == (405, "GET, HEAD") for v in meth.values()), meth)
    try: media_serve.make_server(site, "0.0.0.0", 0); nb = False
    except SystemExit: nb = True
    check("Refuses to start on a non-loopback address (0.0.0.0)", nb)
    lst = [(p, r.status) for p in ("/media/", "/media", "/media/sub/", "/media/sub", "/linkdir/") for r, b in [req(port, "GET", p)] if r.status == 200 or b"clip.mp4" in b or b"a.mp4" in b]
    check("No directory listing is served (5 folder URLs)", not lst, lst or "")
    deny = [(p, r.status) for p in ("/tool.py", "/run.sh", "/notes.txt", "/secrets.env", "/backup.zip", "/data.db", "/README.md", "/noext") for r, _ in [req(port, "GET", p)] if r.status != 404]
    ctrl = req(port, "GET", "/media/clip.mp4", {"Range": "bytes=0-0"})[0].status == 206 and req(port, "GET", "/")[0].status == 200
    check("`.py`, `.sh` and other non-media files are denied (.txt .env .zip .db .md, no extension)", not deny and ctrl, deny or "")

    section("Range requests")
    N = len(DATA); errs = []
    def rng(path, h, want_status, want_cr=None, want_body=None, extra=None):
        r, b = req(port, "GET", path, dict({"Range": h}, **(extra or {})) if h else (extra or {}))
        got = (r.status, r.getheader("Content-Range"), r.getheader("Content-Length"))
        ok = r.status == want_status and (want_cr is None or got[1] == want_cr) and (want_body is None or b == want_body) and (r.status == 416 or int(got[2] or -1) == len(b))
        if not ok: errs.append((h, got, len(b)))
        return ok, r, b
    cases = [("bytes=0-99", 206, "bytes 0-99/%d" % N, DATA[:100]), ("bytes=100-", 206, "bytes 100-%d/%d" % (N - 1, N), DATA[100:]),
             ("bytes=-100", 206, "bytes %d-%d/%d" % (N - 100, N - 1, N), DATA[-100:]), ("bytes=-0", 416, "bytes */%d" % N, None)]
    res = [rng("/media/clip.mp4", h, s, cr, body)[0] for h, s, cr, body in cases]
    res.append(rng("/media/small.webm", "bytes=999999-", 416, "bytes */50000")[0])
    junk = [rng("/media/clip.mp4", h, 200, None, DATA)[0] for h in ("bytes=abc", "bytes=1-2,5-6", "items=0-9", "bytes=--5", "bytes=0-99 junk")]
    res.append(rng("/media/clip.mp4", "bytes=500-100", 416, "bytes */%d" % N)[0])
    check("bytes=0-99, bytes=100-, bytes=-100, bytes=-0, bytes=999999- (on a 50 KB file) give the right answer", all(res), errs or "")
    check("Invalid syntax (5 kinds) is ignored and the whole file is sent; start > end is 416", all(junk), errs or "")
    r, b = req(port, "GET", "/media/clip.mp4"); et = r.getheader("ETag"); ar = r.getheader("Accept-Ranges")
    r304, b304 = req(port, "GET", "/media/clip.mp4", {"If-None-Match": et}); rir, bir = req(port, "GET", "/media/clip.mp4", {"Range": "bytes=0-9", "If-Range": '"stale"'})
    rok, bok = req(port, "GET", "/media/clip.mp4", {"Range": "bytes=0-9", "If-Range": et}); rh, bh = req(port, "HEAD", "/media/clip.mp4", {"Range": "bytes=0-9"})
    ok = (r.status == 200 and ar == "bytes" and et and r304.status == 304 and not b304 and rir.status == 200 and len(bir) == N and rok.status == 206 and bok == DATA[:10]
          and rh.status == 206 and not bh and rh.getheader("Content-Length") == "10")
    check("206 with exact Content-Range and Content-Length on every partial reply, 416 with bytes */size, ETag → 304, stale If-Range → 200, HEAD", ok and not errs,
          {"200": r.status, "Accept-Ranges": ar, "304": r304.status, "If-Range stale": rir.status, "If-Range ok": rok.status, "HEAD": rh.status})
    spans = [(1048000, 1049999), (1048575, 1048576), (2097000, 2097300), (0, N - 1)]
    bad = [(a, z) for a, z in spans for _, r, b in [rng("/media/clip.mp4", "bytes=%d-%d" % (a, z), 206, None, DATA[a:z + 1])] if b != DATA[a:z + 1]]
    check("Ranges crossing the 1 MiB and 2 MiB chunk boundaries are byte-identical", not bad, bad or "")
    srv.shutdown(); srv.server_close()


# ------------------------------------------------------------------ browser
def browser_checks(tmp, app_dir):
    from playwright.sync_api import sync_playwright
    files = tmp / "files"; files.mkdir()
    (files / "pick_a.png").write_bytes(png(64, 48, (200, 80, 80))); (files / "pick_b.png").write_bytes(png(40, 30, (30, 160, 90)))
    (files / "cat.csv").write_text("code,title,type,category,link\nCK-C1,Checklist CSV one,Video,Checklist,https://example.com/c1\nCK-C2,\"Checklist CSV, two\",Video,Checklist,https://example.com/c2\n")
    (files / "cat.tsv").write_text("code\ttitle\ttype\tcategory\tlink\nCK-T1\tChecklist TSV one\tVideo\tChecklist\thttps://example.com/t1\nCK-T2\tChecklist TSV two\tImage\tChecklist\thttps://example.com/t2\n")
    (files / "cat.json").write_text(json.dumps([{"code": "CK-J1", "title": "Checklist JSON one", "type": "Video", "link": "https://example.com/j1"}, {"code": "CK-J2", "title": "Checklist JSON two", "type": "Image", "link": "https://example.com/j2"}]))
    (files / "bad.csv").write_text('code,title,link\nCK-M2,Fine row,https://example.com/m2\n,,,\njust one cell\nCK-M3,Extra,cols,here,too,many\n__proto__,Polluter,https://example.com/p\n"CK-M4","Quoted ""inner"" <b>title</b><img src=x onerror=window.__xss=1>",https://example.com/m4\n\nCK-M1,"Unclosed quote that runs to the end, here\n')
    (files / "bad.json").write_text(json.dumps([1, None, "x", {"code": "CK-MJ1", "title": "ok"}, {"title": "no code"}, {"code": {"x": 1}}, {"code": "CK-MJ2", "__proto__": {"polluted": 1}, "constructor": {"prototype": {"polluted": 1}}}]))
    (files / "broken.json").write_text('{"items": [ {"code": "X"')
    (files / "bad.tsv").write_text("only a header line\n")
    srv = serve(app_dir); url = "http://127.0.0.1:%d/" % srv.server_address[1]
    disk_sha = {p.name: sha(p.read_bytes()) for p in (app_dir / "media").glob("*") if p.is_file()}
    with sync_playwright() as pw:
        b = pw.chromium.launch(); ctx = b.new_context(accept_downloads=True, viewport={"width": 1280, "height": 860}); errors = []
        ctx.add_init_script("""document.addEventListener('DOMContentLoaded',()=>{const mo=new MutationObserver(()=>{if(!window.__firstCard&&document.querySelector('#grid .card')){window.__firstCard=document.getElementById('lock').classList.contains('on')?'locked':'open';}});mo.observe(document.documentElement,{childList:true,subtree:true});});""")
        p = ctx.new_page(); p.on("pageerror", lambda e: errors.append(str(e))); p.on("dialog", lambda d: d.accept())
        J = p.evaluate
        def wait(expr, arg=None, timeout=20000):             # polls with evaluate: the page's security policy (no eval) stays on
            end = time.time() + timeout / 1000
            while True:
                try:
                    v = p.evaluate(expr, arg) if arg is not None else p.evaluate(expr)
                    if v: return v
                except Exception as e:
                    if "context was destroyed" not in str(e) and "navigation" not in str(e).lower(): raise
                if time.time() > end: raise TimeoutError("waited %d ms for %s" % (timeout, expr[:80]))
                time.sleep(0.1)
        ready = lambda: wait("window.__mh && window.__mh.ready", timeout=20000)
        def tap(sel):                                          # wake the player's auto-hiding controls first, like a person moving the mouse
            p.mouse.move(640, 300); p.mouse.move(650, 310); J("showChrome()"); p.wait_for_timeout(120); p.click(sel, timeout=8000)
        def keys(s):
            for ch in s: p.click('#keys [data-k="%s"]' % ch)
        def unlock_pin():
            if J("document.getElementById('lock').classList.contains('on')"): keys("1234"); wait("!document.getElementById('lock').classList.contains('on')", timeout=10000)
        def calm():
            J("closeSheet(); if (V.open) closeViewer(); if (FEED.open) closeFeed(); document.getElementById('toast').classList.remove('on')"); p.wait_for_timeout(1700)
        p.goto(url); ready(); wait("navigator.serviceWorker && navigator.serviceWorker.ready.then(()=>true)", timeout=20000)
        img = J("(shown().find(i=>i.kind==='image'&&hasLocal(i))||{}).id"); imgs = J("shown().filter(i=>i.kind==='image'&&hasLocal(i)).slice(0,4).map(i=>i.id)")
        vid = J("(shown().find(i=>i.kind==='video'&&i.local&&/\\.webm$/i.test(i.local))||{}).id")

        section("App")
        J("id=>openViewer(id,[byId.get(id)])", img); p.wait_for_selector("#viewer.open"); p.click("#vFav"); J("closeViewer()"); p.wait_for_timeout(1700)
        J("id=>itemSheet(byId.get(id))", img); p.fill("#newTag", "checklist-tag"); p.click("#addTag"); p.wait_for_timeout(150)
        p.fill("#noteBox", "checklist private note"); p.dispatch_event("#noteBox", "change"); p.wait_for_timeout(300)
        p.fill("#newCol", "Checklist collection"); p.click("#addCol"); p.wait_for_timeout(200); calm()
        J("id=>openViewer(id,[byId.get(id)])", vid); wait("V.vid && V.vid.readyState>=1 && isFinite(V.vid.duration)", timeout=10000)
        J("V.vid.currentTime=3.2"); wait("Math.abs(V.vid.currentTime-3.2)<0.3", timeout=5000); calm()
        n_imp = J("imported.length"); p.set_input_files("#filePick", str(files / "pick_a.png")); wait("n=>imported.length===n+1", arg=n_imp, timeout=10000); calm()
        p.reload(); ready()
        vals = J("""([img,vid])=>({fav:!!user.fav[img], tag:(user.tags[img]||[]).includes('checklist-tag'), note:user.note[img]||'', col:Object.values(user.collections).some(c=>c.name==='Checklist collection'&&c.ids.includes(img)), prog:(progress.get(vid)||{}).t||0, imp:imported.some(i=>i.name==='pick_a.png')})""", [img, vid])
        stored = J("""async()=>{const it=imported.find(i=>i.name==='pick_a.png'); const r=await dbGet('files',it.id); const b=r&&(r.blob||r); return b?Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await b.arrayBuffer()))).map(x=>x.toString(16).padStart(2,'0')).join(''):''}""")
        check("Added a favourite, tags, a note, a collection, a resume point and an import, then reloaded", True, "fav · tag · note · collection · resume at 3.2 s · pick_a.png")
        check("Every user-layer value survived the reload", vals["fav"] and vals["tag"] and vals["note"] == "checklist private note" and vals["col"] and abs(vals["prog"] - 3.2) < 0.4 and vals["imp"], vals)
        check("The imported file is stored byte-for-byte (SHA-256 of the stored copy = the file)", stored == sha((files / "pick_a.png").read_bytes()), stored[:16])
        p.set_input_files("#filePick", str(files / "pick_a.png")); p.wait_for_timeout(1500)
        dtxt = J("document.getElementById('sheetBody').innerText"); check("Importing the same file twice is recognised as a duplicate (nothing added)", J("imported.length") == n_imp + 1 and "exact copy" in dtxt, dtxt[:120].replace("\n", " ")); calm()
        n0 = J("extraItems.length")
        for f in ("cat.csv", "cat.tsv", "cat.json"): p.set_input_files("#catalogPick", str(files / f)); p.wait_for_timeout(700); calm()
        codes = J("extraItems.map(i=>i.code)"); want = ["CK-C1", "CK-C2", "CK-T1", "CK-T2", "CK-J1", "CK-J2"]
        check("CSV, TSV and JSON catalogs import (2 rows each, a quoted comma kept)", all(c in codes for c in want) and J("(extraItems.find(i=>i.code==='CK-C2')||{}).title") == "Checklist CSV, two", [c for c in want if c not in codes] or "")
        e0 = len(errors)
        for f in ("bad.csv", "bad.json", "broken.json", "bad.tsv"): p.set_input_files("#catalogPick", str(files / f)); p.wait_for_timeout(700); calm()
        J("setTab('library'); setQuery('inner')"); p.wait_for_timeout(500)
        script_ran = J("!!window.__xss || [...document.querySelectorAll('#grid b')].some(b=>b.textContent==='title') || !!document.querySelector('#grid img[src=\"x\"]')")
        literal = J("[...document.querySelectorAll('#grid .card')].some(c=>c.innerText.includes('<b>title</b>'))")
        J("setQuery('checklist')"); p.wait_for_timeout(300)
        polluted = J("({}).polluted !== undefined || Object.prototype.polluted !== undefined || [].polluted !== undefined")
        sane = J("everything().every(i=>typeof i.title==='string' && typeof i.code==='string')")
        check("Malformed rows (unclosed quote, blank and short rows, extra columns, __proto__, HTML in a title, non-objects, broken JSON, header-only) don't break the app; HTML shows as text",
              len(errors) == e0 and not polluted and sane and not script_ran and literal and J("state.list.length") >= 6 and "CK-M2" in J("extraItems.map(i=>i.code)") and "CK-MJ1" in J("extraItems.map(i=>i.code)"),
              {"page errors": errors[e0:], "prototype polluted": polluted, "html ran": script_ran, "shown as text": literal, "list": J("state.list.length")})
        J("setQuery('')")

        section("Viewer")
        J("ids=>openViewer(ids[0], ids.map(i=>byId.get(i)))", imgs); wait("document.querySelector('#vstage img') && document.querySelector('#vstage img').naturalWidth>0", timeout=8000); p.wait_for_timeout(300)
        p.mouse.move(640, 430); p.mouse.wheel(0, -500); p.wait_for_timeout(250); z1 = J("V.z.s"); p.mouse.dblclick(640, 430); p.wait_for_timeout(300); z2 = J("V.z.s")
        t0 = J("V.item.id"); W, H = J("[innerWidth, innerHeight]")
        J("""([W,H])=>{const el=document.querySelector('#vstage'); const ev=(t,x)=>el.dispatchEvent(new PointerEvent(t,{pointerId:1,pointerType:'touch',isPrimary:true,clientX:x,clientY:H/2,bubbles:true,cancelable:true})); ev('pointerdown',W*.8); for(let i=1;i<7;i++) ev('pointermove',W*.8-i*45); ev('pointerup',W*.8-270);}""", [W, H]); p.wait_for_timeout(400)
        swiped = J("V.item.id") != t0
        J("closeViewer()"); p.wait_for_timeout(1700)
        J("""()=>{window.__pip=0; window.__wake=0; HTMLVideoElement.prototype.requestPictureInPicture=function(){window.__pip++; return Promise.resolve({});};
              Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{request:async()=>{window.__wake++; return {addEventListener(){}, release:async()=>{}}}}});}""")
        J("id=>openViewer(id,[byId.get(id)])", vid); wait("V.vid && V.vid.readyState>=2", timeout=10000); p.wait_for_timeout(600)
        resumed = J("V.vid.currentTime")
        if J("V.vid.paused"): tap("#tPlay")
        p.wait_for_timeout(600); J("V.vid.currentTime=4"); p.wait_for_timeout(300); tap("#tA"); p.wait_for_timeout(1300); tap("#tB"); A, B = J("[V.ab.a, V.ab.b]")
        seen = []
        for _ in range(16): p.wait_for_timeout(200); seen.append(J("V.vid.currentTime"))
        looped = A is not None and B is not None and max(seen) < B + 0.6 and any(seen[i + 1] < seen[i] - 0.3 for i in range(len(seen) - 1))
        tap("#tLoopAB"); J("showChrome()"); p.select_option("#tSpeed", "1.5"); rate = J("V.vid.playbackRate"); p.select_option("#tSpeed", "1")
        with p.expect_download() as dl: tap("#tShot")
        d = dl.value; fp = tmp / ("frame-" + d.suggested_filename); d.save_as(str(fp)); fr = fp.read_bytes()
        J("document.activeElement && document.activeElement.blur()"); p.keyboard.press("p"); p.wait_for_timeout(200)
        pip_calls, wake_calls = J("window.__pip"), J("window.__wake")
        check("Zoom: wheel zooms in, double-click returns to fit", z1 > 1.1 and z2 < 1.05, (round(z1, 2), round(z2, 2)))
        check("Swipe navigation: a left swipe goes to the next item", swiped)
        check("Video resume: reopening continues where it was left (3.2 s; it plays on straight away)", 2.9 <= resumed <= 4.9, round(resumed, 2))
        check("A–B loop: playback jumps from B back to A", looped, {"A": A, "B": B, "max": round(max(seen), 2)})
        check("Speed: 1.5× applies to the video", abs(rate - 1.5) < 1e-6, rate)
        check("Frame capture: saves a new PNG file; the original is untouched", fr[:8] == b"\x89PNG\r\n\x1a\n" and d.suggested_filename.endswith(".png") and all(sha((app_dir / "media" / n).read_bytes()) == h for n, h in disk_sha.items()), d.suggested_filename)
        check("PiP: the viewer asks the browser for picture-in-picture (recorded; a headless browser has no PiP window)", pip_calls >= 1, pip_calls)
        check("Wake Lock: requested when the video plays (recorded through a stand-in)", wake_calls >= 1, wake_calls)
        J("closeViewer()"); p.wait_for_timeout(1700)
        u0 = p.url; J("id=>openViewer(id,[byId.get(id)])", img); p.wait_for_selector("#viewer.open"); st_open = J("history.state && history.state.mh")
        p.click("#vClose"); p.wait_for_timeout(1700); after_close = (p.url == u0, J("!(history.state && history.state.mh)"), J("!V.open"))
        J("id=>openViewer(id,[byId.get(id)])", img); p.wait_for_selector("#viewer.open"); p.go_back(); p.wait_for_timeout(600); back_ok = J("!V.open") and p.url.startswith(url)
        check("Closing the viewer restores normal history (entry removed; Back closes the viewer, not the app)", st_open == "viewer" and all(after_close) and back_ok, {"state while open": st_open, "after close": after_close, "Back": back_ok})

        section("Privacy")
        calm(); J("setTab('tools')"); p.click("#btnPin"); p.wait_for_selector("#lock.on"); keys("1234"); p.click('#keys [data-k="ok"]'); p.wait_for_timeout(250); keys("1234"); p.click('#keys [data-k="ok"]')
        wait("!document.getElementById('lock').classList.contains('on') && prefs.pinSet", timeout=10000)
        p.reload(); ready(); p.wait_for_timeout(500)
        first, onl = J("window.__firstCard"), J("document.getElementById('lock').classList.contains('on')")
        covered = J("!!document.elementFromPoint(innerWidth/2, innerHeight/2).closest('#lock')")
        p.mouse.click(300, 300); p.wait_for_timeout(300); opened = J("V.open")
        check("With a PIN set, a reload shows the lock before any content is usable", first == "locked" and onl and covered and not opened, {"first card drawn while": first, "lock on": onl, "covers screen": covered, "a click opened something": opened})
        waits = []
        for _ in range(5): keys("0000"); p.wait_for_timeout(1100)
        w1 = J("Math.round((LOCK.until-Date.now())/1000)"); msg1 = p.inner_text("#lockMsg")
        keys("12"); swallowed = J("LOCK.buf===''"); keys("34"); p.wait_for_timeout(600); still = J("document.getElementById('lock').classList.contains('on')")
        J("LOCK.until=Date.now()-1"); keys("0000"); p.wait_for_timeout(1100); w2 = J("Math.round((LOCK.until-Date.now())/1000)")
        check("Repeated wrong PINs give an escalating lock-out (5 wrong → 15 s, the next wrong → 30 s); keys are ignored and even the right PIN is refused during it",
              "Too many" in msg1 and 12 <= w1 <= 15 and 26 <= w2 <= 30 and swallowed and still, {"first wait s": w1, "second wait s": w2, "input ignored": swallowed, "right PIN refused": still})
        note("The 15 s wait is moved on by the test instead of slept through.")
        J("LOCK.until=0; LOCK.fails=0"); unlock_pin(); calm(); J("setTab('library')"); p.mouse.move(5, 5)
        p.keyboard.press("Escape"); p.wait_for_timeout(700); p.keyboard.press("Escape"); p.wait_for_timeout(300); slow = J("document.getElementById('lock').classList.contains('on') || document.getElementById('cover').classList.contains('on')")
        p.wait_for_timeout(500); p.keyboard.press("Escape"); p.keyboard.press("Escape"); p.wait_for_timeout(300); fast = J("document.getElementById('lock').classList.contains('on')")
        check("Escape twice within 350 ms triggers the panic cover (and twice 700 ms apart does not)", fast and not slow, {"fast": fast, "slow": slow})
        unlock_pin(); calm(); J("setTab('tools')"); p.wait_for_timeout(200)
        p.click("#btnNotesSetup"); p.fill("#nvPass", "checklist passphrase 1"); p.fill("#nvPass2", "checklist passphrase 1"); p.click("#nvGo")
        wait("id=>!!user.enote[id] && !user.note[id]", arg=img, timeout=30000); p.wait_for_timeout(500)
        dump = J("""async()=>{const out=[]; for (const s of ['kv','progress','imports','files']) { try { for (const [k,v] of await dbAll(s)) out.push(String(k)+':'+(v instanceof Blob?'':JSON.stringify(v))); } catch(e){} } return out.join('\\n')}""")
        p.reload(); ready(); unlock_pin(); p.wait_for_timeout(300)
        J("id=>itemSheet(byId.get(id))", img); p.wait_for_timeout(300); locked_view = J("!!document.querySelector('.enclocked') && !document.querySelector('#noteBox')")
        search_hit = J("shown().some(i=>matchesQuery(i,parseQuery('\"checklist private note\"')))")
        p.click("#noteUnlock"); p.fill("#nvPass", "wrong passphrase"); p.click("#nvGo"); wait("document.getElementById('nvMsg').textContent.includes('Wrong')", timeout=30000)
        p.fill("#nvPass", "checklist passphrase 1"); p.click("#nvGo"); wait("document.querySelector('#noteBox') && document.querySelector('#noteBox').value.length>0", timeout=30000)
        shown_text = p.input_value("#noteBox")
        check("An encrypted note can't be read after a reload without the passphrase: no readable copy in storage, sealed view, not searchable, wrong passphrase refused, right one opens it",
              "checklist private note" not in dump and locked_view and not search_hit and shown_text == "checklist private note", {"readable copy stored": "checklist private note" in dump, "sealed view": locked_view, "found by search": search_hit})
        calm()

        section("Offline")
        mf = J("""async()=>{const l=document.querySelector('link[rel=manifest]'); const r=await fetch(l.href); const m=await r.json(); return {ok:r.ok, name:m.name, start:m.start_url, display:m.display, icons:(m.icons||[]).map(i=>i.sizes)}}""")
        ctl = J("!!navigator.serviceWorker.controller")
        check("Served over localhost; installable: valid manifest (name, start_url, standalone, 192 + 512 icons) and an active service worker",
              url.startswith("http://127.0.0.1") and mf["ok"] and mf["display"] == "standalone" and "192x192" in mf["icons"] and "512x512" in mf["icons"] and ctl, mf)
        note("A headless browser can't click the install prompt, so the browser's install requirements are checked instead. On a phone: browser menu → Install app.")
        f = J("id=>byId.get(id).local", vid); raw = (app_dir / f).read_bytes()
        cache_info = J("""async()=>{const out=[]; for (const n of await caches.keys()) { const c=await caches.open(n); for (const r of await c.keys()) { const x=await c.match(r); out.push([n, new URL(r.url).pathname, x.status]); } } return out}""")
        partial = [x for x in cache_info if x[2] != 200]
        full = J("""async(f)=>{const c=await caches.open('mh-media-v1'); const x=await c.match(new URL(f, location.href).href); return x ? (await x.blob()).size : -1}""", f)
        J("""async()=>{const c=await caches.open('mh-media-v1'); const ks=await c.keys(); const k=ks.find(r=>!/DEMO-V1|\\.webm$/.test(r.url)); window.__evict=k?k.url:''; if (k) await c.delete(k);}"""); ev = J("window.__evict")
        net = J("""async(u)=>{if(!u) return null; const r=await fetch(u,{headers:{Range:'bytes=0-99'}}); await r.arrayBuffer(); const c=await caches.open('mh-media-v1'); return {s:r.status, cached:!!(await c.match(u))}}""", ev)
        ctx.set_offline(True); resp = p.reload(); ready()
        from_sw = bool(resp and resp.from_service_worker); cards = J("document.querySelectorAll('#grid .card').length")
        unlock_pin()
        r206 = J("""async(f)=>{const r=await fetch(f,{headers:{Range:'bytes=100-199'}}); const b=new Uint8Array(await r.arrayBuffer()); return {s:r.status, cr:r.headers.get('content-range'), n:b.length, b:Array.from(b.slice(0,8))}}""", f)
        r416 = J("""async(f)=>{const r=await fetch(f,{headers:{Range:'bytes=-0'}}); return {s:r.status, cr:r.headers.get('content-range')}}""", f)
        rfull = J("""async(f)=>{const r=await fetch(f); return {s:r.status, n:(await r.arrayBuffer()).byteLength}}""", f)
        gone = J("""async(u)=>{if(!u) return null; const r=await fetch(u,{headers:{Range:'bytes=0-99'}}); return r.status}""", ev)
        check("Offline reload: the app shell comes from the service worker's cache and the library renders", from_sw and cards > 0, {"from service worker": from_sw, "cards": cards})
        check("Media Range requests are not cached incorrectly: only complete 200 copies are stored, a partial reply is never saved, cached media answers Range with exact 206/416/200",
              not partial and full == len(raw) and (net is None or (net["s"] == 206 and not net["cached"])) and r206["s"] == 206 and r206["cr"] == "bytes 100-199/%d" % len(raw) and r206["n"] == 100 and r206["b"] == list(raw[100:108])
              and r416["s"] == 416 and r416["cr"] == "bytes */%d" % len(raw) and rfull == {"s": 200, "n": len(raw)} and (gone is None or gone == 504),
              {"non-200 cache entries": partial, "cached copy complete": full == len(raw), "partial fetch while online": net, "offline 206": r206["s"], "offline 416": r416["s"], "offline full": rfull["s"], "uncached offline": gone})
        ctx.set_offline(False)
        section("Page health")
        check("No page errors during the whole run", not errors, errors[:5])
        b.close()
    srv.shutdown(); srv.server_close()


def report(path, app_dir):
    tot = sum(1 for _, r in SECTIONS for x in r if x[1] is not None); bad = sum(1 for _, r in SECTIONS for x in r if x[1] is False)
    L = ["# Media Hub checklist report", "", "%s · app folder `%s` · %d checks, %s" % (time.strftime("%Y-%m-%d %H:%M"), app_dir.name, tot, "all passed" if not bad else "%d failed" % bad), ""]
    for title, rows in SECTIONS:
        L += ["## " + title, ""] + [("- [%s] %s%s" % ("x" if ok else " ", label, (" — " + d) if d and not ok else "")) if ok is not None else "  - *Note: " + label + "*" for label, ok, d in rows] + [""]
    L += ["Synthetic files only; run on 127.0.0.1 in a throw-away browser profile. Your media and data were not touched."]
    Path(path).write_text("\n".join(L)); print("\n==== %d checks, %d failed ====  report: %s" % (tot, bad, path)); return bad


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0]); ap.add_argument("--app"); ap.add_argument("--report", default="checklist-report.md"); a = ap.parse_args()
    app_dir = Path(a.app) if a.app else (ROOT if (ROOT / "index.html").is_file() else ROOT / "dist" / "media-hub-app")
    app_dir = app_dir.resolve()
    if not (app_dir / "index.html").is_file(): sys.exit("No Media Hub app folder at %s (use --app DIR)" % app_dir)
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td); server_checks(tmp)
        try: browser_checks(tmp, app_dir)
        except Exception as e:
            import traceback; traceback.print_exc(); SECTIONS.append(("Browser checks stopped", [("ran to the end", False, repr(e)[:300])]))
    sys.exit(1 if report(a.report, app_dir) else 0)


if __name__ == "__main__":
    main()
