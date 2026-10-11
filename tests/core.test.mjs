import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigSchema } from '../server/config.mjs';
import { Service } from '../server/service.mjs';
import { publicError } from '../server/schemas.mjs';

async function create(t,connectors=[],options={}) {
  const dataDir=await mkdtemp(join(tmpdir(),'qg-test-'));
  const service=new Service(ConfigSchema.parse({dataDir,connectors}),options);
  t.after(async()=>{await service.close();await rm(dataDir,{recursive:true,force:true});});
  return service;
}
const item={externalId:'1',title:'项目方向',content:'讨论 MCP 与信息流',tags:['MCP']};

test('stable source-scoped IDs, content updates, state persistence and full content',async t=>{
  const s=await create(t);
  const a=s.ingest({sourceId:'notes',items:[item]}).items[0];
  s.feedback(a.id,{read:true,bookmarked:true});
  const same=s.ingest({sourceId:'notes',items:[{...item,content:'更新后的正文'}]}).items[0];
  assert.equal(a.id,same.id);assert.equal(s.getCard(a.id).state.read,true);
  assert.equal(s.search({query:'更新'}).total,1);
  const other=s.ingest({sourceId:'calendar',items:[item]}).items[0];assert.notEqual(other.id,a.id);
  assert.equal(s.recommend({}).items.some(x=>x.card.id===a.id),false);
  assert.equal(s.recommend({includeRead:true}).items.some(x=>x.card.id===a.id),true);
  assert.throws(()=>s.feedback(a.id,{sourceId:'evil'}));
  assert.throws(()=>s.ingest({sourceId:'codex',items:[{...item,evidenceIds:['missing']}]}),/证据/);
});

test('event urgency, reading feedback and snooze drive explainable ranking',async t=>{
  const s=await create(t),start=new Date(Date.now()+600000).toISOString(),end=new Date(Date.now()+3600000).toISOString();
  const cards=s.ingest({sourceId:'calendar',items:[item,{externalId:'event',title:'十分钟后会议',kind:'event',start,end}]}).items;
  const ranked=s.recommend({interests:['MCP']});assert.equal(ranked.items[0].card.id,cards[1].id);assert.ok(ranked.items[0].reasons.includes('一小时内开始'));
  assert.ok(ranked.items[0].reasons.includes('最近采集，来源更新时间未知'));
  s.feedback(cards[1].id,{snoozedUntil:new Date(Date.now()+1800000).toISOString()});assert.equal(s.recommend({}).items.length,1);
  s.feedback(cards[0].id,{dismissed:true});assert.equal(s.recommend({}).items.length,0);
});

test('workflow validates graph, resumes completed steps and persists evidence-based result',async t=>{
  const s=await create(t);
  assert.throws(()=>s.createWorkflow({goal:'bad',steps:[{id:'a',operation:'search',dependsOn:['b'],input:{}},{id:'b',operation:'search',dependsOn:['a'],input:{}}]}),/循环/);
  let failures=1,calls=0;const original=s.recommend.bind(s);
  s.recommend=args=>{calls++;if(failures--)throw new Error('simulated');return original(args);};
  const workflow=s.createWorkflow({goal:'采集再推荐',steps:[{id:'capture',operation:'ingest',input:{sourceId:'notes',items:[item]}},{id:'rank',operation:'recommend',dependsOn:['capture'],input:{}},{id:'summary',operation:'ingest',dependsOn:['capture','rank'],input:{sourceId:'codex',items:[{externalId:'summary',title:'跨源简报',kind:'suggestion',evidenceIds:{$ref:'capture.cardIds'}}]}}]});
  s.startWorkflow(workflow.id);await s.running.get(workflow.id);
  assert.equal(s.getWorkflow(workflow.id).status,'failed');const finished=s.getWorkflow(workflow.id).steps[0].finishedAt;
  s.startWorkflow(workflow.id);await s.running.get(workflow.id);
  const completed=s.getWorkflow(workflow.id);assert.equal(completed.status,'completed');assert.equal(completed.steps[0].finishedAt,finished);assert.equal(calls,2);
  assert.equal(s.search({sourceIds:['codex']}).items[0].evidenceIds.length,1);
  assert.equal(s.store.history().some(x=>x.event==='workflow_completed'),true);
});

