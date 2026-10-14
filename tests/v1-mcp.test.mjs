import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {startLocal} from '../server/local.mjs';

const token='synthetic-test-only-owner-token-0001',agentToken='synthetic-test-only-agent-token-0002';
const scopes=['content:read','content:write','content:delete','event:submit','event:read','event:result'];
const principals=[{id:'owner',owner:'local',token,scopes,cards:'*'},{id:'agent',owner:'local',token:agentToken,scopes:['content:read','content:write','event:read','event:result'],cards:[]}];
async function setup(){
 const dir=await mkdtemp(join(tmpdir(),'sill-mcp-')),file=join(dir,'cards.json');
 const config={port:0,file,principals:structuredClone(principals),destinations:{manual:{mode:'manual',submitters:['owner'],assignee:'owner',actions:['summarize','complete']}}};
 let server=await startLocal(config);const clients=[];
 const origin=()=>`http://127.0.0.1:${server.address().port}`;
 const client=async(key=token)=>{const c=new Client({name:'sill-test',version:'1.0.0'});await c.connect(new StdioClientTransport({command:process.execPath,args:['server/local-mcp.mjs'],cwd:join(import.meta.dirname,'..'),env:{QG_LOCAL_PORT:String(server.address().port),SILL_MCP_TOKEN:key},stderr:'pipe'}));clients.push(c);return c;};
 const post=async(path,body,key=token,method='POST',headers={})=>fetch(origin()+path,{method,headers:{'Content-Type':'application/json',Authorization:'Bearer '+key,...headers},body:JSON.stringify(body)});
 return {config,file,client,post,origin,async restart(){for(const c of clients)await c.close();await new Promise(r=>server.close(r));server=await startLocal(config);},async close(){for(const c of clients)await c.close();await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}};
}
const call=async(c,name,args)=>{const r=await c.callTool({name,arguments:args});if(r.isError)throw new Error(JSON.stringify(r));return r.structuredContent;};
const bad=async(c,name,args,code)=>{const r=await c.callTool({name,arguments:args});assert.equal(r.isError,true,JSON.stringify(r));assert.equal(r.structuredContent.error.code,code);};

test('SDK stdio initializes, discovers seven tools, validates every tool and persists CRUD/receipts',async()=>{
 const x=await setup();try{
 let c=await x.client();assert.equal(c.getServerVersion().name,'sill-local');
 const tools=(await c.listTools()).tools;assert.equal(tools.length,7);
 for(const t of tools)await bad(c,t.name,{unexpected:true},'invalid_request');
 await bad(c,'missing_tool',{},'not_found');
 const create={idempotency_key:'create_0001',body:{title:'合成笔记',type:'note',body:['初稿']}};
 const a=await call(c,'sill_createContent',create);assert.equal(a.revision,1);
 assert.deepEqual(await call(c,'sill_createContent',create),a);
 await bad(c,'sill_createContent',{...create,body:{...create.body,title:'different'}},'idempotency_conflict');
 assert.deepEqual(await call(c,'sill_getContent',{id:a.id}),a);
 const page=await call(c,'sill_listContents',{});assert.equal(page.items.length,1);
 const update={id:a.id,idempotency_key:'update_0001',body:{expectedRevision:1,changes:{body:['MCP 最新'],state:{read:true,archived:true}}}};
 const b=await call(c,'sill_updateContent',update);assert.equal(b.revision,2);assert.equal(b.state.archived,true);
 assert.deepEqual(await call(c,'sill_updateContent',update),b);
 await bad(c,'sill_updateContent',{...update,idempotency_key:'update_0002'},'revision_conflict');
 await bad(c,'sill_updateContent',{id:a.id,idempotency_key:'no_revision',body:{changes:{title:'stale'}}},'invalid_request');
 const local=await fetch(x.origin()+'/api/local/state').then(r=>r.json());
 const stale=structuredClone(local.state.cards[0]);
 await call(c,'sill_updateContent',{id:a.id,idempotency_key:'update_0003',body:{expectedRevision:2,changes:{title:'Agent title'}}});
 const response=await x.post('/api/local/operations',{operations:[{op:'card.upsert',card:{...stale,title:'Browser draft'},before:stale}]});assert.equal(response.status,409);
 const blind=await x.post('/api/local/operations',{operations:[{op:'card.upsert',card:stale}]});assert.equal(blind.status,409);
 const live=await call(c,'sill_getContent',{id:a.id});assert.equal(live.title,'Agent title');
 const deletion={id:a.id,idempotency_key:'delete_0001',body:{expectedRevision:live.revision}};
 const tomb=await call(c,'sill_deleteContent',deletion);assert.equal(tomb.deleted,true);assert.deepEqual(tomb.body,[]);
 await bad(c,'sill_getContent',{id:a.id},'not_found');assert.deepEqual(await call(c,'sill_deleteContent',deletion),tomb);
 const delta=await call(c,'sill_listContents',{since:page.sync_cursor});assert.equal(delta.items[0].deleted,true);
 await x.restart();c=await x.client();assert.deepEqual(await call(c,'sill_deleteContent',deletion),tomb);
 await bad(c,'sill_listContents',{since:page.sync_cursor},'cursor_expired');
 }finally{await x.close();}
});

