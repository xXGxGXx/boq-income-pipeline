#!/usr/bin/env python3
"""audit_server.py - check a LOCAL media server for the mistakes that leak a private library. Read-only: GET and HEAD only.

    python3 audit_server.py http://127.0.0.1:8765/ [--file /media/clip.mp4] [--listing /api/tree] [--param path] [--json]

  --file     a real file on the server, for the Range checks (path, or e.g. "/api/media?path=Images/a.jpg")
  --listing  a page that lists the library (e.g. /api/tree, /library/index.json); checked against foreign Host/Origin too
  --param    the server takes file paths in a query parameter (e.g. --param path for /api/media?path=...):
             traversal payloads then go into that parameter of --file's URL instead of the URL path

Checks
  host        a foreign Host header must be refused (DNS rebinding: otherwise any web page can read the library)
  origin      a foreign Origin / Origin: null / Sec-Fetch-Site: cross-site must be refused
  headers     X-Content-Type-Options: nosniff, a Content-Security-Policy on the page, Referrer-Policy
  traversal   ../, %2e%2e, double-encoded, backslash, NUL, dotfiles and .git/.env must not be served
  listing     directories must not return an auto-generated index
  range       Accept-Ranges, 206 + exact Content-Range/Content-Length, suffix ranges, 416 with "bytes */size"
  bind        (loopback URLs on Linux) the port must not also listen on 0.0.0.0 / ::
Exit code 0 = no FAIL, 1 = at least one FAIL, 2 = the server could not be reached.
Only point it at servers you run yourself.
"""
import argparse, http.client, json, re, subprocess, sys, urllib.parse

FOREIGN = "attacker.example"
LOOPBACK = {"127.0.0.1", "localhost", "::1"}
SECRET_HINTS = (b"import ", b"#!/", b"[core]", b"root:x:", b"PRIVATE KEY", b"def ", b"password")


def listening_wildcard(port):
    """Addresses other than loopback that `port` listens on, from `ss` or /proc/net/tcp{,6}; None if neither is readable."""
    try:
        out = subprocess.run(["ss", "-ltnH"], capture_output=True, text=True, timeout=5).stdout
        return [l.split()[3] for l in out.splitlines() if len(l.split()) > 3 and re.search(r"(^|[^\d])(0\.0\.0\.0|\*|\[::\]):%d$" % port, l.split()[3])]
    except (OSError, subprocess.SubprocessError):
        pass
    found, readable = [], False
    for name, wild in (("/proc/net/tcp", "00000000"), ("/proc/net/tcp6", "0" * 32)):
        try:
            lines = open(name).read().splitlines()[1:]
        except OSError:
            continue
        readable = True
        for line in lines:
            f = line.split()
            if len(f) > 3 and f[3] == "0A":                                   # 0A = LISTEN
                addr, _, hexport = f[1].partition(":")
                if int(hexport, 16) == port and addr == wild:
                    found.append(("0.0.0.0" if len(wild) == 8 else "[::]") + ":%d" % port)
    return found if readable else None


