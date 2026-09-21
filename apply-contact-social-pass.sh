#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET="${1:-.}"
node "$SCRIPT_DIR/apply-contact-social-pass.mjs" "$TARGET"
