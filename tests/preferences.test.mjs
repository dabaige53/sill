import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigSchema } from '../server/config.mjs';
import { Service } from '../server/service.mjs';
import { DEFAULT_RECOMMENDATION,RecommendationValues,Recommend,publicError } from '../server/schemas.mjs';

const preferences=patch=>({...structuredClone(DEFAULT_RECOMMENDATION),...patch});
const defaults={values:{sort:'priority',reduceTransparency:false},revision:0};
const ids=result=>result.items.map(entry=>entry.card.id);
const settingsEvents=service=>service.store.history(100).filter(event=>event.event==='settings_updated');
async function fixture(t,access={}) {
  const dataDir=await mkdtemp(join(tmpdir(),'qg-preferences-'));
  const config=ConfigSchema.parse({dataDir,access});
  const env={FIXTURE_READER:'preferences-reader-fixture-only-'.repeat(2)};
  let externalCalls=0;
  const options={env,fetchImpl:async()=>{externalCalls++;throw new Error('No external calls expected');}};
  const service=new Service(config,options),instances=new Set([service]);
  t.after(async()=>{for(const instance of instances)await instance.close();await rm(dataDir,{recursive:true,force:true});assert.equal(externalCalls,0);});
  const reopen=()=>{const another=new Service(config,options);instances.add(another);return another;};
  const close=async instance=>{await instance.close();instances.delete(instance);};
  const card=(sourceId,externalId,extra={})=>service.ingest({sourceId,items:[{externalId,title:`Card ${externalId}`,content:'',publishedAt:'2000-01-01T00:00:00Z',...extra}]}).cardIds[0];
  return {service,config,env,reopen,close,card};
}

test('legacy settings retain their contract and gain effective defaults without a migration write',async t=>{
  const {service:s,card}=await fixture(t);
  const id=card('source','one');
  assert.deepEqual(s.readSettings(),defaults);
  assert.deepEqual(ids(s.recommend({})),[id]);
  assert.deepEqual(s.updateSettings({set:{recommendation:preferences()},expectedRevision:0}),defaults);
  assert.equal(s.store.list('settings').length,0);
  assert.equal(settingsEvents(s).length,0);
  const legacy={values:{sort:'unread',reduceTransparency:true},revision:8};
  s.store.put('settings','workspace',legacy);
  assert.deepEqual(s.readSettings(),legacy);
  assert.deepEqual(ids(s.recommend({})),[id]);
  assert.deepEqual(s.updateSettings({set:{recommendation:preferences()},expectedRevision:8}),legacy);
  const updated=s.updateSettings({set:{sort:'time',recommendation:preferences()},expectedRevision:8});
  assert.deepEqual(updated,{values:{sort:'time',reduceTransparency:true},revision:9},'unchanged default group is not materialized by an unrelated update');
  assert.deepEqual(settingsEvents(s)[0].detail,{changedKeys:['sort'],fromRevision:8,toRevision:9});
});

test('nested preferences share settings CAS, survive a full restart, and preserve structural no-ops and reset',async t=>{
  const f=await fixture(t),s=f.service;
  const recommendation=preferences({interests:['MCP','design'],sourcePriorities:{alpha:30,beta:-30},excludedSourceIds:['muted'],includeRead:true});
  const updated=s.updateSettings({set:{recommendation,sort:'time'},expectedRevision:0});
  assert.deepEqual(updated,{values:{sort:'time',reduceTransparency:false,recommendation},revision:1});
  assert.deepEqual(s.updateSettings({set:{recommendation:{includeRead:true,excludedSourceIds:['muted'],sourcePriorities:{beta:-30,alpha:30},interests:['MCP','design']}},expectedRevision:1}),updated);
  assert.equal(settingsEvents(s).length,1,'new objects and object-key order are not setting changes');
  assert.deepEqual(settingsEvents(s)[0].detail,{changedKeys:['recommendation','sort'],fromRevision:0,toRevision:1});
  assert.equal(JSON.stringify(settingsEvents(s)).includes('MCP'),false,'audit does not store preference values');
  await f.close(s);
  const reopened=f.reopen();assert.deepEqual(reopened.readSettings(),updated);
  const concurrent=f.reopen();
  const next=concurrent.updateSettings({set:{reduceTransparency:true},expectedRevision:1});
  for(const set of [{recommendation:preferences()},{recommendation}])assert.throws(()=>reopened.updateSettings({set,expectedRevision:1}),error=>error.code==='SETTINGS_CONFLICT'&&assert.deepEqual(error.detail.current,next)===undefined);
  assert.deepEqual(reopened.readSettings(),next);
  const reset=reopened.updateSettings({set:{recommendation:preferences()},expectedRevision:2});
  assert.deepEqual(reset,{values:{sort:'time',reduceTransparency:true,recommendation:preferences()},revision:3});
  assert.deepEqual(concurrent.readSettings(),reset);
  assert.deepEqual(reopened.updateSettings({set:{recommendation:preferences()},expectedRevision:3}),reset);
  assert.equal(settingsEvents(reopened).length,3);
});

