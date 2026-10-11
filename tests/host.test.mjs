import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,rm,writeFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ConfigSchema,ROOT } from '../server/config.mjs';
import { Service } from '../server/service.mjs';
import { createMcpServer } from '../server/mcp.mjs';
import { startHttp } from '../server/http.mjs';
import { INITIAL_CARD_LIMIT,WORKSPACE_META_KEY,WORKSPACE_MIME_TYPE,WORKSPACE_URI } from '../server/host-app.mjs';

const originalTools=[
  'qg_list_jobs','qg_create_job','qg_update_job','qg_run_job','qg_get_job','qg_cancel_job_run',
  'qg_status','qg_read_settings','qg_update_settings','qg_create_note','qg_update_note',
  'qg_read_annotation','qg_update_annotation','qg_list_source_tools','qg_collect','qg_ingest',
  'qg_search','qg_get_card','qg_recommend','qg_feedback','qg_prepare_action','qg_get_action',
  'qg_commit_action','qg_create_workflow','qg_run_workflow','qg_get_workflow',
  'qg_list_requests','qg_answer_request','qg_audit','qg_create_conversation','qg_list_conversations','qg_read_conversation','qg_create_request','qg_get_request','qg_ai_status','qg_start_ai','qg_get_ai','qg_cancel_ai',
];
const token='host-test-never-return-this-credential';
const html='<!DOCTYPE html><html><head><meta charset="utf-8"><title>Host fixture</title></head><body>Quiet Glass</body></html>';
const defaultSettings={values:{sort:'priority',reduceTransparency:false},revision:0};
const expectedPolicy={ui:{csp:{connectDomains:[],resourceDomains:[],frameDomains:[],baseUriDomains:[]},permissions:{},prefersBorder:false}};

async function fixture(t,{bundle='fixture'}={}) {
  const directory=await mkdtemp(join(tmpdir(),'qg-host-'));
  const service=new Service(ConfigSchema.parse({dataDir:directory,connectors:[
    {id:'private-source',label:'Private connector',type:'notion',tokenEnv:'HOST_TEST_CREDENTIAL'},
  ]}),{env:{HOST_TEST_CREDENTIAL:token}});
  const hostAppPath=join(directory,'host-app.html');
  if(bundle==='fixture')await writeFile(hostAppPath,html);
  else if(bundle==='invalid')await writeFile(hostAppPath,'not an HTML bundle');
  const options=bundle==='default'?{}:{hostAppPath:bundle==='directory'?directory:hostAppPath};
  const server=createMcpServer(service,options);
  const client=new Client({name:'quiet-glass-host-protocol-test',version:'1'});
  const [clientTransport,serverTransport]=InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);await client.connect(clientTransport);
  t.after(async()=>{await client.close();await server.close();await service.close();await rm(directory,{recursive:true,force:true});});
  const call=(name,args={})=>client.callTool({name,arguments:args});
  return {service,client,call,directory,hostAppPath};
}

test('SDK discovery keeps all business tools and adds strict read-only global/thread workspace entrypoints',async t=>{
  const {client}=await fixture(t);
  const listed=await client.listTools();
  assert.deepEqual(listed.tools.map(tool=>tool.name).sort(),[...originalTools,'qg_open_workspace'].sort());
  const tool=listed.tools.find(tool=>tool.name==='qg_open_workspace');
  assert.equal(tool.title,'Quiet Glass');
  assert.equal(tool.inputSchema.type,'object');
  assert.deepEqual(tool.inputSchema.properties,{});
  assert.equal(tool.inputSchema.additionalProperties,false);
  assert.ok(!tool.inputSchema.required||tool.inputSchema.required.length===0);
  assert.deepEqual(tool.annotations,{readOnlyHint:true,destructiveHint:false,openWorldHint:false,idempotentHint:true});
  assert.deepEqual(tool._meta,{ui:{resourceUri:WORKSPACE_URI,visibility:['model','app']},'openai/ui':{entrypoints:[{type:'global'},{type:'thread'}]}});
  assert.equal(Object.hasOwn(tool._meta,'ui/resourceUri'),false,'do not use the deprecated metadata spelling');
  assert.equal(JSON.stringify(listed).includes(token),false);
});

