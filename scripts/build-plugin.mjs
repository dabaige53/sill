import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ROOT } from '../server/config.mjs';

// Emit concrete paths; no reliance on host-specific PLUGIN_ROOT interpolation.
// Keep this checkout in place after building a local package.
const remoteIndex=process.argv.indexOf('--url');
const remote=remoteIndex>=0?process.argv[remoteIndex+1]:null;
if(remoteIndex>=0&&(!remote||new URL(remote).protocol!=='https:'||new URL(remote).username||new URL(remote).password||new URL(remote).hash))throw new Error('--url requires a stable HTTPS MCP URL without credentials');
const directory=resolve(ROOT,'dist/quiet-glass');
await mkdir(resolve(directory,'.codex-plugin'),{recursive:true});
await cp(resolve(ROOT,'skills'),resolve(directory,'skills'),{recursive:true});
const manifest=JSON.parse(await readFile(resolve(ROOT,'plugin.json'),'utf8'));
await writeFile(resolve(directory,'plugin.json'),JSON.stringify(manifest,null,2)+'\n');
const localArgs=['--env-file-if-exists='+resolve(ROOT,'.env'),resolve(ROOT,'server/index.mjs'),'--stdio'];
const server=remote?{type:'streamable-http',url:remote,extensions:{'com.openai':{auth:{type:'api_key',headerScheme:'bearer'}}}}:{type:'stdio',command:process.execPath,args:localArgs,env:{QG_CONFIG:resolve(process.env.QG_CONFIG||resolve(ROOT,'quiet-glass.config.json'))}};
await writeFile(resolve(directory,'mcp.json'),JSON.stringify({$schema:'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',mcpServers:{'quiet-glass':server}},null,2)+'\n');
const compatibility=remote?{url:remote,bearer_token_env_var:'QG_AUTH_TOKEN'}:{command:server.command,args:server.args,env:server.env};
await writeFile(resolve(directory,'.mcp.json'),JSON.stringify({mcpServers:{'quiet-glass':compatibility}},null,2)+'\n');
await writeFile(resolve(directory,'.codex-plugin/plugin.json'),JSON.stringify({name:manifest.name,version:manifest.version,description:manifest.description,skills:'./skills/',mcpServers:'./.mcp.json',interface:manifest.extensions['com.openai'].interface},null,2)+'\n');
await writeFile(resolve(directory,'codex-mcp.toml'),remote?`[mcp_servers.quiet-glass]\nurl = ${JSON.stringify(remote)}\nbearer_token_env_var = "QG_AUTH_TOKEN"\n`:`[mcp_servers.quiet-glass]\ncommand = ${JSON.stringify(server.command)}\nargs = ${JSON.stringify(server.args)}\n\n[mcp_servers.quiet-glass.env]\nQG_CONFIG = ${JSON.stringify(server.env.QG_CONFIG)}\n`);
console.log(`Plugin package: ${directory}\nTransport: ${remote?'remote HTTPS (supply access key at connection time)':'local stdio (keep repository at its current path)'}\nCodex MCP config: ${resolve(directory,'codex-mcp.toml')}`);
