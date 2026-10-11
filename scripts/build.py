"""Build dependency-free, offline HTML pages from shared source modules."""
from pathlib import Path
import argparse
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
PAGES = {
    "index.html": ("feed", "个人信息空间"),
    "components.html": ("library", "组件实验室"),
    "research.html": ("sources", "研究资料"),
}


def build(check=False):
    modules = json.loads((ROOT / "scripts/modules.json").read_text())
    script = "\n\n".join(
        f"/* module: {name} */\n{(ROOT / name).read_text().rstrip()}"
        for name in modules
    )
    css = (ROOT / "src/styles/main.css").read_text().rstrip()
    if "</script" in script.lower() or "</style" in css.lower():
        raise ValueError("Source contains an unsafe inline closing tag")
    template = (ROOT / "src/shell.html").read_text()
    stale = []
    for name, (page, title) in PAGES.items():
        content = (template.replace("{{PAGE}}", page).replace("{{TITLE}}", title)
                   .replace("{{STYLES}}", css).replace("{{SCRIPT}}", script))
        target = ROOT / name
        if check:
            if not target.exists() or target.read_text() != content:
                stale.append(name)
        else:
            target.write_text(content, encoding="utf-8")
    if stale:
        print("Stale build: " + ", ".join(stale), file=sys.stderr)
        return 1
    print("Build verified" if check else "Built 3 standalone pages")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    sys.exit(build(parser.parse_args().check))
