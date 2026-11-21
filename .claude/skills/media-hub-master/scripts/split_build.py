#!/usr/bin/env python3
"""split_build.py - recover editable source files from a built single-file page, and prove the split is lossless.

Build tools like Media Hub's build.py paste style.css into <style> and join JS files with "\\n" into the last inline
<script>. When only the built page survives (or a newer build than your source), this cuts it back into the same files.

    python3 split_build.py BUILT.html --like SRC_DIR --out NEW_SRC_DIR [--order a.js,b.js,...]
    python3 split_build.py BUILT.html --check SRC_DIR [--order ...]          # does SRC_DIR rebuild exactly this page's JS/CSS?

  --like   an older source folder: each JS file's FIRST LINE is the anchor that marks where it starts in the build
  --order  the JS files in build order (default: JS_ORDER read from SRC_DIR/../tools/build.py, else alphabetical .js files)
Writes style.css, one file per JS source, and built-template.html (the page with {{CSS}}, {{JS}} and {{CATALOG}} put back).
--check reports whether joining SRC_DIR's files reproduces the build byte for byte, and which file differs first if not.
Nothing in the built page or the source folder is changed. Exit 0 = lossless / identical, 1 = differs, 2 = bad input.
"""
import argparse, ast, os, re, sys


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def js_order(src, given):
    if given:
        return [x.strip() for x in given.split(",") if x.strip()]
    build = os.path.join(os.path.dirname(os.path.abspath(src)), "tools", "build.py")
    if os.path.isfile(build):
        m = re.search(r"JS_ORDER\s*=\s*(\[[^\]]*\])", read(build))
        if m:
            return ast.literal_eval(m.group(1))
    return sorted(f for f in os.listdir(src) if f.endswith(".js") and not f.startswith("sw."))


def parts_of(html):
    i, j = html.find("<style>\n"), html.find("\n</style>")
    if i < 0 or j < 0:
        raise ValueError("no <style> block found")
    k = html.rfind("<script>\n")
    e = html.rfind("\n</script>")
    if k < 0 or e < k:
        raise ValueError("no inline <script> block found")
    return html[i + 8:j], html[k + 9:e]


def main(argv=None):
    ap = argparse.ArgumentParser(description="Recover source files from a built single-file page (lossless, verified).")
    ap.add_argument("built"); ap.add_argument("--like"); ap.add_argument("--out"); ap.add_argument("--check"); ap.add_argument("--order")
    a = ap.parse_args(argv)
    try:
        html = read(a.built); css, js = parts_of(html)
        if a.check:
            order = js_order(a.check, a.order)
            joined = "\n".join(read(os.path.join(a.check, f)) for f in order)
            css_ok = os.path.isfile(os.path.join(a.check, "style.css")) and read(os.path.join(a.check, "style.css")).rstrip("\n") == css.rstrip("\n")
            if joined == js and css_ok:
                print("identical: %s rebuilds this page's JS (%d files, %d bytes) and CSS exactly" % (a.check, len(order), len(js))); return 0
            pos = next((n for n, (x, y) in enumerate(zip(joined, js)) if x != y), min(len(joined), len(js)))
            acc, where = 0, order[-1] if order else "?"
            for f in order:
                acc += len(read(os.path.join(a.check, f))) + 1
                if acc > pos:
                    where = f; break
            print("differs: JS first differs at byte %d (in %s)%s" % (pos, where, "" if css_ok else "; CSS differs too")); return 1
        if not (a.like and a.out):
            ap.error("give --like SRC_DIR --out NEW_DIR, or --check SRC_DIR")
        order = js_order(a.like, a.order)
        starts = []
        for f in order:
            first = read(os.path.join(a.like, f)).split("\n", 1)[0]
            if not first.strip():
                raise ValueError("%s starts with an empty line: it can't serve as an anchor" % f)
            k = js.find(first + "\n") if not starts else js.find("\n" + first + "\n", starts[-1]) + 1
            if (not starts and k != 0) or (starts and k <= starts[-1]):
                raise ValueError("can't find where %s starts in the build (its first line changed?); pass --order or fix the anchor" % f)
            starts.append(k)
        os.makedirs(a.out, exist_ok=True)
        if any(os.path.exists(os.path.join(a.out, f)) for f in order + ["style.css"]):
            raise ValueError("%s already holds source files; choose an empty folder (nothing is overwritten)" % a.out)
        bounds = starts + [len(js) + 1]
        pieces = [js[bounds[n]:bounds[n + 1] - 1] for n in range(len(order))]
        if "\n".join(pieces) != js:
            raise ValueError("split is not lossless; refusing to write")
        for f, piece in zip(order, pieces):
            with open(os.path.join(a.out, f), "w", encoding="utf-8") as fh:
                fh.write(piece)
        with open(os.path.join(a.out, "style.css"), "w", encoding="utf-8") as fh:
            fh.write(css + "\n")
        tpl = html.replace(css, "{{CSS}}", 1).replace(js, "{{JS}}", 1)
        tpl = re.sub(r'(<script type="application/json" id="catalog">).*?(</script>)', r"\1{{CATALOG}}\2", tpl, count=1, flags=re.S)
        with open(os.path.join(a.out, "built-template.html"), "w", encoding="utf-8") as fh:
            fh.write(tpl)
        for f, piece in zip(order, pieces):
            old = len(read(os.path.join(a.like, f)))
            print("  %-22s %7d bytes (was %d)%s" % (f, len(piece), old, "" if len(piece) == old else "  changed"))
        print("lossless: %d JS files rejoin to the build exactly; style.css and built-template.html written to %s" % (len(order), a.out))
        return 0
    except (OSError, ValueError) as exc:
        print("error:", exc, file=sys.stderr); return 2


if __name__ == "__main__":
    sys.exit(main())
