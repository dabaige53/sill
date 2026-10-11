import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigSchema,JobsConfigSchema,PRINCIPAL_TOOLS } from '../server/config.mjs';
import { Service } from '../server/service.mjs';
import { JobCreate,JobUpdate,JobRun,JobSchedule,JOB_REGISTRY } from '../server/jobs.mjs';

const START=Date.parse('2026-10-11T00:00:00Z');
class FakeClock {
  time=START;timers=new Map();sequence=0;
  now=()=>this.time;
  setTimeout=(fn,delay)=>this.add(fn,delay,0);
  setInterval=(fn,delay)=>this.add(fn,delay,delay);
  clearTimeout=id=>this.timers.delete(id);
  clearInterval=id=>this.timers.delete(id);
  add(fn,delay,interval){const id={id:++this.sequence,unref(){}};this.timers.set(id,{fn,at:this.time+delay,interval});return id;}
  advance(ms,{fire=true}={}){
    const end=this.time+ms;
    if(fire)for(let count=0;;count++){
      if(count>100000)throw Error('Fake timer runaway');
      const next=[...this.timers].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;
      const [id,timer]=next;this.time=timer.at;if(timer.interval)timer.at+=timer.interval;else this.timers.delete(id);timer.fn();
    }
    this.time=end;
  }
}
async function until(check){for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setImmediate(resolve));}assert.fail('Condition did not settle');}
function gate(){let release;const promise=new Promise(resolve=>{release=resolve;});return {promise,release};}
async function fixture(t,{jobs={},jobsCheckpoint,clock=new FakeClock(),access}={}){
  const dir=await mkdtemp(join(tmpdir(),'qg-jobs-')),services=[];let fetches=0;
  const config=ConfigSchema.parse({dataDir:dir,jobs,...(access?{access}:{})});
  const open=(overrides={})=>{const service=new Service(config,{jobsClock:clock,jobsCheckpoint,env:{FIXTURE_AGENT:'fixture-job-agent-token-'.repeat(3)},fetchImpl:async()=>{fetches++;throw Error('Forbidden external request');},...overrides});services.push(service);return service;};
  const service=open();
  t.after(async()=>{for(const s of services)if(!s.jobs.closed)await s.close();assert.equal(clock.timers.size,0,'No worker/watchdog timers survive close');assert.equal(fetches,0);await rm(dir,{recursive:true,force:true});});
  return {s:service,open,clock,config};
}
const create=(s,key='create-one',extra={})=>s.createJob({kind:'data-quality-digest',schedule:{intervalSeconds:60,startAt:new Date(START).toISOString()},idempotencyKey:key,...extra});
const getRun=(s,jobId,runId)=>s.getJob({jobId}).runs.find(run=>run.id===runId);
const note=(s,id='one',content='Local source content')=>s.createNote({title:`Title ${id}`,content,idempotencyKey:`note-${id}`});

test('strict finite schemas, safe defaults, bounded configuration and explicit UTC anchor',()=>{
  assert.equal(ConfigSchema.parse({}).jobs.enabled,false);
  assert.equal(JobCreate.parse({kind:'data-quality-digest',schedule:{intervalSeconds:60,startAt:'2026-10-11T08:00:00+08:00'},idempotencyKey:'key'}).paused,true);
  assert.deepEqual(JOB_REGISTRY.map(item=>item.kind),['recommendation-snapshot','data-quality-digest']);
  for(const schedule of [{intervalSeconds:59,startAt:'2026-10-11T00:00:00Z'},{intervalSeconds:2592001,startAt:'2026-10-11T00:00:00Z'},{intervalSeconds:60,startAt:'2026-10-11T00:00:00'},{intervalSeconds:60,startAt:'2026-10-11T00:00:00Z',cron:'* * * * *'},{intervalSeconds:60,startAt:'2026-10-11T00:00:00Z',timezone:'Pacific/Auckland'}])assert.equal(JobSchedule.safeParse(schedule).success,false);
  const valid={kind:'data-quality-digest',schedule:{intervalSeconds:60,startAt:'2026-10-11T00:00:00Z'},idempotencyKey:'key'};
  for(const extra of [{kind:'shell'},{command:'echo unsafe'},{tool:'qg_collect'},{provider:'openai'},{arguments:{}},{credentials:'secret'},{owner:'owner'},{maxAttempts:2},{retry:true}])assert.equal(JobCreate.safeParse({...valid,...extra}).success,false);
  assert.equal(JobRun.safeParse({jobId:'job_one',idempotencyKey:'key',actor:{kind:'owner'}}).success,false);
  assert.equal(JobUpdate.safeParse({jobId:'job_one',expectedRevision:1,set:{}}).success,false);
  for(const jobs of [{enabled:'true'},{maxJobs:101},{maxRuns:1001},{maxConcurrency:9},{maxManualReceipts:10001},{maxCards:5001},{maxInputBytes:33554433},{maxResultBytes:65537},{timeoutMs:120001},{tickMs:49},{leaseMs:99},{maxRuns:1,maxConcurrency:2},{handlers:{}}])assert.equal(JobsConfigSchema.safeParse(jobs).success,false);
});

