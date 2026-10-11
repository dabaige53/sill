const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
for(const [file,mode] of [['index.html','feed'],['components.html','library'],['research.html','sources']]){
 test(`${file}: standalone script compiles and has no external runtime dependencies`,()=>{
  const html=fs.readFileSync(path.join(root,file),'utf8');
  const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length,2);for(const [,code] of scripts)new vm.Script(code,{filename:file});
  assert.ok(html.includes(`window.__PAGE__="${mode}"`));
  assert.doesNotMatch(html,/<script\s+[^>]*src=/i);
  assert.doesNotMatch(html,/<link\s+[^>]*rel=["']stylesheet/i);
  assert.doesNotMatch(html,/<img[^>]*src=["']https?:/i);
 });
}
