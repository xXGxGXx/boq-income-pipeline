#!/usr/bin/env python3
# privacy-scan: ignore-file   (this file holds the patterns themselves)
"""privacy_scan.py - look for private material before anything is committed, pushed, published or shared.

    python3 privacy_scan.py --staged                       # what `git commit` would record (the usual check)
    python3 privacy_scan.py PATH [PATH ...]                # files or folders
    python3 privacy_scan.py --staged --terms ~/private-terms.txt     # plus your own words (names, titles, categories)
    python3 privacy_scan.py --tracked                      # everything the repository holds now (what a push makes public)
    python3 privacy_scan.py --history                      # every file ever committed on this branch (slow on big repos)
    python3 privacy_scan.py --tracked --baseline .privacy-baseline   # fail only on findings not already reviewed (for CI)
    python3 privacy_scan.py --tracked --write-baseline .privacy-baseline   # record today's reviewed findings

Flags, by category
  media      photos, video, audio files (personal media rarely belongs in a repository, never in a public one)
  catalog    personal catalogs: catalog.json, media_plan.json, media-manifest.json, playable-report.json, *.tsv libraries
  cloud      Google Drive/Docs/Photos, Dropbox, OneDrive, iCloud, MEGA links to files or folders, and bare Drive file or
             folder IDs on a line that mentions Drive, a folder or a doc (an ID alone opens anything shared by link)
  device     paths on a phone or computer: /storage/emulated/0, content://, /sdcard, Termux homes, C:\\Users\\name, /Users/name
  email      email addresses (example.com / example.org / noreply addresses are ignored)
  secret     API keys and tokens (Anthropic, OpenAI, xAI, GitHub, AWS, Google, Slack), private keys, bearer tokens
  bank       bank details: BSB and account numbers, IBANs (checksum-checked), payment card numbers (Luhn-checked) and
             Australian tax file numbers (checksum-checked); shown with all but the last 2 digits hidden
  term       any word from --terms (one per line, case-insensitive; keep that file OUTSIDE the repository)
  large      files over --max-mb (default 5)
A line containing "privacy-scan: ok" is accepted as reviewed; "privacy-scan: ignore-file" in a file's first 5 lines skips it.
A baseline file lists reviewed findings as "category<TAB>path<TAB>detail" (no line numbers, so edits elsewhere in a file
don't break it; a changed media file's size changes its entry, so it is reviewed again).
Matches are shown masked. Exit code 0 = nothing found, 1 = something to review, 2 = bad usage.
"""
import argparse, fnmatch, os, re, subprocess, sys

MEDIA_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".heic", ".heif", ".avif", ".bmp", ".tif", ".tiff", ".raw", ".dng",
             ".mp4", ".m4v", ".mov", ".webm", ".mkv", ".avi", ".3gp", ".wmv", ".flv", ".ts", ".mts",
             ".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg", ".opus", ".amr"}
CATALOG_NAMES = {"catalog.json", "media_plan.json", "media-manifest.json", "playable-report.json", "media_catalog.tsv", "manifest.json"}

# Named exclusion: payout receiving details (BSB + account, deposits only)
# Authorized per AUTHORIZATION-v2.md in 00 - Handover Protocol/Payout & Receiving Details/
# Opt-in access only; every access logged in MERGE-LOG with one-line reason.
# Scanner reports these as KNOWN_POSITIVE (acknowledged, not hidden) so the signal stays loud for real leaks.
PAYOUT_EXCLUSION_PATHS = [
    "00 - Handover Protocol/Payout & Receiving Details/",
]

