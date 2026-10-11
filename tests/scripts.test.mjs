import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { ConfigSchema,ScriptsConfigSchema,PRINCIPAL_TOOLS,ROOT } from '../server/config.mjs';
import { Service } from '../server/service.mjs';
import { ScriptList,ScriptRun,ScriptRead,ScriptCancel,ScriptRuns } from '../server/scripts.mjs';
import { canonicalWasmJSON } from '../server/wasm-runtime.mjs';
import { listBundledWasm } from '../server/wasm-registry.mjs';
import { digest } from '../server/store.mjs';

const START=Date.parse('2026-10-11T07:00:00Z');
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
      if(count>10000)throw Error('Fake timer runaway');
      const next=[...this.timers].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;
      const [id,timer]=next;this.time=timer.at;if(timer.interval)timer.at+=timer.interval;else this.timers.delete(id);timer.fn();
    }
    this.time=end;
  }
}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check){for(let i=0;i<500;i++){if(check())return;await delay(5);}assert.fail('Condition did not settle');}
function gate(){let release;const promise=new Promise(resolve=>{release=resolve;});return {promise,release};}
async function fixture(t,{scripts={},scriptsCheckpoint,clock=new FakeClock(),access}={}){
  const dir=await mkdtemp(join(tmpdir(),'qg-scripts-')),services=[];let fetches=0;
  const config=ConfigSchema.parse({dataDir:dir,scripts:{enabled:true,...scripts},...(access?{access}:{})});
  const open=(overrides={})=>{const service=new Service(config,{scriptsClock:clock,scriptsCheckpoint,env:{FIXTURE_AGENT:'fixture-script-agent-token-'.repeat(3)},fetchImpl:async()=>{fetches++;throw Error('Forbidden external request');},...overrides});services.push(service);return service;};
  const s=open();
  t.after(async()=>{for(const service of services)if(!service.scripts.closed)await service.close();assert.equal(clock.timers.size,0,'No script watchdog survives close');assert.equal(fetches,0);await rm(dir,{recursive:true,force:true});});
  return {s,open,clock,config,dir};
}
const input=(key='one',parameters={values:[-5,0,14]},extra={})=>({scriptId:'integer-stats',version:'1.0.0',parameters,idempotencyKey:key,...extra});
const run=(s,key='one',parameters={values:[-5,0,14]},extra={})=>s.runScript(input(key,parameters,extra));
const get=(s,id)=>s.getScriptRun({runId:id});

test('strict finite schemas, pinned registry and operator-only default-disabled configuration',()=>{
  const defaults=ConfigSchema.parse({});assert.equal(defaults.scripts.enabled,false);assert.equal(defaults.scripts.pythonPath,join(ROOT,'.sandbox-venv/bin/python'));
  assert.deepEqual(listBundledWasm().map(entry=>[entry.id,entry.version]),[['integer-stats','1.0.0'],['bounded-echo','1.0.0']]);
  for(const extra of [{scriptId:'shell'},{version:'latest'},{version:'1.0.1'},{path:'/tmp/x.wasm'},{code:'return 1'},{source:'print(1)'},{upload:'module'},{registryHash:'x'},{sha256:'x'},{pythonPath:'/tmp/x'},{owner:'owner'},{limits:{fuel:1}}])assert.equal(ScriptRun.safeParse({...input(),...extra}).success,false);
  for(const parameters of [{values:[1.2]},{values:[1000001]},{values:Array(1001).fill(0)},{values:[1],text:'extra'},{text:'wrong script'},{values:[Infinity]},{values:[NaN]}])assert.equal(ScriptRun.safeParse(input('one',parameters)).success,false);
  assert.equal(ScriptRun.safeParse(input('one',{text:'x'.repeat(1025)},{scriptId:'bounded-echo'})).success,false);
  assert.equal(ScriptRun.safeParse(input('one',{text:'\uD800'},{scriptId:'bounded-echo'})).success,false);
  for(const scripts of [{enabled:'true'},{pythonPath:'python3'},{pythonPath:'/tmp/\0python'},{timeoutMs:2001},{timeoutMs:99},{fuel:1000001},{fuel:0},{memoryBytes:65535},{memoryBytes:16777217},{maxInputBytes:16385},{maxResultBytes:32769},{maxReceipts:10001},{maxRuns:1001},{maxConcurrency:9},{maxRuns:1,maxConcurrency:2},{path:'/tmp/module.wasm'}])assert.equal(ScriptsConfigSchema.safeParse(scripts).success,false);
  for(const schema of [ScriptList,ScriptRead,ScriptCancel,ScriptRuns])assert.equal(schema.safeParse({command:'echo nope'}).success,false);
  for(const tool of ['qg_list_scripts','qg_run_script','qg_get_script_run','qg_list_script_runs','qg_cancel_script_run'])assert.equal(PRINCIPAL_TOOLS.includes(tool),false);
});

