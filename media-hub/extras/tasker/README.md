# Media Hub with Tasker and Termux

Media Hub needs no special Android permissions. Everything below is optional.

## 1. One tap to start (Termux)
```
bash termux/start-media-hub.sh          # starts the loopback server if needed and opens Chrome
bash termux/start-media-hub.sh DEMO-01     # opens one item directly
bash termux/install-widget-shortcut.sh  # adds a "Media Hub" button to the Termux:Widget widget
```
Install the app once from Chrome's menu ("Add to Home screen" / "Install app") and it runs full-screen with your favourites, notes and progress kept on the phone.

## 2. App links (home-screen shortcuts, Tasker "Browse URL")
| Link | Opens |
|---|---|
| `http://127.0.0.1:8765/?open=DEMO-01` | one item by code (every item's Details sheet has **Copy app link**) |
| `…/?col=Keepers` | a collection |
| `…/?filter=fav` | favourites |
| `…/?q=is%3Aunseen` | anything you can search, e.g. unseen |
| `…/?shuffle=1` | something you haven't opened yet |

Tasker: *Net → Browse URL* with `http://127.0.0.1:8765/?open=%code`.

## 3. Tasker WebView player (`media_hub_webview.html`)
A small player for a Scenes V2 **WebView** element, for when you want a floating overlay instead of the full app.
- Set `%clip_url` (`file:///sdcard/…mp4`, `content://…`, `https://…` or `http://127.0.0.1:…`), optionally `%safe_title` and `%playlist_json` (`[{"url":"…","title":"…"}, …]`). <!-- privacy-scan: ok (example path) -->
- Values are read as plain text (never as HTML), and only local, content, https or this-phone addresses are played.
- Resume position is remembered per clip; double-tap left/right seeks 10 s; Prev/Next walk the playlist.
- With the WebView's **JavaScript Interface** on, ✕ runs your task named `Media Hub Close`. Tasker can also call `mediaHub.play(url, title)`, `mediaHub.next()`, `mediaHub.prev()` with *Run JavaScript*.

The earlier `scenes_v2_media_hub.json` scene (native Video element) still works as it was; this file is the richer WebView alternative.

## Not included on purpose
The permissions script from the earlier package grants Tasker broad system rights (secure settings, logs, hidden APIs). Media Hub doesn't need any of that, so it isn't part of this kit.
