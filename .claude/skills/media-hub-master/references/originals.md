# Originals: retrieve, copy, mirror, verify

## Retrieve an exact original
Order of preference: (1) the original in the user's folder, mirror or app bundle (`media/`, `media-manifest.json`); (2) a byte-identical copy elsewhere (same SHA-256); (3) a processed version only if asked, as a new file in a separate folder (`playable/`, `frames/`) named for what it is (`name.frame-0m06s.png`); (4) if the source can't be reached, say so and ask the user to attach it.

1. Identify the item by code, title, tag or hash; look in `catalog.json`, `media_catalog.tsv` or the mirror's `manifest.json` before searching the disk.
2. Confirm size and SHA-256 against the record (`sha256sum file`); if there is no record, compute and record one.
3. Sniff the real type from magic bytes (`file --mime-type`); if it disagrees with the name or declared type, report both and keep the file as it is.
4. Work on a copy; uploads and mirrors are read-only originals.
5. Deliver files with the file-sending tool (files, not folders).
6. Remote-only items (Drive or site links): give the link and Drive id; don't scrape blocked sites.

Phrases: **"original only"** = exact bytes, not even a remux. **"best playable version"** = the ladder below. **"pull up X"** = look it up, verify the hash, show it. **"archive this as media"** = keep it as is, record it with its SHA-256, say where it lives.

## Playable or smaller copies: the ladder
Probe: `ffprobe -v error -print_format json -show_streams -show_format FILE`. Take the first rung that fits:

| Situation | Action |
|---|---|
| MP4 with H.264/AV1 (yuv420p) + AAC/MP3/none, or WebM with VP8/VP9/AV1 + Opus/Vorbis | **skip**: the original is the best version |
| H.264 (yuv420p) in .mov/.mkv/.avi with AAC/MP3 | **remux**: `ffmpeg -nostdin -n -i SRC -map 0:v:0 -map 0:a:0? -c copy -movflags +faststart OUT.mp4` |
| H.264 with PCM/AC-3/other audio | video copied, **audio only** re-encoded: `-c:v copy -c:a aac -b:a 160k` |
| HEVC, MPEG-4 Part 2, 10-bit, GIF, anything else | **encode** (below) |

```bash
ffmpeg -nostdin -v error -n -i SRC -map 0:v:0 -map 0:a:0? \
  -vf "scale='trunc(min(iw\,1920)/2)*2':-2:flags=lanczos,setsar=1" \
  -c:v libx264 -preset veryfast -crf 20 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 160k OUT.mp4
```
Never upscale (smaller sources keep their size); `-n` refuses to overwrite; smaller downloads = higher CRF (23–28) or lower max width. Output goes to a separate folder; refuse if it resolves to the source. Hash every source before and after; a changed hash means stop and tell the user. Skip existing outputs; never treat earlier outputs as sources. Record everything in `OUT/playable-report.json` keyed by source hash. Media Hub ships this as `tools/optimize_media.py SRC… --out DIR [--max-width N] [--crf N] [--best] [--thumbs] [--dry-run]`.

Ideas worth adding for long phone runs: the first Ctrl+C finishes the current file and stops; rerunning resumes; output names carry the source SHA-256 so a changed source gets a new copy.

## Mirror a "downloadable library" HTML
The page holds `var ITEMS = [{id,title,file,mime,size,path,asset:"data:…"}]` that refers to earlier `var`s, so evaluate the script prefix in a bare Node VM (not a regex), on pages the user supplied only. Decode every `data:` URI verbatim; write `files/<safe path>`; record id, title, declared and sniffed type, declared and real size, SHA-256, mirror path; group duplicates (don't delete); notes go to `notes/NNN-slug.txt`; add `__idNN` when two items share a path; sanitise paths (no `..`, no leading `/`, no backslashes). Re-runs are additive: compare by hash and report new/changed/removed. Leave out items tied to image-transformation bots when building a shipped index, and say so. Media Hub: `tools/mirror_extract.py LIB.html OUT/` and `tools/verify_mirror.py OUT/`.

## Verify against a checksum list, or split archives
```
python3 scripts/verify_checksums.py SHA256SUMS --root DIR [--extra] [--report r.json]
python3 scripts/verify_checksums.py manifest.json            # JSON lists: name/path/relativePath + sha256 (+ size)
python3 scripts/verify_checksums.py --join "vault.zip.part*" --expect <sha256>        # check only, writes nothing
python3 scripts/verify_checksums.py --join "vault.zip.part*" --out vault.zip --expect <sha256>   # rebuild
```
Parts are taken in numeric order and must run without gaps. Checking hashes them in order exactly as `cat` would join them, so a 26 GB archive can be confirmed without 26 GB of free space. A rebuild goes to a temporary file kept only on a match; an existing output is never overwritten. `--parts-manifest` names any single part that differs. Manifest paths that climb out of the folder are refused.

## Report
source used · original untouched? (hash) · anything processed? (rung, where) · archived? · reusable later? Plus counts for mirrors and verifications (items, bytes, mismatches, duplicates, missing).
