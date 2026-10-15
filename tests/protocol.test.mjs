import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,writeFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ConfigSchema,ROOT } from '../server/config.mjs';
import { Service } from '../server/service.mjs';
import { startHttp } from '../server/http.mjs';
import { Collect } from '../server/schemas.mjs';

const token='test-only-access-key-012345678901234567890';
async function fixture(t,connectors=[]) {
  const dir=await mkdtemp(join(tmpdir(),'qg-protocol-'));
  const service=new Service(ConfigSchema.parse({dataDir:dir,connectors}));
  const http=await startHttp(service,{port:0,token});
  const origin=`http://127.0.0.1:${http.address().port}`;
  t.after(async()=>{http.closeAllConnections();await new Promise(r=>http.close(r));await service.close();await rm(dir,{recursive:true,force:true});});
  return {service,http,origin,dir};
}
const call=async(client,name,args={})=>{
  const result=await client.callTool({name,arguments:args});
  assert.notEqual(result.isError,true,JSON.stringify(result));return result.structuredContent;
};

test('official SDK performs HTTP initialization, tools, content, resources, prompts and workflow',async t=>{
  const f=await fixture(t),client=new Client({name:'test',version:'1.0.0'});
  await client.connect(new StreamableHTTPClientTransport(new URL(f.origin+'/mcp'),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
  t.after(()=>client.close());
  const tools=await client.listTools();assert.ok(tools.tools.length>=15);
  const tool=tools.tools.find(t=>t.name==='qg_collect');assert.equal(tool.inputSchema.type,'object');assert.ok(tool.inputSchema.properties.connectorId);
  const ingested=await call(client,'qg_ingest',{sourceId:'test',items:[{externalId:'1',title:'Protocol test',content:'MCP end-to-end'}]});
  const card=await call(client,'qg_get_card',{cardId:ingested.cardIds[0]});assert.equal(card.content,'MCP end-to-end');
  const found=await call(client,'qg_search',{query:'MCP'});assert.equal(found.total,1);
  const ranked=await call(client,'qg_recommend',{});assert.equal(ranked.items[0].evidence.cardId,card.id);
  const resources=await client.listResources();assert.ok(resources.resources.some(r=>r.uri==='sill://feed'));
  assert.ok((await client.readResource({uri:'sill://feed'})).contents[0].text.includes(card.id));
  assert.ok((await client.getPrompt({name:'sill-briefing',arguments:{goal:'daily briefing'}})).messages[0].content.text.includes('daily briefing'));
  const workflow=await call(client,'qg_create_workflow',{goal:'search and recommend',steps:[{id:'search',operation:'search',input:{query:'MCP'}},{id:'recommend',operation:'recommend',dependsOn:['search'],input:{}}]});
  await call(client,'qg_run_workflow',{workflowId:workflow.id});await f.service.running.get(workflow.id);
  assert.equal((await call(client,'qg_get_workflow',{workflowId:workflow.id})).status,'completed');
  const bad=await client.callTool({name:'qg_collect',arguments:{connectorId:'unconfigured'}});assert.equal(bad.isError,true);
});

test('HTTP protects private routes, origins, static paths and browser session; request queue round trip',async t=>{
  const f=await fixture(t);
  assert.equal((await fetch(f.origin+'/api/feed')).status,401);
  assert.equal((await fetch(f.origin+'/mcp',{method:'POST',headers:{Authorization:`Bearer ${token}`,Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'})).status,403);
  assert.equal((await fetch(f.origin+'/.env')).status,404);
  assert.equal((await fetch(f.origin+'/server/config.mjs')).status,404);
  const page=await (await fetch(f.origin)).text();assert.ok(page.includes('window.__QG_RUNTIME__=true'));assert.ok(!page.includes(token));
  const login=await fetch(f.origin+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
  assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly/);
  const card=f.service.ingest({sourceId:'test',items:[{externalId:'1',title:'Hello'}]}).items[0];
  const pending=await fetch(f.origin+'/api/requests',{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify({question:'Summarize',cardIds:[card.id]})});
  assert.equal(pending.status,201);const request=await pending.json();assert.equal(request.status,'pending');
  const client=new Client({name:'test-answer',version:'1'});await client.connect(new StreamableHTTPClientTransport(new URL(f.origin+'/mcp'),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));t.after(()=>client.close());
  assert.equal((await call(client,'qg_list_requests')).requests[0].id,request.id);
  await call(client,'qg_answer_request',{requestId:request.id,answer:'Evidence-based response',evidenceIds:[card.id]});
  const answer=await (await fetch(f.origin+'/api/requests/'+request.id,{headers:{Cookie:cookie}})).json();assert.equal(answer.answer,'Evidence-based response');
});

test('Sill consumes another MCP server with discovery, field mapping and continuation',async t=>{
  const upstream=await fixture(t);
  upstream.service.ingest({sourceId:'notes',items:[{externalId:'1',title:'第一篇',content:'hello'},{externalId:'2',title:'第二篇',content:'world'}]});
  const downstream=await fixture(t,[{id:'upstream',label:'MCP source',type:'mcp',url:upstream.origin+'/mcp',tokenEnv:'TEST_MCP_TOKEN',readTools:['qg_search','qg_prepare_action'],collect:{tool:'qg_search',arguments:{limit:1},itemsPath:'items',fields:{id:'id',title:'title',content:'content'},cursorArgument:'offset',cursorPath:'nextOffset'}}]);
  downstream.service.connectors.env={TEST_MCP_TOKEN:token};
  const discovery=await downstream.service.connectors.tools('upstream');assert.equal(discovery.tools.length,2);
  const first=await downstream.service.collect({connectorId:'upstream'});assert.equal(first.count,1);assert.equal(first.partial,true);
  const second=await downstream.service.collect({connectorId:'upstream',cursor:first.nextCursor});assert.equal(second.count,1);assert.equal(downstream.service.search({}).total,2);
  await assert.rejects(()=>downstream.service.connectors.call(downstream.service.connectors.get('upstream'),'qg_prepare_action',{},true),/副作用/);
  await assert.rejects(()=>downstream.service.connectors.call(downstream.service.connectors.get('upstream'),'qg_commit_action',{},false),/允许列表/);
});

test('legacy service remains readable through SDK stdio without generating a plugin',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'qg-stdio-'));
  const config=join(directory,'config.json');await writeFile(config,JSON.stringify({dataDir:directory}));
  const client=new Client({name:'test-stdio',version:'1'});
  const transport=new StdioClientTransport({command:process.execPath,args:[resolve(ROOT,'server/index.mjs'),'--stdio'],env:{...process.env,QG_CONFIG:config},stderr:'pipe'});
  await client.connect(transport);t.after(async()=>{await client.close();await rm(directory,{recursive:true,force:true});});
  const status=await call(client,'qg_status');assert.equal(status.version,'0.2.0');
  assert.equal((await client.listTools()).tools.some(t=>t.name==='qg_create_workflow'),true);
});
