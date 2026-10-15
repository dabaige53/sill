"""Build dependency-free, offline HTML pages from shared source modules."""
from pathlib import Path
import argparse
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
PAGES = {
    "index.html": ("feed", "个人信息空间"),
}


def build(check=False, preview=False):
    modules = json.loads((ROOT / "scripts/modules.json").read_text())
    if preview:
        modules.insert(modules.index("src/index.js"), "deploy/preview/profile.js")
    script = "\n\n".join(
        f"/* module: {name} */\n{(ROOT / name).read_text().rstrip()}"
        for name in modules
    )
    styles = json.loads((ROOT / "src/styles/styles.json").read_text())
    css = "\n\n".join((ROOT / name).read_text().rstrip() for name in styles)
    if "</script" in script.lower() or "</style" in css.lower():
        raise ValueError("Source contains an unsafe inline closing tag")
    if preview:
        css += "\n#demo-notice{position:relative;z-index:1;padding:12px 20px;text-align:center;background:#fff0cc;color:#5c4518;font:13px/1.6 system-ui;border-bottom:1px solid #e4d5ae}body{padding-top:0}"
    template = (ROOT / "src/shell.html").read_text()
    stale = []
    for name, (page, title) in PAGES.items():
        content = (template.replace("{{PAGE}}", page).replace("{{TITLE}}", title)
                   .replace("{{STYLES}}", css).replace("{{SCRIPT}}", script))
        target = ROOT / ("deploy/preview/" + name if preview else name)
        if check:
            if not target.exists() or target.read_text() != content:
                stale.append(name)
        else:
            target.write_text(content, encoding="utf-8")
    if stale:
        print("Stale build: " + ", ".join(stale), file=sys.stderr)
        return 1
    print("Build verified" if check else f"Built {len(PAGES)} standalone page(s)")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--preview", action="store_true")
    args = parser.parse_args()
    sys.exit(build(args.check, args.preview))