test('disabled worker is timer-free; manual runs work paused and disabled without external calls',async t=>{
  const {s,clock}=await fixture(t);note(s);assert.equal(clock.timers.size,0);
  const job=create(s);assert.equal(job.paused,true);assert.equal(job.nextRunAt,null);assert.deepEqual(s.jobs.tick(),[]);
  const accepted=s.runJob({jobId:job.id,idempotencyKey:'manual'});assert.equal(accepted.status,'running');assert.equal(accepted.attempt,1);
  await s.jobs.drain();const done=getRun(s,job.id,accepted.id);assert.equal(done.status,'completed');assert.equal(done.result.complete,true);assert.equal(done.result.cardsScanned,1);
  assert.equal(done.result.counts.missingUrl,1);assert.equal(clock.timers.size,0);assert.equal(s.getJob({jobId:job.id}).job.paused,true);
  assert.equal(s.listJobs({}).workerEnabled,false);
});

test('job create and manual run retries are durable, payload-specific and exactly once',async t=>{
  const {s,open}=await fixture(t),job=create(s);assert.deepEqual(create(s),job);
  assert.throws(()=>create(s,'create-one',{title:'Different'}),error=>error.code==='JOB_IDEMPOTENCY_CONFLICT');
  const run=s.runJob({jobId:job.id,idempotencyKey:'manual'});assert.equal(s.runJob({jobId:job.id,idempotencyKey:'manual'}).id,run.id);await s.jobs.drain();
  const other=open();assert.equal(create(other).id,job.id);assert.equal(other.runJob({jobId:job.id,idempotencyKey:'manual'}).status,'completed');
  const second=create(s,'create-two');assert.throws(()=>s.runJob({jobId:second.id,idempotencyKey:'manual'}),error=>error.code==='JOB_IDEMPOTENCY_CONFLICT');
  assert.equal(s.store.list('job-run').length,1);
});

test('CAS updates preserve unrelated edits, reject stale writes, and normalize timezone offsets',async t=>{
  const {s,open,clock}=await fixture(t),job=create(s,'create',{schedule:{intervalSeconds:60,startAt:'2026-10-11T08:00:00+08:00'}}),other=open();
  assert.equal(job.schedule.startAt,'2026-10-11T00:00:00.000Z');
  const updated=s.updateJob({jobId:job.id,set:{title:'New title'},expectedRevision:1});assert.equal(updated.revision,2);
  assert.throws(()=>other.updateJob({jobId:job.id,set:{paused:false},expectedRevision:1}),error=>error.code==='JOB_CONFLICT'&&error.detail.current.title==='New title');
  assert.equal(s.updateJob({jobId:job.id,set:{title:'New title'},expectedRevision:2}).revision,2);
  clock.advance(90001);const active=other.updateJob({jobId:job.id,set:{paused:false},expectedRevision:2});assert.equal(active.nextRunAt,'2026-10-11T00:02:00.000Z');assert.equal(active.title,'New title');
});

test('transactional occurrence claims deduplicate two workers and coalesce missed UTC intervals',async t=>{
  const {s,open,clock}=await fixture(t,{jobs:{enabled:true}}),job=create(s,'create',{paused:false}),other=open();
  const [first]=s.jobs.tick();assert.equal(first.scheduledFor,'2026-10-11T00:00:00.000Z');assert.deepEqual(other.jobs.tick(),[]);await s.jobs.drain();
  assert.deepEqual(s.jobs.tick(),[]);clock.advance(3*60*60*1000+17000,{fire:false});
  const [second]=other.jobs.tick();assert.equal(second.scheduledFor,'2026-10-11T03:00:00.000Z');assert.deepEqual(s.jobs.tick(),[]);await other.jobs.drain();
  assert.equal(s.getJob({jobId:job.id}).total,2);assert.deepEqual(other.jobs.tick(),[]);
  assert.equal(s.getJob({jobId:job.id}).job.nextRunAt,'2026-10-11T03:01:00.000Z');
});

