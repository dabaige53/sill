import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigSchema, PRINCIPAL_TOOLS } from '../server/config.mjs';
import { Service } from '../server/service.mjs';
import { publicError } from '../server/schemas.mjs';

// Fixed fake credentials are test fixtures only. No real environment is read,
// modified or configured, and the network sentinel must never be reached.
const TOKENS={owner:'fixture-owner-only-'.repeat(3),a:'fixture-agent-alpha-'.repeat(3),b:'fixture-agent-bravo-'.repeat(3)};
const principal=(id,overrides={})=>({id,enabled:true,tokenEnv:`FIXTURE_${id.toUpperCase()}`,tools:[...PRINCIPAL_TOOLS],resources:{sourceIds:['allowed','local-notes'],ingestSourceIds:['allowed']},...overrides});
const input=(id,extra={})=>({externalId:id,title:`Card ${id}`,content:`Content ${id}`,publishedAt:'2026-10-10T00:00:00Z',...extra});
const deny=fn=>assert.throws(fn,error=>error.code==='ACCESS_DENIED'&&!JSON.stringify(publicError(error)).includes('PRIVATE'));
const authDeny=fn=>assert.throws(fn,error=>error.code==='AUTH_REQUIRED');
async function fixture(t,principals=[principal('a')]){
  const dir=await mkdtemp(join(tmpdir(),'qg-access-'));
  const config=ConfigSchema.parse({dataDir:dir,access:{principals}}),env={FIXTURE_A:TOKENS.a,FIXTURE_B:TOKENS.b};
  let time=100000,fetches=0;
  const service=new Service(config,{env,now:()=>time,fetchImpl:async()=>{fetches++;throw new Error('No external calls allowed');}});
  t.after(async()=>{await service.close();await rm(dir,{recursive:true,force:true});assert.equal(fetches,0);});
  const actor=(id='a',transport='http')=>service.access.authenticate(TOKENS[id],{ownerToken:TOKENS.owner,transport});
  const facade=(id='a',transport='http')=>service.access.facade(actor(id,transport));
  const card=(source,id,extra={})=>service.ingest({sourceId:source,items:[input(id,extra)]}).cardIds[0];
  return {service,config,env,actor,facade,card,advance:ms=>{time+=ms;}};
}

test('configuration is default closed, finite and reference-only with intersecting resource bounds',()=>{
  assert.deepEqual(ConfigSchema.parse({}).access,{principals:[]});
  const disabled=ConfigSchema.parse({access:{principals:[{id:'a',tokenEnv:'FIXTURE_A'}]}}).access.principals[0];
  assert.equal(disabled.enabled,false);assert.deepEqual(disabled.tools,[]);assert.deepEqual(disabled.resources.sourceIds,[]);
  for(const value of [
    principal('a',{token:'PRIVATE literal secret'}),principal('a',{tokenEnv:'QG_AUTH_TOKEN'}),
    principal('owner'),principal('a',{tools:['qg_collect']}),principal('a',{tools:['*']}),
    principal('a',{resources:{sourceIds:['*']}}),principal('a',{resources:{sourceIds:['allowed'],ingestSourceIds:['other']}}),
    principal('a',{limits:{requestsPerMinute:0}}),principal('a',{limits:{maxConcurrent:9}}),principal('a',{limits:{maxRequestBytes:524289}}),
  ])assert.equal(ConfigSchema.safeParse({access:{principals:[value]}}).success,false);
  assert.equal(ConfigSchema.safeParse({access:{principals:[principal('a'),principal('a')]}}).success,false);
  assert.equal(ConfigSchema.safeParse({access:{principals:[principal('a'),principal('b',{tokenEnv:'FIXTURE_A'})]}}).success,false);
});

