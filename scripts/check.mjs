import { readdir,readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { Script } from 'node:vm';
import { resolve } from 'node:path';
import { ROOT, ConfigSchema } from '../server/config.mjs';

for(const directory of ['server','scripts','web','tests'])for(const file of await readdir(resolve(ROOT,directory)))if(/\.(mjs|js)$/.test(file)){
  const result=spawnSync(process.execPath,['--check',resolve(ROOT,directory,file)],{stdio:'inherit'});if(result.status!==0)process.exit(1);
}
for(const file of ['index.html','cards.html','icons.html','components.html','research.html']){
  const html=await readFile(resolve(ROOT,file),'utf8');
  for(const [,code] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new Script(code,{filename:file});
}
ConfigSchema.parse(JSON.parse(await readFile(resolve(ROOT,'quiet-glass.config.example.json'),'utf8')));
JSON.parse(await readFile(resolve(ROOT,'plugin.json'),'utf8'));
console.log('JavaScript, inline scripts, plugin manifest and connector configuration checked.');