test('worker scheduling uses injected timers only and never catches up from time spent paused',async t=>{
  const {s,clock}=await fixture(t,{jobs:{enabled:true}}),job=create(s);assert.equal(clock.timers.size,1);
  clock.advance(120000);await s.jobs.drain();assert.equal(s.getJob({jobId:job.id}).total,0);
  clock.advance(1);s.updateJob({jobId:job.id,set:{paused:false},expectedRevision:1});
  clock.advance(58999);await s.jobs.drain();assert.equal(s.getJob({jobId:job.id}).total,0);
  clock.advance(1000);await s.jobs.drain();assert.equal(s.getJob({jobId:job.id}).total,1);
});

test('per-job overlap and global concurrency are enforced across workers without queue buildup',async t=>{
  const wait=gate();let entered=0;
  const {s,open}=await fixture(t,{jobs:{maxConcurrency:1},jobsCheckpoint:async stage=>{if(stage==='before-read'){entered++;await wait.promise;}}}),job=create(s),other=open(),second=create(s,'two');
  const run=s.runJob({jobId:job.id,idempotencyKey:'manual'});await until(()=>entered===1);
  assert.throws(()=>other.runJob({jobId:job.id,idempotencyKey:'other'}),error=>error.code==='JOB_BUSY');
  assert.throws(()=>other.runJob({jobId:second.id,idempotencyKey:'two'}),error=>error.code==='JOB_CONCURRENCY_LIMIT');
  assert.equal(s.store.count('job-manual-key'),1);assert.equal(s.store.count('job-run'),1);
  wait.release();await s.jobs.drain();assert.equal(getRun(s,job.id,run.id).status,'completed');
});

test('pausing never cancels an in-flight run, and explicit manual run remains available',async t=>{
  const wait=gate();let entered=false;
  const {s,clock}=await fixture(t,{jobs:{enabled:true},jobsCheckpoint:async stage=>{if(stage==='before-read'){entered=true;await wait.promise;}}}),job=create(s,'job',{paused:false});
  const [run]=s.jobs.tick();await until(()=>entered);s.updateJob({jobId:job.id,set:{paused:true},expectedRevision:1});
  assert.equal(getRun(s,job.id,run.id).status,'running');wait.release();await s.jobs.drain();assert.equal(getRun(s,job.id,run.id).status,'completed');
  clock.advance(120000);assert.equal(s.getJob({jobId:job.id}).total,1);
  const manual=s.runJob({jobId:job.id,idempotencyKey:'manual'});await s.jobs.drain();assert.equal(getRun(s,job.id,manual.id).status,'completed');
});

test('cross-worker cancellation wins over late operation result and persists without a retry',async t=>{
  const wait=gate();let entered=false,signal;
  const {s,open,clock}=await fixture(t,{jobsCheckpoint:async (stage,context)=>{if(stage==='before-commit'){entered=true;signal=context.signal;await wait.promise;}}}),job=create(s),other=open();
  const run=s.runJob({jobId:job.id,idempotencyKey:'manual'});await until(()=>entered);
  assert.equal(other.cancelJobRun({runId:run.id}).status,'cancelled');clock.advance(1000);await s.jobs.drain();assert.equal(signal.aborted,true);
  wait.release();await new Promise(resolve=>setImmediate(resolve));const done=getRun(s,job.id,run.id);assert.equal(done.status,'cancelled');assert.equal(done.result,null);
  assert.equal(other.runJob({jobId:job.id,idempotencyKey:'manual'}).status,'cancelled');assert.equal(other.cancelJobRun({runId:run.id}).status,'cancelled');
});

test('timeout races uncooperative checkpoint and blocks late result; no timer or zombie remains',async t=>{
  const wait=gate();let entered=false;
  const {s,clock}=await fixture(t,{jobs:{timeoutMs:100},jobsCheckpoint:async stage=>{if(stage==='before-read'){entered=true;await wait.promise;}}}),job=create(s),run=s.runJob({jobId:job.id,idempotencyKey:'manual'});
  await until(()=>entered);clock.advance(100);await s.jobs.drain();assert.equal(getRun(s,job.id,run.id).status,'timed_out');assert.equal(clock.timers.size,0);
  wait.release();await new Promise(resolve=>setImmediate(resolve));assert.equal(getRun(s,job.id,run.id).result,null);assert.equal(s.runJob({jobId:job.id,idempotencyKey:'manual'}).status,'timed_out');
});