test('authentication rejects absent, short, forged, disabled, duplicate and owner-colliding credentials',async t=>{
  const {service:s,config,env,actor}=await fixture(t,[principal('a'),principal('b')]);
  for(const token of [undefined,'','short','incorrect-token-'.repeat(4),'x'.repeat(4097)])authDeny(()=>s.access.authenticate(token,{ownerToken:TOKENS.owner}));
  authDeny(()=>s.access.run({kind:'owner',id:'owner',transport:'http'},()=>{}));
  const a=actor();assert.equal(a.kind,'principal');assert.deepEqual(Object.keys(a).sort(),['id','kind','transport']);
  const owner=s.access.authenticate(TOKENS.owner,{ownerToken:TOKENS.owner});assert.equal(owner.kind,'owner');
  assert.equal(s.access.allowedTools(owner),null);
  config.access.principals[0].enabled=false;authDeny(()=>actor());authDeny(()=>s.access.run(a,()=>{}));
  config.access.principals[0].enabled=true;env.FIXTURE_B=TOKENS.a;authDeny(()=>actor());
  env.FIXTURE_B=TOKENS.b;env.FIXTURE_A=TOKENS.owner;
  authDeny(()=>s.access.authenticate(TOKENS.owner,{ownerToken:TOKENS.owner}));
  authDeny(()=>s.access.run(owner,()=>{}));
});

test('existing actors recheck dynamic token revocation, grants, limits and malformed operator configuration',async t=>{
  const {service:s,config,env,actor,card}=await fixture(t),id=card('allowed','one'),a=actor(),view=s.access.facade(a);
  assert.equal(view.getCard(id).id,id);
  env.FIXTURE_A='fixture-replacement-token-'.repeat(3);authDeny(()=>view.getCard(id));
  env.FIXTURE_A=TOKENS.a;config.access.principals[0].tools=['qg_search'];deny(()=>view.getCard(id));
  config.access.principals[0].resources.sourceIds=[];config.access.principals[0].resources.ingestSourceIds=[];assert.equal(view.search({}).total,0);
  config.access.principals[0].tools=['qg_status'];assert.throws(()=>view.search({}),error=>error.code==='AUTH_CONFIG');
});

test('card search and ranking filter source bounds and evidence closure before totals and pagination',async t=>{
  const {service:s,facade,card}=await fixture(t);
  const hidden=card('private','PRIVATE hidden',{publishedAt:'2026-10-11T00:00:00Z'});
  const first=card('allowed','one'),second=card('allowed','two'),tainted=card('allowed','tainted',{evidenceIds:[hidden]});
  const transitive=card('allowed','transitive',{evidenceIds:[tainted]});
  const view=facade();
  const all=view.search({limit:1});assert.equal(all.total,2);assert.equal(all.items.length,1);assert.equal(all.nextOffset,1);
  const next=view.search({limit:1,offset:1});assert.equal(next.total,2);assert.equal(next.nextOffset,null);
  assert.deepEqual(new Set([all.items[0].id,next.items[0].id]),new Set([first,second]));
  assert.deepEqual(new Set(view.recommend({limit:50}).items.map(entry=>entry.card.id)),new Set([first,second]));
  for(const id of [hidden,tainted,transitive,'missing'])deny(()=>view.getCard(id));
  assert.deepEqual(view.search({sourceIds:['private']}),{items:[],total:0,nextOffset:null});
  assert.equal(s.search({}).total,5,'owner remains unrestricted');
});

test('optional cardIds narrows source scope, empty lists deny, and cycles cannot escape bounds',async t=>{
  const {service:s,config,facade,card}=await fixture(t);
  const one=card('allowed','one'),two=card('allowed','two'),hidden=card('private','PRIVATE hidden');
  config.access.principals[0].resources.cardIds=[one,hidden];const view=facade();
  assert.deepEqual(view.search({}).items.map(c=>c.id),[one]);deny(()=>view.getCard(two));deny(()=>view.getCard(hidden));
  config.access.principals[0].resources.cardIds=[];assert.equal(view.search({}).total,0);
  delete config.access.principals[0].resources.cardIds;
  const a=s.store.get('card',one),b=s.store.get('card',two);
  s.store.put('card',one,{...a,evidenceIds:[two]});s.store.put('card',two,{...b,evidenceIds:[one]});
  assert.equal(view.search({}).total,2,'safe evidence cycle terminates');
  s.store.put('card',two,{...b,evidenceIds:[one,hidden]});assert.equal(view.search({}).total,0);
});