test('writes need explicit matching approval, are disabled by default, and are idempotent',async t=>{
  let writes=0;
  const s=await create(t,[{id:'calendar',label:'日历',type:'google-calendar',allowWrites:true}],{env:{GOOGLE_ACCESS_TOKEN:'secret-not-in-results'},fetchImpl:async(url,options)=>{writes++;assert.equal(options.method,'POST');return Response.json({id:'created',htmlLink:'https://calendar.google.com/event?id=created'});}});
  const payload={summary:'项目会',start:{dateTime:'2026-10-11T09:00:00+08:00'},end:{dateTime:'2026-10-11T10:00:00+08:00'}};
  const action=s.prepareAction({connectorId:'calendar',action:'create_event',payload,idempotencyKey:'meeting-1'});
  assert.equal(writes,0);
  assert.equal(s.prepareAction({connectorId:'calendar',action:'create_event',payload,idempotencyKey:'meeting-1'}).id,action.id);
  assert.throws(()=>s.prepareAction({connectorId:'calendar',action:'create_event',payload:{...payload,summary:'changed'},idempotencyKey:'meeting-1'}),/幂等/);
  await assert.rejects(()=>s.commitAction({actionId:action.id,expectedDigest:action.digest,approvalToken:action.approvalToken,approved:false}),/批准/);
  const args={actionId:action.id,expectedDigest:action.digest,approvalToken:action.approvalToken,approved:true};
  await s.commitAction(args);await s.commitAction(args);assert.equal(writes,1);
  assert.ok(!JSON.stringify(s.store.history()).includes('secret-not-in-results'));
  assert.throws(()=>s.prepareAction({connectorId:'calendar',action:'create_event',payload:{...payload,attendees:[{email:'x@example.com'}]},idempotencyKey:'attendees'}));
});

test('uncertain writes cannot be replayed; concurrent writers claim at most once',async t=>{
  let count=0;
  const s=await create(t,[{id:'calendar',label:'日历',type:'google-calendar',allowWrites:true}],{env:{GOOGLE_ACCESS_TOKEN:'token'},fetchImpl:async()=>{count++;await new Promise(r=>setTimeout(r,30));throw new Error('secret upstream detail');}});
  const action=s.prepareAction({connectorId:'calendar',action:'create_event',payload:{summary:'会议',start:{dateTime:'2026-10-11T09:00:00Z'},end:{dateTime:'2026-10-11T10:00:00Z'}},idempotencyKey:'once'});
  const args={actionId:action.id,expectedDigest:action.digest,approvalToken:action.approvalToken,approved:true};
  const results=await Promise.allSettled([s.commitAction(args),s.commitAction(args)]);
  assert.equal(count,1);assert.ok(results.every(x=>x.status==='rejected'));assert.equal(s.getAction(action.id).status,'needs_review');
  await assert.rejects(()=>s.commitAction(args),/重复提交/);assert.equal(count,1);
  assert.equal(publicError(new Error('private token')).message.includes('private'),false);
});

test('SQLite retains cards across reopen and rejects accidental connector configuration',async t=>{
  const s=await create(t);s.ingest({sourceId:'notes',items:[item]});
  const second=new Service(s.connectors.config);assert.equal(second.search({}).total,1);await second.close();
  assert.throws(()=>ConfigSchema.parse({connectors:[{id:'m',label:'m',type:'mcp',url:'http://10.1.1.1/mcp'}]}));
  assert.throws(()=>ConfigSchema.parse({connectors:[{id:'m',label:'m',type:'mcp',url:'https://example.com/mcp',readTools:['delete'],writeTools:['delete']}]}));
});