test('preference write and audit are one transaction, and revisions never exceed safe integers',async t=>{
  const {service:s}=await fixture(t),before=s.readSettings(),audit=s.store.audit.bind(s.store);
  s.store.audit=()=>{throw new Error('simulated preference audit failure');};
  assert.throws(()=>s.updateSettings({set:{recommendation:preferences({interests:['private topic']})},expectedRevision:0}),/audit failure/);
  s.store.audit=audit;assert.deepEqual(s.readSettings(),before);assert.equal(s.store.list('settings').length,0);
  const last={...before,revision:Number.MAX_SAFE_INTEGER};s.store.put('settings','workspace',last);
  assert.deepEqual(s.updateSettings({set:{recommendation:preferences()},expectedRevision:Number.MAX_SAFE_INTEGER}),last);
  assert.throws(()=>s.updateSettings({set:{recommendation:preferences({includeRead:true})},expectedRevision:Number.MAX_SAFE_INTEGER}),error=>error.code==='REVISION_LIMIT');
  assert.deepEqual(s.readSettings(),last);
});

test('recommendation preferences have strict finite bounds and cannot carry credentials or arbitrary state',async t=>{
  const {service:s}=await fixture(t);
  const invalid=[
    null,{},undefined,preferences({interests:['']}),preferences({interests:['  ']}),preferences({interests:['x'.repeat(101)]}),
    preferences({interests:Array.from({length:21},(_,index)=>`topic-${index}`)}),preferences({interests:['topic',' topic ']}),preferences({interests:['Topic','topic']}),
    preferences({sourcePriorities:{alpha:31}}),preferences({sourcePriorities:{alpha:-31}}),preferences({sourcePriorities:{alpha:0.5}}),
    preferences({sourcePriorities:{alpha:NaN}}),preferences({sourcePriorities:{alpha:Infinity}}),preferences({sourcePriorities:{alpha:'10'}}),
    preferences({sourcePriorities:{'*':1}}),preferences({sourcePriorities:{'source with space':1}}),preferences({sourcePriorities:{['a'.repeat(65)]:1}}),
    preferences({sourcePriorities:JSON.parse('{"__proto__":30}')}),preferences({sourcePriorities:Object.fromEntries(Array.from({length:21},(_,index)=>[`source-${index}`,0]))}),
    preferences({excludedSourceIds:['alpha','alpha']}),preferences({excludedSourceIds:['*']}),preferences({excludedSourceIds:[' alpha']}),
    preferences({excludedSourceIds:Array.from({length:101},(_,index)=>`source-${index}`)}),preferences({includeRead:'false'}),
    {...preferences(),token:'not-allowed'}, {...preferences(),learning:true},
  ];
  for(const recommendation of invalid)assert.throws(()=>s.updateSettings({set:{recommendation},expectedRevision:0}),error=>error.name==='ZodError');
  for(const args of [{interests:['']},{sourcePriorities:{alpha:31}},{excludedSourceIds:['*']},{recommendation:preferences()},{includeRead:null}])assert.throws(()=>s.recommend(args),error=>error.name==='ZodError');
  assert.deepEqual(s.readSettings(),defaults);assert.equal(settingsEvents(s).length,0);
  const boundary=preferences({interests:Array.from({length:20},(_,index)=>`${index}`.padEnd(100,'x')),sourcePriorities:Object.fromEntries(Array.from({length:20},(_,index)=>[`source-${index}`,index%2?30:-30])),excludedSourceIds:Array.from({length:100},(_,index)=>`excluded-${index}`),includeRead:true});
  assert.deepEqual(RecommendationValues.parse(boundary),boundary);
  assert.deepEqual(s.updateSettings({set:{recommendation:boundary},expectedRevision:0}).values.recommendation,boundary);
  assert.deepEqual(RecommendationValues.parse(preferences({interests:['  trimmed topic  ']})).interests,['trimmed topic']);
  assert.deepEqual(Recommend.parse({}),{query:'',limit:10},'omitted overrides stay omitted through repeat transport parsing');
});

