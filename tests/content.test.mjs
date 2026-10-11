import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ConfigSchema } from '../server/config.mjs';
import { Service } from '../server/service.mjs';
import { startHttp } from '../server/http.mjs';
import { Item,publicError } from '../server/schemas.mjs';

async function fixture(t,connectors=[]) {
  const dir=await mkdtemp(join(tmpdir(),'qg-content-'));
  const config=ConfigSchema.parse({dataDir:dir,connectors}),services=[];
  const open=()=>{const service=new Service(config);services.push(service);return service;};
  const service=open();
  t.after(async()=>{for(const item of services.reverse())await item.close();await rm(dir,{recursive:true,force:true});});
  return {service,open};
}
const draft={title:'Private project note',content:'Private original body',tags:['Personal'],idempotencyKey:'note-one'};
const annotationDefault=cardId=>({cardId,values:{note:'',tags:[]},revision:0});
const upstreamItem={externalId:'source-one',title:'Original source title',content:'Original source body',tags:['Original'],url:'https://example.com/source',publishedAt:'2026-10-10T10:00:00Z'};
const createUpstream=s=>s.ingest({sourceId:'upstream',items:[upstreamItem]}).cardIds[0];
const invalidInput=fn=>assert.throws(fn,error=>publicError(error).code==='INVALID_INPUT');

// Each mutation goes through strict server validation; user strings stay plain content.
test('local note creation validates strict fields, limits, trimmed distinct tags and full-card reads',async t=>{
  const {service:s}=await fixture(t);
  for(const input of [
    {...draft,title:''},{...draft,title:'   '},{...draft,title:'a'.repeat(501)},
    {...draft,content:'x'.repeat(50001)},{...draft,content:null},{...draft,content:123},
    {...draft,tags:Array.from({length:21},(_,i)=>`tag${i}`)},{...draft,tags:['x'.repeat(31)]},
    {...draft,tags:['']},{...draft,tags:['  ']},{...draft,tags:['x',' x ']},
    {...draft,idempotencyKey:''},{...draft,idempotencyKey:'x'.repeat(201)},
    {...draft,kind:'article'},{...draft,sourceId:'pretend'},{...draft,id:'pretend'},
    {...draft,local:true},{...draft,state:{read:true}},{...draft,url:'https://example.com'},
  ])invalidInput(()=>s.createNote(input));
  assert.equal(s.store.list('card').length,0);
  assert.equal(s.store.history().length,0);
  const note=s.createNote({...draft,title:'  Private project note  ',tags:[' Personal ','Case','case']});
  assert.match(note.id,/^local_note_[a-f0-9-]+$/);
  assert.equal(note.externalId,note.id);assert.equal(note.sourceId,'local-notes');
  assert.equal(note.kind,'note');assert.equal(note.local,true);assert.equal(note.revision,1);
  assert.equal(note.title,draft.title);assert.equal(note.content,draft.content);
  assert.deepEqual(note.tags,['Personal','Case','case']);
  assert.deepEqual(note.annotation,annotationDefault(note.id));
  assert.deepEqual(note.state,{read:false,bookmarked:false,dismissed:false,snoozedUntil:null});
  assert.equal(note.truncated,false);assert.deepEqual(note.evidenceIds,[]);
  assert.deepEqual(s.getCard(note.id),note);
  assert.equal(Object.hasOwn(s.store.get('card',note.id),'annotation'),false);
  const max=s.createNote({title:'x'.repeat(500),content:'x'.repeat(50000),tags:['x'.repeat(30)],idempotencyKey:'limits'});
  assert.equal(s.getCard(max.id).content.length,50000);
  const excerpt=s.search({query:'x'.repeat(500)}).items.find(c=>c.id===max.id);
  assert.equal(excerpt.content.length,1200);assert.equal(excerpt.contentTruncated,true);assert.equal(excerpt.truncated,false);
  const empty=s.createNote({title:'Empty is valid',idempotencyKey:'empty'});
  assert.equal(empty.content,'');assert.deepEqual(empty.tags,[]);
});