test('disabled denies even explicit manual runs, exposes registry without probing and grants no ordinary setting',async t=>{
  const {s,clock}=await fixture(t,{scripts:{enabled:false,pythonPath:'/missing/runtime'}});
  const listed=await s.listScripts({});assert.equal(listed.enabled,false);assert.equal(listed.runtimeAvailability.reason,'SCRIPT_DISABLED');assert.equal(listed.registry.length,2);assert.equal(s.scripts.probes.size,0);assert.equal(s.scripts.availability,null);
  assert.throws(()=>run(s),error=>error.code==='SCRIPT_DISABLED');assert.equal(s.store.count('script-run'),0);assert.equal(s.store.count('script-key'),0);assert.equal(clock.timers.size,0);
  assert.throws(()=>s.updateSettings({set:{scripts:{enabled:true}},expectedRevision:0}));assert.equal(s.readSettings().revision,0);
});

test('real Wasmtime discovery coalesces parallel probes and caches only safe runtime metadata',async t=>{
  const {s}=await fixture(t);const calls=Array.from({length:20},()=>s.listScripts({}));assert.equal(s.scripts.probes.size,1);
  const results=await Promise.all(calls);assert.ok(results.every(result=>result.runtimeAvailability.available));assert.equal(s.scripts.probes.size,0);
  assert.equal(results[0].runtimeAvailability.version,'49.0.0');assert.equal(JSON.stringify(results).includes(s.scripts.config.pythonPath),false);
  const at=s.scripts.availability.at;await s.listScripts({});assert.equal(s.scripts.availability.at,at);assert.equal(s.store.count('script-run'),0);
});

test('actual registered Wasm runs preserve bounded output, module identity and safe audit metadata',async t=>{
  const {s}=await fixture(t);const first=run(s);assert.equal(first.status,'running');assert.equal(first.attempt,1);
  await s.scripts.drain();const done=get(s,first.id);assert.equal(done.status,'completed');assert.deepEqual(done.result.output,{count:3,max:14,min:-5,sum:9});assert.equal(done.result.runtime,'wasmtime-py');assert.equal(done.result.version,'49.0.0');
  const entry=listBundledWasm().find(entry=>entry.id==='integer-stats');assert.equal(done.result.sha256,entry.sha256);assert.equal(done.registryHash,digest(JSON.parse(canonicalWasmJSON(entry,{maxBytes:65536}))));assert.ok(done.result.metrics.fuelConsumed>0);
  const secret='LOCAL_PAYLOAD_NOT_FOR_AUDIT';const echoRun=run(s,'echo',{text:secret},{scriptId:'bounded-echo'});await s.scripts.drain();assert.deepEqual(get(s,echoRun.id).result.output,{text:secret});
  const audit=s.store.history(100).filter(entry=>entry.event.startsWith('script_'));assert.equal(audit.filter(entry=>entry.event==='script_started').length,2);assert.equal(JSON.stringify(audit).includes(secret),false);assert.equal(JSON.stringify(audit).includes('pythonPath'),false);
});

test('exact payload/version/registry idempotency survives lost responses and service reopen without execution',async t=>{
  let dispatches=0;const {s,open}=await fixture(t,{scriptsCheckpoint:stage=>{if(stage==='before-dispatch')dispatches++;}});
  const first=run(s);assert.equal(run(s).id,first.id);await s.scripts.drain();const other=open();assert.equal(run(other).id,first.id);assert.equal(run(other).status,'completed');assert.equal(dispatches,1);
  assert.throws(()=>run(other,'one',{values:[9]}),error=>error.code==='SCRIPT_IDEMPOTENCY_CONFLICT');assert.throws(()=>run(other,'one',{text:'same key'},{scriptId:'bounded-echo'}),error=>error.code==='SCRIPT_IDEMPOTENCY_CONFLICT');
  assert.equal(s.store.count('script-run'),1);assert.equal(s.store.count('script-key'),1);
});

