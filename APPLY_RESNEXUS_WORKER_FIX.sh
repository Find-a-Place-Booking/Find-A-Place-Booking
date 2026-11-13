#!/bin/sh
set -eu
cd "$(dirname "$0")"
python3 APPLY_RESNEXUS_WORKER_FIX.py