test('scope/resource restrictions, unknown credentials, disabled delivery and safe schema failures',async()=>{
 const x=await setup();try{
 const c=await x.client(),restricted=await x.client(agentToken);
 assert.deepEqual((await restricted.listTools()).tools.map(t=>t.name),['sill_listContents','sill_getContent','sill_createContent','sill_updateContent','sill_getEvent']);
 const a=await call(c,'sill_createContent',{idempotency_key:'scope_create',body:{title:'Private',type:'note'}});
 await bad(restricted,'sill_getContent',{id:a.id},'not_found');
 await bad(restricted,'sill_deleteContent',{id:a.id,idempotency_key:'denied_key',body:{expectedRevision:1}},'forbidden');
 await bad(restricted,'sill_createContent',{idempotency_key:'denied_key',body:{title:'no',type:'note'}},'forbidden');
 assert.equal((await call(restricted,'sill_listContents',{})).items.length,0);
 assert.equal((await x.post('/api/v1/tools/sill_listContents',{},'wrong')).status,401);
 await bad(c,'sill_createContent',{idempotency_key:'unsafe_url',body:{title:'Unsafe',type:'note',url:'javascript:alert(1)'}},'invalid_request');
 await bad(c,'sill_createContent',{idempotency_key:'task_no_fields',body:{title:'Task',type:'task'}},'not_supported');
 await bad(c,'sill_submitEvent',{idempotency_key:'event_disabled',body:{event_id:'disabled',card_id:a.id,card_version:1,action:'summarize',destination_ref:'unconfigured'}},'not_supported');
 const r=await x.post('/api/v1/contents',{title:'HTTP',type:'note'},token,'POST',{'Idempotency-Key':'http_create'});assert.equal(r.status,201);
 const h=await r.json();assert.deepEqual(await call(c,'sill_getContent',{id:h.id}),h);
 }finally{await x.close();}
});

