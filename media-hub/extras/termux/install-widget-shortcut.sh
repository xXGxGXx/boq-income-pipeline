#!/data/data/com.termux/files/usr/bin/bash
# Adds a "Media Hub" button for the Termux:Widget home-screen widget (install Termux:Widget from F-Droid first).
set -eu
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$HOME/.shortcuts"
cat >"$HOME/.shortcuts/Media Hub" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
exec bash "$APP_DIR/termux/start-media-hub.sh"
EOF
chmod 700 "$HOME/.shortcuts/Media Hub"
echo "Done. Add the Termux:Widget widget to your home screen and tap “Media Hub”."