test('workspace opening accepts only empty arguments, stays read-only and works for a text-only SDK client',async t=>{
  const {service,call}=await fixture(t);
  const before=service.store.history();
  const opened=await call('qg_open_workspace');
  assert.notEqual(opened.isError,true);
  assert.deepEqual(opened.structuredContent,{mode:'host',resourceUri:WORKSPACE_URI,cardCount:0,version:1});
  assert.deepEqual(JSON.parse(opened.content[0].text),opened.structuredContent);
  assert.deepEqual(opened._meta[WORKSPACE_META_KEY].settings,defaultSettings);
  assert.deepEqual(opened._meta[WORKSPACE_META_KEY].recommendations.items,[]);
  assert.equal(service.store.list('settings').length,0);
  assert.deepEqual(service.store.history(),before);
  for(const args of [{unexpected:true},{limit:1},{token},{url:'https://example.com/replacement.html'}]) {
    const rejected=await call('qg_open_workspace',args);
    assert.equal(rejected.isError,true,'additional arguments must not be silently stripped');
    assert.equal(rejected._meta,undefined);
  }
  const next=service.updateSettings({set:{sort:'unread',reduceTransparency:true},expectedRevision:0});
  const again=await call('qg_open_workspace');
  assert.deepEqual(again._meta[WORKSPACE_META_KEY].settings,next);
});

test('bootstrap is bounded and app-only, omits private annotations and configuration, and keeps detail reads intact',async t=>{
  const {service,call}=await fixture(t);
  const fullBody='PRIVATE_INITIAL_BODY:'+('x'.repeat(48000))+':PRIVATE_FULL_BODY_TAIL';
  const ids=service.ingest({sourceId:'private-source',items:Array.from({length:25},(_,index)=>({
    externalId:`item-${index}`,title:`PRIVATE_TITLE_${index}`,kind:'article',content:fullBody,
    summary:'PRIVATE_SUMMARY:'+('s'.repeat(1900)),tags:Array.from({length:30},(_,tag)=>`source-tag-${tag}`),
    url:index===0?'https://username:embedded-password@example.com/article':'https://example.com/article',
  }))}).cardIds;
  service.feedback(ids[0],{bookmarked:true,read:true});
  service.updateAnnotation({cardId:ids[0],set:{note:'PRIVATE_ANNOTATION_NOT_FOR_BOOTSTRAP',tags:['PRIVATE_PERSONAL_TAG']},expectedRevision:0});
  const original=service.store.get('card',ids[0]);
  service.store.put('card',ids[0],{...original,credentials:token,arbitraryMetadata:{token},approvalToken:token});
  const before=JSON.stringify({cards:service.store.list('card'),annotations:service.store.list('annotation'),settings:service.readSettings(),audit:service.store.history()});
  let externalCalls=0;
  service.connectors.collect=async()=>{externalCalls++;throw new Error('Opening a workspace must not collect');};
  service.connectors.tools=async()=>{externalCalls++;throw new Error('Opening a workspace must not discover');};
  service.connectors.status=()=>{externalCalls++;throw new Error('Opening a workspace must not return auth status');};
  const opened=await call('qg_open_workspace');
  assert.notEqual(opened.isError,true);
  assert.equal(opened.structuredContent.cardCount,INITIAL_CARD_LIMIT);
  const modelVisible=JSON.stringify({content:opened.content,structuredContent:opened.structuredContent});
  for(const privateValue of ['PRIVATE_TITLE_','PRIVATE_INITIAL_BODY','PRIVATE_SUMMARY','PRIVATE_ANNOTATION','PRIVATE_PERSONAL_TAG',token,'embedded-password'])assert.equal(modelVisible.includes(privateValue),false);
  const snapshot=opened._meta[WORKSPACE_META_KEY],encoded=JSON.stringify(snapshot);
  assert.equal(snapshot.version,1);assert.equal(snapshot.recommendations.items.length,20);
  assert.equal(encoded.includes('PRIVATE_INITIAL_BODY'),true,'bounded source excerpts are supplied to the app');
  for(const privateValue of ['PRIVATE_FULL_BODY_TAIL','PRIVATE_ANNOTATION_NOT_FOR_BOOTSTRAP','PRIVATE_PERSONAL_TAG',token,'embedded-password','HOST_TEST_CREDENTIAL'])assert.equal(encoded.includes(privateValue),false);
  for(const {card,reasons,evidence} of snapshot.recommendations.items) {
    assert.ok(card.content.length<=1200);assert.ok(card.summary.length<=500);assert.ok(card.title.length<=500);
    assert.equal(card.contentTruncated,true);assert.equal(card.summaryTruncated,true);
    assert.equal(card.annotation,undefined);assert.equal(card.credentials,undefined);assert.equal(card.arbitraryMetadata,undefined);
    assert.equal(card.contentHash,undefined);assert.equal(card.externalId,undefined);assert.equal(card.approvalToken,undefined);
    assert.ok(card.tags.length<=30);assert.ok(reasons.length<=8);
    assert.equal(evidence.cardId,card.id);assert.equal(evidence.sourceId,card.sourceId);
  }
  const bookmarked=snapshot.recommendations.items.find(item=>item.card.id===ids[0]);
  assert.ok(bookmarked,'read cards remain available in the initial workspace');
  assert.equal(bookmarked.card.url,undefined);assert.equal(bookmarked.evidence.url,undefined);
  assert.equal(externalCalls,0);
  assert.equal(JSON.stringify({cards:service.store.list('card'),annotations:service.store.list('annotation'),settings:service.readSettings(),audit:service.store.history()}),before);
  const detail=await call('qg_get_card',{cardId:ids[0]});
  assert.equal(detail.structuredContent.content,fullBody);
  assert.equal(detail.structuredContent.annotation.values.note,'PRIVATE_ANNOTATION_NOT_FOR_BOOTSTRAP');
});