test('manual event is pending until assigned result; replay cannot repeat side effects or loop',async()=>{
 const x=await setup();try{
 const c=await x.client(),other=await x.client(agentToken);
 const a=await call(c,'sill_createContent',{idempotency_key:'event_card',body:{title:'Event',type:'note',body:['before']}});
 const submit={idempotency_key:'event_submit',body:{event_id:'event_001',card_id:a.id,card_version:1,action:'summarize',destination_ref:'manual'}};
 const e=await call(c,'sill_submitEvent',submit);assert.equal(e.delivery,'queued');assert.equal(e.outcome,'pending');
 assert.deepEqual(await call(c,'sill_submitEvent',{...submit,idempotency_key:'event_retry'}),e);
 await bad(other,'sill_getEvent',{id:e.event_id},'not_found');
 const result={id:a.id,idempotency_key:'event_result',body:{expectedRevision:1,changes:{body:['result']},metadata:{event_id:e.event_id,outcome:'succeeded',summary:'Local synthetic result'}}};
 const updated=await call(c,'sill_updateContent',result);assert.equal(updated.revision,2);
 assert.deepEqual(await call(c,'sill_updateContent',result),updated);
 const final=await call(c,'sill_getEvent',{id:e.event_id});assert.equal(final.outcome,'succeeded');assert.equal(final.result_revision,2);
 await bad(c,'sill_updateContent',{...result,idempotency_key:'late_result',body:{...result.body,expectedRevision:2,metadata:{...result.body.metadata,outcome:'failed'}}},'revision_conflict');
 const after=await fetch(x.origin()+'/api/local/state').then(r=>r.json());assert.equal(after.state.cards.length,1);
 await x.restart();const cc=await x.client();assert.deepEqual(await call(cc,'sill_updateContent',result),updated);assert.deepEqual(await call(cc,'sill_getEvent',{id:e.event_id}),final);
 }finally{await x.close();}
});

test('pagination snapshot and delta do not lose concurrent modifications; file has one server writer',async()=>{
 const x=await setup();try{
 await assert.rejects(startLocal({...x.config,port:0}),/locked/);
 const c=await x.client();let cards=[];
 for(let i=0;i<3;i++)cards.push(await call(c,'sill_createContent',{idempotency_key:'pagination_'+i,body:{title:'item '+i,type:'note'}}));
 const page=await call(c,'sill_listContents',{limit:1});
 await call(c,'sill_updateContent',{id:cards[0].id,idempotency_key:'page_update',body:{expectedRevision:1,changes:{title:'changed during pages'}}});
 const rest=await call(c,'sill_listContents',{cursor:page.next_cursor,limit:100});assert.equal(rest.items.length,2);
 assert.ok([...page.items,...rest.items].every(c=>c.revision===1));
 const delta=await call(c,'sill_listContents',{since:rest.sync_cursor});assert.equal(delta.items.length,1);assert.equal(delta.items[0].revision,2);
 await bad(c,'sill_listContents',{cursor:page.next_cursor,since:rest.sync_cursor},'invalid_request');
 }finally{await x.close();}
});

test('real browser preserves inline edit origin across polling and rejects concurrent MCP overwrite',async()=>{
 const {chromium}=await import('playwright');const x=await setup();let browser;
 try{
  const c=await x.client();
  const a=await call(c,'sill_createContent',{idempotency_key:'browser_create',body:{title:'合成原稿',type:'note',body:['原稿正文']}});
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.goto(x.origin());await page.waitForFunction(()=>document.querySelector('#feed-grid')?.dataset.sync==='saved');
  // The note is a local card; explicitly enter the actual inline editor through the UI controller.
  await page.evaluate(id=>__app.startInlineEdit(id),a.id);await page.locator('#inline-body').waitFor();
  await page.waitForFunction(()=>document.querySelector('#feed-grid').dataset.sync==='saved');
  const before=await call(c,'sill_getContent',{id:a.id});
  await call(c,'sill_updateContent',{id:a.id,idempotency_key:'browser_agent',body:{expectedRevision:before.revision,changes:{body:['MCP 新正文，必须保留']}}});
  await page.waitForTimeout(1250); // Cross the actual 1s polling interval while editor is open.
  assert.equal(await page.locator('#inline-body').inputValue(),'原稿正文');
  await page.locator('#inline-title').fill('网页未同步草稿');
  await page.waitForFunction(()=>document.querySelector('#feed-grid').dataset.sync==='error');
  assert.deepEqual((await call(c,'sill_getContent',{id:a.id})).body,['MCP 新正文，必须保留']);
  assert.ok((await page.evaluate(()=>localStorage.getItem('quiet-glass-unsynced'))).includes('网页未同步草稿'));
  assert.equal(await page.locator('#inline-title').inputValue(),'网页未同步草稿');
  await page.reload();await page.waitForFunction(()=>document.querySelector('#feed-grid')?.dataset.sync==='error');
  assert.ok(await page.locator('[data-action=sync-export]').isVisible());
  // Retrying cannot relabel the draft with the current revision and overwrite MCP.
  await page.locator('[data-action=sync-retry]').click();
  await page.waitForFunction(()=>!__app.refreshBusy&&document.querySelector('#feed-grid').dataset.sync==='error');
  assert.deepEqual((await call(c,'sill_getContent',{id:a.id})).body,['MCP 新正文，必须保留']);
 }finally{await browser?.close();await x.close();}
});

