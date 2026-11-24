# Media Hub: quick start

Media Hub is a private media library for your own photos, videos and audio. It's one web page that works like an app: no account, no cloud, no tracking. Nothing leaves your device unless you choose to share it.

## Start in one minute (computer)
1. Unzip this folder.
2. Double-click **`Media Hub.html`**. It opens in your browser (Chrome, Edge, Firefox or Safari).
3. Tap **+** and choose **Photos, videos & audio**, or drag files onto the page.

Your files are stored inside your browser on this device, each with a SHA-256 fingerprint, so exact duplicates are recognised.

## What you can do
- **Organise:** folders that nest as deep as you like, collections, tags, star ratings, notes, and smart folders (Favourites, Not opened yet, Continue watching, Recently added, Exact duplicates, saved searches).
- **Find:** search by title, tag, folder, type and more.
- **Watch and view:** zoom, swipe, A–B loop, speed control, picture-in-picture, resume where you left off, and frame capture (saved as a new file; the original is never changed).
- **Keep it private:**
  - **Offline-only mode** switches off everything that could go online.
  - A **PIN screen** with an escalating lock-out.
  - A **panic cover** (press Escape twice).
  - **Encrypted notes** (AES-256-GCM, passphrase on this device only).
- **Undo anything:** every change can be undone, and daily restore points are kept.

## Keep your library safe
- **Tools › Backup** saves your folders, notes, tags, ratings and progress to a small file. It doesn't include the media files or your PIN.
- **Folders › Export to a real folder** writes copies of your media into an ordinary `Media Hub Library` folder, checking every byte. Do this regularly.
- Clearing your browser's data for this page deletes the library stored in it. Export first.

## Install it as an app, with your phone and computer folders (optional)
The `app-folder` version can be installed from the browser menu, and it can show folders from your device without copying them. It needs Python 3:

```bash
python3 app-folder/tools/media_serve.py --dir app-folder --open --library ~/Pictures --library ~/Movies
```

**On Android, using Termux** (from F-Droid):
1. Allow storage access: `termux-setup-storage`.
2. Copy `app-folder` to your phone and start it: `bash app-folder/termux/start-media-hub.sh`. It installs Python the first time if needed.

Your DCIM, Pictures, Movies, Music and Downloads folders then appear read-only under **Folders › Sources › Phone folders**, and `bash app-folder/termux/install-widget-shortcut.sh` adds a home-screen button.

The server only listens on this device (127.0.0.1), refuses requests from other websites, and serves only the app and your media.

## Good to know
- The PIN covers the screen; it isn't encryption. Use encrypted notes for anything sensitive.
- How much your browser lets a page store depends on the browser and your free space. For very large libraries, use the app-folder version with your own folders, since nothing gets copied into the browser that way.
- Opening a local `.html` file on Android depends on your file manager. The Termux route above always works.
- Linking a folder in place (without copying) needs Chrome or Edge on a computer.

## Updates and support
Updates for 2.x are free: download them again from your purchase page. For questions, use the contact option there.