test('saved owner defaults rank with bounded explicit evidence, filter excluded sources and retain card states',async t=>{
  const {service:s,card}=await fixture(t);
  const alpha=card('alpha','a',{content:'saved topic'}),beta=card('beta','b'),gamma=card('gamma','g'),constructor=card('constructor','prototype-name');
  s.feedback(alpha,{read:true});
  const baseline=s.recommend({});assert.equal(baseline.items.some(entry=>entry.card.id===alpha),false);
  assert.equal(baseline.items.find(entry=>entry.card.id===constructor).score,10,'prototype-like source ID has no implicit priority');
  s.updateSettings({set:{recommendation:preferences({interests:['saved'],sourcePriorities:{alpha:30,beta:-30,constructor:0},excludedSourceIds:['gamma'],includeRead:true})},expectedRevision:0});
  const result=s.recommend({}),byId=Object.fromEntries(result.items.map(entry=>[entry.card.id,entry]));
  assert.deepEqual(ids(result),[alpha,constructor,beta]);
  assert.equal(byId[alpha].score,45);assert.equal(byId[beta].score,-20);assert.equal(byId[constructor].score,10);
  assert.equal(byId[alpha].evidence.sourcePriority,30);assert.equal(byId[beta].evidence.sourcePriority,-30);assert.equal(byId[constructor].evidence.sourcePriority,0);
  assert.ok(byId[alpha].reasons.includes('来源偏好：alpha（+30）'));assert.ok(byId[alpha].reasons.includes('匹配关注词：saved'));
  assert.ok(byId[beta].reasons.includes('来源偏好：beta（-30）'));
  assert.equal(byId[gamma],undefined);assert.equal(s.getCard(gamma).state.dismissed,false,'source exclusion does not change card state');
  assert.match(result.method,/不是语义模型推断/);
  assert.deepEqual(s.recommend({}).items,result.items,'old source timestamps make repeated rankings deterministic');
  s.feedback(alpha,{dismissed:true});assert.equal(ids(s.recommend({})).includes(alpha),false,'saved includeRead never bypasses dismissal');
  s.feedback(beta,{snoozedUntil:'2099-01-01T00:00:00Z'});assert.equal(ids(s.recommend({})).includes(beta),false);
});

test('per-call empty collections and false replace saved fields without mutation or implicit learning',async t=>{
  const {service:s,card}=await fixture(t);
  const alpha=card('alpha','a',{content:'saved'}),beta=card('beta','b'),gamma=card('gamma','g');s.feedback(alpha,{read:true});
  const saved=s.updateSettings({set:{recommendation:preferences({interests:['saved'],sourcePriorities:{alpha:30,beta:-30},excludedSourceIds:['gamma'],includeRead:true})},expectedRevision:0});
  const audits=settingsEvents(s).length;
  const overridden=s.recommend({interests:[],sourcePriorities:{},excludedSourceIds:[],includeRead:false});
  assert.deepEqual(new Set(ids(overridden)),new Set([beta,gamma]));
  assert.ok(overridden.items.every(entry=>entry.score===10&&!Object.hasOwn(entry.evidence,'sourcePriority')&&!entry.reasons.some(reason=>reason.startsWith('匹配关注词'))));
  const partial=s.recommend({sourcePriorities:{beta:30}});
  assert.equal(partial.items[0].card.id,beta);assert.equal(partial.items.find(entry=>entry.card.id===alpha).score,15,'unmentioned interests and includeRead still inherit');
  assert.equal(ids(partial).includes(gamma),false,'unmentioned exclusion still inherits');
  const clearedInterests=s.recommend({interests:[]});assert.equal(clearedInterests.items.find(entry=>entry.card.id===alpha).score,30);
  assert.equal(s.recommend({query:'saved',interests:['saved']}).items.find(entry=>entry.card.id===alpha).score,45,'duplicate query/interest tokens cannot amplify the same evidence');
  assert.deepEqual(s.readSettings(),saved);assert.equal(settingsEvents(s).length,audits);
  s.feedback(beta,{bookmarked:true});s.search({query:'saved'});s.getCard(alpha);
  assert.deepEqual(s.readSettings(),saved,'reading, searching and feedback never learn or mutate preferences');
  assert.equal(s.recommend({}).items[0].card.id,alpha,'the next call returns to saved defaults');
});