test('reverse race: browser commits first, stale MCP update conflicts without mutating browser content',async()=>{
 const {chromium}=await import('playwright');const x=await setup();let browser;
 try{
  const c=await x.client();const a=await call(c,'sill_createContent',{idempotency_key:'reverse_create',body:{title:'原稿',type:'note',body:['原稿']}});
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  const page=await browser.newPage();await page.goto(x.origin());await page.waitForFunction(()=>document.querySelector('#feed-grid')?.dataset.sync==='saved');
  await page.evaluate(id=>__app.startInlineEdit(id),a.id);await page.waitForFunction(()=>document.querySelector('#feed-grid').dataset.sync==='saved');
  const old=await call(c,'sill_getContent',{id:a.id});await page.locator('#inline-body').fill('网页新正文');
  await page.waitForFunction(()=>document.querySelector('#inline-state')?.textContent==='已同步到本地服务');
  await bad(c,'sill_updateContent',{id:a.id,idempotency_key:'reverse_stale',body:{expectedRevision:old.revision,changes:{body:['旧 MCP 草稿']}}},'revision_conflict');
  assert.deepEqual((await call(c,'sill_getContent',{id:a.id})).body,['网页新正文']);
 }finally{await browser?.close();await x.close();}
});

test('lost browser response reuses exact version and idempotency key after recovery',async()=>{
 const {chromium}=await import('playwright');const x=await setup();let browser;
 try{
  const c=await x.client();await call(c,'sill_createContent',{idempotency_key:'lost_seed',body:{title:'Seed',type:'note'}});
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  const page=await browser.newPage();await page.goto(x.origin());await page.waitForFunction(()=>document.querySelector('#feed-grid')?.dataset.sync==='saved');
  let first;
  await page.route('**/api/local/operations',async route=>{first=route.request().postDataJSON();await route.fetch();await route.abort('failed');});
  await page.evaluate(()=>__app.capture('合成响应丢失笔记'));
  await page.waitForFunction(()=>document.querySelector('#feed-grid').dataset.sync==='error');
  assert.ok(first.idempotencyKey);assert.ok(first.operations.some(op=>op.op==='card.upsert'&&op.before===null));
  await page.unroute('**/api/local/operations');let replay;
  await page.route('**/api/local/operations',async route=>{replay=route.request().postDataJSON();await route.continue();});
  await page.locator('[data-action=sync-retry]').click();await page.waitForFunction(()=>document.querySelector('#feed-grid').dataset.sync==='saved');
  assert.deepEqual(replay,first);
  const records=await call(c,'sill_listContents',{});assert.equal(records.items.filter(c=>c.title==='合成响应丢失笔记').length,1);
 }finally{await browser?.close();await x.close();}
});

