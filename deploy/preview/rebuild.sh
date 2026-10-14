#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."
python3 scripts/build.py
python3 scripts/build.py --check
python3 scripts/build.py --preview
python3 scripts/build.py --preview --check
python3 deploy/preview/package-upload.py
