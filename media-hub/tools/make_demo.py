#!/usr/bin/env python3
"""make_demo.py - generate a small SYNTHETIC demo library so Media Hub builds and runs from a clean checkout.

    python3 tools/make_demo.py build/demo
    python3 tools/build.py --catalog build/demo/catalog.json --plan build/demo/media_plan.json --out dist

Everything it makes is generated here: colour-gradient pictures (pure Python), a tone (WAV) and, when ffmpeg is
installed, short gradient clips (VP9/WebM, H.264/MP4) with a poster frame. No real photos, no personal data,
and the links point at example.com. Your own library is built with build_catalog.py instead and never belongs in git.
"""
import hashlib, json, math, os, shutil, struct, subprocess, sys, time, wave, zlib

PICS = [  # code, title, category, w, h, hue, tags, source
    ("DEMO-01", "Harbour at dawn", "Travel", 1600, 900, 205, ["sea", "morning"], "This device"),
    ("DEMO-02", "Desert road", "Travel", 1600, 900, 32, ["road", "warm"], "This device"),
    ("DEMO-03", "Forest light", "Nature", 1200, 1200, 120, ["trees", "green"], "Camera"),
    ("DEMO-04", "City at night", "City", 1080, 1920, 260, ["night", "vertical"], "Camera"),
    ("DEMO-05", "Beach sunset", "Travel", 1920, 1080, 12, ["beach", "sunset"], "This device"),
    ("DEMO-06", "Snow ridge", "Nature", 1600, 1000, 190, ["snow", "cold"], "Gallery"),
    ("DEMO-07", "Market colours", "City", 1000, 1500, 330, ["street", "vertical"], "Screenshots"),
    ("DEMO-08", "Quiet lake", "Nature", 1600, 900, 170, ["water", "calm"], "Gallery"),
    ("AI-DEMO-01", "Generated nebula", "AI renders", 1024, 1024, 280, ["ai-generated", "space"], "AI"),
    ("AI-DEMO-02", "Generated glass city", "AI renders", 1024, 1536, 220, ["ai-generated", "city"], "AI"),
]
LINKS = [  # code, title, kind, category, link, tags
    ("WEB-01", "Example clip on the web", "video", "Web saves", "https://example.com/clips/one", ["web"]),
    ("WEB-02", "Example picture on the web", "image", "Web saves", "https://example.org/pictures/two.jpg", ["web"]),
    ("DRV-01", "Drive clip (placeholder id)", "video", "Drive", "https://drive.google.com/file/d/DEMO_PLACEHOLDER_ID_0001/view", ["drive"]),
]


