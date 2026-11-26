#!/usr/bin/env python3
"""check_repo.py - catch the ways files in a git repository actually break, before (or right after) they land.

    python3 check_repo.py                      # every file git tracks, as it is on disk now
    python3 check_repo.py --rev origin/main    # a commit or branch, read straight from git (no checkout needed)

Checks
  placeholder  a file whose content is an unexpanded shell command such as $(cat /tmp/file.md). This happens when a
               file is written through an API or connector: nothing runs the shell, so the command itself is saved.
               MASTER-ORCHESTRATOR-REFERENCE.md was replaced this way three times.
  size         key documents missing or shrunk far below their real size (deleted or truncated by mistake). List them
               in .check-repo.json at the repository root: {"min_bytes": {"README.md": 300, "docs/spec.md": 10000}}
  conflict     leftover merge-conflict markers (<<<<<<< / >>>>>>>)
  hidden       invisible characters: control bytes such as a form feed (one replaced the f of "function" and broke a
               whole page), bidirectional overrides that make code read differently from how it runs, stray BOMs
  python       Python files that don't compile
  json         JSON files that don't parse
  shell        shell scripts with syntax errors (bash -n)
  js           JavaScript files with syntax errors (node --check), when Node is installed
  generated    files that must never be committed even if .gitignore loses its rule: buyer zips in release-out/,
               APK/AAB builds, signing keystores, .env files and local.properties
Exit code 0 = all good, 1 = problems listed, 2 = bad usage.
"""
import argparse, json, os, re, shutil, subprocess, sys, tempfile

CONFIG_NAME = ".check-repo.json"   # optional; {"min_bytes": {path: smallest believable size}}
BINARY_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".mp4", ".webm", ".mov", ".mp3", ".wav", ".zip", ".gz",
              ".jar", ".apk", ".pdf", ".xlsx", ".docx", ".woff", ".woff2", ".ttf", ".skill", ".bundle", ".pyc"}
PROSE_EXT = {".md", ".txt", ".json", ".html", ".htm", ".yaml", ".yml", ".csv", ".tsv", ".xml", ""}
WHOLE_FILE_COMMAND = re.compile(r"^(?:\$\([^()\n]{1,300}\)|\$\{[^{}\n]{1,300}\}|`[^`\n]{1,300}`|<<-?\s*['\"]?\w+['\"]?)$")
COMMAND_LINE = re.compile(r"^\s*\$\((?:cat|<)\s+[^()]+\)\s*$")
HIDDEN = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u200b\u202a-\u202e\u2066-\u2069\ufeff]")   # a BOM is fine only as the first byte
HIDDEN_NAMES = {"\x0c": "form feed", "\x0b": "vertical tab", "\x00": "NUL", "\x1b": "escape", "\x7f": "DEL",
                "\u200b": "zero-width space", "\ufeff": "byte-order mark inside the file"}
# Mirrors the important .gitignore rules, so a force-add or a deleted ignore line still turns the check red.
NEVER_COMMIT_DIRS = {"release-out": "buyer zip (products are sold, never published here)"}
NEVER_COMMIT_EXT = {".apk": "app build", ".aab": "app build", ".jks": "signing keystore (secret)", ".keystore": "signing keystore (secret)"}


def never_commit(name):
    """Why this tracked path must not be in the repository, or None."""
    parts = name.replace("\\", "/").split("/")
    for d in parts[:-1]:
        if d in NEVER_COMMIT_DIRS:
            return NEVER_COMMIT_DIRS[d]
    base = parts[-1]
    if base == "local.properties":
        return "local SDK paths from someone's computer"
    if base == ".env" or (base.startswith(".env.") and base != ".env.example"):
        return "environment file (secrets)"
    return NEVER_COMMIT_EXT.get(os.path.splitext(base)[1].lower())


def git(*args, binary=False):
    out = subprocess.run(["git", *args], capture_output=True, check=True).stdout
    return out if binary else out.decode("utf-8", errors="replace")


def list_files(rev):
    if rev:
        names = [n for n in git("ls-tree", "-r", "-z", "--name-only", rev).split("\0") if n]
        return [(n, (lambda n=n: git("show", "%s:%s" % (rev, n), binary=True))) for n in names]
    names = [n for n in git("ls-files", "-z").split("\0") if n]

    def read(n):
        with open(n, "rb") as f:
            return f.read()
    return [(n, (lambda n=n: read(n))) for n in names if os.path.isfile(n) and not os.path.islink(n)]


def syntax_check(cmd, data, suffix):
    """Run a syntax checker on the bytes via a temporary file; returns the first error line or None."""
    with tempfile.NamedTemporaryFile("wb", suffix=suffix, delete=False) as tmp:
        tmp.write(data)
    try:
        r = subprocess.run(cmd + [tmp.name], capture_output=True, text=True, timeout=60)
    finally:
        os.unlink(tmp.name)
    if r.returncode == 0:
        return None
    lines = [l for l in (r.stderr or r.stdout).splitlines() if l.strip()]
    msg = next((l for l in lines if "Error" in l or "error" in l), lines[0] if lines else "failed")
    return msg.replace(tmp.name, "file")[:200]


