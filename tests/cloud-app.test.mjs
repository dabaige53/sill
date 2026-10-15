import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {createSillRuntime} from '../server/cloud/http.mjs';
import {workspaceUri} from '../server/cloud/mcp.mjs';
import {createCloudTransport} from '../web/cloud-bridge.js';
import {cloudFixture} from './helpers/cloud-fixture.mjs';
import {A,resource} from './helpers/boundary-fixture.mjs';
import {token} from './helpers/signed-auth.mjs';

test('cloud view preserves edit revision and idempotency when using host tools',async()=>{
 const calls=[],request=createCloudTransport(async args=>{calls.push(args);return {connected:true};});
 assert.equal((await request('/auth/session')).userId,'connected');
 await request('/api/v1/contents?cursor=snapshot');
 const body={expectedRevision:4,changes:{title:'Updated'}};
 await request('/api/v1/contents/card-1',{method:'PATCH',headers:{'Idempotency-Key':'request-key'},body:JSON.stringify(body)});
 assert.deepEqual(calls.at(-1),{name:'sill_updateContent',arguments:{id:'card-1',idempotency_key:'request-key',body}});
 assert.deepEqual(calls[1],{name:'sill_listContents',arguments:{cursor:'snapshot'}});
 await assert.rejects(request('/auth/login',{method:'POST'}));
});

test('sidebar and thread entries use scoped cloud resources and disappear on revocation',async()=>{
 const f=await cloudFixture();let client;
 try{
  await f.db.exec(`insert into sill_private.caller_grants values('${A}','oauth:codex-test',array['content:read','content:write','content:delete','event:read','event:submit'],array['*'],'${resource}');`);
  const html='<!doctype html><html><title>Sill cloud app</title></html>';
  const runtime=createSillRuntime({...f.config,mcpEnabled:true},{clientFactory:f.factory,appHtml:html});
  client=new Client({name:'synthetic-app-test',version:'1.0.0'});
  await client.connect(new StreamableHTTPClientTransport(new URL(resource),{requestInit:{headers:{Authorization:'Bearer '+token({client_id:'codex-test',aud:resource})}},fetch:(url,init)=>runtime(new Request(url,init))}));
  const tools=(await client.listTools()).tools;
  assert.equal(tools.length,9);
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
