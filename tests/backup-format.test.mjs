import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, digest } from '../server/store.mjs';
import { Item, HostItem, hostIdentity } from '../server/schemas.mjs';
import { BACKUP_LIMITS, makeBackup, parseBackup, backupDigest, canonicalBackupJSON,
  validateBackupCard, validateBackupAnnotation, validateBackupSettings, validateBackupPayload } from '../server/backup-format.mjs';

const T0='2026-10-10T08:00:00.000Z',T1='2026-10-10T09:00:00.000Z';
const freshState=()=>({read:false,bookmarked:false,dismissed:false,snoozedUntil:null});
function legacy(externalId='one',extra={}) {
  const item=Item.parse({externalId,title:'Original source',content:'User-entered content may contain sensitive material.',...extra});
  return {...item,id:`card_${digest(['source',item.externalId]).slice(0,32)}`,sourceId:'source',contentHash:digest(item),collectedAt:T1,firstCollectedAt:T0,state:freshState()};
}
function local(extra={}) {
  const id='local_note_11111111-1111-4111-8111-111111111111',values={title:'Local note',content:'Local private original',tags:['b','a']};
  return {...values,id,externalId:id,sourceId:'local-notes',kind:'note',local:true,revision:2,
    summary:values.content.slice(0,300),contentHash:digest(values),truncated:false,evidenceIds:[],
    publishedAt:T1,collectedAt:T0,firstCollectedAt:T0,createdAt:T0,updatedAt:T1,state:freshState(),...extra};
}
function host(provider='notion',extra={}) {
  const externalId=provider==='notion'?'11111111-1111-4111-8111-111111111111':'source-one';
  const input=HostItem.parse({externalId,title:`${provider} source`,content:'Original host body',summary:'',
    kind:{notion:'note','google-calendar':'event',linear:'task'}[provider],truncated:false,expectedRevision:0,
    url:{notion:'https://www.notion.so/Original-11111111111141118111111111111111','google-calendar':'https://calendar.google.com/calendar/event?eid=event-reference',linear:'https://linear.app/workspace/issue/QG-1/title'}[provider],
    ...(provider==='google-calendar'?{start:T0,end:T1}:{}),
    provenance:{provider,upstreamId:externalId,scope:{accountId:'account-one',...(provider==='google-calendar'?{calendarId:'calendar-one'}:{workspaceId:'workspace-one'})},retrievedAt:T1,upstreamUpdatedAt:T0,partial:false,contentOrigin:'upstream-original'},...extra});
  const {expectedRevision,...values}=input,provenance={...values.provenance,mode:'host-assisted',attribution:'host-asserted'};
  return {...values,provenance,id:`card_${digest(['host-assisted',...hostIdentity(provenance)]).slice(0,32)}`,sourceId:`host-${provider}`,revision:1,
    contentHash:digest({...values,provenance}),collectedAt:T1,firstCollectedAt:T0,state:freshState()};
}
const payload=(cards=[],annotations=[],settings=null)=>({cards,annotations,settings});
const backup=content=>makeBackup(content,{exportedAt:T1});
const clone=value=>JSON.parse(JSON.stringify(value));
const invalid=fn=>assert.throws(fn);
const withCode=(fn,code)=>assert.throws(fn,error=>error.code===code);
const annotation=cardId=>({cardId,values:{note:'My own note',tags:['second','first']},revision:3});
const settings=()=>({values:{sort:'unread',reduceTransparency:true,recommendation:{interests:['b','a'],sourcePriorities:{'2':2,'10':1,source:3},excludedSourceIds:['x','y'],includeRead:false}},revision:4});

test('round trips actual legacy and all provider records, local notes, annotations and nullable settings',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'qg-backup-format-')),store=new Store(directory);
  t.after(async()=>{store.close();await rm(directory,{recursive:true,force:true});});
  const first=store.ingest('source',[Item.parse({externalId:'from-store',title:'Source',tags:['z','a']})])[0];
  for(const provider of ['notion','google-calendar','linear']){
    const stored=host(provider),{id,sourceId,revision,contentHash,collectedAt,firstCollectedAt,state,provenance,...fields}=stored;
    const {mode,attribution,...upstream}=provenance;
    store.ingestHost(sourceId,[HostItem.parse({...fields,provenance:upstream,expectedRevision:0,evidenceIds:[first.id]})]);
  }
  store.put('card',local().id,local());
  const original=payload(store.list('card'),[annotation(first.id)],settings()),saved=backup(original),restored=parseBackup(saved);
  assert.deepEqual(restored.payload,validateBackupPayload(original));
  assert.equal(saved.format,'sill-content-backup');assert.equal(saved.scope,'cards-annotations-settings');assert.equal(saved.version,1);
  assert.equal(saved.checksum.algorithm,'sha256');assert.match(saved.checksum.value,/^[a-f0-9]{64}$/);
  assert.equal(parseBackup(backup(payload())).payload.settings,null);assert.equal(saved.payload.cards.length,5);
  for(const card of saved.payload.cards)assert.equal(card.contentHash,original.cards.find(item=>item.id===card.id).contentHash);
  restored.payload.cards[0].title='Mutated returned copy';assert.notEqual(saved.payload.cards[0].title,'Mutated returned copy');
  saved.payload.annotations[0].values.tags.reverse();assert.deepEqual(original.annotations[0].values.tags,['second','first']);
});

