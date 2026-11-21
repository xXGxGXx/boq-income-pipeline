#!/usr/bin/env python3
# privacy-scan: ignore-file   (this file holds the patterns themselves)
"""privacy_scan.py - look for private material before anything is committed, pushed, published or shared.

    python3 privacy_scan.py --staged                       # what `git commit` would record (the usual check)
    python3 privacy_scan.py PATH [PATH ...]                # files or folders
    python3 privacy_scan.py --staged --terms ~/private-terms.txt     # plus your own words (names, titles, categories)
    python3 privacy_scan.py --tracked                      # everything the repository holds now (what a push makes public)
    python3 privacy_scan.py --history                      # every file ever committed on this branch (slow on big repos)

Flags, by category
  media      photos, video, audio files (personal media rarely belongs in a repository, never in a public one)
  catalog    personal catalogs: catalog.json, media_plan.json, media-manifest.json, playable-report.json, *.tsv libraries
  cloud      Google Drive/Docs/Photos, Dropbox, OneDrive, iCloud, MEGA links to files or folders
  device     paths on a phone or computer: /storage/emulated/0, content://, /sdcard, Termux homes, C:\\Users\\name, /Users/name
  email      email addresses (example.com / example.org / noreply addresses are ignored)
  secret     API keys and tokens (Anthropic, OpenAI, xAI, GitHub, AWS, Google, Slack), private keys, bearer tokens
  term       any word from --terms (one per line, case-insensitive; keep that file OUTSIDE the repository)
  large      files over --max-mb (default 5)
A line containing "privacy-scan: ok" is accepted as reviewed; "privacy-scan: ignore-file" in a file's first 5 lines skips it.
Matches are shown masked. Exit code 0 = nothing found, 1 = something to review, 2 = bad usage.
"""
import argparse, fnmatch, os, re, subprocess, sys

MEDIA_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif", ".avif", ".bmp", ".tif", ".tiff", ".raw", ".dng",
             ".mp4", ".m4v", ".mov", ".webm", ".mkv", ".avi", ".3gp", ".wmv", ".flv", ".ts", ".mts",
             ".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg", ".opus", ".amr"}
CATALOG_NAMES = {"catalog.json", "media_plan.json", "media-manifest.json", "playable-report.json", "media_catalog.tsv", "manifest.json"}
TEXT_EXT_SKIP = MEDIA_EXT | {".zip", ".gz", ".7z", ".rar", ".pdf", ".xlsx", ".docx", ".pptx", ".woff", ".woff2", ".ttf", ".ico", ".pyc", ".bin", ".bundle"}
PATTERNS = [
    ("cloud", re.compile(r"https?://(?:drive|docs|photos)\.google\.com/[^\s\"'<>)]*(?:/d/|/folders/|[?&]id=|/share/)[\w-]{10,}", re.I)),
    ("cloud", re.compile(r"https?://photos\.app\.goo\.gl/[\w-]+|https?://(?:www\.)?dropbox\.com/(?:s|scl|sh)/[\w/-]+|https?://1drv\.ms/[\w/!-]+|"
                         r"https?://onedrive\.live\.com/[^\s\"'<>]+|https?://(?:www\.)?icloud\.com/(?:share|photos|iclouddrive)/[^\s\"'<>]+|https?://mega\.nz/[^\s\"'<>]+", re.I)),
    ("device", re.compile(r"/storage/emulated/\d+/[^\s\"'<>]*|content://[\w.]+/[^\s\"'<>]+|/sdcard/[^\s\"'<>]+|/data/data/com\.termux/files/home/[^\s\"'<>]+|"
                          r"[A-Za-z]:\\Users\\(?!Public\\|Default\\)[\w .-]+\\[^\s\"'<>]*|/Users/(?!Shared/)[\w.-]+/[^\s\"'<>]+")),
    ("email", re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")),
    ("secret", re.compile(r"sk-ant-[A-Za-z0-9_-]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{32,}|xai-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|"
                          r"AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[abpr]-[A-Za-z0-9-]{10,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"
                          r"[Bb]earer\s+[A-Za-z0-9._~+/-]{30,}=*")),
]
EMAIL_OK = re.compile(r"@(?:example\.(?:com|org|net)|[\w.-]+\.invalid|anthropic\.com)$|^(?:noreply|no-reply|git|user|you|name)@", re.I)


def read_bytes(path):
    with open(path, "rb") as f:
        return f.read()


def mask(s):
    s = s.strip()
    return s if len(s) <= 12 else s[:8] + "…" + s[-4:]


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, check=True).stdout


def staged_files():
    names = git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z").decode(errors="replace").split("\0")
    return [(n, (lambda n=n: git("show", ":" + n))) for n in names if n]


def tracked_files():
    names = git("ls-files", "-z").decode(errors="replace").split("\0")
    return [(n, (lambda n=n: read_bytes(n))) for n in names if n and os.path.isfile(n) and not os.path.islink(n)]


