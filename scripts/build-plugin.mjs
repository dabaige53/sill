import { mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const directory=resolve(root,'plugins/quiet-glass');
const manifest=JSON.parse(await readFile(resolve(root,'plugin.json'),'utf8'));
await mkdir(resolve(directory,'.codex-plugin'),{recursive:true});
await rm(resolve(directory,'skills'),{recursive:true,force:true});
await cp(resolve(root,'skills'),resolve(directory,'skills'),{recursive:true});
for(const path of ['.app.json','codex-mcp.toml'])await rm(resolve(directory,path),{force:true});
// Preserve the existing Codex package format: preregistered OAuth settings use its compatibility manifest.
await rm(resolve(directory,'plugin.json'),{force:true});
await cp(resolve(root,'mcp.json'),resolve(directory,'mcp.json'));
const portable=JSON.parse(await readFile(resolve(root,'mcp.json'),'utf8'));
const client=JSON.parse(await readFile(resolve(root,'deploy/cloud/codex-client.json'),'utf8'));
const {scopes,...oauth}=client;
const mcpServers=Object.fromEntries(Object.entries(portable.mcpServers).map(([name,server])=>[name,{type:'http',url:server.url,oauth_resource:server.url,scopes,oauth}]));
await writeFile(resolve(directory,'.mcp.json'),JSON.stringify({mcpServers},null,2)+'\n');
await writeFile(resolve(directory,'.codex-plugin/plugin.json'),JSON.stringify({name:manifest.name,version:manifest.version,description:manifest.description,skills:'./skills/',mcpServers:'./.mcp.json',interface:manifest.extensions['com.openai'].interface},null,2)+'\n');
console.log(`Plugin package: ${directory}\nMode: authenticated Sill cloud and sidebar`);