test('checksum includes metadata and preserves ordered arrays but ignores object and record-array order',()=>{
  const a=legacy('a',{tags:['z','a']}),b=legacy('b',{evidenceIds:[a.id]}),c=legacy('c',{evidenceIds:[b.id,a.id]});
  const input=payload([c,b,a],[annotation(b.id),annotation(a.id)],settings()),saved=backup(input);
  assert.deepEqual(saved.payload.cards.map(card=>card.id),[a.id,b.id,c.id].sort());
  assert.deepEqual(saved.payload.annotations.map(row=>row.cardId),[a.id,b.id].sort());
  const reversed=value=>Array.isArray(value)?value.map(reversed):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reversed(item)])):value;
  const reordered=reversed(saved);reordered.payload.cards.reverse();reordered.payload.annotations.reverse();
  assert.equal(backupDigest(reordered),saved.checksum.value);assert.deepEqual(parseBackup(reordered),saved);
  assert.equal(canonicalBackupJSON(reordered),canonicalBackupJSON(saved));
  assert.ok(canonicalBackupJSON(saved).includes('"sourcePriorities":{"10":1,"2":2,"source":3}'));
  assert.deepEqual(input.cards.map(card=>card.id),[c.id,b.id,a.id],'inputs are never sorted in place');
  const changed=clone(saved);changed.payload.cards.find(card=>card.id===c.id).evidenceIds.reverse();
  assert.notEqual(backupDigest(changed),saved.checksum.value);withCode(()=>parseBackup(changed),'BACKUP_CHECKSUM');
  const tags=clone(saved);tags.payload.cards.find(card=>card.id===a.id).tags.reverse();assert.notEqual(backupDigest(tags),saved.checksum.value);
  for(const [key,value] of [['exportedAt',T0],['scope','other'],['format','other'],['version',2],['extra',true]])assert.notEqual(backupDigest({...saved,[key]:value}),saved.checksum.value);
  const {checksum,...body}=saved;
  assert.equal(backupDigest(saved),createHash('sha256').update(canonicalBackupJSON(body)).digest('hex'));
  assert.equal(backupDigest({...saved,checksum:{algorithm:'else',value:'else'}}),saved.checksum.value);
});

test('rejects versions, malformed envelopes/checksums, missing fields and tampered content',()=>{
  const saved=backup(payload([legacy()]));
  withCode(()=>parseBackup({...saved,version:2}),'BACKUP_VERSION');
  withCode(()=>parseBackup({...saved,checksum:{algorithm:'sha256',value:'0'.repeat(64)}}),'BACKUP_CHECKSUM');
  const changed=clone(saved);changed.payload.cards[0].title='Tampered';withCode(()=>parseBackup(changed),'BACKUP_CHECKSUM');
  for(const value of [null,[],JSON.stringify(saved),{...saved,scope:'all'},{...saved,format:'backup'},
    {...saved,checksum:{algorithm:'sha1',value:saved.checksum.value}},{...saved,checksum:{algorithm:'sha256',value:'A'.repeat(64)}},
    {...saved,checksum:{...saved.checksum,key:'secret'}},{...saved,exportedAt:'yesterday'},{...saved,exportedAt:'2026-02-30T00:00:00Z'},
    {...saved,payload:{cards:[],annotations:[]}},{...saved,payload:{cards:[],annotations:[],settings:[]}},
  ])invalid(()=>parseBackup(value));
  for(const field of Object.keys(saved)){const removed={...saved};delete removed[field];invalid(()=>parseBackup(removed));}
});