def history_files():
    names = sorted(set(git("log", "--all", "--pretty=format:", "--name-only", "-z").decode(errors="replace").replace("\n", "\0").split("\0")) - {""})
    out = []
    for n in names:
        def reader(n=n):
            rev = git("log", "--all", "-1", "--pretty=format:%H", "--", n).decode().strip()
            try:
                return git("show", "%s:%s" % (rev, n))
            except subprocess.CalledProcessError:
                return b""
        out.append((n, reader))
    return out


def walk(paths):
    out = []
    for p in paths:
        if os.path.isfile(p):
            out.append((p, (lambda p=p: read_bytes(p))))
        elif os.path.isdir(p):
            for dp, dns, fns in os.walk(p):
                dns[:] = [d for d in dns if d not in (".git", "node_modules", "__pycache__")]
                for f in fns:
                    fp = os.path.join(dp, f)
                    if not os.path.islink(fp):
                        out.append((fp, (lambda fp=fp: read_bytes(fp))))
        else:
            print("  not found:", p, file=sys.stderr)
    return out


def scan(files, terms=(), max_mb=5.0, allow=()):
    findings = []
    term_res = [(t, re.compile(r"(?<![A-Za-z0-9])" + re.escape(t) + r"(?![A-Za-z0-9])", re.I)) for t in terms if t]
    for name, read in files:
        if any(fnmatch.fnmatch(name, g) or fnmatch.fnmatch(name, "*/" + g) or fnmatch.fnmatch(os.path.basename(name), g) for g in allow):
            continue
        base, ext = os.path.basename(name).lower(), os.path.splitext(name)[1].lower()
        try:
            data = read()
        except (OSError, subprocess.CalledProcessError):
            continue
        if ext in MEDIA_EXT:
            findings.append(("media", name, 0, "%s file, %.1f KB" % (ext, len(data) / 1024)))
        if base in CATALOG_NAMES and (base != "manifest.json" or b'"sha256"' in data[:200000]):
            findings.append(("catalog", name, 0, "personal catalog or media manifest"))
        if base.endswith(".tsv") and b"\t" in data[:2000] and re.search(rb"(?i)^code\ttitle", data[:200]):
            findings.append(("catalog", name, 0, "catalog table"))
        if len(data) > max_mb * 1048576:
            findings.append(("large", name, 0, "%.1f MB" % (len(data) / 1048576)))
        if ext in TEXT_EXT_SKIP or b"\0" in data[:4096]:
            continue
        text = data.decode("utf-8", errors="replace")
        if "privacy-scan: ignore-file" in "\n".join(text.splitlines()[:5]):
            continue
        for ln, line in enumerate(text.splitlines(), 1):
            if "privacy-scan: ok" in line:
                continue
            for cat, rx in PATTERNS:
                for m in rx.finditer(line):
                    if cat == "email" and EMAIL_OK.search(m.group(0)):
                        continue
                    findings.append((cat, name, ln, mask(m.group(0))))
            for t, rx in term_res:
                if rx.search(line):
                    findings.append(("term", name, ln, "matches one of your private terms (%s)" % mask(t)))
    return findings


def main(argv=None):
    ap = argparse.ArgumentParser(description="Find private material before committing, pushing or publishing.")
    ap.add_argument("paths", nargs="*"); ap.add_argument("--staged", action="store_true"); ap.add_argument("--history", action="store_true")
    ap.add_argument("--tracked", action="store_true", help="every file git tracks now (what a pushed repository shows)")
    ap.add_argument("--terms", help="file with one private word or phrase per line (keep it outside the repository)")
    ap.add_argument("--allow", action="append", default=[], help="glob to accept, e.g. --allow 'icons/*.png' (repeatable)")
    ap.add_argument("--max-mb", type=float, default=5.0)
    a = ap.parse_args(argv)
    if not (a.paths or a.staged or a.history or a.tracked):
        ap.error("give paths, --staged, --tracked or --history")
    terms = []
    if a.terms:
        with open(os.path.expanduser(a.terms), encoding="utf-8") as f:
            terms = [l.strip() for l in f if l.strip() and not l.startswith("#")]
    files = []
    try:
        if a.staged:
            files += staged_files()
        if a.history:
            files += history_files()
        if a.tracked:
            files += tracked_files()
    except (OSError, subprocess.CalledProcessError) as exc:
        print("git failed (run inside a repository):", exc, file=sys.stderr); return 2
    files += walk(a.paths)
    found = scan(files, terms, a.max_mb, a.allow)
    by_cat = {}
    for cat, name, ln, what in found:
        by_cat.setdefault(cat, []).append((name, ln, what))
    for cat in sorted(by_cat):
        print("== %s (%d)" % (cat, len(by_cat[cat])))
        for name, ln, what in by_cat[cat][:50]:
            print("   %s%s  %s" % (name, (":%d" % ln) if ln else "", what))
        if len(by_cat[cat]) > 50:
            print("   … %d more" % (len(by_cat[cat]) - 50))
    print("%d file(s) scanned: %s" % (len(files), ("%d finding(s) to review" % len(found)) if found else "nothing private found"))
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
