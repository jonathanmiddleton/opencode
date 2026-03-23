#!/usr/bin/env bash
set -euo pipefail

BUN="$(which -a bun)"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PKG="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT="$(cd "$PKG/../.." && pwd)"

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
  aarch64|arm64) ARCH="arm64" ;;
  x86_64)        ARCH="x64" ;;
esac

DIST="$PKG/dist/opencode-${OS}-${ARCH}/bin/opencode"
DEST="$HOME/.opencode/bin/opencode"
GLOBAL_CONFIG="$HOME/.config/opencode"

echo "Installing dependencies..."
"$BUN" install --cwd "$ROOT"

echo "Building..."
"$BUN" run "$PKG/script/build.ts" --single

echo "Installing..."
mkdir -p "$(dirname "$DEST")"
cp "$DIST" "$DEST"

if [ "$(uname -s)" = "Darwin" ]; then
  echo "Signing..."
  codesign --force --sign - "$DEST"
fi

# Disable auto-update to prevent the official release from overwriting this build
mkdir -p "$GLOBAL_CONFIG"
CONFIG_FILE="$GLOBAL_CONFIG/opencode.json"
if [ -f "$CONFIG_FILE" ]; then
  if ! grep -q '"autoupdate"' "$CONFIG_FILE"; then
    echo "Disabling auto-update in $CONFIG_FILE..."
    # Insert autoupdate:false into existing config
    "$BUN" -e "
      const f = Bun.file('$CONFIG_FILE');
      const c = await f.json().catch(() => ({}));
      c.autoupdate = false;
      await Bun.write(f, JSON.stringify(c, null, 2));
    "
  fi
else
  echo "Creating $CONFIG_FILE with auto-update disabled..."
  echo '{ "autoupdate": false }' > "$CONFIG_FILE"
fi

echo "Done: $("$DEST" --version 2>/dev/null || echo 'installed')"
