import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
test('local package keeps identity and removes App and MCP registrations',async()=>{
  const dir=resolve(root,'plugins/quiet-glass');
  execFileSync(process.execPath,[resolve(root,'scripts/build-plugin.mjs')]);
  for(const path of ['.app.json','mcp.json','.mcp.json'])await writeFile(resolve(dir,path),'{}');
  execFileSync(process.execPath,[resolve(root,'scripts/build-plugin.mjs')]);
  for(const path of ['plugin.json','.app.json','mcp.json','.mcp.json','codex-mcp.toml'])await assert.rejects(access(resolve(dir,path)),{code:'ENOENT'});
  const overlay=JSON.parse(await readFile(resolve(dir,'.codex-plugin/plugin.json'),'utf8'));
  assert.equal(overlay.name,'quiet-glass');assert.equal(overlay.version,'0.4.2');assert.equal(overlay.apps,undefined);assert.equal(overlay.mcpServers,undefined);
  const skill=await readFile(resolve(dir,'skills/quiet-glass/SKILL.md'),'utf8');
  assert.ok(skill.includes('http://127.0.0.1:4318/#feed'));assert.ok(skill.includes('scripts/qg.mjs'));
  assert.ok(!skill.includes('qg_open_workspace'));
  assert.ok(!skill.includes('/Users/'));
  await access(resolve(dir,'skills/quiet-glass/scripts/qg.mjs'));
  const marketplace=JSON.parse(await readFile(resolve(root,'.agents/plugins/marketplace.json'),'utf8'));
  assert.equal(resolve(root,marketplace.plugins[0].source.path),dir);
  assert.match(execFileSync(process.execPath,[resolve(dir,'skills/quiet-glass/scripts/qg.mjs'),'help'],{cwd:'/tmp',encoding:'utf8'}),/Sill/);
});