def load_key_files(files):
    """Key documents and their size floors, from .check-repo.json in the checked tree (none when it is absent)."""
    for name, read in files:
        if name == CONFIG_NAME:
            try:
                floors = json.loads(read().decode("utf-8")).get("min_bytes", {})
                return {str(k): int(v) for k, v in floors.items()}
            except (ValueError, AttributeError, TypeError) as exc:
                raise ValueError("%s is not valid: %s" % (CONFIG_NAME, exc))
    return {}


def check(files, key_files=None):
    key_files = load_key_files(files) if key_files is None else key_files
    problems = []
    add = lambda kind, name, what: problems.append((kind, name, what))
    seen = set()
    has_bash, has_node = shutil.which("bash"), shutil.which("node")
    for name, read in files:
        seen.add(name)
        why = never_commit(name)
        if why:
            add("generated", name, why + "; remove it with git rm --cached and keep its .gitignore rule")
        ext = os.path.splitext(name)[1].lower()
        if ext in BINARY_EXT:
            continue
        try:
            data = read()
        except (OSError, subprocess.CalledProcessError):
            add("read", name, "could not read"); continue
        if b"\0" in data[:8192]:
            continue
        text = data.decode("utf-8", errors="replace")
        stripped = text.strip()
        lines = [l[:-1] if l.endswith("\r") else l for l in text.split("\n")]   # not splitlines(): it treats a form feed as a line break

        if name in key_files and len(data) < key_files[name]:
            add("size", name, "%d bytes; a real copy is over %d" % (len(data), key_files[name]))
        if stripped and WHOLE_FILE_COMMAND.match(stripped):
            add("placeholder", name, "the whole file is the unexpanded command %r" % stripped[:80])
        elif ext in PROSE_EXT:
            fenced = False
            for ln, line in enumerate(lines, 1):
                if line.lstrip().startswith(("```", "~~~")):
                    fenced = not fenced
                elif not fenced and COMMAND_LINE.match(line):
                    add("placeholder", "%s:%d" % (name, ln), "unexpanded command %r" % line.strip()[:80])

        for ln, line in enumerate(lines, 1):
            if line.startswith(("<<<<<<< ", ">>>>>>> ", "||||||| ")) or line in ("<<<<<<<", ">>>>>>>"):
                add("conflict", "%s:%d" % (name, ln), "merge-conflict marker")
            m = next((m for m in HIDDEN.finditer(line) if not (ln == 1 and m.start() == 0 and m.group(0) == "\ufeff")), None)
            if m:
                ch = m.group(0)
                label = HIDDEN_NAMES.get(ch, "bidirectional control" if "\u202a" <= ch <= "\u2069" else "control character")
                add("hidden", "%s:%d" % (name, ln), "%s (U+%04X) at column %d" % (label, ord(ch), m.start() + 1))

        if ext == ".py":
            try:
                compile(data, name, "exec", dont_inherit=True)
            except (SyntaxError, ValueError) as exc:
                add("python", "%s:%s" % (name, getattr(exc, "lineno", "?")), str(getattr(exc, "msg", exc))[:200])
        elif ext in (".json", ".webmanifest"):
            try:
                json.loads(text)
            except ValueError as exc:
                add("json", name, str(exc)[:200])
        elif ext == ".sh" and has_bash:
            err = syntax_check(["bash", "-n"], data, ".sh")
            if err:
                add("shell", name, err)
        elif ext in (".js", ".mjs", ".cjs") and has_node and ".template." not in os.path.basename(name):   # templates hold {{PLACEHOLDERS}}
            err = syntax_check(["node", "--check"], data, ext)
            if err:
                add("js", name, err)
    for name in key_files:
        if name not in seen:
            add("size", name, "missing (this key file should exist)")
    return problems


def main(argv=None):
    ap = argparse.ArgumentParser(description="Catch broken, truncated or placeholder files in this repository.")
    ap.add_argument("--rev", help="check this commit or branch from git instead of the files on disk")
    a = ap.parse_args(argv)
    try:
        files = list_files(a.rev)
    except (OSError, subprocess.CalledProcessError) as exc:
        print("git failed (run inside the repository; is the revision right?):", exc, file=sys.stderr)
        return 2
    try:
        problems = check(files)
    except ValueError as exc:
        print(exc, file=sys.stderr)
        return 2
    by_kind = {}
    for kind, where, what in problems:
        by_kind.setdefault(kind, []).append((where, what))
    for kind in sorted(by_kind):
        print("== %s (%d)" % (kind, len(by_kind[kind])))
        for where, what in by_kind[kind][:40]:
            print("   %s  %s" % (where, what))
        if len(by_kind[kind]) > 40:
            print("   ... %d more" % (len(by_kind[kind]) - 40))
    print("%d file(s) checked%s: %s" % (len(files), " at " + a.rev if a.rev else "",
                                       "%d problem(s)" % len(problems) if problems else "all good"))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