TEXT_EXT_SKIP = MEDIA_EXT | {".zip", ".gz", ".7z", ".rar", ".pdf", ".xlsx", ".docx", ".pptx", ".woff", ".woff2", ".ttf", ".ico", ".pyc", ".bin", ".bundle"}
PATTERNS = [
    ("cloud", re.compile(r"https?://(?:drive|docs|photos)\.google\.com/[^\s\"'<>)]*(?:/d/|/folders/|[?&]id=|/share/)[\w-]{10,}", re.I)),
    ("cloud", re.compile(r"https?://photos\.app\.goo\.gl/[\w-]+|https?://(?:www\.)?dropbox\.com/(?:s|scl|sh)/[\w/-]+|https?://1drv\.ms/[\w/!-]+|"
                         r"https?://onedrive\.live\.com/[^\s\"'<>]+|https?://(?:www\.)?icloud\.com/(?:share|photos|iclouddrive)/[^\s\"'<>]+|https?://mega\.nz/[^\s\"'<>]+", re.I)),
    ("device", re.compile(r"/storage/emulated/\d+/[^\s\"'<>]*|content://[\w.]+/[^\s\"'<>]+|/sdcard/[^\s\"'<>]+|/data/data/com\.termux/files/home/[^\s\"'<>]*|"
                          r"[A-Za-z]:\\Users\\(?!Public\\|Default\\)[\w .-]+\\[^\s\"'<>]*|/Users/(?!Shared/)[\w.-]+/[^\s\"'<>]*")),
    ("email", re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")),
    ("secret", re.compile(r"sk-ant-[A-Za-z0-9_-]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{32,}|xai-[A-Za-z0-9]{20,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|"
                          r"AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[abpr]-[A-Za-z0-9-]{10,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|"
                          r"[Bb]earer\s+[A-Za-z0-9._~+/-]{30,}=*")),
]
DRIVE_ID = re.compile(r"(?<![\w-])1[A-Za-z0-9_-]{24,43}(?![\w-])")
DRIVE_CONTEXT = re.compile(r"drive|folder|gdoc|google ?doc|docs\.google", re.I)
BSB_NO = re.compile(r"(?i)\bBSB\b[\s:#.-]*(\d{3}[- ]?\d{3})(?!\d)")
BSB_ACCT = re.compile(r"(?<![\d.])(\d{3}[- ]?\d{3}\s*/\s*(?:(?:acc(?:ount|t)?|a/c)\.?\s*(?:no\.?\s*)?)?\d{6,10})(?![\d.])", re.I)
ACCOUNT_NO = re.compile(r"(?i)\b(?:acc(?:ount|t)?|a/c)\.?(?:\s*(?:no\.?|number|num|#))?[\s:#.-]*(\d[\d -]{4,13}\d)(?![\d.])")
IBAN = re.compile(r"\b([A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?)\b")
CARD = re.compile(r"(?<![\w.-])([2-6]\d{3}(?:[ -]?\d){9,15})(?![\w.-])")
TFN = re.compile(r"(?i)\b(?:tfn|tax file(?: number)?)\b[^0-9\n]{0,20}(\d{3}[ -]?\d{3}[ -]?\d{2,3})(?!\d)")
EMAIL_OK = re.compile(r"@(?:(?:[\w-]+\.)*example\.(?:com|org|net)|[\w.-]+\.invalid|anthropic\.com)$|^(?:noreply|no-reply|git|user|you|name)@", re.I)


def read_bytes(path):
    with open(path, "rb") as f:
        return f.read()


def mask(s):
    s = s.strip()
    return s if len(s) <= 12 else s[:8] + "…" + s[-4:]


def mask_digits(s):
    """Hide every digit but the last two, so a report never repeats a real number."""
    return re.sub(r"\d(?=(?:\D*\d){2})", "•", s.strip())


def luhn_ok(digits):
    total = 0
    for i, d in enumerate(reversed(digits)):
        n = int(d) * (2 if i % 2 else 1)
        total += n - 9 if n > 9 else n
    return 13 <= len(digits) <= 19 and total % 10 == 0


def iban_ok(iban):
    s = iban.replace(" ", "")
    if not 15 <= len(s) <= 34:
        return False
    moved = s[4:] + s[:4]
    return int("".join(str(int(c, 36)) for c in moved)) % 97 == 1


def tfn_ok(digits):
    weights = (1, 4, 3, 7, 5, 8, 6, 9, 10) if len(digits) == 9 else (10, 7, 8, 4, 6, 3, 5, 1)
    return len(digits) in (8, 9) and sum(int(d) * w for d, w in zip(digits, weights)) % 11 == 0


def bank_findings(line):
    """Bank, card and tax numbers on one line, as masked descriptions (empty when there are none)."""
    out, seen = [], set()

    def add(kind, raw):
        digits = re.sub(r"\D", "", raw)
        if not any(digits in s for s in seen):
            seen.add(digits); out.append("%s %s" % (kind, mask_digits(raw)))
    for m in BSB_ACCT.finditer(line):
        add("BSB and account number", m.group(1))
    for m in BSB_NO.finditer(line):
        add("BSB", m.group(1))
    for m in ACCOUNT_NO.finditer(line):
        raw = m.group(1)
        if len(re.sub(r"\D", "", raw)) >= 6 and not any(re.sub(r"\D", "", raw) in s for s in seen):
            add("account number", raw)
    for m in IBAN.finditer(line):
        if iban_ok(m.group(1)):
            add("IBAN", m.group(1))
    for m in CARD.finditer(line):
        digits = re.sub(r"\D", "", m.group(1))
        if luhn_ok(digits):
            add("card number", m.group(1))
    for m in TFN.finditer(line):
        if tfn_ok(re.sub(r"\D", "", m.group(1))):
            add("tax file number", m.group(1))
    return out


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


def _is_payout_excluded(name):
    """True when path matches a named payout exclusion (normalized to forward slashes)."""
    norm = name.replace(os.sep, "/")
    return any(norm.startswith(ex.rstrip("/")) or norm.startswith(ex) for ex in PAYOUT_EXCLUSION_PATHS)


def scan(files, terms=(), max_mb=5.0, allow=()):
    findings = []
    known_positives = []
    term_res = [(t, re.compile(r"(?<![A-Za-z0-9])" + re.escape(t) + r"(?![A-Za-z0-9])", re.I)) for t in terms if t]
    for name, read in files:
        if any(fnmatch.fnmatch(name, g) or fnmatch.fnmatch(name, "*/" + g) or fnmatch.fnmatch(os.path.basename(name), g) for g in allow):
            continue
        if _is_payout_excluded(name):
            known_positives.append(name)
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
            for what in bank_findings(line):
                findings.append(("bank", name, ln, what))
            if DRIVE_CONTEXT.search(line):
                for m in DRIVE_ID.finditer(line):
                    tok = m.group(0)
                    if re.search(r"[a-z]", tok) and re.search(r"[A-Z]", tok) and not any(tok in f[3] for f in findings[-5:]):
                        findings.append(("cloud", name, ln, "Drive ID " + mask(tok)))
            for t, rx in term_res:
                if rx.search(line):
                    findings.append(("term", name, ln, "matches one of your private terms (%s)" % mask(t)))
    return findings, known_positives


def baseline_key(finding):
    cat, name, _ln, what = finding
    return "\t".join((cat, name.replace(os.sep, "/"), what))


def read_baseline(path):
    with open(path, encoding="utf-8") as f:
        return {l.rstrip("\n") for l in f if l.strip() and not l.startswith("#")}


def main(argv=None):
    ap = argparse.ArgumentParser(description="Find private material before committing, pushing or publishing.")
    ap.add_argument("paths", nargs="*"); ap.add_argument("--staged", action="store_true"); ap.add_argument("--history", action="store_true")
    ap.add_argument("--tracked", action="store_true", help="every file git tracks now (what a pushed repository shows)")
    ap.add_argument("--terms", help="file with one private word or phrase per line (keep it outside the repository)")
    ap.add_argument("--allow", action="append", default=[], help="glob to accept, e.g. --allow 'icons/*.png' (repeatable)")
    ap.add_argument("--max-mb", type=float, default=5.0)
    ap.add_argument("--baseline", help="file of reviewed findings to accept; only new findings fail")
    ap.add_argument("--write-baseline", help="write every current finding to FILE as reviewed, then exit 0")
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
    found, known_positives = scan(files, terms, a.max_mb, a.allow)
    for kp in known_positives:
        print("KNOWN_POSITIVE  %s  (payout receiving details — authorized exclusion, not a leak)" % kp)
    if a.write_baseline:
        if terms:
            print("not writing a baseline that includes --terms findings (it would name your private words)", file=sys.stderr); return 2
        keys = sorted({baseline_key(f) for f in found})
        with open(a.write_baseline, "w", encoding="utf-8") as f:
            f.write("# privacy-scan: ignore-file\n# Reviewed findings accepted by privacy_scan.py --baseline (category, path, masked detail).\n"
                    "# Remove a line when its file is fixed; add lines only after checking that the finding is safe to publish.\n")
            f.writelines(k + "\n" for k in keys)
        print("%d finding(s) written to %s" % (len(keys), a.write_baseline)); return 0
    accepted = 0
    if a.baseline:
        try:
            known = read_baseline(a.baseline)
        except OSError as exc:
            print("can't read baseline:", exc, file=sys.stderr); return 2
        kept = [f for f in found if baseline_key(f) not in known]
        accepted, found = len(found) - len(kept), kept
    by_cat = {}
    for cat, name, ln, what in found:
        by_cat.setdefault(cat, []).append((name, ln, what))
    for cat in sorted(by_cat):
        print("== %s (%d)" % (cat, len(by_cat[cat])))
        for name, ln, what in by_cat[cat][:50]:
            print("   %s%s  %s" % (name, (":%d" % ln) if ln else "", what))
        if len(by_cat[cat]) > 50:
            print("   … %d more" % (len(by_cat[cat]) - 50))
    print("%d file(s) scanned: %s%s" % (len(files), ("%d finding(s) to review" % len(found)) if found else ("nothing new" if a.baseline else "nothing private found"),
                                        (" (%d already reviewed, in the baseline)" % accepted) if accepted else ""))
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main())
