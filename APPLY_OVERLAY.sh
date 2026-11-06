#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
python3 apply_overlay.py .
printf '\nNext: npm run typecheck && npm run build\n'