test('SDK resource discovery and reads return only bundled HTML with the strict MCP App MIME and CSP',async t=>{
  const {service,client}=await fixture(t,{bundle:'default'});
  service.createNote({title:'PRIVATE_NEVER_IN_HTML',content:'PRIVATE_BODY_NEVER_IN_HTML',idempotencyKey:'html-is-static'});
  const listing=await client.listResources();
  assert.ok(listing.resources.some(resource=>resource.uri==='quiet-glass://feed'),'preserve existing JSON feed resource');
  const resource=listing.resources.find(resource=>resource.uri===WORKSPACE_URI);
  assert.ok(resource);assert.equal(resource.mimeType,WORKSPACE_MIME_TYPE);assert.deepEqual(resource._meta,expectedPolicy);
  const read=await client.readResource({uri:WORKSPACE_URI});
  assert.equal(read.contents.length,1);
  const content=read.contents[0];
  assert.equal(content.uri,WORKSPACE_URI);assert.equal(content.mimeType,'text/html;profile=mcp-app');
  assert.deepEqual(content._meta,expectedPolicy);
  assert.equal(content.text,await readFile(resolve(ROOT,'dist/host-app.html'),'utf8'));
  assert.match(content.text,/<!doctype html/i);
  for(const privateValue of ['PRIVATE_NEVER_IN_HTML','PRIVATE_BODY_NEVER_IN_HTML',token,'HOST_TEST_CREDENTIAL'])assert.equal(content.text.includes(privateValue),false);
});

test('authenticated HTTP MCP carries workspace metadata and HTML without exposing the transport credential',async t=>{
  const {service}=await fixture(t);
  const bearer='http-host-secret-012345678901234567890';
  const http=await startHttp(service,{port:0,token:bearer}),origin=`http://127.0.0.1:${http.address().port}`;
  const client=new Client({name:'quiet-glass-host-http-test',version:'1'});
  t.after(async()=>{await client.close();http.closeAllConnections();await new Promise(resolve=>http.close(resolve));});
  assert.equal((await fetch(origin+'/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{requestInit:{headers:{Authorization:`Bearer ${bearer}`}}}));
  const opened=await client.callTool({name:'qg_open_workspace',arguments:{}});
  assert.notEqual(opened.isError,true);assert.deepEqual(opened._meta[WORKSPACE_META_KEY].settings,defaultSettings);
  const resource=await client.readResource({uri:WORKSPACE_URI});
  assert.equal(resource.contents[0].mimeType,WORKSPACE_MIME_TYPE);assert.deepEqual(resource.contents[0]._meta,expectedPolicy);
  for(const credential of [bearer,token])assert.equal(JSON.stringify({opened,resource}).includes(credential),false);
});

test('missing, unreadable or invalid bundles fail explicitly without replacing the UI or disabling existing tools',async t=>{
  for(const bundle of ['missing','directory','invalid'])await t.test(bundle,async t=>{
    const {client,call,hostAppPath,directory}=await fixture(t,{bundle});
    const opened=await call('qg_open_workspace');
    assert.equal(opened.isError,true);assert.equal(opened.structuredContent.code,'HOST_APP_UNAVAILABLE');
    assert.match(opened.structuredContent.message,/build/i);assert.equal(opened._meta,undefined);
    assert.equal(JSON.stringify(opened).includes(directory),false,'error must not leak filesystem paths');
    await assert.rejects(()=>client.readResource({uri:WORKSPACE_URI}),error=>error.code===-32603&&/HOST_APP_UNAVAILABLE/.test(error.message)&&!error.message.includes(directory));
    assert.deepEqual((await call('qg_read_settings')).structuredContent,defaultSettings,'legacy tools still work without the UI build');
    if(bundle==='missing') {
      await writeFile(hostAppPath,html);
      assert.notEqual((await call('qg_open_workspace')).isError,true,'a later local build recovers without server restart');
      assert.equal((await client.readResource({uri:WORKSPACE_URI})).contents[0].text,html);
    }
  });
});
