# Media Hub · Personal (v2.3)

A private, offline-first media library that behaves like an app. One page of plain HTML/CSS/JS: no accounts, no tracking, no network calls unless you turn something on. Every kind of personal media is treated the same way: nothing is judged, hidden or filtered for its content.

## Try it in two minutes (synthetic demo)
```
python3 tools/make_demo.py build/demo                       # generated pictures, a tone, and clips if ffmpeg is installed
python3 tools/build.py --catalog build/demo/catalog.json --plan build/demo/media_plan.json --out dist
python3 tools/media_serve.py --dir dist/media-hub-app --open   # or open dist/media-hub-standalone.html directly
```
The demo holds no real photos or personal data. Build your own library with `build_catalog.py` (see *Rebuild your own library*).

## Keep your library private
This folder holds the **app only**. Your media, catalog and builds stay on your devices: `media/`, `build/`, `dist/`, `mirror/`, `private/`, `*.zip` and catalog files are git-ignored here, so they can't be committed by accident. Never push a personal build to a public repository or a hosted page.

## Three ways to run it
1. **Open `media-hub-standalone.html`**: the one combined app. Your on-device pictures and clips, the whole catalog, and a **companion kit** (server, playable-copy tool, master-folder tool, Tasker player, Termux start, rebuild scripts and source) are all inside it; Tools → *Download companion kit* unpacks them as a zip. Works from a file, no install.
2. **Folder + local server (installable, with your phone folders)**: `python3 tools/media_serve.py --dir . --open --library ~/Pictures --library ~/Movies`, then Install from the browser menu.
   On the phone (Termux, after `termux-setup-storage`): `bash termux/start-media-hub.sh`. It shares DCIM, Pictures, Movies, Music, Downloads and `Media Hub Library` **read-only**; they appear under Folders › Sources › Phone folders. `bash termux/install-widget-shortcut.sh` adds a home-screen button.
3. Host the folder over https on a private server you control; it is static.

## What's new
**2.3** (merges the two separate 2.2 builds)
- Fixed: on phones, any refresh (phone folders arriving, an import, filing) threw you back up to the filter chips. Only the chip row scrolls now.
- Fixed: the floating Shuffle and + buttons sat on top of the right-hand column's ★ on phones; they step aside while you scroll down.
- Accessibility: the viewer, details sheet and Scroll feed now take keyboard and screen-reader focus, keep Tab inside, and give focus back to where you were. Space still plays and pauses.
- Server: only the app's own page files and photos, videos and audio are served; a stray `.env`, `.zip`, `.txt` or key file in the app folder is refused.
- Tests: `tests/checklist.py` (40-line checklist with a Markdown report) and `tests/test_media_serve.py` (21 server cases) join the unit tests and the browser test.
- `tools/verify_checksums.py`: check a folder against a checksum list (sha256sum, BSD or JSON), and check or rebuild a split archive (`name.zip.part000…`) against the original's SHA-256 without writing anything unless asked.
- `bash tests/run_all.sh` runs every suite in one go. Ideas gathered for later: [IDEAS.md](IDEAS.md).