test('unknown operational data is rejected at each nested schema while free text is preserved',()=>{
  const card=legacy(),note=local(),hostCard=host();
  for(const [base,change] of [
    [backup(payload([card])),value=>value.jobs=[]],
    [backup(payload([card])),value=>value.payload.conversations=[]],
    [backup(payload([card])),value=>value.payload.cards[0].annotation=annotation(card.id)],
    [backup(payload([card])),value=>value.payload.cards[0].state.token='secret'],
    [backup(payload([hostCard])),value=>value.payload.cards[0].provenance.credentials='secret'],
    [backup(payload([hostCard])),value=>value.payload.cards[0].provenance.scope.apiKey='secret'],
    [backup(payload([card],[annotation(card.id)])),value=>value.payload.annotations[0].values.sourceId='source'],
    [backup(payload([],[],settings())),value=>value.payload.settings.values.ai={enabled:true}],
    [backup(payload([],[],settings())),value=>value.payload.settings.values.recommendation.accessToken='secret'],
  ]){change(base);invalid(()=>parseBackup(base));}
  for(const field of ['revision','local','createdAt','expectedRevision','approvalToken','contentTruncated'])invalid(()=>validateBackupCard({...card,[field]:1}));
  invalid(()=>validateBackupCard({...note,url:'https://example.com'}));invalid(()=>validateBackupCard({...hostCard,expectedRevision:0}));
  const sensitive='A password written as personal free text is not automatically removed.';
  assert.equal(validateBackupCard({...card,content:sensitive}).content,sensitive);
});

test('stored defaults and trimmed values must be present; hashes retain historical semantics',()=>{
  const card=legacy();
  for(const key of ['content','summary','kind','tags','evidenceIds','truncated','state','contentHash','firstCollectedAt']){
    const copy={...card};delete copy[key];invalid(()=>validateBackupCard(copy));
  }
  for(const hash of ['','a'.repeat(63),'g'.repeat(64),'A'.repeat(64),null])invalid(()=>validateBackupCard({...card,contentHash:hash}));
  assert.equal(validateBackupCard({...card,contentHash:'a'.repeat(64)}).contentHash,'a'.repeat(64));
  invalid(()=>validateBackupCard(local({title:' Needs trim '})));invalid(()=>validateBackupCard(local({tags:[' tag ']})));
  invalid(()=>validateBackupAnnotation({...annotation(card.id),values:{note:'ok',tags:[' tag ']}}));
  const prefs=settings();prefs.values.recommendation.interests=[' Topic '];invalid(()=>validateBackupSettings(prefs));
  const absent=backup(payload()),present=backup(payload([],[],{values:{sort:'priority',reduceTransparency:false},revision:0}));
  assert.notEqual(absent.checksum.value,present.checksum.value,'null and explicit settings differ');
});

test('local identity, kind, timestamps, summary and revision coherence are checked',()=>{
  const note=local();
  for(const patch of [
    {id:'local_note_fake'},{externalId:'local_note_else'},{sourceId:'else'},{kind:'article'},{local:false},{revision:0},{revision:1.2},
    {summary:'unrelated'},{truncated:true},{evidenceIds:[legacy().id]},{createdAt:T1},{firstCollectedAt:T1},{collectedAt:T1},
    {publishedAt:T0},{updatedAt:'2026-10-09T00:00:00Z',publishedAt:'2026-10-09T00:00:00Z'},
  ])invalid(()=>validateBackupCard({...note,...patch}));
  assert.equal(validateBackupCard({...note,revision:Number.MAX_SAFE_INTEGER}).revision,Number.MAX_SAFE_INTEGER);
});

test('source and normalized host identities must match derived IDs and stored variants',()=>{
  const card=legacy(),notion=host();
  for(const patch of [{id:'card_wrong'},{sourceId:'other'},{externalId:'other'},{sourceId:'local-notes'},{sourceId:'host-notion'},{firstCollectedAt:'2026-10-11T00:00:00Z'}])invalid(()=>validateBackupCard({...card,...patch}));
  for(const patch of [{id:'card_wrong'},{sourceId:'host-linear'},{revision:0},{externalId:'else'}])invalid(()=>validateBackupCard({...notion,...patch}));
  const missing={...notion};delete missing.provenance;invalid(()=>validateBackupCard(missing));
  for(const key of ['mode','attribution']){const copy=clone(notion);delete copy.provenance[key];invalid(()=>validateBackupCard(copy));}
  for(const [key,value] of [['mode','connector'],['attribution','verified'],['provider','github'],['upstreamId','else']]){
    const copy=clone(notion);copy.provenance[key]=value;invalid(()=>validateBackupCard(copy));
  }
  const compact=clone(notion);compact.provenance.upstreamId=compact.provenance.upstreamId.replaceAll('-','').toUpperCase();compact.externalId=compact.provenance.upstreamId;
  assert.equal(validateBackupCard(compact).id,notion.id);invalid(()=>backup(payload([notion,compact])));
});