test('expired leases are interrupted on restart, fenced forever, and only later occurrences can run',async t=>{
  const wait=gate();let entered=false;
  const {s,open,clock}=await fixture(t,{jobs:{enabled:true,leaseMs:200,timeoutMs:10000},jobsCheckpoint:async stage=>{if(stage==='before-read'){entered=true;await wait.promise;}}}),job=create(s,'job',{paused:false}),[run]=s.jobs.tick();
  await until(()=>entered);clock.advance(500,{fire:false});const other=open({jobsCheckpoint:undefined});assert.equal(getRun(other,job.id,run.id).status,'interrupted');assert.deepEqual(other.jobs.tick(),[]);
  wait.release();await s.jobs.drain();assert.equal(getRun(other,job.id,run.id).status,'interrupted');assert.equal(getRun(other,job.id,run.id).result,null);
  clock.advance(59500,{fire:false});const [next]=other.jobs.tick();await other.jobs.drain();assert.equal(next.scheduledFor,'2026-10-11T00:01:00.000Z');assert.equal(getRun(other,job.id,next.id).status,'completed');
});

test('a live second worker does not steal or interrupt an unexpired lease',async t=>{
  const wait=gate();let entered=false;
  const {s,open}=await fixture(t,{jobsCheckpoint:async stage=>{if(stage==='before-read'){entered=true;await wait.promise;}}}),job=create(s),run=s.runJob({jobId:job.id,idempotencyKey:'manual'});await until(()=>entered);
  const other=open();assert.equal(getRun(other,job.id,run.id).status,'running');assert.throws(()=>other.runJob({jobId:job.id,idempotencyKey:'different'}),error=>error.code==='JOB_BUSY');wait.release();await s.jobs.drain();
});

test('graceful close interrupts its runs and drains ignoring uncooperative work',async t=>{
  let entered=false;
  const {s,open,clock}=await fixture(t,{jobs:{enabled:true},jobsCheckpoint:async stage=>{if(stage==='before-read'){entered=true;await new Promise(()=>{});}}}),job=create(s),run=s.runJob({jobId:job.id,idempotencyKey:'manual'});await until(()=>entered);
  await s.close();assert.equal(clock.timers.size,0);const other=open({jobsCheckpoint:undefined});assert.equal(getRun(other,job.id,run.id).status,'interrupted');assert.equal(other.runJob({jobId:job.id,idempotencyKey:'manual'}).status,'interrupted');
});

test('history and results are bounded but manual receipts survive pruning and exhaustion',async t=>{
  const {s,open}=await fixture(t,{jobs:{maxRuns:2,maxConcurrency:1,maxManualReceipts:3}}),job=create(s),ids=[];
  for(let i=0;i<3;i++){ids.push(s.runJob({jobId:job.id,idempotencyKey:`run-${i}`}).id);await s.jobs.drain();}
  assert.equal(s.store.count('job-run'),2);assert.equal(s.store.count('job-manual-key'),3);
  const history=s.getJob({jobId:job.id,limit:1});assert.equal(history.runs[0].id,ids[2]);assert.equal(history.total,2);assert.equal(history.nextOffset,1);
  assert.equal(s.getJob({jobId:job.id,limit:1,offset:1}).runs[0].id,ids[1]);assert.equal(s.getJob({jobId:job.id,offset:99}).runs.length,0);
  const other=open();assert.throws(()=>other.runJob({jobId:job.id,idempotencyKey:'run-0'}),error=>error.code==='JOB_RUN_PRUNED');
  assert.equal(other.runJob({jobId:job.id,idempotencyKey:'run-2'}).id,ids[2]);
  assert.throws(()=>other.runJob({jobId:job.id,idempotencyKey:'run-3'}),error=>error.code==='JOB_RECEIPT_LIMIT');assert.equal(other.store.count('job-run'),2);
});