test('restricted recommendations never load or expose owner preferences and keep evidence-closure bounds',async t=>{
  const f=await fixture(t,{principals:[{id:'reader',enabled:true,tokenEnv:'FIXTURE_READER',tools:['qg_search','qg_get_card','qg_recommend'],resources:{sourceIds:['allowed']}}]});
  const {service:s,card}=f;
  const first=card('allowed','one',{content:'topic appears in authorized source content'}),read=card('allowed','read'),hidden=card('private','hidden');
  s.feedback(read,{read:true});const tainted=card('allowed','tainted',{evidenceIds:[hidden]});
  s.updateAnnotation({cardId:first,set:{note:'OWNER_PRIVATE_ANNOTATION'},expectedRevision:0});
  const actor=s.access.authenticate(f.env.FIXTURE_READER,{transport:'test'}),view=s.access.facade(actor),before=view.recommend({}).items;
  assert.deepEqual(before.map(entry=>entry.card.id),[first]);
  const saved=s.updateSettings({set:{recommendation:preferences({interests:['topic','OWNER_PRIVATE_INTEREST'],sourcePriorities:{allowed:30,'private-owner-source':-30},excludedSourceIds:['allowed','private-exclusion'],includeRead:true})},expectedRevision:0});
  assert.deepEqual(s.recommend({}).items.map(entry=>entry.card.id),[hidden]);
  const get=s.store.get.bind(s.store);s.store.get=(kind,id)=>{assert.notEqual(kind,'settings','restricted recommendation must not even load owner preferences');return get(kind,id);};
  let after,overridden;
  try {
    after=view.recommend({}).items;
    overridden=view.recommend({interests:['topic'],sourcePriorities:{allowed:-30,private:30},excludedSourceIds:[],includeRead:true}).items;
  } finally {s.store.get=get;}
  assert.deepEqual(after,before,'owner exclusions, read inclusion, interests and weights have zero influence');
  assert.deepEqual(new Set(overridden.map(entry=>entry.card.id)),new Set([first,read]));
  assert.ok(overridden.every(entry=>entry.evidence.sourcePriority===-30));
  assert.equal(overridden.some(entry=>entry.card.id===hidden||entry.card.id===tainted),false,'explicit overrides cannot extend card visibility');
  const serialized=JSON.stringify({after,overridden});
  for(const privateValue of ['OWNER_PRIVATE_INTEREST','OWNER_PRIVATE_ANNOTATION','private-owner-source','private-exclusion'])assert.equal(serialized.includes(privateValue),false);
  assert.equal(typeof view.readSettings,'undefined');assert.equal(typeof view.updateSettings,'undefined');
  for(const method of [()=>s.readSettings(),()=>s.updateSettings({set:{recommendation:preferences()},expectedRevision:saved.revision})])assert.throws(()=>s.access.run(actor,method),error=>error.code==='ACCESS_DENIED'&&!JSON.stringify(publicError(error)).includes('OWNER_PRIVATE'));
  assert.deepEqual(s.readSettings(),saved);
});

test('preference weights keep deterministic tie breaks, source diversity and event urgency',async t=>{
  const {service:s,card}=await fixture(t);
  const same=Array.from({length:3},(_,index)=>card('alpha',`alpha-${index}`));const diverse=card('beta','other');
  s.updateSettings({set:{recommendation:preferences({sourcePriorities:{alpha:30,beta:-30}})},expectedRevision:0});
  const ranked=s.recommend({}).items;
  const ordered=[...same].sort((a,b)=>a.localeCompare(b));
  assert.deepEqual(ranked.map(entry=>entry.card.id),[ordered[0],ordered[1],diverse,ordered[2]],'existing diversity defers the third nonurgent source card');
  assert.deepEqual(ranked[2].evidence.sourceDiversity,{scoreRank:4,displayRank:3});
  assert.deepEqual(ranked[3].evidence.sourceDiversity,{scoreRank:3,displayRank:4});
  assert.match(ranked[2].reasons.at(-1),/来源多样性/);assert.match(ranked[3].reasons.at(-1),/来源多样性/);
  assert.ok(s.recommend({limit:3}).items[2].reasons.some(reason=>reason.includes('来源多样性')),'promotion is explained even when the deferred card is outside the result limit');
  const event=card('beta','event',{kind:'event',start:new Date(Date.now()+30*60000).toISOString(),end:new Date(Date.now()+90*60000).toISOString()});
  const urgent=s.recommend({}).items[0];assert.equal(urgent.card.id,event);assert.equal(urgent.score,80);assert.ok(urgent.reasons.includes('一小时内开始'));
});

test('an old read card without a score boost still has an honest eligibility explanation',async t=>{
  const {service:s,card}=await fixture(t),id=card('archive','old');s.feedback(id,{read:true});
  const result=s.recommend({includeRead:true}).items[0];
  assert.equal(result.score,0);assert.deepEqual(result.reasons,['符合当前筛选条件；没有额外加分']);
  assert.equal(result.evidence.cardId,id);assert.equal(result.evidence.sourceId,'archive');
});