test('host projection retains all provider, scope, URL, calendar and content-origin invariants',()=>{
  for(const provider of ['notion','google-calendar','linear']){
    const card=host(provider);
    for(const mutate of [
      value=>value.kind='suggestion',value=>delete value.provenance.scope.accountId,
      value=>value.provenance.scope[provider==='google-calendar'?'workspaceId':'calendarId']='wrong',
      value=>value.provenance.upstreamUpdatedAt='2026-10-11T00:00:00Z',
      value=>value.summary='Summary without origin',value=>value.provenance.summaryOrigin='model-summary',
      value=>value.provenance.contentOrigin='model-summary',value=>value.url='https://example.com/resource',
      value=>value.provenance.partial='false',value=>delete value.truncated,
    ]){const copy=clone(card);mutate(copy);invalid(()=>validateBackupCard(copy));}
  }
  const calendar=host('google-calendar');
  for(const patch of [{end:T0},{allDay:true},{startDate:'2026-10-10'},{start:'2026-02-30T08:00:00Z'}])invalid(()=>validateBackupCard({...calendar,...patch}));
  const allDay={...calendar,allDay:true,startDate:'2026-10-10',endDate:'2026-10-11'};delete allDay.start;delete allDay.end;
  assert.equal(validateBackupCard(allDay).allDay,true);
  invalid(()=>validateBackupCard({...allDay,endDate:'2026-10-10'}));invalid(()=>validateBackupCard({...allDay,startDate:'2026-02-30'}));
  const summaryOnly=host('linear');summaryOnly.content='';summaryOnly.summary='Model summary';summaryOnly.provenance.contentOrigin='model-summary';summaryOnly.provenance.summaryOrigin='model-summary';summaryOnly.truncated=true;summaryOnly.provenance.partial=true;
  assert.equal(validateBackupCard(summaryOnly).provenance.contentOrigin,'model-summary');
});

test('annotations and evidence resolve within the bundle and record IDs are unique',()=>{
  const first=legacy('first'),second=legacy('second',{evidenceIds:[first.id]}),note=local();
  assert.equal(backup(payload([second,first,note],[annotation(second.id),annotation(note.id)])).payload.cards.length,3);
  invalid(()=>backup(payload([second])));invalid(()=>backup(payload([first],[annotation(second.id)])));
  invalid(()=>backup(payload([first,first])));invalid(()=>backup(payload([first],[annotation(first.id),annotation(first.id)])));
  const repeats=legacy('repeated',{evidenceIds:[first.id,first.id]});
  assert.deepEqual(backup(payload([first,repeats])).payload.cards.find(card=>card.id===repeats.id).evidenceIds,[first.id,first.id]);
});

test('URLs reject userinfo and credential fields rather than silently sanitizing',()=>{
  const card=legacy();
  for(const url of [
    'https://user@example.com/item','https://user:password@example.com/item','https://example.com/?token=x',
    'https://example.com/?access_token=x','https://example.com/?API-KEY=x','https://example.com/?%70assword=x',
    'https://example.com/?oauth_token=x','https://example.com/?authToken=x','https://example.com/?AWSAccessKeyId=x','https://@example.com/','https:example.com/',
    'https://example.com/?X-Amz-Credential=x','https://example.com/?authorization=x','https://example.com/?code=x',
    'https://example.com/#access_token=x','https://example.com/\\wrong',' https://example.com/item','https://example.com/\nitem',
    'ftp://example.com/item','javascript:alert(1)',`https://example.com/${'x'.repeat(2048)}`,
  ])invalid(()=>validateBackupCard({...card,url}));
  for(const url of ['https://example.com/item?topic=weather#section','http://localhost:8080/item','https://example.com/item?q=ordinary'])assert.equal(validateBackupCard({...card,url}).url,url);
  const exact=`https://example.com/${'x'.repeat(2048-'https://example.com/'.length)}`;assert.equal(validateBackupCard({...card,url:exact}).url.length,2048);
});