test('accepted snapshot and caller input cannot mutate deferred durable parameters',async t=>{
  const hold=gate();let entered=false;const {s}=await fixture(t,{scriptsCheckpoint:async stage=>{if(stage==='before-dispatch'){entered=true;await hold.promise;}}});
  const payload=input(),accepted=s.runScript(payload);payload.parameters.values[0]=999;accepted.parameters.values[0]=888;await until(()=>entered);hold.release();await s.scripts.drain();assert.equal(get(s,accepted.id).result.output.sum,9);
});

test('concurrency and cancellation slots are durable across workers and released only after drain',async t=>{
  const hold=gate();let entered=false;const {s,open,clock}=await fixture(t,{scriptsCheckpoint:async stage=>{if(stage==='before-dispatch'){entered=true;await hold.promise;}}});
  const first=run(s),other=open();await until(()=>entered);assert.throws(()=>run(other,'two'),error=>error.code==='SCRIPT_CONCURRENCY_LIMIT');assert.equal(other.cancelScriptRun({runId:first.id}).status,'cancelled');
  assert.throws(()=>run(other,'two'),error=>error.code==='SCRIPT_CONCURRENCY_LIMIT');clock.advance(250);await s.scripts.drain();assert.equal(get(s,first.id).status,'cancelled');
  hold.release();const second=run(other,'two');await other.scripts.drain();assert.equal(get(other,second.id).status,'completed');assert.equal(s.store.count('script-key'),2);
});

test('cross-worker cancellation beats a real completed guest result awaiting commit',async t=>{
  const hold=gate();let entered=false,signal;const {s,open,clock}=await fixture(t,{scriptsCheckpoint:async(stage,context)=>{if(stage==='before-commit'){entered=true;signal=context.signal;await hold.promise;}}});
  const first=run(s),other=open();await until(()=>entered);const cancelled=other.cancelScriptRun({runId:first.id});assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.result,null);clock.advance(250);await s.scripts.drain();hold.release();assert.equal(signal.aborted,true);assert.equal(get(s,first.id).status,'cancelled');assert.equal(run(other).status,'cancelled');
});

test('wall watchdog fences late success and retains the timeout receipt',async t=>{
  const hold=gate();let entered=false;const {s,clock}=await fixture(t,{scripts:{timeoutMs:100},scriptsCheckpoint:async stage=>{if(stage==='before-dispatch'){entered=true;await hold.promise;}}});
  const first=run(s);await until(()=>entered);clock.advance(100);await s.scripts.drain();assert.equal(get(s,first.id).status,'timed_out');assert.equal(get(s,first.id).error.code,'SCRIPT_TIMEOUT');assert.equal(run(s).id,first.id);hold.release();
});

test('lease loss marks interruption and never retries an unknown accepted outcome',async t=>{
  const hold=gate();let entered=false;const {s,open,clock}=await fixture(t,{scripts:{leaseMs:100},scriptsCheckpoint:async stage=>{if(stage==='before-dispatch'){entered=true;await hold.promise;}}});
  const first=run(s);await until(()=>entered);clock.advance(101,{fire:false});const other=open();assert.equal(get(other,first.id).status,'interrupted');assert.equal(run(other).id,first.id);clock.advance(34);await s.scripts.drain();hold.release();assert.equal(get(other,first.id).result,null);
});

test('graceful close interrupts, aborts checkpoints, drains and preserves terminal receipt on restart',async t=>{
  const hold=gate();let entered=false,signal;const {s,open}=await fixture(t,{scriptsCheckpoint:async(stage,context)=>{if(stage==='before-dispatch'){entered=true;signal=context.signal;await hold.promise;}}});
  const first=run(s);await until(()=>entered);await s.close();assert.equal(signal.aborted,true);assert.equal(s.scripts.running.size,0);const other=open();assert.equal(get(other,first.id).status,'interrupted');assert.equal(run(other).status,'interrupted');hold.release();
});

