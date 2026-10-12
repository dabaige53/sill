import { mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const directory=resolve(root,'dist/quiet-glass');
const manifest=JSON.parse(await readFile(resolve(root,'plugin.json'),'utf8'));
await mkdir(resolve(directory,'.codex-plugin'),{recursive:true});
await rm(resolve(directory,'skills'),{recursive:true,force:true});
await cp(resolve(root,'skills'),resolve(directory,'skills'),{recursive:true});
// One local skill package. Clear registrations left by earlier App/MCP builds.
for(const path of ['plugin.json','.app.json','mcp.json','.mcp.json','codex-mcp.toml'])await rm(resolve(directory,path),{force:true});
await writeFile(resolve(directory,'.codex-plugin/plugin.json'),JSON.stringify({name:manifest.name,version:manifest.version,description:manifest.description,skills:'./skills/',interface:manifest.interface},null,2)+'\n');
console.log(`Plugin package: ${directory}\nMode: local cards and agent commands`);