test('V1 CLI shares credentials and writes; unknown identities and all unauthorized tools fail closed',async()=>{
 const {promisify}=await import('node:util');const {execFile}=await import('node:child_process');const {writeFile}=await import('node:fs/promises');
 const run=promisify(execFile),x=await setup();try{
  const port=new URL(x.origin()).port,env={...process.env,QG_LOCAL_PORT:port,SILL_MCP_TOKEN:token};
  const path=join(x.file,'..','request.json');await writeFile(path,JSON.stringify({idempotency_key:'cli_create_1',body:{title:'CLI synthetic',type:'note'}}));
  const result=JSON.parse((await run(process.execPath,['scripts/qg.mjs','v1','sill_createContent','--file',path],{env})).stdout);
  const c=await x.client();assert.equal((await call(c,'sill_getContent',{id:result.id})).title,'CLI synthetic');
  await run(process.execPath,['scripts/smoke-v1-health.mjs',x.origin(),'--v1']);
  const unknown=await x.client('synthetic-unregistered-token-999');
  await bad(unknown,'sill_listContents',{},'unauthenticated');await assert.rejects(unknown.listTools());
  const restricted=await x.client(agentToken);x.config.principals[1].scopes=[];
  assert.equal((await restricted.listTools()).tools.length,0);
  for(const t of (await c.listTools()).tools)await bad(restricted,t.name,{},'forbidden');
 }finally{await x.close();}
});

test('metadata-only failed event preserves revision; assigned identity and legacy fields are enforced',async()=>{
 const x=await setup();try{
  const c=await x.client();const seed={id:'fixture_task',type:'task',title:'Tasks',tasks:[{id:'step_1',text:'keep this',done:false}],related:['other'],body:['original']};
  assert.equal((await x.post('/api/local/operations',{operations:[{op:'card.upsert',card:seed}]})).status,200);
  const a=await call(c,'sill_getContent',{id:seed.id});
  const b=await call(c,'sill_updateContent',{id:a.id,idempotency_key:'task_update',body:{expectedRevision:a.revision,changes:{title:'new title'}}});
  let local=await fetch(x.origin()+'/api/local/state').then(r=>r.json());assert.deepEqual(local.state.cards[0].tasks,seed.tasks);assert.deepEqual(local.state.cards[0].related,seed.related);
  await call(c,'sill_submitEvent',{idempotency_key:'failed_submit',body:{event_id:'failed_event',card_id:a.id,card_version:b.revision,action:'complete',destination_ref:'manual'}});
  x.config.principals[1].cards=[a.id];const other=await x.client(agentToken);
  await bad(other,'sill_getEvent',{id:'failed_event'},'not_found');
  await bad(other,'sill_updateContent',{id:a.id,idempotency_key:'wrong_assignee',body:{expectedRevision:b.revision,metadata:{event_id:'failed_event',outcome:'succeeded',summary:'not mine'}}},'not_found');
  const result=await call(c,'sill_updateContent',{id:a.id,idempotency_key:'failed_result',body:{expectedRevision:b.revision,metadata:{event_id:'failed_event',outcome:'failed',summary:'Synthetic failure, no external action'}}});
  assert.equal(result.revision,b.revision);assert.equal(result.state.done,false);
  const event=await call(c,'sill_getEvent',{id:'failed_event'});assert.equal(event.outcome,'failed');assert.equal(event.result_revision,b.revision);
  await bad(c,'sill_getContent',{id:'__proto__'},'invalid_request');
 }finally{await x.close();}
});

test('a late polling response cannot roll browser state back after a newer write',async()=>{
 const {chromium}=await import('playwright');const x=await setup();let browser,release;
 try{
  const c=await x.client();await call(c,'sill_createContent',{idempotency_key:'poll_seed',body:{title:'Seed',type:'note'}});
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  const page=await browser.newPage();await page.goto(x.origin());await page.waitForFunction(()=>document.querySelector('#feed-grid')?.dataset.sync==='saved');
  let arrived;const gate=new Promise(r=>release=r),ready=new Promise(r=>arrived=r);let held=false;
  await page.route('**/api/local/state',async route=>{if(held)return route.continue();held=true;const response=await route.fetch();arrived();await gate;await route.fulfill({response});});
  await ready;await page.evaluate(()=>__app.capture('合成晚到轮询测试'));
  await page.waitForFunction(()=>document.querySelector('#feed-grid').dataset.sync==='saved');
  release();await page.waitForTimeout(250);
  assert.ok(await page.evaluate(()=>__store.state.cards.some(c=>c.title==='合成晚到轮询测试')),'older GET must not replace the newer acknowledged state');
 }finally{release?.();await browser?.close();await x.close();}
});