test('create idempotency is persisted, payload-bound and returns the same current note after edits',async t=>{
  const {service:s,open}=await fixture(t);
  const note=s.createNote(draft),other=open();
  assert.deepEqual(other.createNote(draft),note);
  assert.equal(s.store.list('card').length,1);
  assert.equal(s.store.history().filter(e=>e.event==='note_created').length,1);
  assert.throws(()=>other.createNote({...draft,content:'different'}),e=>e.code==='IDEMPOTENCY_CONFLICT');
  const edited=s.updateNote({cardId:note.id,set:{title:'Edited later'},expectedRevision:1});
  assert.equal(edited.revision,2);
  assert.deepEqual(other.createNote(draft),edited,'a network retry does not undo later edits');
  assert.equal(other.getCard(note.id).title,'Edited later');
  assert.throws(()=>s.createNote({...draft,title:'Edited later'}),e=>e.code==='IDEMPOTENCY_CONFLICT');
  assert.equal(s.store.list('card').length,1);
});

test('local note edits use CAS and independent annotation/state; no-op does not audit or revise',async t=>{
  const {service:s,open}=await fixture(t),note=s.createNote(draft),other=open();
  s.feedback(note.id,{bookmarked:true});
  const annotation=s.updateAnnotation({cardId:note.id,set:{note:'Private personal remark'},expectedRevision:0});
  const edited=s.updateNote({cardId:note.id,set:{content:'Edited body',tags:[' Edited ']},expectedRevision:1});
  assert.equal(edited.revision,2);assert.equal(edited.title,note.title);
  assert.equal(edited.content,'Edited body');assert.equal(edited.summary,'Edited body');assert.deepEqual(edited.tags,['Edited']);
  assert.equal(edited.state.bookmarked,true);assert.deepEqual(edited.annotation,annotation);
  assert.equal(edited.createdAt,note.createdAt);assert.equal(edited.firstCollectedAt,note.firstCollectedAt);
  assert.notEqual(edited.contentHash,note.contentHash);
  assert.deepEqual(s.updateNote({cardId:note.id,set:{content:'Edited body',tags:['Edited']},expectedRevision:2}),edited);
  assert.throws(()=>other.updateNote({cardId:note.id,set:{title:'Stale'},expectedRevision:1}),e=>e.code==='NOTE_CONFLICT'&&JSON.stringify(e.detail.current)===JSON.stringify(edited));
  assert.throws(()=>s.updateNote({cardId:note.id,set:{content:'Edited body'},expectedRevision:1}),e=>e.code==='NOTE_CONFLICT','even no-op stale writes must review current content');
  const changes=s.store.history().filter(e=>e.event==='note_updated');
  assert.equal(changes.length,1);
  assert.deepEqual(changes[0].detail,{id:note.id,changedKeys:['content','tags'],fromRevision:1,toRevision:2});
  for(const input of [
    {cardId:note.id,set:{},expectedRevision:2},{cardId:note.id,set:{title:undefined},expectedRevision:2},
    {cardId:note.id,set:{sourceId:'evil'},expectedRevision:2},{cardId:note.id,set:{title:'ok',local:false},expectedRevision:2},
    {cardId:note.id,set:{content:'ok'},expectedRevision:'2'},{cardId:note.id,set:{content:'ok'},expectedRevision:-1},
    {cardId:note.id,set:{content:'ok'},expectedRevision:2.5},{cardId:note.id,set:{content:'ok'}},
    {cardId:note.id,set:{content:'ok'},expectedRevision:2,extra:true},
  ])invalidInput(()=>s.updateNote(input));
  const sourceId=createUpstream(s);
  assert.throws(()=>s.updateNote({cardId:sourceId,set:{title:'Overwrite'},expectedRevision:0}),e=>e.code==='NOTE_NOT_LOCAL');
  assert.equal(s.getCard(sourceId).title,upstreamItem.title);
  assert.deepEqual(s.getCard(note.id),edited);
});