**2.2**
- Source tree recovered from the 2.1 build (the 2.0 zip's `src/` was out of date), so 2.1 can be rebuilt and changed again.
- Fixed: a favourite, rating, note or other change made in the last moment before closing, reloading or switching away from the app was lost (saves were delayed 400 ms and never flushed). Pending saves now flush when the page is hidden or closed, and IndexedDB writes commit at once.
- Fixed: on phones the first filter chip and the first *Recently added* card sat against the screen edge (scroll-snap hid the gutter).
- `tools/make_demo.py`: a synthetic demo library, so the app builds and tests from a clean checkout.
- `tests/e2e_smoke.js`: browser test on desktop, a phone profile and the single file, with the page's security policy enforced. Fails on any page error, console error or CSP violation.
- `build_catalog.py` no longer hard-codes particular files or sites: titles like `CODE — title` are matched automatically, and a private `--codes map.json` (`{"title prefix": "CODE"}`) covers the rest. Web links show the site's own name.

**2.1**
- **The wall**: the page's own security policy lets it talk only to itself, this device's loopback server and the Google Drive items you open. *Offline-only mode* turns off everything that can go online (Drive thumbnails and player, voice, web-search links).
- **Shared space**: the only place meant for other people, kept apart from your library. Share packs (.zip) out and in, or connect a shared folder; nothing gets in unless you share it.
- **Encrypted notes**: seal notes with a passphrase (AES-256-GCM, on this device). They re-lock with panic, the PIN screen or 5 minutes away, stay encrypted in backups and are never searchable. The passphrase can't be recovered.
- **Restore points**: daily snapshots of your own layer and one before every big change (restore, delete for good, catalog import, filing 25+ items, removing note encryption). The last 12 are kept; media is never part of them.

## The master library (Folders tab)
Every item has exactly one home folder. Moving it only changes that label; files are never moved, copied or altered.
- **By type**: Photos · Videos · GIFs & loops · Audio · Vertical · HD & 4K (live views)
- **AI**: **Generated** · **Edited & enhanced** · **Sourced** · **Provided** · **Prompts & references**. AI-made files are filed here automatically (codes like `AI-…`/`GROK-…`, tags or names such as ai-generated, grok, sora, midjourney, and anything inside an `AI/Generated`, `AI/Sourced`… folder on disk).
- **Sources**: Inbox (shared or pasted) · This device (files you added, folder paths kept) · Linked folders · Phone folders · Gallery originals · Google Drive · Web links (grouped by site) · Imported catalogs · Live server
- **My folders** (nest as deep as you like) · **Collections** · **Smart folders** (Favourites, Not opened yet, Continue watching, Recently added, Recently opened, Rated, With notes, Exact duplicates, plus your **saved searches**) · **Indexes** (phone vault snapshot, workspace files) · **Archive** · **Trash**
- Leaf folders split into sub-folders by category (or by site, or by original folder) automatically.
- **Library location**: a card at the top shows a clickable, copyable link to your library, where every kind of file lives (*Where are my files?*), and your Drive cloud folders.
- **Export to a real folder**: writes a `Media Hub Library` folder (AI, Inbox, Photos, Videos, GIFs, Audio, Sources, My folders, Collections) byte-for-byte, re-hashes what it wrote, adds `index.csv` and a README, and skips identical files. Where the browser can't write folders, you get the same tree as a .zip. `tools/make_master_folder.py DEST` creates the empty tree on a phone or computer.
- **Select** (button, or Ctrl/Shift+click): move, add to a collection, star, tag, archive or trash many items at once. Trash has Restore and Delete for good (read-only catalog, linked and phone files are only hidden; files you added are erased from the app). Every change has **Undo**.

## Getting media in (any photo, video or audio file)
+ button: **Photos, videos & audio** · **A whole folder** (copied, subfolders kept) · **Link a folder** (read in place, never copied; Chrome/Edge desktop) · **Camera** · **Paste** · **A link** · **A catalog file** · **Phone folders**. Choose *File into* any folder first, or leave it automatic. Also drag-and-drop (onto an open folder files it there), Ctrl+V anywhere, and share-to-app on Android (lands in the Inbox). Everything is stored byte-for-byte with a SHA-256; exact duplicates are recognised.

## Scroll
A full-screen vertical feed of whatever you're looking at (nav **Scroll**, key **3**, or say “scroll unseen videos”): the item in view plays by itself (muted until you tap the speaker), double-tap to star, auto-scroll moves on when a clip ends, ↑/↓ or J/K, Enter opens the full viewer. Only nearby items are loaded, so big libraries stay fast.

## Commands and voice
Type in the search box (press Enter), in Quick actions (**K**), or tap the mic and talk (**V**; hold the mic for hands-free, where you start each command with “hub” so a playing clip can't trigger anything). Examples:
- *Find*: “show me unseen videos”, “videos from drive not gifs”, “newest photos”, “vertical clips in hd”, “tagged slow-mo”. Requests become visible search terms (`is:unseen kind:video src:drive`).
- *Folders*: “open generated”, “go to inbox”, “new folder trips”, “where are my files”.
- *Play*: “play favourites”, “scroll unseen videos”, “surprise me”, “pause”, “next”, “skip 30 seconds”, “go to 1:30”, “speed 1.5”, “loop”, “mute”, “full screen”, “sleep in 20 minutes”.
- *Organise* (the item in view, or your selection): “favourite this”, “rate this 5”, “file this in sourced”, “move this to trips” (makes the folder if needed), “add this to keepers”, “tag this as close-up”, “note: …”, “archive this”, “delete this”, “undo”.
- *Add*: “add files”, “link a folder”, “take a photo”, “paste”, “load phone folders”, “export library to a folder”. *Other*: “hide”, “blur off”, “dark mode”, “search the web for …” (shows search-engine links; nothing is sent until you tap one).
“What can I say?” lists tappable examples. Speech is turned into text by the browser's own speech service (in Chrome that's Google's); Media Hub sends nothing anywhere, and every command also works typed.

## Viewer, privacy, integrity
- Zoom/swipe/slideshow; video and audio with resume, A–B loop, speed, frame step, save frame (new PNG), sleep timer, theatre, PiP, **Adjust** (brightness, rotate/mirror, volume boost; display only), **Lock** (touches ignored until you hold the lock), **G** move to a folder, **Delete** to Trash.
- Blurred thumbnails (hover or press-and-hold to peek), cover when hidden, optional PIN (PBKDF2-SHA256, salted, lock-out), panic (**X** or **Esc Esc**). The PIN and cover are not encryption.
- *Verify originals* re-hashes everything; imports, links and exports end with: source used · original untouched? · anything processed? · archived? · reusable later?
- Backup v3: favourites, ratings, notes, tags, progress, collections, folders and filing, trash/archive, saved searches, links/rows and settings. No media, no PIN.

## Search language
Words, `"phrases"`, `-exclude`, `a|b` (either), `tag:` `cat:` `src:` `kind:` `code:` `res:` `col:` `audio:` `q:1080`, `in:<folder>`, `has:note|link|local|hash|desc|audio|playable`, `is:fav|local|remote|seen|unseen|video|image|audio|gif|ai|inbox|linked|server|trash|archived|noted|rated|imported|added|dupe|live|silent|drive|collected|vertical|hd|new|filed`. Press **?** in the app for everything.

## App links (home-screen shortcuts, Tasker)
`?open=CODE`, `?folder=ai/generated`, `?scroll=1`, `?cmd=play favourites`, `?col=Name`, `?filter=fav`, `?q=is%3Aunseen`, `?shuffle=1`, `?tab=folders`. The Termux script accepts a command too: `bash termux/start-media-hub.sh "play favourites"`.

## Best playable version (originals untouched)
```
python3 tools/optimize_media.py media --out media/playable --thumbs
```
Skips files that already play everywhere, remuxes losslessly where it can, re-encodes only what must be (never upscales), re-hashes sources before and after. Rebuild with `build_catalog.py --playable media/playable` and the app plays the copy when a browser can't play the original.

## Check originals against a checksum list
```
python3 tools/verify_checksums.py SHA256SUMS --root ~/storage/dcim --extra           # or a JSON manifest, or media-manifest.json
python3 tools/verify_checksums.py --join "vault.zip.part*" --expect <sha256>           # do the parts rebuild the original? writes nothing
```

## Rebuild your own library
```
python3 tools/mirror_extract.py "My Library.html" private/mirror/        # a downloadable library page -> plain files + manifest.json
python3 tools/build_catalog.py --mirror private/mirror/ [--tsv catalog.tsv] [--vault hub.html] [--descriptions list.html] \
        [--viewer viewer.html] [--cloud cloud_locations.json] [--codes private/codes.json] [--playable media/playable] --version 2.2 --out private/build/
python3 tools/build.py --catalog private/build/catalog.json --plan private/build/media_plan.json --out private/dist --zip
```
Every media file is re-hashed after copying; the build stops if one byte differs.

## Tests
```
bash tests/run_all.sh                                                                 # everything below, after building the demo
python3 -m unittest tests/test_range.py tests/test_optimize.py tests/test_library.py tests/test_checksums.py
python3 -m pytest tests/test_media_serve.py                                           # 21 server cases (pip install pytest)
node tests/e2e_smoke.js dist [--shots DIR]                                            # browser test; needs Node Playwright + Chromium
python3 tests/checklist.py --report checklist-report.md                               # 40-line checklist; needs Python Playwright
```
Run the last two after building the demo. Everything uses synthetic files on 127.0.0.1; your media is never touched.

## Notes & limits
- Linking folders in place needs the File System Access API (Chrome/Edge on a computer). Elsewhere “Link a folder” copies the folder in, or use phone folders through the companion server. After a restart the browser may ask once to allow access again.
- Voice needs a browser with speech recognition (Chrome, Edge, Safari) and, in Chrome, a connection. On-device recognition is deliberately not requested: in current Chromium it can crash the tab.
- Drive “Play here” needs the file to be viewable by your Google account.
- Share-to-app works on Android Chrome once installed; iOS has no share target.
- Items from the third-party image-transformation bot were left out of the workspace index on purpose.
