#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO"

usage() {
  echo "Usage: ./sync.sh <command>"
  echo ""
  echo "Commands:"
  echo "  check     Show upstream changes without applying"
  echo "  update    Fetch upstream and merge into main"
  echo "  build     Build and install the patched binary"
  echo "  all       update + build (full sync)"
  echo "  restore   Restore the official opencode binary"
}

check() {
  echo "Fetching upstream..."
  git fetch upstream
  local count
  count=$(git rev-list --count HEAD..upstream/dev)
  if [ "$count" -eq 0 ]; then
    echo "Already up to date with upstream/dev."
  else
    echo "$count new commits on upstream/dev:"
    git log --oneline HEAD..upstream/dev | head -20
  fi
}

update() {
  echo "Fetching upstream..."
  git fetch upstream
  local count
  count=$(git rev-list --count HEAD..upstream/dev)
  if [ "$count" -eq 0 ]; then
    echo "Already up to date."
    return
  fi
  echo "Merging $count commits from upstream/dev..."
  git merge upstream/dev
  echo "Update complete. If there were conflicts, resolve them and run: ./sync.sh build"
}

build() {
  echo "Building and installing..."
  "$REPO/packages/opencode/script/install-local.sh"
}

restore() {
  local dest="$HOME/.opencode/bin/opencode"
  local backup="$dest.bak"
  if [ ! -f "$backup" ]; then
    echo "No backup found at $backup"
    exit 1
  fi
  cp "$backup" "$dest"
  if [ "$(uname -s)" = "Darwin" ]; then
    codesign --force --sign - "$dest" 2>/dev/null || true
  fi
  echo "Restored official binary."
  echo "To re-enable auto-update, set \"autoupdate\": true in ~/.config/opencode/opencode.json"
}

case "${1:-}" in
  check)   check ;;
  update)  update ;;
  build)   build ;;
  all)     update && build ;;
  restore) restore ;;
  *)       usage ;;
esac