test('annotations are strict, revisioned, persistent and stored separately from original source data',async t=>{
  const {service:s,open}=await fixture(t),cardId=createUpstream(s),original=s.store.get('card',cardId),other=open();
  assert.deepEqual(s.readAnnotation({cardId}),annotationDefault(cardId));
  assert.equal(s.store.list('annotation').length,0);
  for(const input of [
    {cardId,set:{},expectedRevision:0},{cardId,set:{note:undefined},expectedRevision:0},
    {cardId,set:{note:null},expectedRevision:0},{cardId,set:{note:'x'.repeat(4001)},expectedRevision:0},
    {cardId,set:{tags:['x'.repeat(31)]},expectedRevision:0},{cardId,set:{tags:Array.from({length:21},(_,i)=>`${i}`)},expectedRevision:0},
    {cardId,set:{tags:['same',' same ']},expectedRevision:0},{cardId,set:{tags:['  ']},expectedRevision:0},
    {cardId,set:{title:'source change'},expectedRevision:0},{cardId,set:{note:'ok'},expectedRevision:0,sourceId:'evil'},
    {cardId,set:{note:'ok'},expectedRevision:'0'},{cardId,set:{note:'ok'},expectedRevision:-1},{cardId,set:{note:'ok'},expectedRevision:0.5},
  ])invalidInput(()=>s.updateAnnotation(input));
  invalidInput(()=>s.readAnnotation({cardId,extra:true}));
  assert.throws(()=>s.readAnnotation({cardId:'missing'}),e=>e.code==='CARD_NOT_FOUND');
  assert.throws(()=>s.updateAnnotation({cardId:'missing',set:{note:'lost'},expectedRevision:0}),e=>e.code==='CARD_NOT_FOUND');
  const annotation=s.updateAnnotation({cardId,set:{note:'x'.repeat(4000),tags:[' Personal ']},expectedRevision:0});
  assert.deepEqual(annotation,{cardId,values:{note:'x'.repeat(4000),tags:['Personal']},revision:1});
  assert.deepEqual(other.readAnnotation({cardId}),annotation);
  assert.deepEqual(s.store.get('card',cardId),original,'personal notes never overwrite upstream content/provenance');
  assert.deepEqual(s.updateAnnotation({cardId,set:{note:'x'.repeat(4000),tags:['Personal']},expectedRevision:1}),annotation);
  assert.throws(()=>other.updateAnnotation({cardId,set:{note:'stale'},expectedRevision:0}),e=>e.code==='ANNOTATION_CONFLICT'&&e.detail.current.revision===1);
  assert.equal(s.store.history().filter(e=>e.event==='annotation_updated').length,1);
  const cleared=s.updateAnnotation({cardId,set:{note:'',tags:[]},expectedRevision:1});
  assert.deepEqual(cleared,{cardId,values:{note:'',tags:[]},revision:2});
  assert.deepEqual(s.store.get('card',cardId),original);
});

test('content and idempotency writes roll back if transactional audit fails and metadata excludes user text',async t=>{
  const {service:s}=await fixture(t),audit=s.store.audit.bind(s.store);
  s.store.audit=()=>{throw new Error('simulated audit failure');};
  assert.throws(()=>s.createNote(draft),/audit failure/);
  assert.equal(s.store.list('card').length,0);assert.equal(s.store.list('note-key').length,0);
  s.store.audit=audit;
  const note=s.createNote(draft),before=s.store.history();
  s.store.audit=()=>{throw new Error('simulated audit failure');};
  assert.throws(()=>s.updateNote({cardId:note.id,set:{content:'Private failed update'},expectedRevision:1}),/audit failure/);
  assert.throws(()=>s.updateAnnotation({cardId:note.id,set:{note:'Private failed remark',tags:['SecretLabel']},expectedRevision:0}),/audit failure/);
  assert.deepEqual(s.getCard(note.id),note);assert.equal(s.store.list('annotation').length,0);assert.deepEqual(s.store.history(),before);
  s.store.audit=audit;
  s.updateNote({cardId:note.id,set:{content:'Private saved update'},expectedRevision:1});
  s.updateAnnotation({cardId:note.id,set:{note:'Private saved remark',tags:['SecretLabel']},expectedRevision:0});
  const encoded=JSON.stringify(s.store.history());
  for(const privateValue of [draft.title,draft.content,draft.idempotencyKey,'Private saved update','Private saved remark','SecretLabel'])assert.equal(encoded.includes(privateValue),false);
});

