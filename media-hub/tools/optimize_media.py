#!/usr/bin/env python3
"""optimize_media.py - make a SEPARATE, reliably playable copy of a video ("best playable version").
The original is never modified, moved, renamed or overwritten.

  python3 optimize_media.py SRC [SRC ...] --out DIR [--max-width 1920] [--crf 20] [--best] [--no-audio]
                            [--thumbs] [--limit N] [--dry-run] [--force-encode]

SRC can be files or folders (searched recursively for videos and GIFs).

It always picks the LEAST processing that gives a file every browser and phone can play:
  already playable (MP4 with H.264/AV1 + AAC/MP3, or WebM with VP8/VP9/AV1 + Opus/Vorbis)  -> skipped: the original IS the best version
  playable H.264 in another container (.mov, .mkv, .avi ...)                              -> remuxed losslessly (stream copy) to MP4
  ... with an audio codec browsers can't play (PCM, AC-3 ...)                             -> video copied, only the audio re-encoded to AAC
  anything else (HEVC, MPEG-4 Part 2, 10-bit, GIF ...)                                    -> re-encoded to H.264/AAC MP4
Never upscales (width is capped at --max-width, smaller videos keep their size), always +faststart so playback starts at once.
Every source is SHA-256 hashed before and after; the run stops with an error if a source changed. Results go to
OUT/playable-report.json (merged across runs), which build_catalog.py --playable OUT uses to link the copies.
Needs ffmpeg + ffprobe (Termux: pkg install ffmpeg).
"""
import argparse, datetime, hashlib, json, os, shutil, subprocess, sys
from pathlib import Path

VIDEO_EXT = {".mp4", ".m4v", ".mov", ".mkv", ".webm", ".avi", ".wmv", ".flv", ".3gp", ".ts", ".mts", ".m2ts", ".mpg", ".mpeg", ".ogv", ".gif"}
MP4_OK = ({"h264", "av1"}, {"aac", "mp3", None})
WEBM_OK = ({"vp8", "vp9", "av1"}, {"opus", "vorbis", None})
GOOD_PIX = {"yuv420p", "yuvj420p", None}


def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""): h.update(c)
    return h.hexdigest()


def probe(p):
    r = subprocess.run(["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format", str(p)], capture_output=True, text=True)
    if r.returncode: raise RuntimeError("ffprobe could not read it: " + r.stderr.strip()[:200])
    j = json.loads(r.stdout or "{}"); st = j.get("streams", [])
    v = next((s for s in st if s.get("codec_type") == "video" and not (s.get("disposition") or {}).get("attached_pic")), None)
    a = next((s for s in st if s.get("codec_type") == "audio"), None)
    dur = float((j.get("format") or {}).get("duration") or (v or {}).get("duration") or 0)
    return {"format": (j.get("format") or {}).get("format_name", ""), "vcodec": v and v.get("codec_name"), "acodec": a and a.get("codec_name"),
            "pix": v and v.get("pix_fmt"), "width": v and v.get("width"), "height": v and v.get("height"), "duration": round(dur, 3)}


def decide(p, info, force):
    ext = p.suffix.lower(); vc, ac, pix = info["vcodec"], info["acodec"], info["pix"]
    if not vc or vc in ("png", "mjpeg", "bmp") and ext != ".gif" and info["duration"] < 0.2:
        return "not-video", "no video stream"
    if not force:
        if ext in (".mp4", ".m4v") and vc in MP4_OK[0] and ac in MP4_OK[1] and pix in GOOD_PIX:
            return "skip", "already playable everywhere: the original is the best version"
        if ext == ".webm" and vc in WEBM_OK[0] and ac in WEBM_OK[1]:
            return "skip", "already playable in browsers: the original is the best version"
        if vc == "h264" and pix in GOOD_PIX and ext != ".gif":
            if ac in MP4_OK[1]: return "remux", "H.264 in a %s container: copied into MP4 without re-encoding" % (ext or "different")
            return "remux-audio", "H.264 kept as is; audio (%s) re-encoded to AAC" % ac
    return "encode", "re-encoded to H.264/AAC (%s%s)" % (vc, "" if pix in GOOD_PIX else ", " + str(pix))


