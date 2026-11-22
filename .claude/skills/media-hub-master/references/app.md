# Building and extending the app

## Contents
1. Architecture that works
2. Storage and the user layer
3. Library model, search and commands
4. Viewer, feed and privacy
5. Import, online items and playable copies
6. Phone integration
7. The build
8. Pitfalls already paid for

## 1. Architecture that works
- **One self-contained page.** `src/index.template.html` holds `{{CSS}}`, `{{CATALOG}}`, `{{EMBED_BLOCKS}}`, `{{EMBED}}`, `{{KIT}}`, `{{JS}}`. JS files are joined with `"\n"` in a fixed order (Media Hub: core → ui → library → shared → vault → viewer → extras → feed → commands → tools) into one scope. The catalog sits in `<script type="application/json">` with `<` escaped as `<`.
- **Two deliveries:** a folder build (`media/` beside `index.html`, installable when served) and a single file with each media file as an inert base64 block decoded on first use (works from `file://`, ~media size × 1.33).
- **The wall:** a meta CSP allowing only `'self'`, `data:`, `blob:`, loopback `connect-src` and the Drive frames/thumbnails the user opens. Do not write `http://[::1]:*` in `connect-src` (Chrome ignores it with a warning).
- **Service worker:** a versioned shell cache plus a separate media cache keyed by URL; serve cached media Range requests with `blob.slice` (206/416 per the contract in `server.md`); never cache-put a 206; pass `/library/` straight to the network; **no `clients.claim()`** (it swapped a loading `<video>` mid-request and caused rare MEDIA_ERR_NETWORK).

## 2. Storage and the user layer
- IndexedDB stores `kv`, `progress`, `imports`, `files` with an in-memory fallback; `localStorage` only for synchronous prefs (theme, blur, PIN set) so the lock and blur apply before first paint.
- Item ids: the catalog code; imports use `imp-` + the first 16 hex of the SHA-256, so a restored backup re-links when the same file is added again.
- **The user layer must round-trip completely.** Favourites, ratings, notes, tags, seen, recent, collections, per-item adjustments, folders and filing, trash/archive, saved searches, encrypted notes: one list drives boot loading, backup and restore points. A key missing from the boot loader silently vanishes on the next save.
- Saves are debounced; **flush on `pagehide` and `visibilitychange` (hidden)**, and call `transaction.commit()` after `put`, or the last change before closing is lost.
- Backup: JSON of the user layer only (no media, no PIN); restore merges, guards `__proto__`/`constructor`/`prototype`, validates shapes and makes a restore point first.
- Your own catalog rows (TSV/CSV/JSON imports, saved links) live in a separate layer (`kv: extra`) merged at runtime, so the shipped catalog stays read-only. Accept header aliases (code/id, title/name, link/url, description/notes), parse quoted CSV properly, keep only http(s) links, end with a receipt.

## 3. Library model, search and commands
- Every item has ONE home folder (a manual override in the user layer, else auto-filed: AI codes, tags or paths → AI/Generated, Edited, Sourced, Provided, Prompts; else by source). By type, Smart folders, Collections and linked/phone mirrors are live views. Moving changes only the label; every change has Undo.
- Search language: words, `"phrases"`, `-exclude`, `a|b`, `tag: cat: src: kind: code: res: col: audio: in: has: is:`.
- One command interpreter for typed, palette (K / Ctrl+K) and voice input; turn content requests into visible search tokens; keep `.` between digits ("speed 1.5"); keep the user's capitals for names.
- Voice in Chromium: never call `SpeechRecognition.available()` and never set `processLocally` with `lang` (both crashed the tab); say that the browser's speech service is used; hands-free needs a wake word.
- App links: `?open=CODE`, `?folder=`, `?scroll=1`, `?cmd=`, `?col=`, `?filter=`, `?q=`, `?shuffle=1`, `?tab=`.

## 4. Viewer, feed and privacy
- Viewer: pinch/wheel/double-tap zoom, swipe step, `history.pushState` so Back closes it; video resume as a true percent (skip within the last 5 s), A–B loop, speed, frame step, save-frame as a new PNG, sleep timer, PiP, Media Session, Wake Lock; display-only adjustments (CSS filters, rotate/mirror, volume boost through one shared AudioContext).
- Dialogs (viewer, sheet, feed): move focus into the container on open, make `#top #main #nav #fab #selbar` `inert`, stack nested dialogs, return focus on close.
- Feed: absolutely position media (`inset:0; object-fit:contain`), build only ±2 slides, its own history entry.
- Privacy: blurred thumbnails with peek (scale ~1.14 to hide the soft edge), cover when hidden, PIN with PBKDF2-SHA256 (≥150k rounds, random salt, constant-time compare, escalating lock-out, keys swallowed during lock-out), panic key and Esc Esc within 350 ms. Encrypted notes: AES-GCM with a PBKDF2 key (600k), bound to the item id, never searchable.

## 5. Import, online items and playable copies
- Import: file input + folder input + drag-and-drop (`webkitGetAsEntry`). Per file: sniff the real type from magic bytes → SHA-256 (skip above ~400 MB and say so) → skip exact duplicates → store the same bytes (`new Blob([file],{type})` only relabels) → probe dimensions/duration → receipt.
- Drive "Play here": the `/preview` iframe in a sandbox, only after a tap or an explicit opt-in (it contacts Google).
- Share target: one POST target with `title`, `text`, `url`, `files`; the SW stores files under `shared:*` and redirects 303; a shared link opens a prefilled Save-link sheet (never saved silently).
- Playable copies: when a browser can't decode the original, play the separate copy (`playable` in the catalog) on the video `error` event and say the original is untouched.

## 6. Phone integration
- Termux: start the loopback server only if the port is closed, then `termux-open-url`; a Termux:Widget shortcut. Shared phone folders mount read-only at `/library/<name>/…` with `/library/index.json` (no dotfiles, no symlinks, capped; empty list when nothing is shared, so the app's probe never logs a 404).
- Tasker WebView player: values in hidden `<textarea>` blocks read as text (never as HTML); play only `file:`, `content:`, `https:` or loopback; `performTask` only if it exists. Media Hub needs no extra Android permissions: don't ship permission-granting scripts with it.

## 7. The build
```
python3 tools/make_demo.py build/demo            # synthetic library (gradients, a tone, clips if ffmpeg)
python3 tools/build.py --catalog build/demo/catalog.json --plan build/demo/media_plan.json --out dist [--zip]
python3 tools/media_serve.py --dir dist/media-hub-app --open
```
Every copied media file is re-hashed; the build stops if one byte differs. A personal library is built from the user's own catalog in a private folder (`private/`, git-ignored) and delivered as a file.

## 8. Pitfalls already paid for
- `scrollIntoView` on anything inside a horizontal scroller scrolls the page too; set `scrollLeft`.
- A horizontally scrolling action bar must not use `justify-content:flex-end` (the start becomes unreachable); use `margin-left:auto` on the first child.
- `height:100%` inside a grid with `place-items:center` resolves against content; absolutely position feed media.
- A Python `//` comment pasted mid-line in JS comments out the rest of the statement; always syntax-check the joined JS (`cat src/app.*.js > /tmp/all.js && node --check /tmp/all.js`, in build order).
- Short demo clips (<5 s past a resume point) never resume by design; make demo media long enough for the features you test.