test('job cap is durable, list pagination exact, and create replay works at capacity',async t=>{
  const {s,open}=await fixture(t,{jobs:{maxJobs:2}}),a=create(s,'a'),b=create(s,'b');assert.equal(create(s,'a').id,a.id);
  assert.throws(()=>create(open(),'c'),error=>error.code==='JOB_LIMIT');
  const first=s.listJobs({limit:1}),second=s.listJobs({limit:1,offset:1});assert.equal(first.total,2);assert.equal(first.nextOffset,1);assert.equal(second.nextOffset,null);assert.deepEqual(new Set([...first.jobs,...second.jobs].map(job=>job.id)),new Set([a.id,b.id]));
});

test('count and byte limits refuse before allocating an unbounded card list or recommending',async t=>{
  for(const jobs of [{maxCards:1},{maxInputBytes:1024}]){
    const {s}=await fixture(t,{jobs});note(s,'one','x'.repeat(1200));note(s,'two');
    let lists=0,recommendations=0;const list=s.store.list.bind(s.store);s.store.list=kind=>{if(kind==='card')lists++;return list(kind);};s.recommend=()=>{recommendations++;throw Error('Should not read');};
    for(const kind of ['recommendation-snapshot','data-quality-digest']){const job=create(s,kind,{kind}),run=s.runJob({jobId:job.id,idempotencyKey:kind});await s.jobs.drain();const done=getRun(s,job.id,run.id);assert.equal(done.status,'failed');assert.equal(done.error.code,'JOB_INPUT_LIMIT');assert.equal(done.result,null);}
    assert.equal(lists,0);assert.equal(recommendations,0);
  }
});

test('recommendation snapshots retain bounded IDs/titles/rules without card bodies or annotations',async t=>{
  const {s}=await fixture(t);const card=note(s,'one','PRIVATE_FULL_BODY_SHOULD_NOT_BE_STORED');s.updateAnnotation({cardId:card.id,set:{note:'PRIVATE_ANNOTATION'},expectedRevision:0});
  const job=create(s,'rec',{kind:'recommendation-snapshot'}),run=s.runJob({jobId:job.id,idempotencyKey:'rec'});await s.jobs.drain();const done=getRun(s,job.id,run.id);assert.equal(done.status,'completed');assert.equal(done.result.items[0].cardId,card.id);assert.ok(done.result.items[0].reasons.length>0);
  const saved=JSON.stringify(s.store.list('job-run'));assert.equal(saved.includes('PRIVATE_FULL_BODY'),false);assert.equal(saved.includes('PRIVATE_ANNOTATION'),false);assert.equal(Object.hasOwn(done,'owner'),false);assert.equal(Object.hasOwn(done,'claimToken'),false);
});

test('output caps fail explicitly and arbitrary thrown details are never exposed or audited',async t=>{
  const {s}=await fixture(t,{jobs:{maxResultBytes:1024}});for(let i=0;i<10;i++)s.createNote({title:'Long title '.repeat(20),content:'content',idempotencyKey:`n-${i}`});
  const job=create(s,'output'),run=s.runJob({jobId:job.id,idempotencyKey:'output'});await s.jobs.drain();assert.equal(getRun(s,job.id,run.id).error.code,'JOB_OUTPUT_LIMIT');assert.equal(getRun(s,job.id,run.id).result,null);
  s.jobs.testCheckpoint=()=>{throw Error('PRIVATE_SECRET_MUST_NOT_LEAK');};const failed=s.runJob({jobId:job.id,idempotencyKey:'error'});await s.jobs.drain();assert.equal(getRun(s,job.id,failed.id).error.code,'JOB_INTERNAL_ERROR');
  assert.equal(JSON.stringify([s.store.list('job-run'),s.store.history()]).includes('PRIVATE_SECRET'),false);
});

test('claim failure rolls back history pruning, run receipt, watermark and dispatch',async t=>{
  const {s}=await fixture(t,{jobs:{enabled:true}}),job=create(s,'job',{paused:false}),audit=s.store.audit.bind(s.store);let checkpoints=0;s.jobs.testCheckpoint=()=>{checkpoints++;};
  s.store.audit=(event,detail)=>{if(event==='job_started')throw Error('Injected claim failure');return audit(event,detail);};
  assert.throws(()=>s.runJob({jobId:job.id,idempotencyKey:'manual'}),/Injected claim failure/);assert.throws(()=>s.jobs.tick(),/Injected claim failure/);
  assert.equal(checkpoints,0);assert.equal(s.store.count('job-run'),0);assert.equal(s.store.count('job-manual-key'),0);assert.equal(s.getJob({jobId:job.id}).job.activeRunId,null);assert.equal(s.getJob({jobId:job.id}).job.nextRunAt,'2026-10-11T00:00:00.000Z');
});

