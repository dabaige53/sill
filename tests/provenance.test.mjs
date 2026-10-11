import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Service } from '../server/service.mjs';
import { ConfigSchema } from '../server/config.mjs';
import { Item,Ingest,publicError } from '../server/schemas.mjs';

const T0='2026-10-10T08:00:00Z',T1='2026-10-10T09:00:00Z',T2='2026-10-10T10:00:00Z',T3='2026-10-10T11:00:00Z';
const providers=['notion','google-calendar','linear'];
function sourceItem(provider='notion',overrides={}){
  const externalId='shared-stable-id';
  return {externalId,title:`Private ${provider} source`,content:'Private original source body',summary:'',kind:{notion:'note','google-calendar':'event',linear:'task'}[provider],
    url:{notion:'https://www.notion.so/Original-page-11111111111111111111111111111111','google-calendar':'https://calendar.google.com/calendar/event?eid=event-reference',linear:'https://linear.app/workspace/issue/QG-1/private-title'}[provider],
    ...(provider==='google-calendar'?{start:'2026-10-12T09:00:00Z',end:'2026-10-12T10:00:00Z'}:{}),
    truncated:false,expectedRevision:0,provenance:{provider,upstreamId:externalId,scope:{accountId:'account-one',...(provider==='google-calendar'?{calendarId:'calendar-one'}:{workspaceId:'workspace-one'})},retrievedAt:T1,upstreamUpdatedAt:T0,partial:false,contentOrigin:'upstream-original'},...overrides};
}
const ingestArgs=item=>({mode:'host-assisted',sourceId:`host-${item.provenance.provider}`,items:[item]});
const cardFrom=(service,result)=>service.getCard(result.cardIds[0]);
const invalidInput=fn=>assert.throws(fn,error=>publicError(error).code==='INVALID_INPUT');
const conflict=(fn,reason)=>assert.throws(fn,error=>error.code==='INGEST_CONFLICT'&&(!reason||error.detail.reason===reason));
async function fixture(t,connectors=[]){
  const dataDir=await mkdtemp(join(tmpdir(),'qg-provenance-')),config=ConfigSchema.parse({dataDir,connectors}),services=[];let fetchCount=0;
  const open=()=>{const s=new Service(config,{fetchImpl:async()=>{fetchCount++;throw new Error('No external calls allowed');}});services.push(s);return s;};
  const service=open();t.after(async()=>{for(const s of services.reverse())await s.close();await rm(dataDir,{recursive:true,force:true});});
  return {service,open,fetchCount:()=>fetchCount};
}

test('all host providers store strict attributed original data without pretending authorization or calling upstream',async t=>{
  const {service:s,fetchCount}=await fixture(t);
  for(const provider of providers){
    const item=sourceItem(provider),result=s.ingest(ingestArgs(item)),card=cardFrom(s,result);
    assert.equal(result.count,1);assert.equal(result.replayed,0);assert.equal(result.items[0].replayed,false);
    assert.equal(card.sourceId,`host-${provider}`);assert.equal(card.externalId,item.externalId);assert.equal(card.revision,1);
    assert.equal(card.content,item.content);assert.equal(card.summary,'');assert.equal(card.url,item.url);
    assert.deepEqual(card.provenance,{...item.provenance,mode:'host-assisted',attribution:'host-asserted'});
    assert.equal(Object.hasOwn(card,'expectedRevision'),false);assert.equal(Object.hasOwn(card.provenance,'authorizationVerified'),false);
    assert.equal(s.search({sourceIds:[card.sourceId]}).items[0].id,card.id);
    assert.equal(s.recommend({limit:10}).items.some(entry=>entry.card.id===card.id),true);
  }
  assert.equal(s.store.list('card').length,3);assert.equal(s.store.list('host-import-receipt').length,3);assert.equal(fetchCount(),0);
});

