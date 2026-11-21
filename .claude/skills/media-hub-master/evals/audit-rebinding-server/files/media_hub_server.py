#!/usr/bin/env python3
"""Media Hub 6.0: dependency-free, local-first file library + optional SearXNG.
Default binding is 127.0.0.1. External roots are read-only explicit mounts.
"""
from __future__ import annotations
import argparse
import hashlib
import hmac
import http.cookies
import http.server
import json
import mimetypes
import os
from pathlib import Path
import re
import secrets
import threading
import urllib.error
import urllib.parse
import urllib.request
import sys

FOLDERS = (
    "Images", "GIFs", "Videos", "Audio", "Documents", "Archives",
    "Recovered_Vault", "Online_Shared/Bookmarks", "Online_Shared/Imports",
    "AI_Workspaces/workspace", "AI_Workspaces/hidden_workspace", "Unsorted",
)
ALLOWED = re.compile(r"^[a-zA-Z0-9_-]+$")
MIME_INLINE = ("image/", "video/", "audio/", "application/pdf", "text/plain")
STATIC = {"": "index.html", "index.html": "index.html",
          "manifest.webmanifest": "manifest.webmanifest",
          "service-worker.js": "service-worker.js",
          "icon-192.png": "icon-192.png", "icon-512.png": "icon-512.png"}