test('plain JSON rejects bad Unicode/numbers, prototypes, cycles, accessors and hidden properties',()=>{
  for(const value of [NaN,Infinity,-Infinity,Number.MAX_SAFE_INTEGER+1,undefined,1n,()=>{},new Date(),new Map(),new Set(),new Uint8Array([1]),'\ud800','\udfff'])invalid(()=>canonicalBackupJSON(value));
  for(const value of [{bad:'\ud800'},{'\ud800':'bad'},[undefined],Array(2),Object.assign([],{secret:'x'}),Object.create({inherited:1})])invalid(()=>canonicalBackupJSON(value));
  const cyclic={};cyclic.child=cyclic;invalid(()=>canonicalBackupJSON(cyclic));
  let calls=0;const accessor={};Object.defineProperty(accessor,'value',{enumerable:true,get(){calls++;return 1;}});invalid(()=>canonicalBackupJSON(accessor));assert.equal(calls,0);
  const hidden={};Object.defineProperty(hidden,'secret',{value:'x'});invalid(()=>canonicalBackupJSON(hidden));
  const symbol={visible:1,[Symbol('secret')]:'x'};invalid(()=>canonicalBackupJSON(symbol));
  class Values extends Array {}invalid(()=>canonicalBackupJSON(new Values(1,2)));
  const untrusted=JSON.parse('{"__proto__":{"polluted":true}}');assert.equal(canonicalBackupJSON(untrusted),'{"__proto__":{"polluted":true}}');assert.equal({}.polluted,undefined);
  assert.equal(canonicalBackupJSON(Object.assign(Object.create(null),{ok:'🙂'})),'{"ok":"🙂"}');
  const malformed=legacy();malformed.content='\ud800';invalid(()=>backup(payload([malformed])));
  const unsafe=settings();unsafe.revision=Number.MAX_SAFE_INTEGER+1;invalid(()=>validateBackupSettings(unsafe));
});

test('canonical whole-envelope byte ceiling is exact and helper options cannot enlarge it',()=>{
  const cards=Array.from({length:6},(_,index)=>legacy(`bytes-${index}`,{content:'x'.repeat(42000)}));
  const base=backup(payload(cards)),bytes=Buffer.byteLength(canonicalBackupJSON(base));assert.ok(bytes<BACKUP_LIMITS.bytes);
  cards[0].content+='x'.repeat(BACKUP_LIMITS.bytes-bytes);
  const exact=backup(payload(cards));assert.equal(Buffer.byteLength(canonicalBackupJSON(exact)),BACKUP_LIMITS.bytes);assert.deepEqual(parseBackup(exact),exact);
  cards[0].content+='x';withCode(()=>backup(payload(cards)),'BACKUP_LIMIT');
  const emoji=clone(exact);emoji.payload.cards[0].content=emoji.payload.cards[0].content.slice(0,-1)+'🙂';withCode(()=>parseBackup(emoji),'BACKUP_LIMIT');
  for(const options of [{maxBytes:BACKUP_LIMITS.bytes+1},{maxDepth:33},{maxElements:8001},{maxBytes:0},{maxBytes:1.5},{unexpected:true}])withCode(()=>canonicalBackupJSON({},options),'BACKUP_LIMIT');
  assert.equal(canonicalBackupJSON('a',{maxBytes:3}),'"a"');withCode(()=>canonicalBackupJSON('aa',{maxBytes:3}),'BACKUP_LIMIT');
});

test('card, annotation, recursive element and nesting bounds fail closed',()=>{
  const cards=Array.from({length:100},(_,index)=>legacy(`limit-${index}`));assert.equal(backup(payload(cards)).payload.cards.length,100);
  invalid(()=>backup(payload([...cards,legacy('overflow')])));
  invalid(()=>backup(payload([cards[0]],Array.from({length:101},()=>annotation(cards[0].id)))));
  assert.equal(JSON.parse(canonicalBackupJSON(Array(7999).fill(null))).length,7999);withCode(()=>canonicalBackupJSON(Array(8000).fill(null)),'BACKUP_LIMIT');
  let nested=null;for(let i=0;i<32;i++)nested=[nested];assert.equal(canonicalBackupJSON(nested).length,68);withCode(()=>canonicalBackupJSON([nested]),'BACKUP_LIMIT');
  assert.equal(canonicalBackupJSON({a:null},{maxElements:3}),'{"a":null}');withCode(()=>canonicalBackupJSON({a:null},{maxElements:2}),'BACKUP_LIMIT');
  const many=Array.from({length:100},(_,index)=>legacy(`elements-${index}`,{tags:Array.from({length:30},()=>''),evidenceIds:Array(30).fill(cards[0].id)}));withCode(()=>backup(payload(many)),'BACKUP_LIMIT');
});