test('host ingestion rejects unknown fields, missing provenance, source/scope mismatches and unsafe links without writes',async t=>{
  const {service:s}=await fixture(t),valid=sourceItem(),args=ingestArgs(valid);
  const changeProvenance=patch=>({...valid,provenance:{...valid.provenance,...patch}});
  const malformed=[
    {...args,mode:'connector'},{...args,mode:undefined},{...args,sourceId:'notion'},{...args,sourceId:'local-notes'},
    {...args,sourceId:'host-linear'},{...args,unexpected:true},{...args,items:[]},
    ...[
      {...valid,provenance:undefined},{...valid,expectedRevision:undefined},{...valid,expectedRevision:'0'},{...valid,expectedRevision:-1},{...valid,expectedRevision:0.5},
      {...valid,content:undefined},{...valid,truncated:undefined},{...valid,externalId:'different-record'},
      {...valid,content:'x'.repeat(50001)},{...valid,url:'https://www.notion.so/'},{...valid,url:'https://evil.example/page'},
      {...valid,url:'https://www.notion.so.evil.example/page'},{...valid,url:'javascript:alert(1)'},{...valid,url:'not-a-url'},
      {...valid,url:'http://www.notion.so/page'},{...valid,url:'https://token@www.notion.so/page'},
      {...valid,url:'https://www.notion.so:444/page'},{...valid,url:'https://www.notion.so/\\evil'},
      {...valid,url:'https://www.notion.so/'+'x'.repeat(2048)},{...valid,url:'https://linear.app/workspace/issue/QG-1'},
      {...valid,local:true},{...valid,state:{read:true}},{...valid,id:'pretend-card'},{...valid,revision:20},
      changeProvenance({provider:'github'}),changeProvenance({retrievedAt:'tomorrow'}),changeProvenance({retrievedAt:undefined}),
      changeProvenance({partial:undefined}),changeProvenance({partial:'false'}),changeProvenance({verified:true}),
      changeProvenance({upstreamUpdatedAt:T2}),changeProvenance({upstreamId:'x'.repeat(301)}),
      changeProvenance({scope:{accountId:'account-one'}}),changeProvenance({scope:{accountId:'',workspaceId:'one'}}),
      changeProvenance({scope:{accountId:'a',workspaceId:'w',calendarId:'c'}}),changeProvenance({scope:{accountId:'a\n',workspaceId:'w'}}),
      changeProvenance({scope:{accountId:'a',workspaceId:'w',token:'secret'}}),{...valid,kind:'suggestion'},
    ].map(item=>({...args,items:[item]})),
  ];
  for(const input of malformed)invalidInput(()=>s.ingest(input));
  const calendar=sourceItem('google-calendar');
  invalidInput(()=>s.ingest(ingestArgs({...calendar,provenance:{...calendar.provenance,scope:{accountId:'a',workspaceId:'w'}}})));
  assert.equal(s.store.list('card').length,0);assert.equal(s.store.list('host-import-receipt').length,0);assert.equal(s.store.history().length,0);
});

test('official Notion, Calendar and Linear direct-link variants are allowed but roots and unrelated routes are not',async t=>{
  const {service:s}=await fixture(t);
  for(const [provider,urls] of Object.entries({
    notion:['https://app.notion.com/p/Bug-bash-be633bf1dfa0436db259571129a590e5','https://team.notion.site/Page-be633bf1dfa0436db259571129a590e5','https://notion.so/be633bf1dfa0436db259571129a590e5'],
    'google-calendar':['https://www.google.com/calendar/event?eid=abc','https://calendar.google.com/calendar/u/0/r/eventedit/abc'],
    linear:['https://linear.app/issue/LIN-1778/slug','https://linear.app/workspace/issue/LIN-123/slug'],
  }))for(const [index,url] of urls.entries()){
    const item=sourceItem(provider);item.url=url;item.externalId+=index;item.provenance.upstreamId=item.externalId;s.ingest(ingestArgs(item));
  }
  for(const [provider,url] of [
    ['notion','https://app.notion.com/'],['notion','https://www.notion.so/login'],['notion','https://www.notion.so/settings'],['notion','https://www.notion.so/product'],['notion','https://www.notion.so/redirect?url=https%3A%2F%2Fevil.example'],
    ['linear','https://linear.app/workspace'],['google-calendar','https://calendar.google.com/'],['google-calendar','https://www.google.com/search?q=private'],
  ])invalidInput(()=>s.ingest(ingestArgs(sourceItem(provider,{url}))));
  for(const provider of providers)for(const key of ['access_token','TOKEN','api_key','authorization','code','password','client_secret']){
    const item=sourceItem(provider),url=new URL(item.url);url.searchParams.set(key,'must-not-be-stored');item.url=url.href;
    invalidInput(()=>s.ingest(ingestArgs(item)));
  }
});

