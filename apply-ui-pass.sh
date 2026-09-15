#!/usr/bin/env bash
set -euo pipefail

OVERLAY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${1:-.}"

if [[ ! -f "$TARGET_DIR/package.json" || ! -d "$TARGET_DIR/app" || ! -d "$TARGET_DIR/components" ]]; then
  echo "Target does not look like the Find A Place Booking repository: $TARGET_DIR" >&2
  echo "Usage: ./apply-ui-pass.sh /path/to/Find-A-Place-Booking" >&2
  exit 1
fi

mkdir -p "$TARGET_DIR/public/brand"
cp -R "$OVERLAY_DIR/app/." "$TARGET_DIR/app/"
cp -R "$OVERLAY_DIR/components/." "$TARGET_DIR/components/"
cp -R "$OVERLAY_DIR/public/brand/." "$TARGET_DIR/public/brand/"

echo "Find A Place UI pass applied to: $TARGET_DIR"
echo "Review 'git diff', then run your normal build/test commands before committing."