test('unsafe cards are denied before note/annotation conflicts and feedback writes',async t=>{
  const {service:s,config,facade,card}=await fixture(t);
  const note=s.createNote({title:'PRIVATE note',content:'PRIVATE original',idempotencyKey:'owner-note'}),hidden=card('private','PRIVATE hidden');
  s.updateAnnotation({cardId:note.id,set:{note:'PRIVATE annotation'},expectedRevision:0});
  config.access.principals[0].resources.sourceIds=['allowed'];const view=facade(),before=s.store.get('card',note.id);
  deny(()=>view.updateNote({cardId:note.id,set:{content:'overwrite'},expectedRevision:0}));
  deny(()=>view.updateAnnotation({cardId:note.id,set:{note:'overwrite'},expectedRevision:0}));
  deny(()=>view.readAnnotation({cardId:note.id}));deny(()=>view.feedback(hidden,{read:true}));
  assert.deepEqual(s.store.get('card',note.id),before);assert.equal(s.getCard(hidden).state.read,false);
});

test('annotations require their read grant even when cards and note mutations are granted',async t=>{
  const {service:s,config,facade,actor,card}=await fixture(t),id=card('allowed','one');
  s.updateAnnotation({cardId:id,set:{note:'PRIVATE personal annotation'},expectedRevision:0});
  config.access.principals[0].tools=config.access.principals[0].tools.filter(tool=>tool!=='qg_read_annotation');
  const view=facade();
  assert.equal(s.access.allowedTools(actor()).includes('qg_update_annotation'),false,'Discovery omits an unusable annotation-update grant');
  assert.equal(Object.hasOwn(view.getCard(id),'annotation'),false);
  assert.equal(Object.hasOwn(view.search({}).items[0],'annotation'),false);
  assert.equal(Object.hasOwn(view.recommend({}).items[0].card,'annotation'),false);
  deny(()=>view.readAnnotation({cardId:id}));
  deny(()=>view.updateAnnotation({cardId:id,set:{tags:['safe']},expectedRevision:1}));
  deny(()=>view.updateAnnotation({cardId:id,set:{tags:['safe']},expectedRevision:0}));
  deny(()=>view.updateAnnotation({cardId:id,set:{tags:[]},expectedRevision:1}));
  config.access.principals[0].tools.push('qg_read_annotation');assert.equal(view.getCard(id).annotation.values.note,'PRIVATE personal annotation');
});

test('creation idempotency is actor-namespaced and payload-bound across both transports',async t=>{
  const {service:s,facade,actor}=await fixture(t,[principal('a'),principal('b')]);
  const input={title:'Local result',content:'same body',idempotencyKey:'shared-key'};
  const own=s.createNote(input),a=facade('a'),b=facade('b'),first=a.createNote(input),second=b.createNote(input);
  assert.equal(new Set([own.id,first.id,second.id]).size,3);
  const mcp=s.access.facade(actor('a','mcp-http'));assert.equal(mcp.createNote(input).id,first.id);
  a.updateNote({cardId:first.id,set:{content:'edited'},expectedRevision:1});
  assert.equal(mcp.createNote(input).content,'edited');
  assert.throws(()=>a.createNote({...input,content:'changed'}),error=>error.code==='IDEMPOTENCY_CONFLICT');
  assert.equal(s.store.list('card').length,3);
});

