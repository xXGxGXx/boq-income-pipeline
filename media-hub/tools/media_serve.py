#!/usr/bin/env python3
"""media_serve.py - a tiny, hardened, LOOPBACK-ONLY static server for Media Hub (stdlib only, works in Termux).

    python3 media_serve.py --dir . --port 8765 [--open] [--library ~/storage/dcim --library ~/storage/movies]

Why it exists: browsers will not install a PWA or register a service worker from file://, and relative media
paths cannot be read there. Serving the folder on 127.0.0.1 fixes both without exposing anything.

What it enforces
  * binds only to 127.0.0.1 / ::1 / localhost (anything else is refused)
  * serves only files inside --dir: percent-decoded ONCE, rejects "..", NUL, backslashes, dotfiles, any symlink in the
    path, and anything whose real path leaves the base directory; no directory listings
  * Host must be a loopback name (DNS-rebinding defence); Origin, when sent, must be this server; Sec-Fetch-Site
    must be same-origin or none
  * GET and HEAD only; ETag / If-None-Match / If-Range; Accept-Ranges with 206/416, open-ended and suffix ranges,
    streamed in 1 MiB chunks so a video never loads into memory
  * nosniff, no-referrer, CORP same-origin, a strict CSP on HTML
  * --library DIR (repeatable) shares phone folders READ-ONLY at /library/<name>/...: photos, videos and audio only, the same
    path rules, plus /library/index.json listing them (no dotfiles, no symlinks, capped at 50,000 files). Media Hub shows
    them under Folders > Sources > Phone folders and streams them with Range; nothing is copied or changed.
"""
import argparse, json, mimetypes, os, re, sys, threading, time, urllib.parse, webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

CHUNK = 1024 * 1024
LOOPBACK = {"127.0.0.1", "::1", "localhost"}
DENY_SUFFIX = {".py", ".pyc", ".sh", ".tsv"}
TYPES = {".webmanifest": "application/manifest+json", ".js": "text/javascript; charset=utf-8", ".html": "text/html; charset=utf-8",
         ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".m4v": "video/mp4",
         ".webm": "video/webm", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
         ".mov": "video/quicktime", ".mkv": "video/x-matroska", ".avi": "video/x-msvideo", ".3gp": "video/3gpp", ".ogv": "video/ogg", ".heic": "image/heic", ".heif": "image/heif",
         ".avif": "image/avif", ".bmp": "image/bmp", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac", ".wav": "audio/wav", ".flac": "audio/flac",
         ".ogg": "audio/ogg", ".oga": "audio/ogg", ".opus": "audio/ogg", ".weba": "audio/webm", ".amr": "audio/amr"}
