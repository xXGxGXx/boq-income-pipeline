# Local servers: write them safe, audit them fast

Any server that holds a private library must assume a malicious web page is open in the same browser. The browser will happily send that page's requests to `127.0.0.1`; the server's checks are all that stand in the way.

## Audit first
```
python3 scripts/audit_server.py http://127.0.0.1:PORT/ --file /media/clip.mp4 --listing /library/index.json
python3 scripts/audit_server.py http://127.0.0.1:PORT/ --file "/api/media?path=Images/a.jpg" --listing /api/tree --param path
```
GET and HEAD only, so it is safe against servers with upload endpoints. FAIL lines are real problems; WARN lines are worth a look. Run it on servers you run yourself, before and after a fix, and put the before/after in the report.

What it caught in practice: a "Media Hub 6.0" server that answered any Host name. A page using DNS rebinding could list the library, read files and upload an HTML file into it. The same server sent 416 without `Content-Range`. Python's `http.server` fails five checks (any Host, cross-site, dotfiles served, directory listings, no Range) and is not a media server.

## The rules (with the reason)
- **Bind to loopback only** (127.0.0.1, ::1, localhost); refuse anything else at start-up. LAN access is a separate, opt-in mode: a token login with an HttpOnly, SameSite=Strict cookie, constant-time compare, a Host allow-list for the LAN name, and HTTPS through a reverse proxy.
- **Host must be one of the server's own names** (DNS-rebinding defence). Answer 421 otherwise.
- **If a browser says where a request came from, it must be this page:** `Origin` equal to the Host (and never `null`), `Sec-Fetch-Site` `same-origin` or `none`.
- **GET and HEAD only** unless writes are the point; then 405 with `Allow` for everything else, and writes stream to a hidden temp file, hash while writing, rename atomically, never overwrite.
- **Path safety:** decode once; reject NUL, backslashes, `..`, dotfiles and any symlink in the chain; resolve and require the result to stay inside the base; no directory listings; an allow-list of served types (the app's own page files plus photo/video/audio), so a stray `.env`, `.zip`, `.db`, `.md`, `.txt` or key file is never served.
- **Serve user-folder HTML/SVG/JS as downloads**, never inline, if they must be served at all.
- **Headers:** `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-origin`, a CSP on HTML (`default-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`).
- **Idle timeout** on sockets; swallow ConnectionReset/BrokenPipe.

## Range contract
- `Accept-Ranges: bytes` on every file; ETag + `If-None-Match` → 304; `If-Range` mismatch → ignore the range, send 200.
- `bytes=a-b` → 206 with `Content-Range: bytes a-b/size` and the exact `Content-Length`; `b` past the end is clamped; `bytes=a-` and `bytes=-n` (n larger than the file → whole file).
- `bytes=-0`, start ≥ size, start > end → **416 with `Content-Range: bytes */size`**.
- Multi-range or junk → ignore, 200 full body. HEAD: same headers, no body.
- Stream in 1 MiB chunks; test a range that crosses a chunk boundary byte for byte.

## Tests to keep
Traversal variants (`..`, `%2e%2e`, double-encoded, backslash, NUL, symlinked file and folder, dotfile), bad Host/Origin/Sec-Fetch-Site, non-loopback bind refused, every Range case above, and the patched server passing the same suite that the original failed (show both).
