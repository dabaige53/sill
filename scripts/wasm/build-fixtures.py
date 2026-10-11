#!/usr/bin/env python3
"""Reproduce text-safe Wasm artifacts using the pinned official Wasmtime WAT tool.
Run: .sandbox-venv/bin/python -I scripts/wasm/build-fixtures.py [--check]
"""
import base64
import hashlib
import importlib.metadata
from pathlib import Path
import sys
import wasmtime

if importlib.metadata.version('wasmtime') != '49.0.0':
    raise SystemExit('Exactly wasmtime==49.0.0 is required')
root = Path(__file__).resolve().parent
for name in ('integer-stats', 'bounded-echo'):
    binary = wasmtime.wat2wasm((root / f'{name}.wat').read_text())
    encoded = base64.b64encode(binary).decode() + '\n'
    target = root / f'{name}.wasm.b64'
    if '--check' in sys.argv:
        if target.read_text() != encoded:
            raise SystemExit(f'{name}: artifact differs from reviewed WAT')
    else:
        target.write_text(encoded)
    print(f'{name} {hashlib.sha256(binary).hexdigest()} {len(binary)} bytes')