test('bounded history retains permanent dedup receipts and refuses fresh claims once receipts fill',async t=>{
  const {s,open}=await fixture(t,{scripts:{maxRuns:1,maxReceipts:2}});const first=run(s);await s.scripts.drain();const second=run(s,'two');await s.scripts.drain();
  assert.equal(s.store.count('script-run'),1);assert.equal(s.store.count('script-key'),2);assert.throws(()=>run(open()),error=>error.code==='SCRIPT_RUN_PRUNED');assert.throws(()=>run(s,'third'),error=>error.code==='SCRIPT_RECEIPT_LIMIT');assert.equal(run(s,'two').id,second.id);assert.throws(()=>get(s,first.id),error=>error.code==='SCRIPT_RUN_NOT_FOUND');
});

test('history pagination is bounded, newest-first and independent of receipt retention',async t=>{
  const {s}=await fixture(t);const ids=[];for(let i=0;i<3;i++){ids.push(run(s,`key-${i}`).id);await s.scripts.drain();}
  const first=s.listScriptRuns({limit:2});assert.deepEqual(first.runs.map(run=>run.id),[ids[2],ids[1]]);assert.equal(first.nextOffset,2);const last=s.listScriptRuns({limit:2,offset:2});assert.equal(last.total,3);assert.equal(last.nextOffset,null);assert.equal(last.runs[0].id,ids[0]);
});

test('claim and audit are atomic and a failed claim never dispatches Wasm',async t=>{
  let dispatches=0;const {s}=await fixture(t,{scriptsCheckpoint:()=>{dispatches++;}});const audit=s.store.audit.bind(s.store);
  s.store.audit=(event,detail)=>{if(event==='script_started')throw Error('Synthetic claim failure');return audit(event,detail);};
  assert.throws(()=>run(s),/Synthetic claim failure/);assert.equal(s.store.count('script-run'),0);assert.equal(s.store.count('script-key'),0);assert.equal(s.scripts.running.size,0);assert.equal(dispatches,0);
});

test('terminal audit failure rolls back a real result and exposes only a safe failure',async t=>{
  const {s}=await fixture(t);const audit=s.store.audit.bind(s.store);
  s.store.audit=(event,detail)=>{if(event==='script_finished'&&detail.status==='completed')throw Error('DO_NOT_EXPOSE_FAILURE_DETAIL');return audit(event,detail);};
  const first=run(s);await s.scripts.drain();const done=get(s,first.id);assert.equal(done.status,'failed');assert.equal(done.result,null);assert.equal(done.error.code,'SCRIPT_INTERNAL_ERROR');assert.equal(JSON.stringify(done).includes('DO_NOT_EXPOSE'),false);
});

test('unavailable local runtime is a durable failed invocation with sanitized metadata and no retry',async t=>{
  const {s,open}=await fixture(t,{scripts:{pythonPath:'/missing/PRIVATE_RUNTIME_PATH'}});const listed=await s.listScripts({});assert.equal(listed.runtimeAvailability.available,false);assert.equal(listed.runtimeAvailability.reason,'SCRIPT_RUNTIME_UNAVAILABLE');
  const first=run(s);await s.scripts.drain();const done=get(s,first.id);assert.equal(done.status,'failed');assert.equal(done.error.code,'SCRIPT_RUNTIME_UNAVAILABLE');assert.equal(JSON.stringify(done).includes('PRIVATE_RUNTIME_PATH'),false);assert.equal(run(open()).id,first.id);
});

test('real guest fuel limits fail closed and preserve exactly one execution receipt',async t=>{
  const {s}=await fixture(t,{scripts:{fuel:1}});const first=run(s);await s.scripts.drain();const done=get(s,first.id);assert.equal(done.status,'failed');assert.equal(done.error.code,'SCRIPT_FUEL_LIMIT');assert.equal(done.result,null);assert.equal(run(s).id,first.id);assert.equal(s.store.count('script-key'),1);
});

test('operator input and stored-envelope limits reject rather than truncate',async t=>{
  const {s}=await fixture(t,{scripts:{maxInputBytes:256,maxResultBytes:256}});assert.throws(()=>run(s,'large',{text:'x'.repeat(300)},{scriptId:'bounded-echo'}),error=>error.code==='SCRIPT_INPUT_LIMIT');assert.equal(s.store.count('script-key'),0);
  const first=run(s);await s.scripts.drain();const done=get(s,first.id);assert.equal(done.status,'failed');assert.equal(done.error.code,'SCRIPT_OUTPUT_LIMIT');assert.equal(done.result,null);
});