test('source refresh and feedback preserve annotations; search/get/recommend return annotation snapshots',async t=>{
  const {service:s}=await fixture(t),cardId=createUpstream(s);
  const annotation=s.updateAnnotation({cardId,set:{note:'Personal context',tags:['Personal']},expectedRevision:0});
  s.feedback(cardId,{read:true,bookmarked:true});
  const refreshed={...upstreamItem,title:'Source refreshed',content:'New source body',tags:['New upstream tag']};
  s.ingest({sourceId:'upstream',items:[refreshed]});
  let card=s.getCard(cardId);
  assert.equal(card.title,refreshed.title);assert.equal(card.url,upstreamItem.url);assert.deepEqual(card.tags,refreshed.tags);
  assert.equal(card.state.bookmarked,true);assert.deepEqual(card.annotation,annotation);
  s.connectors.collect=async()=>({items:[Item.parse({...refreshed,content:'Collected source update'})],nextCursor:null,partial:false});
  await s.collect({connectorId:'upstream'});
  card=s.getCard(cardId);
  assert.equal(card.content,'Collected source update');assert.deepEqual(card.annotation,annotation);
  assert.deepEqual(s.search({query:'Collected'}).items[0].annotation,annotation);
  assert.deepEqual(s.recommend({includeRead:true}).items[0].card.annotation,annotation);
  assert.equal(Object.hasOwn(s.store.get('card',cardId),'annotation'),false);
  assert.deepEqual(s.store.get('annotation',cardId),annotation);
});

test('reserved note source and disjoint IDs cannot be overwritten by ingest or connectors',async t=>{
  const {service:s}=await fixture(t,[{id:'local-notes',label:'Reserved name',type:'google-calendar'}]);
  const note=s.createNote(draft);let calls=0;
  s.connectors.collect=async()=>{calls++;return {items:[Item.parse({externalId:note.id,title:'Attack'})],nextCursor:null,partial:false};};
  assert.throws(()=>s.ingest({sourceId:'local-notes',items:[{externalId:note.id,title:'Attack'}]}),e=>e.code==='RESERVED_SOURCE');
  await assert.rejects(()=>s.collect({connectorId:'local-notes'}),e=>e.code==='RESERVED_SOURCE');
  assert.equal(calls,0,'reserved connector rejected before calling upstream');
  for(const extra of [{id:note.id},{local:true},{revision:1}])invalidInput(()=>s.ingest({sourceId:'upstream',items:[{externalId:note.id,title:'Attack',...extra}]}));
  const imported=s.ingest({sourceId:'upstream',items:[{externalId:note.id,title:'Untrusted matching external ID'}]}).cardIds[0];
  assert.match(imported,/^card_/);assert.notEqual(imported,note.id);
  await s.collect({connectorId:'upstream'});
  assert.deepEqual(s.getCard(note.id),note);
  assert.equal(s.store.list('note-key').length,1);
});