test('Notion UUID aliases share identity and page URL UUIDs must agree with a UUID upstream ID',async t=>{
  const {service:s}=await fixture(t),uuid='aabbccdd-1111-2222-3333-444455556666',item=sourceItem();
  item.externalId=uuid;item.provenance.upstreamId=uuid;item.url=`https://app.notion.com/p/Original-${uuid.replaceAll('-','')}`;
  const result=s.ingest(ingestArgs(item)),alias=structuredClone(item);
  alias.externalId=uuid.replaceAll('-','').toUpperCase();alias.provenance.upstreamId=alias.externalId;
  conflict(()=>s.ingest(ingestArgs(alias)),'used-revision');
  assert.equal(s.store.list('card').length,1);assert.equal(s.getCard(result.cardIds[0]).provenance.upstreamId,uuid);
  invalidInput(()=>s.ingest({...ingestArgs(item),items:[item,alias]}));
  const other=structuredClone(item);other.externalId='ffffffff-1111-2222-3333-444455556666';other.provenance.upstreamId=other.externalId;
  invalidInput(()=>s.ingest(ingestArgs(other)));
  const hyphenated=sourceItem();hyphenated.url=`https://team.notion.site/Original-${uuid}`;
  assert.equal(Ingest.safeParse(ingestArgs(hyphenated)).success,true);
});

test('host Calendar requires consistent valid timed or exclusive-end all-day event dates',async t=>{
  const {service:s}=await fixture(t),timed=sourceItem('google-calendar'),dateOnly={...timed,allDay:true,startDate:'2024-02-29',endDate:'2024-03-01'};
  delete dateOnly.start;delete dateOnly.end;
  for(const item of [
    {...timed,start:undefined,end:undefined},{...timed,start:undefined},{...timed,end:undefined},
    {...timed,end:timed.start},{...timed,end:'2026-10-12T08:59:59Z'},{...timed,start:'2026-02-30T09:00:00Z'},
    {...timed,start:'2026-10-12T09:00:00'},{...timed,allDay:true},
    {...timed,startDate:'2026-10-12',endDate:'2026-10-13'},
    {...dateOnly,start:timed.start},{...dateOnly,end:timed.end},{...dateOnly,allDay:false},{...dateOnly,allDay:undefined},
    {...dateOnly,startDate:undefined},{...dateOnly,endDate:undefined},{...dateOnly,endDate:dateOnly.startDate},
    {...dateOnly,endDate:'2024-02-28'},{...dateOnly,startDate:'2023-02-29'},{...dateOnly,endDate:'2024-02-30'},
    {...dateOnly,startDate:'2024-13-01'},{...dateOnly,startDate:'2024-2-29'},
  ])invalidInput(()=>s.ingest(ingestArgs(item)));
  assert.equal(s.store.list('card').length,0);assert.equal(s.store.history().length,0);
  const timedCard=cardFrom(s,s.ingest(ingestArgs({...timed,allDay:false})));
  assert.equal(timedCard.start,timed.start);assert.equal(timedCard.end,timed.end);assert.equal(timedCard.allDay,false);
  dateOnly.externalId='all-day-record';dateOnly.provenance={...dateOnly.provenance,upstreamId:dateOnly.externalId};
  const allDay=cardFrom(s,s.ingest(ingestArgs(dateOnly)));
  assert.equal(allDay.allDay,true);assert.equal(allDay.startDate,'2024-02-29');assert.equal(allDay.endDate,'2024-03-01');
  assert.equal(allDay.start,undefined);assert.equal(allDay.end,undefined);
  // Legacy Item and configured collector inputs keep their previous contract.
  assert.equal(Item.safeParse({externalId:'legacy',title:'Legacy event without timing',kind:'event'}).success,true);
});

