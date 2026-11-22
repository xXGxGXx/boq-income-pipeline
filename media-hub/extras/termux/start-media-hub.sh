#!/data/data/com.termux/files/usr/bin/bash
# Start Media Hub on this phone (loopback only) and open it.
#   bash termux/start-media-hub.sh                 -> opens the app, sharing your phone folders read-only (Folders > Sources > Phone folders)
#   bash termux/start-media-hub.sh DEMO-01            -> opens one item straight away (any catalog code)
#   bash termux/start-media-hub.sh "play favourites"   -> runs a command (anything you could say or type)
#   PORT=9000 bash termux/start-media-hub.sh       -> another port
#   MH_LIBRARY="$HOME/storage/dcim:$HOME/storage/shared/Media Hub Library" bash termux/start-media-hub.sh   -> choose the folders to share
#   MH_LIBRARY=none ...                            -> share no folders
# Phone folders need `termux-setup-storage` once. Files are only read: nothing is copied, moved or changed.
set -eu
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8765}"
command -v python3 >/dev/null 2>&1 || { echo "Installing Python…"; pkg install -y python; }
LIBS=()
if [ "${MH_LIBRARY:-}" != "none" ]; then
  if [ -n "${MH_LIBRARY:-}" ]; then IFS=':' read -r -a CAND <<<"$MH_LIBRARY"
  else CAND=("$HOME/storage/dcim" "$HOME/storage/pictures" "$HOME/storage/movies" "$HOME/storage/music" "$HOME/storage/downloads" "$HOME/storage/shared/Media Hub Library"); fi
  for d in "${CAND[@]}"; do [ -d "$d" ] && LIBS+=(--library "$d"); done
fi
if ! (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then
  nohup python3 "$APP_DIR/tools/media_serve.py" --dir "$APP_DIR" --port "$PORT" "${LIBS[@]}" >"$APP_DIR/.media-serve.log" 2>&1 &
  for _ in 1 2 3 4 5 6 7 8 9 10; do (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null && break; sleep 0.3; done
fi
URL="http://127.0.0.1:$PORT/"
if [ -n "${1:-}" ]; then
  case "$1" in
    *" "*) URL="${URL}?cmd=$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$1")" ;;
    *) URL="${URL}?open=$(printf '%s' "$1" | sed 's/[^A-Za-z0-9._-]/-/g')" ;;
  esac
fi
if command -v termux-open-url >/dev/null 2>&1; then termux-open-url "$URL"; else echo "Open $URL in Chrome"; fi
echo "Media Hub: $URL  (stop it with: pkill -f media_serve.py)"
[ ${#LIBS[@]} -gt 0 ] && echo "Sharing $(( ${#LIBS[@]} / 2 )) phone folder(s) read-only."
exit 0
