#!/usr/bin/env python3
"""build_releases.py - build the buyer zip for each product, reproducibly, and refuse to package private material.

    python3 products/build_releases.py --out release-out                 # every product
    python3 products/build_releases.py --out release-out privacy-integrity-toolkit
    python3 products/build_releases.py --list

Each zip holds one folder, <product>-<version>/, with the product's files and a SHA256SUMS file. The output folder
also gets SHA256SUMS.txt, holding each zip's own checksum, for the listing page or a buyer's check.
The same sources always give byte-identical zips (fixed dates, sorted entries, fixed permissions).
Every file is run through privacy_scan.py first; any finding stops the build.
"""
import argparse, fnmatch, glob, hashlib, io, json, os, subprocess, sys, tempfile, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import privacy_scan  # noqa: E402

SKILL = ".claude/skills/media-hub-master/scripts/"


def media_hub_starter():
    """Build Media Hub with an empty library (the buyer adds their own media) and return its files."""
    with tempfile.TemporaryDirectory() as tmp:
        cat = {"meta": {"version": "2.3", "built": "2026-11-24", "count": 0, "local": 0, "mirrorSource": "empty starter library",
                        "workspaceSource": "none", "vaultSnapshot": "none", "cloud": []},
               "items": [], "vault": [], "workspace": {"items": []}}
        Path(tmp, "catalog.json").write_text(json.dumps(cat))
        Path(tmp, "media_plan.json").write_text(json.dumps({"mirror": tmp, "media": []}))
        subprocess.run([sys.executable, str(ROOT / "media-hub/tools/build.py"), "--catalog", str(Path(tmp, "catalog.json")),
                        "--plan", str(Path(tmp, "media_plan.json")), "--out", str(Path(tmp, "dist"))],
                       check=True, capture_output=True, timeout=600)
        dist = Path(tmp, "dist")
        out = {"Media Hub.html": (dist / "media-hub-standalone.html").read_bytes()}
        app = dist / "media-hub-app"
        for f in sorted(app.rglob("*")):
            if f.is_file() and "__pycache__" not in f.parts:
                out["app-folder/" + f.relative_to(app).as_posix()] = f.read_bytes()
        return out


PRODUCTS = {
    "privacy-integrity-toolkit": {
        "version": "1.0.0", "date": (2026, 11, 24),
        "files": [
            ("scripts/privacy_scan.py", "privacy_scan.py"),
            ("scripts/check_repo.py", "check_repo.py"),
            ("scripts/test_check_repo.py", "test_check_repo.py"),
            (SKILL + "verify_checksums.py", "verify_checksums.py"),
            (SKILL + "audit_server.py", "audit_server.py"),
            (SKILL + "split_build.py", "split_build.py"),
            (SKILL + "test_scripts.py", "test_scripts.py"),
            ("products/privacy-integrity-toolkit/README.md", "README.md"),
            ("products/privacy-integrity-toolkit/CHANGELOG.md", "CHANGELOG.md"),
            ("products/privacy-integrity-toolkit/examples/*", "examples/"),
            ("LICENSE", "LICENSE.txt"),
        ],
        "executable": {"privacy_scan.py", "check_repo.py", "verify_checksums.py", "audit_server.py", "split_build.py",
                       "examples/pre-commit"},
    },
    "media-hub": {
        "version": "2.3.0", "date": (2026, 11, 24),
        "files": [
            ("products/media-hub/GUIDE.md", "GUIDE.md"),
            ("LICENSE", "LICENSE.txt"),
        ],
        "generated": [media_hub_starter],
        "executable": {"app-folder/tools/*.py", "app-folder/termux/*.sh"},
        # reviewed: the app's own generated icons, and a media manifest that lists no files
        "allow": ["app-folder/icons/*.png", "app-folder/media-manifest.json"],
    },
}


def expand(product):
    """[(path inside the product folder, bytes)] for every listed file, sorted; a missing source is an error."""
    out = {}
    for src, dest in product["files"]:
        if any(c in src for c in "*?["):
            matches = sorted(glob.glob(str(ROOT / src)))
            if not matches:
                raise FileNotFoundError("nothing matches " + src)
            for m in matches:
                if os.path.isfile(m):
                    out[dest + os.path.basename(m)] = Path(m).read_bytes()
        else:
            path = ROOT / src
            if not path.is_file():
                raise FileNotFoundError(src)
            out[dest] = path.read_bytes()
    for generate in product.get("generated", []):
        out.update(generate())
    return sorted(out.items())


def privacy_findings(entries, allow=()):
    files = [(name, (lambda data=data: data)) for name, data in entries]
    return privacy_scan.scan(files, max_mb=20, allow=allow)


def build_zip(name, product):
    entries = expand(product)
    found = privacy_findings(entries, product.get("allow", ()))
    if found:
        lines = ["  %s:%s  %s %s" % (n, ln, cat, what) for cat, n, ln, what in found]
        raise ValueError("privacy scan stopped the %s build:\n%s" % (name, "\n".join(lines)))
    folder = "%s-%s/" % (name, product["version"])
    sums = "".join("%s  %s\n" % (hashlib.sha256(data).hexdigest(), path) for path, data in entries)
    entries = sorted(entries + [("SHA256SUMS", sums.encode())])
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for path, data in entries:
            info = zipfile.ZipInfo(folder + path, date_time=product["date"] + (0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            mode = 0o755 if any(fnmatch.fnmatch(path, g) for g in product.get("executable", ())) else 0o644
            info.external_attr = (0o100000 | mode) << 16
            info.create_system = 3                       # Unix, so the permissions above are honoured
            z.writestr(info, data, compresslevel=9)
    return "%s-%s.zip" % (name, product["version"]), buf.getvalue(), [p for p, _ in entries]


def main(argv=None):
    ap = argparse.ArgumentParser(description="Build reproducible buyer zips for the products in this repository.")
    ap.add_argument("products", nargs="*", help="product names (default: all)")
    ap.add_argument("--out", default="release-out", help="output folder (default: release-out)")
    ap.add_argument("--list", action="store_true", help="list products and exit")
    a = ap.parse_args(argv)
    if a.list:
        for n, p in PRODUCTS.items():
            print("%s %s" % (n, p["version"]))
        return 0
    names = a.products or list(PRODUCTS)
    unknown = [n for n in names if n not in PRODUCTS]
    if unknown:
        ap.error("unknown product(s): %s (try --list)" % ", ".join(unknown))
    os.makedirs(a.out, exist_ok=True)
    sums = []
    for n in names:
        try:
            zname, data, contents = build_zip(n, PRODUCTS[n])
        except (OSError, ValueError, subprocess.CalledProcessError) as exc:
            print("FAILED %s: %s" % (n, exc), file=sys.stderr)
            return 1
        Path(a.out, zname).write_bytes(data)
        digest = hashlib.sha256(data).hexdigest()
        sums.append("%s  %s\n" % (digest, zname))
        print("%s  %d files, %.1f KB, sha256 %s" % (zname, len(contents), len(data) / 1024, digest))
    Path(a.out, "SHA256SUMS.txt").write_text("".join(sums))
    return 0


if __name__ == "__main__":
    sys.exit(main())