test('restricted creation needs source-wide access and legacy ingest requires read, write and evidence bounds',async t=>{
  const {service:s,config,facade,card}=await fixture(t),hidden=card('private','PRIVATE hidden'),allowed=card('allowed','one'),view=facade();
  deny(()=>view.ingest({sourceId:'private',items:[input('outside')]}));
  deny(()=>view.ingest({sourceId:'allowed',items:[input('bad-evidence',{evidenceIds:[hidden]})]}));
  const tainted=card('allowed','tainted',{evidenceIds:[hidden]});
  deny(()=>view.ingest({sourceId:'allowed',items:[input('tainted')]}));
  assert.deepEqual(s.store.get('card',tainted).evidenceIds,[hidden]);
  const result=view.ingest({sourceId:'allowed',items:[input('new',{evidenceIds:[allowed]})]});assert.equal(result.count,1);
  config.access.principals[0].resources.cardIds=[allowed];
  deny(()=>view.createNote({title:'out of scope',idempotencyKey:'new'}));
  deny(()=>view.ingest({sourceId:'allowed',items:[input('another-new')]}));
  assert.equal(view.ingest({sourceId:'allowed',items:[input('one',{content:'targeted update'})]}).count,1);
});

test('finite facade cannot become an admin, connector, AI, workflow, host or conversation proxy',async t=>{
  const {service:s,actor,facade}=await fixture(t),a=actor(),view=facade();
  assert.equal(Object.getPrototypeOf(view),null);assert.equal(Object.isFrozen(view),true);
  for(const key of ['store','connectors','access','constructor','__proto__','close','status','createConversation','createRequest','startAi','startWorkflow','prepareAction'])assert.equal(view[key],undefined);
  for(const method of ['status','aiStatus','readSettings','updateSettings','collect','prepareAction','getAction','commitAction','createWorkflow','startWorkflow','getWorkflow','createConversation','listConversations','readConversation','createRequest','getRequest','listRequests','answerRequest','startAi','getAi','cancelAi']){
    deny(()=>s.access.run(a,()=>s[method]({})));
  }
  assert.equal(s.store.list('conversation').length,0);assert.equal(s.store.list('workflow').length,0);
});

test('request/rate/concurrency limits are bounded, shared across transports, and nested dispatch is charged once',async t=>{
  const {service:s,actor,advance}=await fixture(t,[principal('a',{limits:{requestsPerMinute:2,maxConcurrent:1,maxRequestBytes:256}})]),a=actor(),mcp=actor('a','mcp-http');
  assert.equal(s.access.requestLimit(a),256);assert.throws(()=>s.access.run(a,()=>{}, {requestBytes:257}),error=>error.code==='BODY_TOO_LARGE');
  s.access.run(a,()=>s.access.run(a,()=>{}));s.access.run(mcp,()=>{});
  assert.throws(()=>s.access.run(a,()=>{}),error=>error.code==='RATE_LIMITED');
  advance(60000);let release;const pending=s.access.run(a,()=>new Promise(resolve=>{release=resolve;}));
  assert.throws(()=>s.access.run(mcp,()=>{}),error=>error.code==='RATE_LIMITED');
  release();await pending;s.access.run(mcp,()=>{});
  assert.throws(()=>s.access.assertRequestSize(a,Infinity),error=>error.code==='BODY_TOO_LARGE');
});

test('concurrent asynchronous contexts preserve metadata-only audit attribution without credential material',async t=>{
  const {service:s,actor}=await fixture(t,[principal('a'),principal('b')]);
  let releaseA,releaseB;
  const a=s.access.run(actor('a','http'),async()=>{await new Promise(resolve=>{releaseA=resolve;});s.store.audit('fixture',{operation:'alpha'});});
  const b=s.access.run(actor('b','mcp-http'),async()=>{await new Promise(resolve=>{releaseB=resolve;});s.store.audit('fixture',{operation:'bravo'});});
  releaseB();await b;releaseA();await a;
  const records=s.store.history().filter(record=>record.event==='fixture');
  assert.equal(records.find(record=>record.detail.operation==='alpha').detail.actorId,'a');
  assert.equal(records.find(record=>record.detail.operation==='alpha').detail.transport,'http');
  assert.equal(records.find(record=>record.detail.operation==='bravo').detail.actorId,'b');
  assert.equal(records.find(record=>record.detail.operation==='bravo').detail.transport,'mcp-http');
  for(const secret of Object.values(TOKENS))assert.equal(JSON.stringify(records).includes(secret),false);
});