test('HTTP and MCP expose the compatible content contract with auth, strict bodies and explicit conflicts',async t=>{
  const {service:s}=await fixture(t),token='content-test-only-012345678901234567890';
  const server=await startHttp(s,{port:0,token}),origin=`http://127.0.0.1:${server.address().port}`;
  const client=new Client({name:'content-test',version:'1'});
  t.after(async()=>{await client.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));});
  await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}));
  const call=(name,args={})=>client.callTool({name,arguments:args});
  const names=(await client.listTools()).tools.map(tool=>tool.name);
  const originals=['qg_status','qg_read_settings','qg_update_settings','qg_list_source_tools','qg_collect','qg_ingest','qg_search','qg_get_card','qg_recommend','qg_feedback','qg_prepare_action','qg_get_action','qg_commit_action','qg_create_workflow','qg_run_workflow','qg_get_workflow','qg_list_requests','qg_answer_request','qg_audit'];
  assert.equal(names.length,33);
  for(const name of [...originals,'qg_create_note','qg_update_note','qg_read_annotation','qg_update_annotation'])assert.ok(names.includes(name),name);
  assert.equal(names.some(name=>name.includes('delete')),false);
  const created=await call('qg_create_note',draft);assert.notEqual(created.isError,true);
  const note=created.structuredContent,cardPath=`/api/cards/${note.id}`,notePath=`/api/notes/${note.id}`,annotationPath=cardPath+'/annotation';
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const request=(path,method='GET',value,extraHeaders={})=>fetch(origin+path,{method,headers:{...headers,...extraHeaders},...(value===undefined?{}:{body:JSON.stringify(value)})});
  for(const [path,method,value] of [['/api/notes','POST',draft],[notePath,'PATCH',{set:{title:'No access'},expectedRevision:1}],[annotationPath,'GET'],[annotationPath,'PATCH',{set:{note:'No access'},expectedRevision:0}]]) {
    const response=await fetch(origin+path,{method,headers:{'Content-Type':'application/json'},...(value===undefined?{}:{body:JSON.stringify(value)})});assert.equal(response.status,401);
  }
  assert.equal((await request('/api/notes','POST',draft,{Origin:'https://evil.example'})).status,403);
  assert.deepEqual(await (await request(cardPath)).json(),note);
  assert.deepEqual(await (await request(annotationPath)).json(),annotationDefault(note.id));
  const patch=await request(notePath,'PATCH',{set:{title:'HTTP edited'},expectedRevision:1});assert.equal(patch.status,200);
  const edited=await patch.json();assert.equal(edited.revision,2);
  assert.deepEqual((await call('qg_get_card',{cardId:note.id})).structuredContent,edited);
  const fromMcp=await call('qg_update_note',{cardId:note.id,set:{content:'MCP edited'},expectedRevision:2});assert.notEqual(fromMcp.isError,true);
  const latest=fromMcp.structuredContent;assert.equal(latest.revision,3);
  const saved=await call('qg_update_annotation',{cardId:note.id,set:{note:'MCP personal note',tags:['Review']},expectedRevision:0});assert.notEqual(saved.isError,true);
  assert.deepEqual(await (await request(annotationPath)).json(),saved.structuredContent);
  const annotationResponse=await request(annotationPath,'PATCH',{set:{note:'HTTP personal note'},expectedRevision:1});assert.equal(annotationResponse.status,200);
  const annotation=await annotationResponse.json();
  assert.deepEqual((await call('qg_read_annotation',{cardId:note.id})).structuredContent,annotation);
  for(const [path,set,code,revision] of [[notePath,{title:'Stale'},'NOTE_CONFLICT',3],[annotationPath,{note:'Stale'},'ANNOTATION_CONFLICT',2]]) {
    const conflict=await request(path,'PATCH',{set,expectedRevision:0});assert.equal(conflict.status,409);
    const value=await conflict.json();assert.equal(value.code,code);assert.equal(value.current.revision,revision);
  }
  for(const [name,set,code] of [['qg_update_note',{title:'Stale'},'NOTE_CONFLICT'],['qg_update_annotation',{note:'Stale'},'ANNOTATION_CONFLICT']]) {
    const conflict=await call(name,{cardId:note.id,set,expectedRevision:0});assert.equal(conflict.isError,true);assert.equal(conflict.structuredContent.code,code);
  }
  const retry=await request('/api/notes','POST',draft);assert.equal(retry.status,201);assert.equal((await retry.json()).id,note.id);
  const keyConflict=await request('/api/notes','POST',{...draft,title:'Different create'});assert.equal(keyConflict.status,409);assert.equal((await keyConflict.json()).code,'IDEMPOTENCY_CONFLICT');
  const foreign=s.createNote({...draft,title:'Another',idempotencyKey:'foreign'});
  for(const [path,set,revision] of [[notePath,{title:'Attempt'},3],[annotationPath,{note:'Attempt'},2]])for(const extra of [{cardId:foreign.id},{cardId:note.id},{extra:true}]) {
    const response=await request(path,'PATCH',{set,expectedRevision:revision,...extra});assert.equal(response.status,400);assert.equal((await response.json()).code,'INVALID_INPUT');
  }
  assert.equal((await request('/api/notes','POST',{...draft,extra:true})).status,400);
  for(const [name,args] of [['qg_create_note',{...draft,extra:true}],['qg_update_note',{cardId:note.id,set:{title:'Attempt',sourceId:'evil'},expectedRevision:3}],['qg_read_annotation',{cardId:note.id,extra:true}],['qg_update_annotation',{cardId:note.id,set:{note:'Attempt'},expectedRevision:2,extra:true}]])assert.equal((await call(name,args)).isError,true);
  assert.equal((await request(notePath,'DELETE')).status,404);assert.equal((await request(annotationPath,'DELETE')).status,404);
  assert.equal(s.getCard(note.id).title,'HTTP edited');assert.equal(s.getCard(foreign.id).title,'Another');
  assert.deepEqual(s.readAnnotation({cardId:note.id}),annotation);
  const feed=await (await request('/api/feed')).json();assert.deepEqual(feed.items.find(card=>card.id===note.id).annotation,annotation);
  assert.deepEqual((await call('qg_search',{query:'MCP edited'})).structuredContent.items[0].annotation,annotation);
  assert.deepEqual((await call('qg_get_card',{cardId:note.id})).structuredContent.annotation,annotation);
});
