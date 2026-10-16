import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createSillRuntime} from '../../server/cloud/http.ts';
import {workspaceUri} from '../../server/cloud/mcp.ts';
import {createCloudTransport,readWhenReady} from '../../apps/web/cloud-bridge.ts';
import {cloudFixture} from './helpers/cloud-fixture.ts';
import {A,resource} from './helpers/boundary-fixture.ts';
import {token} from './helpers/signed-auth.ts';

test('initial host reads recover automatically, while denied reads and writes are not retried',async()=>{
 let calls=0;const delays=[];
 assert.equal(await readWhenReady(async()=>{if(++calls<3)throw Object.assign(new Error('Host starting'),{status:503});return 'ready';},{name:'sill_open_workspace'},{sleep:async (ms?: any)=>delays.push(ms)}),'ready');
 assert.equal(calls,3);assert.deepEqual(delays,[300,900]);
 for(const [name,status] of [['sill_open_workspace',401],['sill_listContents',403],['sill_createContent',503]]){
  calls=0;await assert.rejects(readWhenReady(async()=>{calls++;throw Object.assign(new Error('Denied'),{status});},{name},{sleep:async()=>{}}));assert.equal(calls,1);
 }
});

test('cloud view preserves edit revision and idempotency when using host tools',async()=>{
 const calls=[],request=createCloudTransport(async (args?: any)=>{calls.push(args);return {connected:true};});
 assert.equal((await request('/auth/session')).userId,'connected');
 await request('/api/v1/contents?cursor=snapshot');
 const body: Record<string, any>={expectedRevision:4,changes:{title:'Updated'}};
 await request('/api/v1/contents/card-1',{method:'PATCH',headers:{'Idempotency-Key':'request-key'},body:JSON.stringify(body)});
 assert.deepEqual(calls.at(-1),{name:'sill_updateContent',arguments:{id:'card-1',idempotency_key:'request-key',body}});
 assert.deepEqual(calls[1],{name:'sill_listContents',arguments:{cursor:'snapshot'}});
 await assert.rejects(request('/auth/login',{method:'POST'}));
});

test('sidebar and thread entries use scoped cloud resources and disappear on revocation',async()=>{
 const f=await cloudFixture();let client: any;
 try{
  await f.db.exec(`insert into sill_private.caller_grants values('${A}','oauth:codex-test',array['content:read','content:write','content:delete','event:read','event:submit'],array['*'],'${resource}');`);
  const html='<!doctype html><html><title>Sill cloud app</title></html>';
  const runtime=createSillRuntime({...f.config,mcpEnabled:true},{clientFactory:f.factory,appHtml:html});
  client=new Client({name:'synthetic-app-test',version:'1.0.0'});
  await client.connect(new StreamableHTTPClientTransport(new URL(resource),{requestInit:{headers:{Authorization:'Bearer '+token({client_id:'codex-test',aud:resource})}},fetch:(url?: any,init?: any)=>runtime(new Request(url,init))}));
  const tools=(await client.listTools()).tools;
  assert.equal(tools.length,9);
  for(const tool of tools.slice(0,2)){assert.deepEqual(tool.icons.map((i?: any)=>i.theme),['light','dark']);assert.ok(tool.icons.every((i?: any)=>i.mimeType==='image/svg+xml'&&i.src.includes('/assets/sill-line')));}
  assert.deepEqual(tools[0]._meta['openai/ui'].entrypoints,[{type:'global'}]);
  assert.deepEqual(tools[1]._meta['openai/ui'].entrypoints,[{type:'thread'}]);
  const opened=await client.callTool({name:'sill_open_workspace',arguments:{}});
  assert.equal(opened.structuredContent.connected,true);
  assert.ok(!JSON.stringify(opened).includes('Bearer'));
  assert.equal((await client.readResource({uri:workspaceUri})).contents[0].text,html);
  await assert.rejects(client.readResource({uri:'ui://sill/other'}));
  await f.db.exec(`reset role;update sill_private.caller_grants set resources=array['11111111-1111-4111-8111-111111111112'] where caller_id='oauth:codex-test';`);
  assert.equal((await client.listResources()).resources.length,0);
  assert.equal((await client.callTool({name:'sill_open_workspace',arguments:{}})).isError,true);
  await assert.rejects(client.readResource({uri:workspaceUri}));
  await f.db.exec(`reset role;delete from sill_private.caller_grants where caller_id='oauth:codex-test';`);
  await assert.rejects(client.listTools());
 }finally{await client?.close();await f.close();}
});
