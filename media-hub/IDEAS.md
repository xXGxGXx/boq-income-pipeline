# Ideas and integrations

Lessons and possible next steps gathered from other tools, drafts and notes reviewed alongside Media Hub, kept here for future reference. ✅ = built, ➜ = worth doing, ⚠ = possible but in tension with Media Hub's rules (originals untouched, loopback only, nothing online unless you turn it on).

## From a sibling server ("Media Hub 6.0")
- ✅ **Lesson: check the Host header.** That server answered any Host name, so a web page could point its own domain at 127.0.0.1 (DNS rebinding) and read the library listing, read files and upload files as if it were the app. A patched copy (6.0.1) refuses unknown Host names, cross-site Origins and `Sec-Fetch-Site: cross-site`. `media_serve.py` has done this from the start; keep it that way.
- ✅ **416 replies need `Content-Range: bytes */size`.** Also covered by `tests/test_range.py` and `tests/test_media_serve.py`.
- ➜ **Link files in shared folders.** Turn `.url` (Windows) and `.webloc` (macOS) files inside a `--library` folder into link items. Real `.url` files are INI text (`[InternetShortcut]` then `URL=…`), so parse that line instead of reading the whole file as the address, which is what 6.0 does. Allow http(s) only.
- ➜ **Write API pattern, if one is ever needed:** stream to a hidden temp file, hash while writing, then rename atomically and return the SHA-256. Size limit up front, unique name on collision, never overwrite.
- ➜ **Serve user-folder HTML, SVG and JS as downloads, never inline.** Media Hub's allow-list serves none of these from shared folders today; keep it that way if the list ever grows.
- ⚠ **LAN mode** (watch on a TV or tablet at home): a token login with an HttpOnly, SameSite=Strict session cookie and a constant-time compare, a Host allow-list for the LAN name, and HTTPS through a reverse proxy. Media Hub refuses any non-loopback address on purpose; this would be a separate, opt-in mode with its own tests.
- ⚠ **Self-hosted web search** (SearXNG) through the local server. It goes online, so it belongs behind the Offline-only switch, off by default.
- Note: that server's service worker calls `clients.claim()` on activate. In Media Hub this caused rare MEDIA_ERR_NETWORK on cold loads, so the Media Hub worker doesn't.

## From recovered-media manifests
- ✅ **Verify against a manifest:** `tools/verify_checksums.py` reads JSON lists with `name` / `relativePath` / `size` / `sha256`, as well as sha256sum and BSD formats.
- ➜ **Richer phone-folder index:** width, height, duration, frame count and codec per file (probed once with ffprobe and cached by SHA-256), so phone-folder items get sizes, HD and vertical badges, and duration without opening each file.
- ✅ Already in Media Hub: a file whose name says one type while its bytes say another is shown as the real type with a note, and never "fixed".

## From an archive layout note (a large archive split into numbered parts, plus a checksums folder)
- ✅ `verify_checksums.py --join "name.zip.part*" --expect <sha256>` confirms the parts rebuild the original without writing it (no extra disk space), names any part that differs from its own checksum, and rebuilds only on request into a new file.
- ➜ In the app: load a checksum list under Folders › Indexes and mark items "verified" or "differs", like *Verify originals* but against an outside list.

## From a "Signal and Media Toolkit" README
- ➜ **Resumable batch jobs:** the first Ctrl+C finishes the current file and stops before the next, the same command resumes, and output names include the source SHA-256 so a changed source gets a new output. `optimize_media.py` already skips existing copies; adding the hash to output names and the graceful stop would make long runs on a phone safer.
- ➜ **Animated previews for the grid:** short, silent GIF or WebP previews (first few seconds, about 12 fps, up to 360 px wide) as clearly derived files beside the originals, shown on hover or in Scroll.
- ⚠ **"Send to phone":** pair two browsers and send a file over a WebRTC data channel (as PairDrop does). It needs a signalling relay, which is a network service outside the wall. The offline way is already there: share packs and connected shared folders.

## From the Caffe contributing guide
- ✅ **One command before any merge:** `bash tests/run_all.sh` runs every suite (unit, server, browser, checklist).
- ➜ Keep the guide's other habits: one feature per branch, every change ships with a test, and fast-forward merges only after the suite is green.

## From the multi-model orchestrator (`../orchestrator/`)
- ✅ Fixed and tested: Claude Code tasks are read-only by default, with retries and backoff and JSON plus Markdown reports.
- ⚠ Using it for library chores (writing descriptions, suggesting tags) would send library details to cloud models. Only ever send metadata you pick yourself, never media, and never as a default.

## Kept out on purpose
- Anything tied to third-party image-transformation ("nudify") services, including their presets and the files they made: left out of tools, indexes and imports, as `build_catalog.py` already does.
- Private locations (cloud folder links, original file names, personal catalogs) never go in this repository. Keep them in a `private/` folder, which git ignores.