test('dedup identity includes provider, account and workspace/calendar scope, with exact batch duplicates rejected',async t=>{
  const {service:s}=await fixture(t),ids=[];
  for(const provider of providers)for(const accountId of ['account-one','account-two'])for(const scopeId of ['scope-one','scope-two']){
    const item=sourceItem(provider);item.provenance.scope={accountId,...(provider==='google-calendar'?{calendarId:scopeId}:{workspaceId:scopeId})};
    const result=s.ingest(ingestArgs(item));ids.push(result.cardIds[0]);assert.equal(s.ingest(ingestArgs(item)).cardIds[0],result.cardIds[0]);
  }
  assert.equal(new Set(ids).size,12);assert.equal(s.store.list('card').length,12);
  const item=sourceItem(),input=ingestArgs(item);input.items.push(structuredClone(item));invalidInput(()=>s.ingest(input));
  input.items[1].content='contradiction';invalidInput(()=>s.ingest(input));
  assert.equal(s.store.list('card').length,12);
});

test('reserved namespaces cannot be forged through legacy ingest or configured collect and old ingest remains compatible',async t=>{
  const connectors=[{id:'notion',label:'Configured Notion',type:'notion'},{id:'host-notion',label:'Bad reserved connector',type:'notion'}];
  const {service:s}=await fixture(t,connectors),item={externalId:'legacy',title:'Legacy record',content:'Unverified provided text'};
  for(const sourceId of ['local-notes','host-notion','host-linear','host-google-calendar'])assert.throws(()=>s.ingest({sourceId,items:[item]}),e=>e.code==='RESERVED_SOURCE');
  let calls=0;s.connectors.collect=async()=>{calls++;return {items:[Item.parse(item)],partial:false,nextCursor:null};};
  await assert.rejects(s.collect({connectorId:'host-notion'}),e=>e.code==='RESERVED_SOURCE');assert.equal(calls,0);
  const ordinary=s.ingest({sourceId:'host-source',items:[item]});assert.equal(s.getCard(ordinary.cardIds[0]).provenance,undefined);
  const imported=s.ingest({sourceId:'notion',items:[item]});assert.equal(s.getCard(imported.cardIds[0]).provenance,undefined);
  const collected=await s.collect({connectorId:'notion'});assert.equal(collected.cardIds[0],imported.cardIds[0]);assert.equal(calls,1);
  const host=sourceItem('notion',{externalId:'legacy'});host.provenance.upstreamId='legacy';const attributed=s.ingest(ingestArgs(host));
  assert.notEqual(attributed.cardIds[0],imported.cardIds[0]);assert.equal(s.store.list('card').length,3);
  const forged=ingestArgs(host);delete forged.mode;invalidInput(()=>s.ingest(forged));
});

test('persisted revision receipts make exact creates and updates replay current cards without undoing later data',async t=>{
  const {service:s,open}=await fixture(t),item=sourceItem(),first=s.ingest(ingestArgs(item)),other=open(),id=first.cardIds[0];
  const retried=other.ingest(ingestArgs(item));assert.equal(retried.items[0].replayed,true);assert.equal(retried.replayed,1);
  const update={...item,content:'Newer original body',expectedRevision:1,provenance:{...item.provenance,retrievedAt:T2,upstreamUpdatedAt:T1}};
  const changed=other.ingest(ingestArgs(update));assert.equal(changed.items[0].revision,2);
  const replayCreate=s.ingest(ingestArgs(item));assert.equal(replayCreate.items[0].revision,2);assert.equal(replayCreate.items[0].replayed,true);
  assert.equal(s.getCard(id).content,update.content);assert.equal(s.store.list('card').length,1);assert.equal(s.store.history().length,2);
  assert.equal(s.ingest(ingestArgs(update)).items[0].replayed,true);assert.equal(s.store.history().length,2);
  conflict(()=>s.ingest(ingestArgs({...item,title:'Changed creation'})),'used-revision');
  conflict(()=>s.ingest(ingestArgs({...update,content:'Changed retry'})),'used-revision');
  assert.equal(s.getCard(id).content,update.content);assert.equal(s.store.list('host-import-receipt').length,2);
});