test('completion persistence failure atomically rolls back result and leaves a safe failed run',async t=>{
  const {s}=await fixture(t),job=create(s),audit=s.store.audit.bind(s.store);
  s.store.audit=(event,detail)=>{if(event==='job_finished'&&detail.status==='completed')throw Error('Injected terminal failure');return audit(event,detail);};
  const run=s.runJob({jobId:job.id,idempotencyKey:'manual'});await s.jobs.drain();const done=getRun(s,job.id,run.id);assert.equal(done.status,'failed');assert.equal(done.result,null);assert.equal(s.getJob({jobId:job.id}).job.activeRunId,null);
});

test('owner-only methods reject all restricted principals and background audit uses server-derived actor',async t=>{
  const access={principals:[{id:'agent',enabled:true,tokenEnv:'FIXTURE_AGENT',tools:[...PRINCIPAL_TOOLS],resources:{sourceIds:['local-notes'],ingestSourceIds:[]}}]};
  const {s}=await fixture(t,{jobs:{enabled:true},access}),job=create(s,'job',{paused:false});
  const actor=s.access.authenticate('fixture-job-agent-token-'.repeat(3),{ownerToken:'fixture-job-owner-token-'.repeat(3),transport:'http'}),facade=s.access.facade(actor);
  for(const [method,args] of [['listJobs',{}],['createJob',{}],['updateJob',{}],['runJob',{}],['getJob',{}],['cancelJobRun',{}]]){assert.equal(facade[method],undefined);assert.throws(()=>s.access.run(actor,()=>s[method](args)),error=>error.code==='ACCESS_DENIED');}
  // Explicitly run tick under a restricted request context to prove it creates
  // its own server actor instead of inheriting client identity into timers.
  s.access.run(actor,()=>s.jobs.tick());await s.jobs.drain();const events=s.store.history(100).filter(row=>['job_started','job_finished'].includes(row.event));assert.equal(events.length,2);
  for(const event of events){assert.equal(event.detail.actorKind,'owner');assert.equal(event.detail.actorId,'owner');assert.equal(event.detail.transport,'stdio');assert.equal(event.detail.executor,'registered-local-job');}
  assert.equal(s.getJob({jobId:job.id}).runs[0].status,'completed');
});

test('quality digest counts model summaries even when the content itself is upstream original',async t=>{
  const {s}=await fixture(t),card=note(s);s.store.put('card',card.id,{...card,provenance:{contentOrigin:'upstream-original',summaryOrigin:'model-summary',attribution:'host-asserted',partial:false}});
  const job=create(s),run=s.runJob({jobId:job.id,idempotencyKey:'summary'});await s.jobs.drain();const done=getRun(s,job.id,run.id);assert.equal(done.result.counts.modelSummary,1);assert.ok(done.result.samples[0].issues.includes('model-summary'));
});

test('real event-loop cancellation is observed without a synthetic checkpoint gate',async t=>{
  const {s}=await fixture(t);for(let i=0;i<120;i++)note(s,`${i}`);const job=create(s),run=s.runJob({jobId:job.id,idempotencyKey:'cancel-loop'});
  // This independent macrotask must run before the complete card scan commits.
  // A Promise.resolve-only checkpoint would finish first and fail this test.
  const cancelled=await new Promise(resolve=>setImmediate(()=>resolve(s.cancelJobRun({runId:run.id}))));
  assert.equal(cancelled.status,'cancelled');await s.jobs.drain();assert.equal(getRun(s,job.id,run.id).result,null);
});

test('elapsed timeout remains bounded when wall clock jumps backward during a run',async t=>{
  const clock=new FakeClock();let wall=START,entered=false;clock.now=()=>wall;
  const {s}=await fixture(t,{clock,jobs:{timeoutMs:100},jobsCheckpoint:async stage=>{if(stage==='before-read'){entered=true;await new Promise(()=>{});}}}),job=create(s),run=s.runJob({jobId:job.id,idempotencyKey:'clock-backward'});
  await until(()=>entered);wall-=60000;clock.advance(100);await s.jobs.drain();const done=getRun(s,job.id,run.id);assert.equal(done.status,'timed_out');assert.equal(done.error.code,'JOB_TIMEOUT');assert.equal(done.result,null);assert.equal(clock.timers.size,0);
});
