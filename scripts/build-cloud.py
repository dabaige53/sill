"""Build an isolated cloud page. Does not change the local app or preview branch."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
modules=json.loads((ROOT/'scripts/modules.json').read_text())
modules[modules.index('src/index.js')]='web/cloud-entry.js'
script='\n\n'.join((ROOT/name).read_text() for name in modules)
styles=json.loads((ROOT/'src/styles/styles.json').read_text())
css='\n'.join((ROOT/name).read_text() for name in styles)
css+='\n'+(ROOT/'web/cloud.css').read_text()
assert '</script' not in script.lower() and '</style' not in css.lower()
html=(ROOT/'src/shell.html').read_text().replace('{{PAGE}}','feed').replace('{{TITLE}}','云端工作台').replace('{{STYLES}}',css).replace('{{SCRIPT}}',script)
target=ROOT/'dist/cloud/index.html';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(html)
print('Built isolated cloud page')
