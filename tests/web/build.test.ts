import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
const root=path.resolve(import.meta.dirname,'../..');
for(const [file,mode] of [['index.html','feed']]){
 test(`${file}: standalone script compiles and has no external runtime dependencies`,()=>{
  const html=fs.readFileSync(path.join(root,'dist/web',file),'utf8');
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,2);for(const [,code] of scripts)new vm.Script(code,{filename:file});
  assert.ok(html.includes(`window.__PAGE__="${mode}"`));
  assert.doesNotMatch(html,/<script\s+[^>]*src=/i);
  assert.doesNotMatch(html,/<link\s+[^>]*rel=["']stylesheet/i);
  assert.doesNotMatch(html,/<img[^>]*src=["']https?:/i);
 });
}