def category(name: str, mime: str) -> str:
    ext = Path(name).suffix.lower()
    if ext in (".gif", ".jpg", ".jpeg", ".png", ".webp", ".heic", ".avif", ".svg", ".bmp"):
        return "image"
    if ext in (".mp4", ".m4v", ".mov", ".webm", ".mkv", ".avi", ".ogv"):
        return "video"
    if ext in (".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".opus"):
        return "audio"
    if ext in (".pdf", ".txt", ".md", ".doc", ".docx", ".csv", ".xlsx", ".html", ".json", ".zip"):
        return "document"
    return "other"


def safe_join(root: Path, relative: str) -> Path:
    if not isinstance(relative, str) or "\x00" in relative or "\\" in relative:
        raise ValueError("Invalid path")
    parts = relative.split("/")
    if relative.startswith("/") or any(p in ("..", "") for p in parts if relative):
        raise ValueError("Absolute, empty, and parent paths are not allowed")
    p = root.joinpath(*parts).resolve(strict=False)
    if not p.is_relative_to(root):
        raise ValueError("Path escapes library root")
    return p


def encode_row(root: Path, path: Path) -> dict:
    rel = path.relative_to(root).as_posix()
    st = path.stat()
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    row = {
        "path": rel, "folder": path.parent.relative_to(root).as_posix() if path.parent != root else "",
        "name": path.name, "size": st.st_size,
        "type": mime, "kind": category(path.name, mime),
        "modified": int(st.st_mtime * 1000),
    }
    if path.suffix.lower() == ".url" and st.st_size < 4096:
        try:
            url = path.read_text(encoding="utf-8").strip()
            if urllib.parse.urlsplit(url).scheme in ("http", "https"):
                row.update({"name": path.stem, "kind": "link", "url": url})
        except (OSError, UnicodeError):
            pass
    return row


def walk_tree(root: Path, max_items: int = 25000) -> dict:
    files, dirs = [], []
    if not root.is_dir():
        return {"files": [], "folders": []}
    # os.walk does not follow symlink directories by default; explicitly reject links.
    for base, names, filenames in os.walk(root, followlinks=False):
        current = Path(base)
        names[:] = sorted(n for n in names if not (current / n).is_symlink())
        for n in names:
            dirs.append((current / n).relative_to(root).as_posix())
        for n in sorted(filenames):
            p = current / n
            if p.is_symlink() or not p.is_file() or n.startswith(".hub-"):
                continue
            if len(files) >= max_items:
                return {"files": files, "folders": dirs, "truncated": True}
            try:
                files.append(encode_row(root, p))
            except (OSError, ValueError):
                continue
    return {"files": files, "folders": dirs, "truncated": False}


class HubServer(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, addr, handler, *, data_root, workspace, hidden_workspace,
                 token, searx, max_upload):
        super().__init__(addr, handler)
        self.base = Path(__file__).resolve().parent
        self.roots = {"library": data_root, "workspace": workspace,
                      "hidden_workspace": hidden_workspace}
        self.token = token or ""
        self.searx = searx or ""
        self.max_upload = max_upload
        self.sessions = set()
        self.sessions_lock = threading.Lock()


class Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))

    def header(self, status, mime, length, extra=None):
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(length))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()

    def respond(self, code, value):
        raw = json.dumps(value, ensure_ascii=False).encode("utf8")
        self.header(code, "application/json; charset=utf-8", len(raw))
        self.wfile.write(raw)

    def parse(self):
        p = urllib.parse.urlsplit(self.path)
        return p.path, urllib.parse.parse_qs(p.query, keep_blank_values=True)

    def param(self, params, key, default=""):
        return params.get(key, [default])[0]

    def authenticated(self):
        if not self.server.token:
            return True
        cookie = http.cookies.SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
            value = cookie.get("hub_session").value if cookie.get("hub_session") else ""
        except http.cookies.CookieError:
            value = ""
        with self.server.sessions_lock:
            return value in self.server.sessions

    def require_auth(self):
        if not self.authenticated():
            self.respond(401, {"error": "Host requires a login token"})
            return False
        return True

    def mount(self, name):
        path = self.server.roots.get(name)
        if path is None or not path.is_dir():
            return None
        return path

    def do_GET(self):
        path, params = self.parse()
        if path.startswith("/api/"):
            if not self.require_auth():
                return
            try:
                if path == "/api/health":
                    self.respond(200, {"version": 6, "search": bool(self.server.searx),
                                       "mounts": {k: bool(self.mount(k)) for k in self.server.roots}})
                elif path == "/api/tree":
                    root = self.mount(self.param(params, "root", "library"))
                    if root is None:
                        self.respond(403, {"error": "Root not mounted or not authorized"})
                    else:
                        self.respond(200, walk_tree(root))
                elif path == "/api/media":
                    self.get_media(params)
                elif path == "/api/search":
                    self.get_search(params)
                else:
                    self.respond(404, {"error": "Not found"})
            except (ValueError, OSError) as exc:
                self.respond(400, {"error": str(exc)})
            return
        name = path.lstrip("/")
        if name not in STATIC:
            return self.respond(404, {"error": "Not found"})
        p = self.server.base / STATIC[name]
        if not p.is_file():
            return self.respond(404, {"error": "Missing asset"})
        mime = (mimetypes.guess_type(p.name)[0] or "application/octet-stream")
        blob = p.read_bytes()
        self.header(200, mime, len(blob))
        self.wfile.write(blob)

    def get_media(self, params):
        root = self.mount(self.param(params, "root", "library"))
        if root is None:
            return self.respond(403, {"error": "Unavailable mount"})
        p = safe_join(root, self.param(params, "path"))
        if not p.is_file() or p.is_symlink():
            return self.respond(404, {"error": "File not found"})
        size = p.stat().st_size
        mimetype = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
        inline = any(mimetype.startswith(m) for m in MIME_INLINE)
        # Prevent arbitrary user-selected HTML or SVG from running on the origin.
        if p.suffix.lower() in (".html", ".htm", ".svg", ".xml", ".js", ".mjs"):
            inline = False
        disposition = ("inline" if inline else "attachment") + "; filename*=UTF-8''" + urllib.parse.quote(p.name)
        headers = {"Accept-Ranges": "bytes", "Content-Disposition": disposition}
        match = re.fullmatch(r"bytes=(\d*)-(\d*)", self.headers.get("Range", ""))
        start, end = 0, size - 1
        if match:
            left, right = match.groups()
            if not left and not right:
                return self.respond(416, {"error": "Invalid range"})
            if not left:
                suffix = int(right)
                start = max(0, size - suffix)
            else:
                start = int(left)
            if right and left:
                end = min(end, int(right))
            if start >= size or end < start:
                return self.respond(416, {"error": "Range not satisfiable"})
            headers["Content-Range"] = f"bytes {start}-{end}/{size}"
        length = max(0, end - start + 1)
        self.header(206 if match else 200, mimetype, length, headers)
        try:
            with p.open("rb") as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    buf = f.read(min(1024 * 1024, remaining))
                    if not buf:
                        break
                    self.wfile.write(buf)
                    remaining -= len(buf)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def get_search(self, params):
        if not self.server.searx:
            return self.respond(503, {"error": "No SearXNG service configured"})
        query = self.param(params, "q").strip()[:500]
        if not query:
            return self.respond(400, {"error": "Query required"})
        category = self.param(params, "category", "general")
        if category not in ("general", "images", "videos", "files"):
            category = "general"
        safesearch = "0" if self.param(params, "safesearch") == "0" else "1"
        base = self.server.searx.rstrip("/")
        if not base.endswith("/search"):
            base += "/search"
        params = urllib.parse.urlencode({"q": query, "categories": category, "safesearch": safesearch, "format": "json"})
        try:
            req = urllib.request.Request(base + "?" + params, headers={"Accept": "application/json", "User-Agent": "MediaHub6/1.0"})
            with urllib.request.urlopen(req, timeout=12) as response:
                content = response.read(2_000_000)
            response = json.loads(content)
            results = []
            for x in response.get("results", [])[:60]:
                u = x.get("url", "")
                if isinstance(u, str) and u.startswith(("http://", "https://")):
                    results.append({"url": u, "title": x.get("title", ""), "content": x.get("content", ""),
                                    "engines": x.get("engines", [])})
            self.respond(200, {"results": results, "sources": list({a for x in results for a in x["engines"]})})
        except (urllib.error.URLError, ValueError, TimeoutError) as exc:
            self.respond(502, {"error": "SearXNG request failed", "details": str(exc)[:200]})

    def do_POST(self):
        path, params = self.parse()
        if path == "/api/login":
            if not self.server.token:
                return self.respond(400, {"error": "Host login not required"})
            try:
                raw = self.read_small_json()
                token = str(raw.get("token", ""))
                if not hmac.compare_digest(token, self.server.token):
                    return self.respond(401, {"error": "Incorrect token"})
                session = secrets.token_urlsafe(32)
                with self.server.sessions_lock:
                    self.server.sessions.add(session)
                result = b'{"ok":true}'
                self.header(200, "application/json", len(result),
                            {"Set-Cookie": f"hub_session={session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400"})
                self.wfile.write(result)
            except (ValueError, OSError) as exc:
                self.respond(400, {"error": str(exc)})
            return
        if not self.require_auth():
            return
        if path not in ("/api/folder", "/api/upload"):
            return self.respond(404, {"error": "Not found"})
        origin = self.headers.get("Origin", "")
        host = self.headers.get("Host", "")
        if origin and urllib.parse.urlparse(origin).netloc != host:
            return self.respond(403, {"error": "Cross-origin writes refused"})
        try:
            library = self.server.roots["library"]
            if path == "/api/folder":
                folder = safe_join(library, self.param(params, "path"))
                folder.mkdir(parents=True, exist_ok=True)
                return self.respond(200, {"ok": True, "path": folder.relative_to(library).as_posix()})
            if path == "/api/upload":
                folder = safe_join(library, self.param(params, "folder", "Unsorted"))
                name = self.param(params, "name")
                if not name or name in (".", "..") or "/" in name or "\\" in name or "\x00" in name:
                    return self.respond(400, {"error": "Invalid filename"})
                try:
                    n = int(self.headers.get("Content-Length", "-1"))
                except ValueError:
                    n = -1
                if n < 0 or n > self.server.max_upload:
                    return self.respond(413, {"error": "Upload length not provided or exceeds allowed size"})
                folder.mkdir(parents=True, exist_ok=True)
                dst = safe_join(folder, name)
                suffix, stem = dst.suffix, dst.stem
                i = 1
                while dst.exists():
                    dst = folder / (stem + f" ({i})" + suffix)
                    i += 1
                tmp = folder / (".hub-upload-" + secrets.token_hex(10))
                h = hashlib.sha256()
                try:
                    with tmp.open("xb") as f:
                        remaining = n
                        while remaining:
                            block = self.rfile.read(min(1024 * 1024, remaining))
                            if not block:
                                raise IOError("Incomplete upload")
                            f.write(block)
                            h.update(block)
                            remaining -= len(block)
                    tmp.replace(dst)
                finally:
                    if tmp.exists():
                        tmp.unlink()
                return self.respond(201, {"ok": True, "path": dst.relative_to(library).as_posix(),
                                          "size": n, "sha256": h.hexdigest()})
        except (ValueError, OSError) as exc:
            self.respond(400, {"error": str(exc)})

    def read_small_json(self):
        n = int(self.headers.get("Content-Length", "0"))
        if n < 0 or n > 4096:
            raise ValueError("Invalid request length")
        return json.loads(self.rfile.read(n))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--host", default="127.0.0.1", help="Default: local machine only")
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--library", type=Path, default=Path(__file__).parent / "MEDIA_LIBRARY")
    ap.add_argument("--mount-workspace", type=Path, help="Explicit, READ-ONLY path mapped to /workspace")
    ap.add_argument("--mount-hidden-workspace", type=Path, help="Explicit, READ-ONLY path mapped to /hidden_workspace")
    ap.add_argument("--token", default=os.getenv("MEDIA_HUB_TOKEN", ""), help="Required for LAN binding")
    ap.add_argument("--searxng-url", default=os.getenv("SEARXNG_URL", ""), help="JSON-enabled SearXNG base URL")
    ap.add_argument("--max-upload-mb", type=int, default=1024)
    args = ap.parse_args()
    if args.host not in ("127.0.0.1", "::1", "localhost") and not args.token:
        ap.error("--token is required when listening beyond local machine")
    if args.searxng_url and urllib.parse.urlparse(args.searxng_url).scheme not in ("http", "https"):
        ap.error("SearXNG URL must start with http:// or https://")
    root = args.library.expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    for p in FOLDERS:
        safe_join(root, p).mkdir(parents=True, exist_ok=True)
    workspace = args.mount_workspace.expanduser().resolve() if args.mount_workspace else None
    hidden = args.mount_hidden_workspace.expanduser().resolve() if args.mount_hidden_workspace else None
    for label, p in (("workspace", workspace), ("hidden_workspace", hidden)):
        if p is not None and not p.is_dir():
            ap.error(f"Mount {label} does not exist: {p}")
    server = HubServer((args.host, args.port), Handler, data_root=root, workspace=workspace,
                       hidden_workspace=hidden, token=args.token, searx=args.searxng_url,
                       max_upload=args.max_upload_mb * 1024 * 1024)
    print(f"Media Hub: http://{args.host}:{args.port}/", flush=True)
    print(f"Library: {root} | Workspace mounted: {bool(workspace)} | Hidden mounted: {bool(hidden)}", flush=True)
    if args.host not in ("127.0.0.1", "localhost", "::1"):
        print("LAN mode: protect with HTTPS reverse proxy; do not expose directly to the internet.", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Shutting down...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