test('legacy delete requires a revision covering concurrent item state, not only card before',async()=>{
 const x=await setup();try{
  const c=await x.client(),a=await call(c,'sill_createContent',{idempotency_key:'delete_before',body:{title:'Delete guard',type:'note'}});
  const old=await fetch(x.origin()+'/api/local/state').then(r=>r.json());
  const update=await x.post('/api/local/operations',{expectedRevision:old.revision,operations:[{op:'item.patch',id:a.id,values:{note:'Concurrent draft'}}]});assert.equal(update.status,200);
  const deletion=await x.post('/api/local/operations',{operations:[{op:'card.delete',id:a.id,before:old.state.cards[0]}]});assert.equal(deletion.status,409);
  const stale=await x.post('/api/local/operations',{expectedRevision:old.revision,operations:[{op:'card.delete',id:a.id}]});assert.equal(stale.status,409);
  const saved=await fetch(x.origin()+'/api/local/state').then(r=>r.json());assert.equal(saved.state.items[a.id].note,'Concurrent draft');
 }finally{await x.close();}
});

test('invalid startup port does not leave a lock; occupied port failure releases the new file lock',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'sill-lock-test-')),file=join(dir,'cards.json');let first,second;
 try{
  await assert.rejects(startLocal({file,port:-1}),/Invalid local port/);
  first=await startLocal({file,port:0});const otherFile=join(dir,'other.json');
  await assert.rejects(startLocal({file:otherFile,port:first.address().port}),/EADDRINUSE/);
  second=await startLocal({file:otherFile,port:0});
 }finally{if(first)await new Promise(r=>first.close(r));if(second)await new Promise(r=>second.close(r));await rm(dir,{recursive:true,force:true});}
});

test('type transition uses new completion mapping; repeated terminal result still reserves its key',async()=>{
 const x=await setup();try{
  const c=await x.client(),a=await call(c,'sill_createContent',{idempotency_key:'type_create',body:{title:'Type test',type:'note'}});
  const b=await call(c,'sill_updateContent',{id:a.id,idempotency_key:'type_update',body:{expectedRevision:a.revision,changes:{type:'reminder',state:{done:true}}}});assert.equal(b.state.done,true);
  await call(c,'sill_submitEvent',{idempotency_key:'terminal_submit',body:{event_id:'terminal_event',card_id:a.id,card_version:b.revision,action:'complete',destination_ref:'manual'}});
  const args={id:a.id,idempotency_key:'terminal_first',body:{expectedRevision:b.revision,metadata:{event_id:'terminal_event',outcome:'failed',summary:'Synthetic'}}};
  await call(c,'sill_updateContent',args);
  const repeated={...args,idempotency_key:'terminal_repeat'};await call(c,'sill_updateContent',repeated);
  await bad(c,'sill_updateContent',{...repeated,body:{expectedRevision:b.revision,changes:{title:'must not reuse key'}}},'idempotency_conflict');
 }finally{await x.close();}
});

