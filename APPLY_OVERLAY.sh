#!/bin/sh
cd "$(dirname "$0")" || exit 1
python3 apply_overlay.py . || exit 1
echo 'Now run npm run typecheck and npm run build before pushing.'