test('principal contexts cannot discover, invoke, inspect, list or cancel registered scripts',async t=>{
  const {s}=await fixture(t,{access:{principals:[{id:'agent',enabled:true,tokenEnv:'FIXTURE_AGENT',tools:[...PRINCIPAL_TOOLS],resources:{sourceIds:[]}}]}});
  const actor=s.access.authenticate('fixture-script-agent-token-'.repeat(3),{ownerToken:'fixture-owner-token-'.repeat(3)}),facade=s.access.facade(actor);
  for(const [method,args] of [['listScripts',{}],['runScript',input()],['getScriptRun',{runId:'scriptrun_missing'}],['listScriptRuns',{}],['cancelScriptRun',{runId:'scriptrun_missing'}]]){
    assert.equal(facade[method],undefined);assert.throws(()=>s.access.run(actor,()=>s[method](args)),error=>error.code==='ACCESS_DENIED');
  }
  assert.equal(s.store.count('script-run'),0);
});

test('SQLite claims enforce concurrency against a separate live process',async t=>{
  const {s,config}=await fixture(t);const code=`import {Service} from './server/service.mjs';const s=new Service(${JSON.stringify(config)},{scriptsCheckpoint:()=>new Promise(()=>{})});const run=s.runScript(${JSON.stringify(input('other-process'))});process.stdout.write(JSON.stringify(run)+'\\n');process.on('SIGTERM',async()=>{await s.close();process.exit(0);});setInterval(()=>{},1000);`;
  const child=spawn(process.execPath,['--input-type=module','-e',code],{cwd:ROOT,stdio:['ignore','pipe','pipe']});let text='';child.stdout.on('data',chunk=>{text+=chunk;});let err='';child.stderr.on('data',chunk=>{err+=chunk;});
  t.after(async()=>{if(child.exitCode===null){child.kill('SIGKILL');await once(child,'close');}});await until(()=>text.includes('\n')||child.exitCode!==null);assert.equal(child.exitCode,null,err);const accepted=JSON.parse(text.trim());
  assert.throws(()=>run(s,'parent'),error=>error.code==='SCRIPT_CONCURRENCY_LIMIT');assert.equal(run(s,'other-process').id,accepted.id);assert.equal(s.store.count('script-key'),1);
  child.kill('SIGTERM');await once(child,'close');assert.equal(get(s,accepted.id).status,'interrupted');
});

test('forward wall-clock jumps cannot release an undrained worker reservation',async t=>{
  const hold=gate();let entered=false;const {s,open,clock}=await fixture(t,{scriptsCheckpoint:async stage=>{if(stage==='before-dispatch'){entered=true;await hold.promise;}}});
  const first=run(s),other=open();await until(()=>entered);clock.advance(3600000,{fire:false});
  assert.throws(()=>run(other,'after-clock-jump'),error=>error.code==='SCRIPT_CONCURRENCY_LIMIT');assert.equal(get(other,first.id).status,'interrupted');assert.equal(s.store.count('script-run'),1);
  assert.equal(s.store.get('script-run',first.id).slotReleasedAt,null,'Wall time never acknowledges process drain');
  await s.close();hold.release();const next=run(other,'after-clock-jump');await other.scripts.drain();assert.equal(get(other,next.id).status,'completed');
});

test('a dead undispatched process can release its slot without replaying its interrupted invocation',async t=>{
  const {s,config,clock}=await fixture(t,{scripts:{leaseMs:100}});const code=`import {Service} from './server/service.mjs';const s=new Service(${JSON.stringify(config)},{scriptsClock:{now:()=>${START}},scriptsCheckpoint:()=>new Promise(()=>{})});const run=s.runScript(${JSON.stringify(input('crashed-owner'))});process.stdout.write(JSON.stringify(run)+'\\n');setInterval(()=>{},1000);`;
  const child=spawn(process.execPath,['--input-type=module','-e',code],{cwd:ROOT,stdio:['ignore','pipe','pipe']});let text='';child.stdout.on('data',chunk=>{text+=chunk;});
  t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await once(child,'close');}});
  await until(()=>text.includes('\n'));const first=JSON.parse(text.trim());assert.equal(s.store.get('script-run',first.id).dispatchStarted,false);
  child.kill('SIGKILL');await once(child,'close');clock.advance(101,{fire:false});assert.equal(get(s,first.id).status,'interrupted');assert.equal(run(s,'crashed-owner').id,first.id);
  const second=run(s,'new-authorized-run');await s.scripts.drain();assert.equal(get(s,second.id).status,'completed');assert.equal(s.store.count('script-key'),2);
});

