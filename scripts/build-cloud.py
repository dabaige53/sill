"""Build an isolated cloud page. Does not change the local app or preview branch."""
from pathlib import Path
import json
ROOT=Path(__file__).resolve().parents[1]
modules=json.loads((ROOT/'scripts/modules.json').read_text())
modules[modules.index('src/index.js')]='web/cloud-entry.js'
script='\n\n'.join((ROOT/name).read_text() for name in modules)
styles=json.loads((ROOT/'src/styles/styles.json').read_text())
css='\n'.join((ROOT/name).read_text() for name in styles)
css+='''\n#cloud-account{padding:16px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;background:var(--card)}#cloud-account span{flex:1;min-width:200px;font-size:13px}#cloud-editor label{display:block;margin:16px 0}#cloud-editor input:not([type=checkbox]),#cloud-editor textarea{display:block;width:100%;margin-top:8px}#cloud-editor textarea{resize:vertical}#cloud-save-status{color:var(--secondary)}[data-action=bookmark],[data-action=later],[data-action=task],[data-action=sources-add],[data-action=selected-bookmark],[data-action=selected-later],[data-action=selected-tag]{display:none!important}'''
assert '</script' not in script.lower() and '</style' not in css.lower()
html=(ROOT/'src/shell.html').read_text().replace('{{PAGE}}','feed').replace('{{TITLE}}','云端工作台').replace('{{STYLES}}',css).replace('{{SCRIPT}}',script)
target=ROOT/'dist/cloud/index.html';target.parent.mkdir(parents=True,exist_ok=True);target.write_text(html)
print('Built isolated cloud page')
