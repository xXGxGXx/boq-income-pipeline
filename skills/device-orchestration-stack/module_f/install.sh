#!/usr/bin/env bash
# Module F installer for Termux. One command on the phone:
#
#   curl -fsSL https://raw.githubusercontent.com/xXGxGXx/boq-income-pipeline/main/skills/device-orchestration-stack/module_f/install.sh | bash
#
# Installs python, adb (android-tools), termux-api and droid-agent, downloads Module F to
# ~/.module-f/app, and adds a `module-f` command that works from any folder.
# Safe to run again: it updates Module F and keeps ~/.module-f/allowlist.local.json (apps you added with learn).
set -euo pipefail

SRC="${MODULE_F_SRC:-https://raw.githubusercontent.com/xXGxGXx/boq-income-pipeline/main/skills/device-orchestration-stack/module_f}"
APP="${MODULE_F_HOME:-$HOME/.module-f}/app/module_f"
BIN_DIR="${MODULE_F_BIN:-${PREFIX:-}/bin}"
FILES="__init__.py __main__.py core.py backends.py allowlist.json README.md"

if [ -z "${MODULE_F_SKIP_PKG:-}" ]; then
  if ! command -v pkg >/dev/null 2>&1; then
    echo "module-f: this installer is for Termux (no 'pkg' command found)." >&2
    exit 1
  fi
  echo "==> Installing Termux packages: python, android-tools (adb), termux-api"
  pkg install -y python android-tools termux-api
  echo "==> Installing droid-agent"
  pip install --upgrade droid-agent || pip install --upgrade --break-system-packages droid-agent
fi

echo "==> Downloading Module F"
mkdir -p "$APP.new"
for f in $FILES; do
  curl -fsSL "$SRC/$f" -o "$APP.new/$f"
done
rm -rf "$APP"
mv "$APP.new" "$APP"

mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/module-f" <<EOF
#!/usr/bin/env bash
# Runs Module F from any folder. Installed by module_f/install.sh.
PYTHONPATH="$(dirname "$APP")\${PYTHONPATH:+:\$PYTHONPATH}" exec python3 -m module_f "\$@"
EOF
chmod +x "$BIN_DIR/module-f"

echo
echo "Module F installed. Command: module-f"
echo
echo "Next, once:"
echo "  1. Install the Termux:API app from the same place you got Termux (F-Droid or GitHub), if you haven't."
echo "  2. Settings > Developer options > Wireless debugging > on. Tap 'Pair device with pairing code', then run:"
echo "       droid-agent pair 127.0.0.1:PAIRING_PORT CODE"
echo "       droid-agent connect 127.0.0.1:PORT_SHOWN_UNDER_IP_ADDRESS"
echo "       droid-agent state        # should print the app on screen"
echo "  3. module-f learn ChatGPT     # switch to ChatGPT during the 6-second countdown"
echo "     module-f check"
echo "     module-f --dry-run say \"hello press send\""
