import { readdir,readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { Script } from 'node:vm';
import { resolve } from 'node:path';
const ROOT = resolve(import.meta.dirname, '..');

for(const directory of ['server','scripts','web','tests'])for(const file of await readdir(resolve(ROOT,directory)))if(/\.(mjs|js)$/.test(file)){
  const result=spawnSync(process.execPath,['--check',resolve(ROOT,directory,file)],{stdio:'inherit'});if(result.status!==0)process.exit(1);
}
for(const file of ['index.html']){
  const html=await readFile(resolve(ROOT,file),'utf8');
  for(const [,code] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new Script(code,{filename:file});
}
JSON.parse(await readFile(resolve(ROOT,'plugin.json'),'utf8'));
console.log('JavaScript, inline scripts and plugin manifest checked.');
