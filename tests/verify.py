"""Dependency-free build and core checks; browser checks are a separate command."""
from pathlib import Path
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def run(*args):
    subprocess.run(args, cwd=ROOT, check=True)


run(sys.executable, "scripts/build.py", "--check")
for module in json.loads((ROOT / "scripts/modules.json").read_text()):
    run("node", "--check", module)
run("node", "--test", "tests/core.test.cjs", "tests/build.test.cjs")
print("Core checks passed. Browser checks: npm run test:browser (separate, not implied).")