test('uncertain child identity remains reserved after owner loss, regardless elapsed time',async t=>{
  const {s,clock}=await fixture(t);const first=run(s);await s.scripts.drain();const stored=s.store.get('script-run',first.id);
  // Simulate the conservative durable state of a crash between spawn and its
  // identity callback. A boot mismatch proves the old owner gone but cannot
  // prove what happened to an unidentified child on an unknown host.
  s.store.put('script-run',first.id,{...stored,status:'interrupted',result:null,owner:'lost-owner',ownerIdentity:{...stored.ownerIdentity,bootId:'00000000-0000-0000-0000-000000000000'},dispatchStarted:true,childIdentity:null,slotReleasedAt:null});
  clock.advance(86400000,{fire:false});assert.throws(()=>run(s,'new'),error=>error.code==='SCRIPT_CONCURRENCY_LIMIT');assert.equal(s.store.count('script-key'),1);assert.equal(run(s).status,'interrupted');
});

test('public run snapshots omit internal owner and child process identities',async t=>{
  const {s}=await fixture(t);const first=run(s);await s.scripts.drain();const internal=s.store.get('script-run',first.id);assert.equal(internal.ownerIdentity.pid,process.pid);assert.ok(Number.isSafeInteger(internal.childIdentity.pid));assert.ok(internal.childIdentity.startTicks);
  const visible=JSON.stringify(s.listScriptRuns({}));for(const privateKey of ['ownerIdentity','childIdentity','startTicks','claimToken','dispatchStarted','slotReleasedAt','pythonPath'])assert.equal(visible.includes(privateKey),false);
});

test('verified dead owner and completed child identities release a crash reservation without replay',async t=>{
  const {s,config,clock}=await fixture(t,{scripts:{leaseMs:100}});const code=`import {Service} from './server/service.mjs';const s=new Service(${JSON.stringify(config)},{scriptsClock:{now:()=>${START}},scriptsCheckpoint:async(stage,{runId})=>{if(stage==='before-commit'){process.stdout.write(JSON.stringify({id:runId})+'\\n');await new Promise(()=>{});}}});s.runScript(${JSON.stringify(input('dispatched-crash'))});setInterval(()=>{},1000);`;
  const child=spawn(process.execPath,['--input-type=module','-e',code],{cwd:ROOT,stdio:['ignore','pipe','pipe']});let text='';child.stdout.on('data',chunk=>{text+=chunk;});
  t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');await once(child,'close');}});
  await until(()=>text.includes('\n'));const first=JSON.parse(text.trim()),stored=s.store.get('script-run',first.id);assert.equal(stored.dispatchStarted,true);assert.ok(stored.childIdentity.startTicks);assert.equal(stored.slotReleasedAt,null);
  child.kill('SIGKILL');await once(child,'close');clock.advance(101,{fire:false});assert.equal(get(s,first.id).status,'interrupted');const second=run(s,'new-key-after-verified-exit');await s.scripts.drain();assert.equal(get(s,second.id).status,'completed');assert.equal(run(s,'dispatched-crash').id,first.id);
});

test('elapsed watchdog persists timeout even when the wall clock moves backward',async t=>{
  const hold=gate();let entered=false;const {s,clock}=await fixture(t,{scriptsCheckpoint:async stage=>{if(stage==='before-dispatch'){entered=true;await hold.promise;}}});const first=run(s);await until(()=>entered);
  const watchdog=[...clock.timers.values()].find(timer=>timer.interval===0);assert.ok(watchdog);clock.time-=3600000;watchdog.fn();await s.scripts.drain();assert.equal(get(s,first.id).status,'timed_out');assert.equal(get(s,first.id).error.code,'SCRIPT_TIMEOUT');hold.release();
});
