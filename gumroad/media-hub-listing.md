# Gumroad Listing: Media Hub

**Price:** A$24 (one-time). Suggested launch price A$15 for the first week (discount code, not a permanent price).
**Category:** Software Development > Apps (or Photography > Tools)
**Tags:** private gallery, offline, photo library, video library, no cloud, privacy, Android, PWA
**Files to upload:** `media-hub-2.3.0.zip` from `python3 products/build_releases.py --out release-out media-hub`
**Images:** cover and thumbnail from `products/make_covers.py`; screenshots taken from the synthetic demo library only

---

## Title
Media Hub: Private Offline Media Library (One File, No Cloud, No Account)

## Subtitle
Organise your own photos, videos and audio in a fast, app-like library that never leaves your device.

## Description

### Your media, on your device, organised
Cloud galleries scan, sync and sell. Media Hub doesn't. It's a single web page that works like an app: open it, add your photos, videos and audio, and organise them with folders, collections, tags, ratings and notes. There's no account, no upload and no tracking.

### What you get
- **`Media Hub.html`:** the whole app in one file. Double-click it and start adding media.
- **An installable app folder** with a small local server:
  - install it from your browser menu;
  - show your computer's or phone's folders read-only, without copying them;
  - on Android, run it through Termux.
- **A quick-start guide**, and the full technical README.

### Features
- Folders that nest as deep as you like, plus collections, tags, star ratings, notes and saved searches.
- Smart folders: Favourites, Not opened yet, Continue watching, Recently added, Exact duplicates.
- A viewer and player with zoom, swipe, slideshow, A–B loop, speed control, picture-in-picture and resume.
- Frame capture saves a new image; your originals are never changed.
- Every file gets a SHA-256 fingerprint, so exact duplicates are found automatically.
- Undo for every change, plus daily restore points.
- Export your library to an ordinary folder, with every byte checked.

### Privacy, built in
- **Offline-only mode** switches off everything that could go online.
- The page's own security policy only lets it talk to itself and your device.
- A PIN screen with an escalating lock-out, and a panic cover (press Escape twice).
- Encrypted notes (AES-256-GCM, with a passphrase that stays on your device).
- The optional local server listens only on your own device and refuses requests from other websites.

### Requirements
- A modern browser: Chrome, Edge, Firefox or Safari.
- Optional: Python 3 for the installable app folder and the folder-sharing server (Termux on Android).

### Good to know
- Media you add is stored in your browser on that device. Use the built-in export to keep copies elsewhere. Clearing the browser's data for the page removes the library.
- The PIN covers the screen; it isn't encryption. Encrypted notes are.
- There's no cloud sync between devices, by design.
- Linking a folder in place (without copying) needs Chrome or Edge on a computer. The app folder's server covers phones.

### Updates
Free updates for version 2.x.

---

## Cover image brief
Dark navy background. Left: the library screenshot (synthetic demo) in a laptop frame, with the phone screenshot overlapping. Right: "Media Hub", then "Your photos and videos. Your device. No cloud." Small footer: "One file · Offline · No account". No stock photos, and no padlock or shield clip-art.