def hsl(h, s, l):
    c = (1 - abs(2 * l - 1)) * s; x = c * (1 - abs((h / 60) % 2 - 1)); m = l - c / 2
    r, g, b = [(c, x, 0), (x, c, 0), (0, c, x), (0, x, c), (x, 0, c), (c, 0, x)][int(h // 60) % 6]
    return tuple(int((v + m) * 255) for v in (r, g, b))


def png(path, w, h, hue):
    """A diagonal two-colour gradient with soft rings, written as a real PNG (no dependencies)."""
    a, b = hsl(hue, .55, .42), hsl((hue + 50) % 360, .6, .18)
    cx, cy, rows = w * .68, h * .32, []
    for y in range(h):
        row = bytearray(b"\x00")
        for x in range(w):
            t = (x / w + y / h) / 2
            ring = .5 + .5 * math.cos(math.hypot(x - cx, y - cy) / (min(w, h) / 14))
            k = .12 * ring
            row += bytes(min(255, int(a[i] * (1 - t) + b[i] * t + 255 * k * (1 - t))) for i in range(3))
        rows.append(bytes(row))
    raw = zlib.compress(b"".join(rows), 6)
    chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    open(path, "wb").write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", raw) + chunk(b"IEND", b""))


def tone(path, secs=6, rate=22050):
    with wave.open(path, "wb") as wv:
        wv.setnchannels(1); wv.setsampwidth(2); wv.setframerate(rate)
        fr = bytearray()
        for n in range(secs * rate):
            env = min(1, n / 2000, (secs * rate - n) / 4000)
            v = env * .3 * (math.sin(2 * math.pi * 330 * n / rate) + .5 * math.sin(2 * math.pi * 495 * n / rate))
            fr += struct.pack("<h", int(v * 32767 / 1.5))
        wv.writeframes(bytes(fr))


def sha(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""): h.update(c)
    return h.hexdigest()


def main():
    if len(sys.argv) != 2: sys.exit(__doc__)
    out = os.path.abspath(sys.argv[1]); med = os.path.join(out, "media"); os.makedirs(os.path.join(med, "posters"), exist_ok=True)
    items, plan, now = [], [], int(time.time() * 1000)

    def local(it, rel, mime, derived=False):
        p = os.path.join(out, rel); d = {"code": it["code"] + ("-poster" if derived else ""), "src": rel, "dest": rel, "sha256": sha(p), "bytes": os.path.getsize(p), "mime": mime}
        if derived: d["derived"] = True
        plan.append(d); return d

    # PNG width scales the time it takes; keep the stored pictures modest, the declared resolution is what the app shows
    for n, (code, title, cat, w, h, hue, tags, src) in enumerate(PICS):
        sw, sh = (w // 4, h // 4)
        rel = "media/%s.png" % code; png(os.path.join(out, rel), sw, sh, hue)
        it = {"id": code, "code": code, "title": title, "kind": "image", "category": cat, "source": src, "res": "%d×%d" % (sw, sh), "tags": tags, "link": "",
              "added": now - n * 86400000, "desc": "Synthetic demo picture: a generated gradient, not a photo."}
        d = local(it, rel, "image/png"); it.update(local=rel, mime="image/png", bytes=d["bytes"], sha256=d["sha256"]); items.append(it)

    rel = "media/DEMO-TONE.wav"; tone(os.path.join(out, rel))
    it = {"id": "DEMO-TONE", "code": "DEMO-TONE", "title": "Two-note tone", "kind": "audio", "category": "Sounds", "source": "This device", "res": "", "tags": ["tone"], "link": "", "added": now - 3600000,
          "desc": "Synthetic six-second tone.", "audio": "a two-note chord"}
    d = local(it, rel, "audio/wav"); it.update(local=rel, mime="audio/wav", bytes=d["bytes"], sha256=d["sha256"]); items.append(it)

    if shutil.which("ffmpeg"):
        clips = [("DEMO-CLIP", "Gradient loop (WebM)", "webm", ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "40", "-deadline", "realtime", "-c:a", "libopus"], "video/webm", "640x360"),
                 ("DEMO-CLIP-HD", "Gradient loop (MP4)", "mp4", ["-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart"], "video/mp4", "1280x720"),
                 ("DEMO-VERT", "Vertical gradient (WebM)", "webm", ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "40", "-deadline", "realtime", "-c:a", "libopus"], "video/webm", "360x640")]
        for code, title, ext, enc, mime, size in clips:
            rel = "media/%s.%s" % (code, ext); p = os.path.join(out, rel)
            cmd = ["ffmpeg", "-nostdin", "-v", "error", "-y", "-f", "lavfi", "-i", "gradients=s=%s:d=12:speed=0.03:r=24" % size, "-f", "lavfi", "-i", "sine=frequency=440:duration=12", "-shortest"] + enc + [p]
            if subprocess.run(cmd).returncode or not os.path.exists(p): print("  skipped", code, "(this ffmpeg lacks the encoder)"); continue
            w, h = size.split("x")
            it = {"id": code, "code": code, "title": title, "kind": "video", "category": "Clips", "source": "Camera", "res": "%s×%s" % (w, h), "tags": ["clip", "vertical"] if int(h) > int(w) else ["clip"],
                  "link": "", "added": now - 7200000, "desc": "Synthetic twelve-second gradient clip with a test tone."}
            d = local(it, rel, mime); it.update(local=rel, mime=mime, bytes=d["bytes"], sha256=d["sha256"])
            prel = "media/posters/%s.jpg" % code
            if not subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-ss", "1", "-i", p, "-frames:v", "1", "-q:v", "4", os.path.join(out, prel)]).returncode:
                local(it, prel, "image/jpeg", derived=True); it["poster"] = prel
            items.append(it)
    else:
        print("  ffmpeg not found: the demo has pictures and audio but no clips")

    for code, title, kind, cat, link, tags in LINKS:
        it = {"id": code, "code": code, "title": title, "kind": kind, "category": cat, "source": "Google Drive" if "drive.google" in link else "Web", "res": "", "tags": tags, "link": link,
              "added": now - 5 * 86400000, "desc": "Placeholder link for the demo; it does not lead to real media."}
        if "/d/" in link: it["driveId"] = link.split("/d/")[1].split("/")[0]
        items.append(it)

    vault = [{"path": "Phone/DCIM/Camera", "files": 120, "size": 812345678, "note": "Example snapshot entry"},
             {"path": "Phone/Pictures/Screenshots", "files": 48, "size": 23456789, "note": ""}]
    ws = [{"id": "ws-1", "title": "Trip packing list", "collection": "Notes", "type": "NOTE", "size": 210, "file": "packing.txt", "path": "notes/packing.txt", "filed": "", "note": "", "tags": ["travel"], "sha256": "", "text": "Passport\nCharger\nCamera"},
          {"id": "ws-2", "title": "Camera settings", "collection": "Reference", "type": "FILE", "size": 4096, "file": "settings.pdf", "path": "ref/settings.pdf", "filed": "", "note": "Example", "tags": [], "sha256": ""}]
    meta = {"version": "2.2-demo", "built": time.strftime("%Y-%m-%d"), "count": len(items), "local": sum(1 for p in plan if not p.get("derived")), "mirrorSource": "synthetic demo (tools/make_demo.py)",
            "workspaceSource": "demo workspace (%d items)" % len(ws), "vaultSnapshot": "demo snapshot", "cloud": [{"name": "Example cloud folder", "url": "https://example.com/folder"}]}
    json.dump({"meta": meta, "items": items, "vault": vault, "workspace": {"items": ws}}, open(os.path.join(out, "catalog.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump({"mirror": out, "media": plan}, open(os.path.join(out, "media_plan.json"), "w"), indent=1)
    print("demo: %d items (%d local files) -> %s" % (len(items), meta["local"], out))


if __name__ == "__main__":
    main()