def ffmpeg_cmd(action, src, dst, a, info):
    base = ["ffmpeg", "-nostdin", "-v", "error", "-n", "-i", str(src), "-map", "0:v:0"]
    if not a.no_audio and info["acodec"]: base += ["-map", "0:a:0"]
    if action == "remux": return base + ["-c", "copy", "-movflags", "+faststart", str(dst)]
    if action == "remux-audio": return base + ["-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(dst)]
    vf = "scale='trunc(min(iw\\,%d)/2)*2':-2:flags=lanczos,setsar=1" % a.max_width          # never upscale, even dimensions for H.264
    cmd = base + ["-vf", vf, "-c:v", "libx264", "-preset", "slow" if a.best else "veryfast", "-crf", str(a.crf), "-pix_fmt", "yuv420p", "-movflags", "+faststart"]
    cmd += ["-an"] if (a.no_audio or not info["acodec"]) else ["-c:a", "aac", "-b:a", "160k"]
    return cmd + [str(dst)]


def find_sources(paths, limit):
    out = []
    for s in paths:
        p = Path(s)
        if p.is_file(): out.append(p)
        elif p.is_dir(): out += sorted(q for q in p.rglob("*") if q.is_file() and q.suffix.lower() in VIDEO_EXT and not q.name.startswith("."))
        else: print("  ! not found:", s, file=sys.stderr)
    seen, uniq = set(), []
    for p in out:
        r = p.resolve()
        if r not in seen: seen.add(r); uniq.append(p)
    return uniq[:limit] if limit else uniq


def main():
    ap = argparse.ArgumentParser(description="Make separate, reliably playable copies. Originals are never modified.")
    ap.add_argument("src", nargs="+"); ap.add_argument("--out", required=True, help="folder for the copies (created if missing)")
    ap.add_argument("--max-width", type=int, default=1920); ap.add_argument("--crf", type=int, default=20)
    ap.add_argument("--best", action="store_true", help="slower encoder preset for the best quality per byte")
    ap.add_argument("--no-audio", action="store_true"); ap.add_argument("--thumbs", action="store_true", help="also save a JPEG still from each copy")
    ap.add_argument("--limit", type=int, default=0); ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force-encode", action="store_true", help="re-encode even files that already play")
    a = ap.parse_args()
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool): sys.exit("%s is not installed (Termux: pkg install ffmpeg)" % tool)
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    rep_path = out / "playable-report.json"
    report = json.load(open(rep_path)) if rep_path.exists() else {"tool": "optimize_media.py", "files": []}
    by_sha = {e.get("source_sha256"): e for e in report.get("files", [])}
    counts = {}; changed = 0
    for src in find_sources(a.src, a.limit):
        if src.resolve().parent == out.resolve() and src.name in {Path(e.get("output") or "").name for e in report["files"]}:
            continue                                                       # never treat our own outputs as sources
        before = sha256(src)
        try: info = probe(src)
        except Exception as e: print("  ! %s: %s" % (src, e)); counts["unreadable"] = counts.get("unreadable", 0) + 1; continue
        action, why = decide(src, info, a.force_encode)
        dst = out / (src.stem + ".mp4")
        entry = {"source": str(src), "source_sha256": before, "source_bytes": src.stat().st_size, "action": action, "reason": why,
                 "video": info["vcodec"], "audio": info["acodec"], "width": info["width"], "height": info["height"], "duration": info["duration"]}
        if action in ("skip", "not-video"):
            print("  = %-40s %s" % (src.name, why))
        elif dst.resolve() == src.resolve():
            print("  ! %-40s output would replace the original; choose another --out" % src.name); entry["action"] = action = "refused"
        elif dst.exists():
            print("  = %-40s copy already exists: %s" % (src.name, dst)); entry["action"] = action = "exists"; entry["output"] = str(dst)
        elif a.dry_run:
            print("  ~ %-40s would %s -> %s" % (src.name, action, dst)); entry["action"] = action = "dry-run:" + action
        else:
            print("  > %-40s %s" % (src.name, why), flush=True)
            r = subprocess.run(ffmpeg_cmd(action, src, dst, a, info), capture_output=True, text=True)
            if r.returncode or not dst.exists():
                if dst.exists(): dst.unlink()
                print("    failed:", r.stderr.strip()[:300]); entry["action"] = action = "failed"; entry["error"] = r.stderr.strip()[:300]
            else:
                o = probe(dst); entry.update(output=str(dst), output_sha256=sha256(dst), output_bytes=dst.stat().st_size, output_video=o["vcodec"], output_audio=o["acodec"], output_width=o["width"], output_height=o["height"])
                print("    %s -> %s (%dx%d %s/%s)" % (fmt(entry["source_bytes"]), fmt(entry["output_bytes"]), o["width"] or 0, o["height"] or 0, o["vcodec"], o["acodec"] or "no audio"))
                if a.thumbs:
                    (out / "thumbs").mkdir(exist_ok=True); t = out / "thumbs" / (src.stem + ".jpg")
                    subprocess.run(["ffmpeg", "-nostdin", "-v", "error", "-n", "-ss", str(min(1.0, (o["duration"] or 2) / 2)), "-i", str(dst), "-frames:v", "1", "-q:v", "3", str(t)], capture_output=True)
                    if t.exists(): entry["thumb"] = str(t)
        after = sha256(src)
        entry["source_untouched"] = after == before
        if after != before: changed += 1; print("  !! SOURCE CHANGED DURING THE RUN:", src, file=sys.stderr)
        counts[action] = counts.get(action, 0) + 1
        if not action.startswith("dry-run"):
            by_sha[before] = entry
    report["files"] = list(by_sha.values()); report["generated"] = datetime.datetime.now().isoformat(timespec="seconds")
    if not a.dry_run: json.dump(report, open(rep_path, "w"), indent=1)
    made = counts.get("encode", 0) + counts.get("remux", 0) + counts.get("remux-audio", 0)
    print("\nDone: " + ", ".join("%d %s" % (n, k) for k, n in sorted(counts.items())) if counts else "\nNothing to do.")
    print("Source used: %s\nOriginal untouched? %s\nAnything processed? %s\nArchived? %s\nReusable later? Yes: %s (build_catalog.py --playable %s links the copies)" % (
        ", ".join(a.src), "Yes, every source re-hashed identical" if not changed else "NO, %d changed (see above)" % changed,
        ("%d separate playable cop%s made in %s" % (made, "y" if made == 1 else "ies", out)) if made else "No",
        "copies and playable-report.json in %s" % out if made else "n/a", rep_path, out))
    sys.exit(2 if changed else 0)


def fmt(n):
    for u in ("B", "KB", "MB", "GB"):
        if n < 1024: return "%.1f %s" % (n, u)
        n /= 1024
    return "%.1f TB" % n


if __name__ == "__main__":
    main()