test('CAS, stale retrieval and stale upstream versions cannot overwrite newer server data',async t=>{
  const {service:s,open}=await fixture(t),item=sourceItem(),id=s.ingest(ingestArgs(item)).cardIds[0],other=open();
  const update={...item,content:'New source version',expectedRevision:1,provenance:{...item.provenance,retrievedAt:T3,upstreamUpdatedAt:T2}};
  other.ingest(ingestArgs(update));const current=s.getCard(id);
  conflict(()=>s.ingest(ingestArgs({...update,title:'Concurrent losing update'})),'used-revision');
  conflict(()=>s.ingest(ingestArgs({...update,expectedRevision:9})),'revision');
  conflict(()=>s.ingest(ingestArgs({...update,expectedRevision:2,provenance:{...update.provenance,retrievedAt:T2}})),'stale-retrieval');
  conflict(()=>s.ingest(ingestArgs({...update,expectedRevision:2,provenance:{...update.provenance,upstreamUpdatedAt:T1}})),'stale-upstream');
  const missingVersion={...update,expectedRevision:2,provenance:{...update.provenance}};delete missingVersion.provenance.upstreamUpdatedAt;
  conflict(()=>s.ingest(ingestArgs(missingVersion)),'missing-upstream-version');
  assert.deepEqual(s.getCard(id),current);assert.equal(s.store.history().length,2);
});

test('summary labeling is explicit, source original survives summaries, and state/annotations/evidence remain separate',async t=>{
  const {service:s}=await fixture(t),e1=s.createNote({title:'First evidence',idempotencyKey:'e1'}),e2=s.createNote({title:'Second evidence',idempotencyKey:'e2'});
  const item=sourceItem();item.summary='Model interpretation';item.provenance.summaryOrigin='model-summary';item.evidenceIds=[e1.id];
  const id=s.ingest(ingestArgs(item)).cardIds[0];s.feedback(id,{read:true,bookmarked:true});const annotation=s.updateAnnotation({cardId:id,set:{note:'Private annotation',tags:['Mine']},expectedRevision:0});
  const next={...item,summary:'Revised model interpretation',evidenceIds:[e2.id],expectedRevision:1,provenance:{...item.provenance,retrievedAt:T2}};
  const result=s.ingest(ingestArgs(next)),card=cardFrom(s,result);
  assert.equal(card.content,item.content);assert.equal(card.summary,next.summary);assert.deepEqual(card.evidenceIds,[e1.id,e2.id]);
  assert.equal(card.state.read,true);assert.equal(card.state.bookmarked,true);assert.deepEqual(card.annotation,annotation);
  assert.equal(Object.hasOwn(s.store.get('card',id),'annotation'),false);
  const modelOnly=sourceItem('linear',{content:'',summary:'Model-only summary'});modelOnly.provenance.contentOrigin='model-summary';modelOnly.provenance.summaryOrigin='model-summary';
  const summaryCard=cardFrom(s,s.ingest(ingestArgs(modelOnly)));assert.equal(summaryCard.content,'');assert.equal(summaryCard.summary,modelOnly.summary);
  for(const invalid of [
    {...item,provenance:{...item.provenance,summaryOrigin:undefined}},
    {...item,summary:'',provenance:{...item.provenance,summaryOrigin:'model-summary'}},
    {...modelOnly,content:'Pretended original'},
    {...modelOnly,summary:'',provenance:{...modelOnly.provenance,summaryOrigin:undefined}},
    {...modelOnly,provenance:{...modelOnly.provenance,summaryOrigin:'upstream-original'}},
  ])invalidInput(()=>s.ingest(ingestArgs(invalid)));
  conflict(()=>s.ingest(ingestArgs({...next,expectedRevision:2,content:'',provenance:{...next.provenance,contentOrigin:'model-summary'}})),'original-loss');
  assert.equal(s.getCard(id).content,item.content);
});