class Audit:
    def __init__(self, base, timeout=6):
        u = urllib.parse.urlsplit(base)
        if u.scheme not in ("http", "https") or not u.hostname:
            raise ValueError("give a URL like http://127.0.0.1:8765/")
        self.scheme, self.host, self.port = u.scheme, u.hostname, u.port or (443 if u.scheme == "https" else 80)
        self.netloc = u.netloc
        self.root = u.path or "/"
        self.timeout = timeout
        self.rows = []

    def req(self, method, path, headers=None):
        conn_cls = http.client.HTTPSConnection if self.scheme == "https" else http.client.HTTPConnection
        c = conn_cls(self.host, self.port, timeout=self.timeout)
        h = {"Host": self.netloc}
        h.update(headers or {})
        try:
            c.putrequest(method, path, skip_host=True, skip_accept_encoding=True)   # path sent exactly as given
            for k, v in h.items():
                c.putheader(k, v)
            c.endheaders()
            r = c.getresponse()
            body = r.read(65536) if method != "HEAD" else b""
            return r.status, {k.lower(): v for k, v in r.getheaders()}, body
        finally:
            c.close()

    def add(self, check, level, msg):
        self.rows.append({"check": check, "level": level, "message": msg})

    # ---------------------------------------------------------------- checks
    def check_host(self, paths):
        for p in paths:
            st, _, body = self.req("GET", p, {"Host": "%s:%d" % (FOREIGN, self.port)})
            if st < 400:
                self.add("host", "FAIL", "%s answered %d to Host: %s (DNS rebinding: a web page could read this)" % (p, st, FOREIGN))
            else:
                self.add("host", "PASS", "%s refused a foreign Host (%d)" % (p, st))

    def check_origin(self, paths):
        cases = [("Origin", "http://%s" % FOREIGN), ("Origin", "null"), ("Sec-Fetch-Site", "cross-site")]
        for p in paths:
            bad = []
            for k, v in cases:
                st, _, _ = self.req("GET", p, {k: v})
                if st < 400:
                    bad.append("%s: %s -> %d" % (k, v, st))
            if bad:
                self.add("origin", "WARN" if p == self.root else "FAIL",
                         "%s served a cross-site request (%s)" % (p, "; ".join(bad)))
            else:
                self.add("origin", "PASS", "%s refused cross-site Origin / Sec-Fetch-Site" % p)

    def check_headers(self):
        st, h, _ = self.req("GET", self.root)
        if st >= 400:
            self.add("headers", "WARN", "the page itself answered %d" % st); return
        self.add("headers", "PASS" if h.get("x-content-type-options", "").lower() == "nosniff" else "WARN", "X-Content-Type-Options: %s" % h.get("x-content-type-options", "missing"))
        csp = h.get("content-security-policy", "")
        self.add("headers", "PASS" if csp else "WARN", "Content-Security-Policy: %s" % (csp[:80] + ("…" if len(csp) > 80 else "") if csp else "missing (a meta tag in the page may cover it)"))
        self.add("headers", "PASS" if h.get("referrer-policy") else "WARN", "Referrer-Policy: %s" % h.get("referrer-policy", "missing"))

    def traversal_urls(self, file_url, param):
        payloads = ["../../../../etc/passwd", "..%2f..%2f..%2fetc%2fpasswd", "%2e%2e/%2e%2e/%2e%2e/etc/passwd", "%252e%252e/%252e%252e/etc/passwd",
                    "..\\..\\..\\etc\\passwd", "x%00.jpg", ".git/config", ".env", ".ssh/id_rsa", "%2e%2e%2f"]
        if param and file_url:
            u = urllib.parse.urlsplit(file_url)
            q = urllib.parse.parse_qsl(u.query, keep_blank_values=True)
            out = []
            for pl in payloads:
                qs = "&".join(("%s=%s" % (k, pl) if k == param else "%s=%s" % (k, urllib.parse.quote(v, safe="/"))) for k, v in q)
                out.append(u.path + "?" + qs)
            return out
        prefix = self.root.rstrip("/") + "/"
        if file_url and "/" in file_url.strip("/"):
            prefix = file_url.rsplit("/", 1)[0] + "/"
        urls = [prefix + pl for pl in payloads] + ["/" + pl for pl in payloads] + [self.root.rstrip("/") + "/" + pl for pl in payloads]
        return list(dict.fromkeys(urls))                     # the file's folder, the site root and the app root, without repeats

    def check_traversal(self, file_url, param):
        leaks = []
        for p in self.traversal_urls(file_url, param):
            try:
                st, _, body = self.req("GET", p)
            except (OSError, http.client.HTTPException):
                continue
            if st == 200 and any(s in body for s in SECRET_HINTS):
                leaks.append("%s -> %d" % (p, st))
        if leaks:
            self.add("traversal", "FAIL", "served something it should not: " + "; ".join(leaks[:4]))
        else:
            self.add("traversal", "PASS", "no traversal, dotfile or NUL payload returned file contents")

    def check_listing(self, file_url):
        dirs = {self.root.rstrip("/") + "/media/", "/media/"}
        if file_url and "?" not in file_url and "/" in file_url.strip("/"):
            dirs.add(file_url.rsplit("/", 1)[0] + "/")
        for d in sorted(dirs):
            st, h, body = self.req("GET", d)
            if st == 200 and (b"Index of" in body or b"Directory listing" in body or body.count(b"<a href") > 20) and "html" in h.get("content-type", ""):
                self.add("listing", "FAIL", "%s returns a directory listing" % d)
                return
        self.add("listing", "PASS", "no auto-generated directory listing")

    def check_range(self, file_url):
        if not file_url:
            self.add("range", "SKIP", "pass --file /path/to/a/real/file to check Range handling"); return
        st, h, full = self.req("GET", file_url)
        if st != 200:
            self.add("range", "WARN", "%s answered %d; Range not checked" % (file_url, st)); return
        size = int(h.get("content-length") or len(full)) if h.get("content-length") else None
        ok = []
        ok.append(("Accept-Ranges: bytes", h.get("accept-ranges") == "bytes"))
        st1, h1, b1 = self.req("GET", file_url, {"Range": "bytes=0-9"})
        ok.append(("bytes=0-9 -> 206 with 10 bytes", st1 == 206 and len(b1) == min(10, size or 10) and h1.get("content-length") == str(len(b1))))
        ok.append(("Content-Range on 206", bool(re.match(r"^bytes 0-\d+/\d+$", h1.get("content-range", "")))))
        st2, h2, b2 = self.req("GET", file_url, {"Range": "bytes=-4"})
        ok.append(("suffix bytes=-4 -> last 4 bytes", st2 == 206 and len(b2) == min(4, size or 4) and (not full or len(full) < 65536 and full.endswith(b2) or len(full) >= 65536)))
        st3, h3, _ = self.req("GET", file_url, {"Range": "bytes=999999999999-"})
        ok.append(("unsatisfiable -> 416 with Content-Range: bytes */size", st3 == 416 and bool(re.match(r"^bytes \*/\d+$", h3.get("content-range", "")))))
        st4, _, b4 = self.req("GET", file_url, {"Range": "bytes=abc"})
        ok.append(("junk Range ignored (200)", st4 == 200))
        hs, hh, hb = self.req("HEAD", file_url, {"Range": "bytes=0-3"})
        ok.append(("HEAD: no body", hb == b""))
        bad = [n for n, good in ok if not good]
        self.add("range", "FAIL" if bad else "PASS", ("problems: " + "; ".join(bad)) if bad else "Range contract holds (%d checks)" % len(ok))

    def check_bind(self):
        if self.host not in LOOPBACK:
            self.add("bind", "WARN", "%s is not a loopback address: anyone on the network can reach this server" % self.host); return
        wide = listening_wildcard(self.port)
        if wide is None:
            self.add("bind", "SKIP", "could not read listening sockets (no `ss`, no /proc); check by hand that the port listens on 127.0.0.1 only"); return
        self.add("bind", "FAIL" if wide else "PASS", ("port %d also listens on %s (reachable from the network)" % (self.port, ", ".join(wide))) if wide else "port %d listens on loopback only" % self.port)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Read-only security audit of a local media server.")
    ap.add_argument("url"); ap.add_argument("--file"); ap.add_argument("--listing", action="append", default=[])
    ap.add_argument("--param"); ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    try:
        au = Audit(a.url)
        au.req("GET", au.root)
    except (OSError, ValueError, http.client.HTTPException) as exc:
        print("cannot reach %s: %s" % (a.url, exc), file=sys.stderr); return 2
    sensitive = [au.root] + a.listing + ([a.file] if a.file else [])
    au.check_host(sensitive)
    au.check_origin([p for p in sensitive if p != au.root] or [au.root])
    au.check_headers(); au.check_traversal(a.file, a.param); au.check_listing(a.file); au.check_range(a.file); au.check_bind()
    if a.json:
        print(json.dumps(au.rows, indent=1))
    else:
        for r in au.rows:
            print("%-5s %-10s %s" % (r["level"], r["check"], r["message"]))
        fails = sum(r["level"] == "FAIL" for r in au.rows)
        print("\n%d FAIL, %d WARN, %d PASS" % (fails, sum(r["level"] == "WARN" for r in au.rows), sum(r["level"] == "PASS" for r in au.rows)))
    return 1 if any(r["level"] == "FAIL" for r in au.rows) else 0


if __name__ == "__main__":
    sys.exit(main())