MEDIA_KIND = {**{e: "image" for e in (".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".bmp", ".heic", ".heif")},
              **{e: "video" for e in (".mp4", ".m4v", ".mov", ".webm", ".mkv", ".avi", ".3gp", ".ogv", ".ts")},
              **{e: "audio" for e in (".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg", ".oga", ".opus", ".weba", ".amr")}}
INDEX_MAX = 50000
CSP = ("default-src 'self'; img-src 'self' data: blob: https://drive.google.com https://*.googleusercontent.com; media-src 'self' blob: data:; "
       "script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:* http://localhost:*; "
       "object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; worker-src 'self'; manifest-src 'self'; "
       "frame-src https://drive.google.com https://*.google.com https://*.googleusercontent.com")   # Drive's player for “Play here” (user-initiated)


def resolve_child(base: Path, url_path: str, media_only=False):
    """Map a URL path to a real file strictly inside `base`, or None. `base` must already be resolved.
    media_only: library mounts serve photos, videos and audio files only, never index.html or anything else."""
    try:
        rel = urllib.parse.unquote(url_path.split("?", 1)[0].split("#", 1)[0], errors="strict")   # decode exactly once
    except UnicodeDecodeError:
        return None
    if "\x00" in rel or "\\" in rel:
        return None
    parts = [p for p in rel.split("/") if p not in ("", ".")]
    if any(p == ".." or p.startswith(".") for p in parts):
        return None
    cur = base
    for p in parts:
        cur = cur / p
        if cur.is_symlink():
            return None
    target = base.joinpath(*parts) if parts else base
    try:
        real = target.resolve(strict=True)
    except (OSError, RuntimeError):
        return None
    if real != base and base not in real.parents:
        return None
    if real.is_dir():
        if media_only:
            return None
        real = real / "index.html"
        if not real.is_file() or real.is_symlink():
            return None
    if real.suffix.lower() in DENY_SUFFIX:
        return None
    if media_only and (real.suffix.lower() not in MEDIA_KIND or not real.is_file()):
        return None
    return real


def library_roots(dirs):
    """--library DIR values -> {name: resolved Path}; names are folder basenames made unique."""
    roots = {}
    for d in dirs or []:
        p = Path(os.path.expanduser(d)).resolve(strict=True)
        if not p.is_dir():
            raise SystemExit("Not a directory: %s" % d)
        name = re.sub(r"[^\w .()-]+", "_", p.name or "root").strip(" .") or "root"
        base, n = name, 2
        while name in roots or name == "index.json":
            name = "%s-%d" % (base, n); n += 1
        roots[name] = p
    return roots


def library_index(roots):
    """Walk the shared folders without following symlinks and skipping dotfiles; media files only."""
    files, out_roots, truncated = [], [], False
    for name, base in roots.items():
        count = 0
        for dirpath, dirnames, filenames in os.walk(base, followlinks=False):
            dirnames[:] = sorted(d for d in dirnames if not d.startswith(".") and not os.path.islink(os.path.join(dirpath, d)))
            rel_dir = os.path.relpath(dirpath, base)
            for fn in sorted(filenames):
                if fn.startswith("."):
                    continue
                ext = os.path.splitext(fn)[1].lower()
                if ext not in MEDIA_KIND:
                    continue
                full = os.path.join(dirpath, fn)
                if os.path.islink(full):
                    continue
                try:
                    st = os.stat(full)
                except OSError:
                    continue
                rel = fn if rel_dir == "." else rel_dir.replace(os.sep, "/") + "/" + fn
                files.append({"r": name, "p": rel, "s": st.st_size, "t": int(st.st_mtime), "k": MEDIA_KIND[ext], "m": TYPES.get(ext, "")})
                count += 1
                if len(files) >= INDEX_MAX:
                    truncated = True; break
            if truncated: break
        out_roots.append({"name": name, "files": count})
        if truncated: break
    return {"version": 1, "roots": out_roots, "files": files, "truncated": truncated}


def parse_range(header, size):
    """-> None (no usable Range: send 200), 'bad' (send 416) or (start, end) inclusive."""
    if not header:
        return None
    m = re.fullmatch(r"bytes=(\d*)-(\d*)", header.strip())
    if not m or (m.group(1) == "" and m.group(2) == ""):
        return None                                  # multi-range or unknown unit: ignored, full body is a valid answer
    if m.group(1) == "":                             # suffix: last N bytes
        n = int(m.group(2))
        if n == 0 or size == 0:
            return "bad"
        return (max(0, size - n), size - 1)
    start = int(m.group(1)); end = size - 1 if m.group(2) == "" else min(int(m.group(2)), size - 1)
    if start >= size or start > end:
        return "bad"
    return (start, end)


def make_handler(base: Path, port_ref, roots=None):
    roots = roots or {}
    cache = {"at": 0.0, "body": b""}
    lock = threading.Lock()

    class H(BaseHTTPRequestHandler):
        server_version = "MediaServe"; sys_version = ""; protocol_version = "HTTP/1.1"
        timeout = 60                                                # idle connections are dropped (no slow-loris pile-up)

        def log_message(self, fmt, *a):
            if os.environ.get("MEDIA_SERVE_QUIET") != "1":
                sys.stderr.write("%s %s\n" % (self.address_string(), fmt % a))

        def _allowed_hosts(self):
            p = port_ref[0]
            return {"127.0.0.1:%d" % p, "localhost:%d" % p, "[::1]:%d" % p}

        def _deny(self, code, msg):
            body = (msg + "\n").encode()
            self.send_response(code); self.send_header("Content-Type", "text/plain; charset=utf-8"); self.send_header("Content-Length", str(len(body)))
            self.send_header("X-Content-Type-Options", "nosniff"); self.send_header("Connection", "close"); self.end_headers()
            if self.command != "HEAD": self.wfile.write(body)
            self.close_connection = True

        def _guard(self):
            if self.headers.get("Host", "").lower() not in self._allowed_hosts():
                return self._deny(HTTPStatus.MISDIRECTED_REQUEST, "Unrecognised Host")
            o = self.headers.get("Origin")
            if o is not None and o.lower() not in {"http://" + h for h in self._allowed_hosts()}:
                return self._deny(HTTPStatus.FORBIDDEN, "Cross-origin request refused")
            sf = self.headers.get("Sec-Fetch-Site")
            if sf is not None and sf not in ("same-origin", "none"):
                return self._deny(HTTPStatus.FORBIDDEN, "Cross-site request refused")
            return True

        def do_GET(self): self._serve(True)
        def do_HEAD(self): self._serve(False)

        def _other(self):
            self.send_response(HTTPStatus.METHOD_NOT_ALLOWED); self.send_header("Allow", "GET, HEAD"); self.send_header("Content-Length", "0")
            self.send_header("Connection", "close"); self.end_headers(); self.close_connection = True
        do_POST = do_PUT = do_DELETE = do_PATCH = do_OPTIONS = _other

        def _serve(self, with_body):
            if not self._guard():
                return
            if len(self.path) > 2048:
                return self._deny(HTTPStatus.REQUEST_URI_TOO_LONG, "Path too long")
            path_only = self.path.split("?", 1)[0].split("#", 1)[0]
            if path_only == "/library/index.json":
                with lock:                                   # no --library: an empty list, so the app's quiet check never logs a 404
                    if time.time() - cache["at"] > 30 or not cache["body"]:
                        cache["body"] = json.dumps(library_index(roots), separators=(",", ":")).encode(); cache["at"] = time.time()
                    body = cache["body"]
                self.send_response(HTTPStatus.OK)
                for k, v in (("Content-Type", "application/json"), ("Cache-Control", "no-store"), ("X-Content-Type-Options", "nosniff"), ("Referrer-Policy", "no-referrer"),
                             ("Cross-Origin-Resource-Policy", "same-origin"), ("Content-Length", str(len(body)))):
                    self.send_header(k, v)
                self.end_headers()
                if with_body: self.wfile.write(body)
                return
            if path_only.startswith("/library/"):
                rest = path_only[len("/library/"):]
                seg, _, sub = rest.partition("/")
                try:
                    name = urllib.parse.unquote(seg, errors="strict")
                except UnicodeDecodeError:
                    name = ""
                lib = roots.get(name)
                f = resolve_child(lib, "/" + sub, media_only=True) if lib is not None and sub else None
            else:
                f = resolve_child(base, self.path)
            if f is None:
                return self._deny(HTTPStatus.NOT_FOUND, "Not found")
            st = f.stat(); size = st.st_size
            etag = '"%x-%x"' % (size, st.st_mtime_ns)
            ctype = TYPES.get(f.suffix.lower()) or mimetypes.guess_type(f.name)[0] or "application/octet-stream"
            h = [("Content-Type", ctype), ("Accept-Ranges", "bytes"), ("ETag", etag), ("Cache-Control", "no-cache"),
                 ("X-Content-Type-Options", "nosniff"), ("Referrer-Policy", "no-referrer"), ("Cross-Origin-Resource-Policy", "same-origin")]
            if ctype.startswith("text/html"): h.append(("Content-Security-Policy", CSP))
            inm = self.headers.get("If-None-Match")
            if inm and etag in [x.strip() for x in inm.split(",")]:
                self.send_response(HTTPStatus.NOT_MODIFIED)
                for k, v in h: self.send_header(k, v)
                self.send_header("Content-Length", "0"); self.end_headers(); return
            rng = parse_range(self.headers.get("Range"), size)
            ir = self.headers.get("If-Range")
            if ir and ir.strip() != etag:
                rng = None                                  # validator changed: restart with the whole file
            if rng == "bad":
                self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                for k, v in h: self.send_header(k, v)
                self.send_header("Content-Range", "bytes */%d" % size); self.send_header("Content-Length", "0"); self.end_headers(); return
            if rng:
                start, end = rng; self.send_response(HTTPStatus.PARTIAL_CONTENT)
                h.append(("Content-Range", "bytes %d-%d/%d" % (start, end, size)))
            else:
                start, end = 0, size - 1; self.send_response(HTTPStatus.OK)
            length = end - start + 1 if size else 0
            for k, v in h: self.send_header(k, v)
            self.send_header("Content-Length", str(length)); self.end_headers()
            if not with_body or not length:
                return
            try:
                with open(f, "rb") as fh:
                    fh.seek(start); left = length
                    while left > 0:
                        chunk = fh.read(min(CHUNK, left))
                        if not chunk: break
                        self.wfile.write(chunk); left -= len(chunk)
            except (BrokenPipeError, ConnectionResetError, TimeoutError):
                self.close_connection = True
    return H


def make_server(directory, host="127.0.0.1", port=8765, library=None):
    if host not in LOOPBACK:
        raise SystemExit("Refusing to bind to %r: only loopback addresses are allowed." % host)
    base = Path(directory).resolve(strict=True)
    if not base.is_dir():
        raise SystemExit("Not a directory: %s" % directory)
    port_ref = [port]
    class Srv(ThreadingHTTPServer):
        address_family = __import__("socket").AF_INET6 if host == "::1" else __import__("socket").AF_INET
        daemon_threads = True

        def handle_error(self, request, client_address):          # browsers abort connections all the time; that is not an error
            if isinstance(sys.exc_info()[1], (ConnectionResetError, BrokenPipeError, TimeoutError)):
                return
            super().handle_error(request, client_address)
    roots = library_roots(library)
    srv = Srv(("127.0.0.1" if host == "localhost" else host, port), make_handler(base, port_ref, roots))
    srv.library = roots
    port_ref[0] = srv.server_address[1]
    return srv


def main():
    ap = argparse.ArgumentParser(description="Loopback-only static server for Media Hub")
    ap.add_argument("--dir", default="."); ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--host", default="127.0.0.1", help="127.0.0.1, ::1 or localhost only"); ap.add_argument("--open", action="store_true")
    ap.add_argument("--library", action="append", default=[], metavar="DIR", help="share a folder of photos/videos/audio read-only (repeatable)")
    a = ap.parse_args()
    try:
        srv = make_server(a.dir, a.host, a.port, a.library)
    except OSError as e:
        raise SystemExit("Could not start on port %d: %s (try --port %d)" % (a.port, e, a.port + 1))
    p = srv.server_address[1]; url = "http://%s:%d/" % ("localhost" if a.host == "localhost" else ("[::1]" if a.host == "::1" else "127.0.0.1"), p)
    print("Media Hub is running at", url, "\nServing", Path(a.dir).resolve(), "(loopback only). Ctrl+C to stop.", flush=True)
    for name, p_ in srv.library.items():
        print("Sharing read-only:", p_, "as Phone folders >", name, flush=True)
    if a.open: threading.Timer(0.4, lambda: webbrowser.open(url)).start()
    try: srv.serve_forever()
    except KeyboardInterrupt: print("\nStopped.")


if __name__ == "__main__":
    main()