test('same-version imports permit exact-prefix truncated enrichment and reject contradictory originals',async t=>{
  const {service:s}=await fixture(t),item=sourceItem('notion',{content:'Original prefix',truncated:true});item.provenance.partial=true;
  const id=s.ingest(ingestArgs(item)).cardIds[0];
  conflict(()=>s.ingest(ingestArgs({...item,content:'Contradictory body',expectedRevision:1,provenance:{...item.provenance,retrievedAt:T2}})),'source-version');
  conflict(()=>s.ingest(ingestArgs({...item,title:'Contradictory title',content:'Original prefix plus rest',expectedRevision:1,provenance:{...item.provenance,retrievedAt:T2}})),'source-version');
  const full={...item,content:'Original prefix plus rest',truncated:false,expectedRevision:1,provenance:{...item.provenance,retrievedAt:T2,partial:false}};
  s.ingest(ingestArgs(full));assert.equal(s.getCard(id).content,full.content);assert.equal(s.getCard(id).truncated,false);assert.equal(s.getCard(id).provenance.partial,false);
  conflict(()=>s.ingest(ingestArgs({...full,content:'Original prefix plus rest and contradiction',expectedRevision:2,provenance:{...full.provenance,retrievedAt:T3}})),'source-version');
  s.ingest(ingestArgs({...full,expectedRevision:2,summary:'A labeled derived summary',provenance:{...full.provenance,summaryOrigin:'model-summary'}}));
  assert.equal(s.getCard(id).revision,3);assert.equal(s.getCard(id).content,full.content);
  const upstreamSummary=sourceItem('linear',{summary:'Source provided summary'});upstreamSummary.provenance.summaryOrigin='upstream-original';s.ingest(ingestArgs(upstreamSummary));
  conflict(()=>s.ingest(ingestArgs({...upstreamSummary,summary:'Different source summary',expectedRevision:1,provenance:{...upstreamSummary.provenance,retrievedAt:T2}})),'source-version');
});

test('summary-only records can gain original text at the same source version only when other originals agree',async t=>{
  const {service:s}=await fixture(t),item=sourceItem('linear',{content:'',summary:'Derived summary'});
  item.provenance.contentOrigin='model-summary';item.provenance.summaryOrigin='model-summary';item.provenance.partial=true;
  const id=s.ingest(ingestArgs(item)).cardIds[0],enriched={...item,content:'Actual upstream original',expectedRevision:1,provenance:{...item.provenance,retrievedAt:T2,contentOrigin:'upstream-original',partial:false}};
  conflict(()=>s.ingest(ingestArgs({...enriched,title:'Different source title'})),'source-version');
  conflict(()=>s.ingest(ingestArgs({...enriched,tags:['Conflicting source tag']})),'source-version');
  conflict(()=>s.ingest(ingestArgs({...enriched,provenance:{...enriched.provenance,retrievedAt:T0}})),'stale-retrieval');
  s.ingest(ingestArgs(enriched));const card=s.getCard(id);
  assert.equal(card.revision,2);assert.equal(card.content,enriched.content);assert.equal(card.summary,item.summary);assert.equal(card.provenance.contentOrigin,'upstream-original');
  conflict(()=>s.ingest(ingestArgs({...item,expectedRevision:2,provenance:{...item.provenance,retrievedAt:T3}})),'original-loss');
  assert.equal(s.getCard(id).content,enriched.content);
});

test('host batch, receipts and metadata audit are atomic including mid-batch audit failures',async t=>{
  const {service:s}=await fixture(t),one=sourceItem(),two=sourceItem();two.externalId='other-record';two.provenance.upstreamId=two.externalId;
  const input={...ingestArgs(one),items:[one,two]},audit=s.store.audit.bind(s.store);let auditCalls=0;
  s.store.audit=(...args)=>{if(++auditCalls===2)throw new Error('simulated transactional audit failure');return audit(...args);};
  assert.throws(()=>s.ingest(input),/transactional audit failure/);
  assert.equal(s.store.list('card').length,0);assert.equal(s.store.list('host-import-receipt').length,0);assert.equal(s.store.history().length,0);
  s.store.audit=audit;s.ingest(input);const before=s.store.list('card'),history=s.store.history();
  const update={...input,items:input.items.map(item=>({...item,expectedRevision:1,content:'Private revised original',provenance:{...item.provenance,retrievedAt:T2,upstreamUpdatedAt:T1}}))};
  auditCalls=0;s.store.audit=(...args)=>{if(++auditCalls===2)throw new Error('simulated update audit failure');return audit(...args);};
  assert.throws(()=>s.ingest(update),/update audit failure/);assert.deepEqual(s.store.list('card'),before);assert.deepEqual(s.store.history(),history);assert.equal(s.store.list('host-import-receipt').length,2);
  s.store.audit=audit;const absentEvidence=structuredClone(update);absentEvidence.items[1].evidenceIds=['card_absent'];
  assert.throws(()=>s.ingest(absentEvidence),e=>e.code==='EVIDENCE_NOT_FOUND');assert.deepEqual(s.store.list('card'),before);
  const log=JSON.stringify(history);for(const secret of ['Private original source body','Private notion source','account-one','workspace-one','shared-stable-id'])assert.equal(log.includes(secret),false);
  assert.deepEqual(history[0].detail,{id:before.find(card=>card.externalId===two.externalId).id,sourceId:'host-notion',provider:'notion',fromRevision:0,toRevision:1,truncated:false,partial:false});
});