test('cross-process writer lock survives abnormal exit until explicit verified cleanup',async()=>{
 const {spawn}=await import('node:child_process');const {once}=await import('node:events');const {existsSync}=await import('node:fs');
 const dir=await mkdtemp(join(tmpdir(),'sill-process-lock-')),file=join(dir,'cards.json');let child,server;
 try{
  child=spawn(process.execPath,['--input-type=module','-e',"import {startLocal} from './server/local.mjs';const s=await startLocal({port:0,file:process.argv[1]});console.log(s.address().port);",file],{cwd:join(import.meta.dirname,'..'),stdio:['ignore','pipe','pipe']});
  const [output]=await once(child.stdout,'data');const port=Number(output.toString().trim());assert.ok(port>0);
  const saved=await fetch(`http://127.0.0.1:${port}/api/local/operations`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operations:[{op:'card.upsert',card:{id:'process_fixture',title:'Synthetic process fixture',type:'note'}}]})});assert.equal(saved.status,200);
  await assert.rejects(startLocal({port:0,file}),/locked/);
  const exited=once(child,'exit');child.kill('SIGKILL');await exited;
  assert.equal(existsSync(file+'.lock'),true);await assert.rejects(startLocal({port:0,file}),/locked/);
  // The test owns this isolated path and has observed the sole child exit.
  await rm(file+'.lock');server=await startLocal({port:0,file});
  const state=await fetch(`http://127.0.0.1:${server.address().port}/api/local/state`).then(r=>r.json());assert.equal(state.state.cards[0].id,'process_fixture');
 }finally{if(child&&child.exitCode===null&&child.signalCode===null){const done=once(child,'exit');child.kill('SIGKILL');await done;}if(server)await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});

test('discard confirmation cannot erase new edits made while its server read is pending',async()=>{
 const {chromium}=await import('playwright');const x=await setup();let browser,release;
 try{
  const c=await x.client();await call(c,'sill_createContent',{idempotency_key:'discard_seed',body:{title:'Seed',type:'note'}});
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  const page=await browser.newPage();await page.goto(x.origin());await page.waitForFunction(()=>document.querySelector('#feed-grid')?.dataset.sync==='saved');
  await page.route('**/api/local/operations',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"synthetic offline"}'}));
  await page.evaluate(()=>__app.capture('合成放弃前草稿'));await page.waitForFunction(()=>document.querySelector('#feed-grid').dataset.sync==='error');
  await page.locator('[data-action=sync-discard]').click();
  let arrived;const gate=new Promise(r=>release=r),ready=new Promise(r=>arrived=r);
  await page.route('**/api/local/state',async route=>{const response=await route.fetch();arrived();await gate;await route.fulfill({response});});
  await page.locator('[data-action=sync-discard-confirm]').click();await ready;
  await page.evaluate(()=>__app.capture('读取期间新增草稿'));release();await page.waitForTimeout(200);
  assert.ok((await page.evaluate(()=>localStorage.getItem('quiet-glass-unsynced'))).includes('读取期间新增草稿'));
  assert.ok(await page.evaluate(()=>__store.state.cards.some(c=>c.title==='读取期间新增草稿')));
 }finally{release?.();await browser?.close();await x.close();}
});

test('unrelated MCP update does not stall an in-flight browser bookmark write',async()=>{
 const {chromium}=await import('playwright');const x=await setup();let browser,release;
 try{
  const c=await x.client(),a=await call(c,'sill_createContent',{idempotency_key:'parallel_ui',body:{title:'UI card',type:'note'}}),b=await call(c,'sill_createContent',{idempotency_key:'parallel_agent',body:{title:'Agent card',type:'note'}});
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
  const page=await browser.newPage();await page.goto(x.origin());await page.waitForFunction(()=>document.querySelector('#feed-grid')?.dataset.sync==='saved');
  let arrived;const gate=new Promise(r=>release=r),ready=new Promise(r=>arrived=r);
  await page.route('**/api/local/operations',async route=>{arrived();await gate;await route.continue();});
  await page.evaluate(id=>__store.patch(id,{bookmarked:true}),a.id);await ready;
  await call(c,'sill_updateContent',{id:b.id,idempotency_key:'parallel_change',body:{expectedRevision:b.revision,changes:{title:'Unrelated MCP update'}}});
  release();await page.waitForFunction(id=>document.querySelector('#feed-grid').dataset.sync==='saved'&&__store.card(id).title==='Unrelated MCP update',b.id);
  const state=await fetch(x.origin()+'/api/local/state').then(r=>r.json());assert.equal(state.state.items[a.id].bookmarked,true);
 }finally{release?.();await browser?.close();await x.close();}
});
