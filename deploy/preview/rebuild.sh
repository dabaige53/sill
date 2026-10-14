#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
python3 scripts/build.py
python3 scripts/build.py --check
cp index.html deploy/preview/index.html
python3 deploy/preview/package-upload.py