test('frozen request snapshots preserve bounded host labels and scope after later imports and omit annotations',async t=>{
  const {service:s}=await fixture(t),item=sourceItem('notion',{content:'O'.repeat(1600),summary:'Model summary '+ 'S'.repeat(600)});item.provenance.summaryOrigin='model-summary';
  const id=s.ingest(ingestArgs(item)).cardIds[0];s.updateAnnotation({cardId:id,set:{note:'Never send this private annotation'},expectedRevision:0});
  const conversation=s.createConversation({title:'Context',idempotencyKey:'context'}),request=s.createRequest({conversationId:conversation.id,question:'Discuss source',cardIds:[id],idempotencyKey:'question'}),snapshot=request.cardRefs[0];
  assert.equal(snapshot.content.length,1200);assert.equal(snapshot.summary.length,500);assert.equal(snapshot.contentTruncated,true);assert.equal(snapshot.summaryTruncated,true);
  assert.equal(snapshot.provenance.contentOrigin,'upstream-original');assert.equal(snapshot.provenance.summaryOrigin,'model-summary');assert.equal(snapshot.provenance.attribution,'host-asserted');assert.deepEqual(snapshot.provenance.scope,item.provenance.scope);
  assert.equal(JSON.stringify(snapshot).includes('Never send'),false);
  s.ingest(ingestArgs({...item,content:'New original',summary:'New model summary',expectedRevision:1,provenance:{...item.provenance,retrievedAt:T2,upstreamUpdatedAt:T1}}));
  assert.deepEqual(s.getRequest({requestId:request.id}).cardRefs[0],snapshot);assert.equal(snapshot.revision,1);assert.equal(s.getCard(id).revision,2);
  assert.equal(s.search({}).items[0].provenance.summaryOrigin,'model-summary');
});

test('host evidence union stays bounded and revisions cannot overflow',async t=>{
  const {service:s}=await fixture(t),ids=[];
  for(let index=0;index<101;index++)ids.push(s.createNote({title:`Evidence ${index}`,idempotencyKey:`e-${index}`}).id);
  const item=sourceItem();item.evidenceIds=ids.slice(0,100);const id=s.ingest(ingestArgs(item)).cardIds[0];
  assert.throws(()=>s.ingest(ingestArgs({...item,expectedRevision:1,evidenceIds:[ids[100]],provenance:{...item.provenance,retrievedAt:T2}})),e=>e.code==='EVIDENCE_LIMIT');
  assert.equal(s.getCard(id).revision,1);assert.equal(s.getCard(id).evidenceIds.length,100);
  const record=s.store.get('card',id);s.store.put('card',id,{...record,revision:Number.MAX_SAFE_INTEGER});
  assert.throws(()=>s.ingest(ingestArgs({...item,expectedRevision:Number.MAX_SAFE_INTEGER})),e=>e.code==='REVISION_LIMIT');
  assert.equal(s.getCard(id).revision,Number.MAX_SAFE_INTEGER);
  assert.equal(Ingest.safeParse(ingestArgs({...item,expectedRevision:Number.MAX_SAFE_INTEGER+1})).success,false);
});
