#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
python3 apply_overlay.py .
echo "Run npm run typecheck and npm run build, then commit/push."
