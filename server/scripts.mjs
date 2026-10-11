import { randomUUID } from 'node:crypto';
import { readFileSync, readlinkSync } from 'node:fs';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { z } from 'zod';
import { ScriptsConfigSchema } from './config.mjs';
import { digest, uid } from './store.mjs';
import { QGError } from './schemas.mjs';
import { WASM_ABI, WASM_VERSION, canonicalWasmJSON, probeWasmRuntime } from './wasm-runtime.mjs';
import { listBundledWasm, getBundledWasm, validateBundledWasmInput, runBundledWasm } from './wasm-registry.mjs';

const runId=z.string().max(100).regex(/^scriptrun_[a-z0-9_-]+$/i);
const key=z.string().min(1).max(200);
const stats=z.object({values:z.array(z.number().finite().int().min(-1000000).max(1000000)).max(1000)}).strict();
const echo=z.object({text:z.string().max(1024)}).strict();
export const ScriptList=z.object({}).strict();
export const ScriptRun=z.object({scriptId:z.enum(['integer-stats','bounded-echo']),version:z.literal('1.0.0'),parameters:z.union([stats,echo]),idempotencyKey:key}).strict().superRefine((input,ctx)=>{
  try{validateBundledWasmInput(input.scriptId,input.parameters,input.version);}
  catch{ctx.addIssue({code:'custom',path:['parameters'],message:'Parameters must match the selected registered script'});}
});
export const ScriptRead=z.object({runId}).strict();
export const ScriptCancel=z.object({runId}).strict();
export const ScriptRuns=z.object({limit:z.number().int().min(1).max(100).default(20),offset:z.number().int().min(0).max(1000000).default(0)}).strict();
const iso=value=>new Date(value).toISOString();
const terminal=run=>run.status!=='running';
const fail=(code,message)=>new QGError(code,message);
const ERRORS=Object.freeze({
  SCRIPT_DISABLED:'注册脚本尚未由运营者启用。',
  SCRIPT_CANCELLED:'脚本运行已取消；不会自动重试。',
  SCRIPT_TIMEOUT:'脚本运行已超时；不会保存迟到结果或自动重试。',
  SCRIPT_INTERRUPTED:'脚本运行已中断；不会恢复或自动重试此运行。',
  SCRIPT_RUNTIME_UNAVAILABLE:'本地固定版本 Wasmtime 运行时不可用；请由运营者检查安装。',
  SCRIPT_INPUT_LIMIT:'输入超出运营者设置的范围。',
  SCRIPT_OUTPUT_LIMIT:'结果超出运营者设置的范围；未保存截断结果。',
  SCRIPT_FUEL_LIMIT:'脚本耗尽了允许的计算配额。',
  SCRIPT_MEMORY_LIMIT:'脚本超过了允许的内存范围。',
  SCRIPT_PROCESS_LIMIT:'脚本运行进程超过资源限制或异常终止。',
  SCRIPT_INVALID_MODULE:'注册模块校验失败；没有接受替代模块。',
  SCRIPT_INVALID_OUTPUT:'脚本返回的数据未通过固定接口校验。',
  SCRIPT_TRAP:'脚本在受限运行时中终止。',
  SCRIPT_INTERNAL_ERROR:'脚本未能完成；不会自动重试。',
});
const errorOf=code=>({code,message:ERRORS[code]||ERRORS.SCRIPT_INTERNAL_ERROR});
// Wall clocks and elapsed lease time never prove process exit. Linux boot and
// process-start identities prevent PID reuse from freeing another worker's
// reservation. An unreadable identity is uncertain and remains reserved.
function bootId() {try{const value=readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();return /^[a-f0-9-]{36}$/.test(value)?value:null;}catch{return null;}}
function processIdentity(pid) {
  if(!Number.isSafeInteger(pid)||pid<1)return null;
  try{
    const text=readFileSync(`/proc/${pid}/stat`,'utf8'),parts=text.slice(text.lastIndexOf(')')+1).trim().split(/\s+/),boot=bootId();
    const pidNamespace=readlinkSync(`/proc/${pid}/ns/pid`);
    return boot&&/^\d+$/.test(parts[19])&&/^pid:\[\d+\]$/.test(pidNamespace)?{pid,bootId:boot,pidNamespace,startTicks:parts[19],state:parts[0]}:null;
  }catch{return null;}
}
function identityGone(identity) {
  if(!identity?.bootId||!identity?.startTicks||!identity?.pidNamespace||!Number.isSafeInteger(identity.pid))return false;
  // Missing namespace evidence is uncertainty, not evidence of target death.
  try{if(readlinkSync('/proc/self/ns/pid')!==identity.pidNamespace)return false;}
  catch{return false;}
  const boot=bootId();if(!boot)return false;if(boot!==identity.bootId)return true;
  try{
    const text=readFileSync(`/proc/${identity.pid}/stat`,'utf8'),parts=text.slice(text.lastIndexOf(')')+1).trim().split(/\s+/);
    return /^\d+$/.test(parts[19])&&(parts[19]!==identity.startTicks||['Z','X'].includes(parts[0]));
  }catch(error){return error.code==='ENOENT';}
}
const RUNTIME_ERRORS=Object.freeze({
  SPAWN_OBSERVER_FAILED:'SCRIPT_INTERNAL_ERROR',
  RUNTIME_UNAVAILABLE:'SCRIPT_RUNTIME_UNAVAILABLE',TIMEOUT:'SCRIPT_TIMEOUT',CANCELLED:'SCRIPT_INTERRUPTED',
  INPUT_LIMIT:'SCRIPT_INPUT_LIMIT',OUTPUT_LIMIT:'SCRIPT_OUTPUT_LIMIT',FUEL_EXHAUSTED:'SCRIPT_FUEL_LIMIT',FUEL_LIMIT:'SCRIPT_FUEL_LIMIT',
  MEMORY_LIMIT:'SCRIPT_MEMORY_LIMIT',PROCESS_LIMIT:'SCRIPT_PROCESS_LIMIT',INVALID_MODULE:'SCRIPT_INVALID_MODULE',
  PROCESS_MEMORY_LIMIT:'SCRIPT_MEMORY_LIMIT',ARTIFACT_UNAVAILABLE:'SCRIPT_INVALID_MODULE',ARTIFACT_INTEGRITY:'SCRIPT_INVALID_MODULE',
  FORBIDDEN_IMPORT:'SCRIPT_INVALID_MODULE',FORBIDDEN_START:'SCRIPT_INVALID_MODULE',FORBIDDEN_TABLE:'SCRIPT_INVALID_MODULE',INVALID_ABI:'SCRIPT_INVALID_MODULE',
  HASH_MISMATCH:'SCRIPT_INVALID_MODULE',REGISTRY_INTEGRITY:'SCRIPT_INVALID_MODULE',UNKNOWN_SCRIPT:'SCRIPT_INVALID_MODULE',VERSION_MISMATCH:'SCRIPT_INVALID_MODULE',
  INVALID_PROTOCOL:'SCRIPT_INVALID_OUTPUT',INVALID_OUTPUT:'SCRIPT_INVALID_OUTPUT',OUTPUT_SCHEMA:'SCRIPT_INVALID_OUTPUT',INVALID_POINTER:'SCRIPT_INVALID_OUTPUT',INVALID_UTF8:'SCRIPT_INVALID_OUTPUT',INVALID_JSON:'SCRIPT_INVALID_OUTPUT',TRAP:'SCRIPT_TRAP',GUEST_TRAP:'SCRIPT_TRAP',
});
function abortable(promise,signal) {
  if(signal.aborted)return Promise.reject(fail('SCRIPT_INTERRUPTED',ERRORS.SCRIPT_INTERRUPTED));
  return new Promise((resolve,reject)=>{
    const cleanup=()=>signal.removeEventListener('abort',onAbort);
    const onAbort=()=>{cleanup();reject(fail('SCRIPT_INTERRUPTED',ERRORS.SCRIPT_INTERRUPTED));};
    signal.addEventListener('abort',onAbort,{once:true});
    Promise.resolve(promise).then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
  });
}

// No scheduler, arbitrary source, upload, command, path, connector, or provider is
// part of this service. Only the pinned registry may select a Wasm binary.
export class ScriptsEngine {
  constructor(service,config={},options={}) {
    this.service=service;this.store=service.store;this.config=ScriptsConfigSchema.parse(config||{});
    const clock=options.scriptsClock||{};
    this.clock={now:clock.now||Date.now,setTimeout:clock.setTimeout||setTimeout,clearTimeout:clock.clearTimeout||clearTimeout,setInterval:clock.setInterval||setInterval,clearInterval:clock.clearInterval||clearInterval};
    // Trusted test checkpoint only. It cannot replace a registry operation or
    // fabricate a result, and is never accepted by any config or tool schema.
    this.testCheckpoint=options.scriptsCheckpoint;
    this.owner=randomUUID();this.ownerIdentity=processIdentity(process.pid);this.actor=service.access.owner({transport:'stdio'});
    this.running=new Map();this.controllers=new Map();this.probes=new Map();this.closed=false;this.discovery=null;this.availability=null;
    this.asWorker(()=>this.recover());
  }
  asWorker(fn) {return this.service.access.run(this.actor,fn);}
  assertOpen() {if(this.closed)throw fail('SCRIPT_UNAVAILABLE','脚本服务正在关闭。');}
  runSnapshot(run) {
    const {id,scriptId,version,registryHash,parameters,status,attempt,startedAt,updatedAt,finishedAt,result,error}=run;
    return structuredClone({id,scriptId,version,registryHash,parameters,status,attempt,startedAt,updatedAt,finishedAt,result,error});
  }
  allRuns() {const runs=this.store.listBounded('script-run',{limit:1001});if(runs.length>1000)throw fail('SCRIPT_STORAGE_LIMIT','脚本运行记录超过安全范围。');return runs;}
  requireRun(id) {const run=this.store.get('script-run',id);if(!run)throw fail('SCRIPT_RUN_NOT_FOUND','脚本运行不存在或已从有界历史中清理。');return run;}
  audit(event,detail) {this.store.audit(event,{...detail,executor:'registered-wasm',workerId:this.owner});}
  holdsSlot(run) {
    if(typeof run.slotReleasedAt==='string'&&Number.isFinite(Date.parse(run.slotReleasedAt)))return false;
    if(run.owner===this.owner&&this.running.has(run.id))return true;
    if(!identityGone(run.ownerIdentity))return true;
    // Owner death before the durable dispatch marker proves no child launch.
    // After dispatch starts, only an identified child's death is sufficient.
    // A crash between spawn and identity persistence stays closed for review.
    return run.dispatchStarted!==false&&!identityGone(run.childIdentity);
  }
  finishLocked(run,status,error=null,result=null) {
    const now=iso(this.clock.now()),next={...run,status,error,result,updatedAt:now,finishedAt:now,leaseUntil:null};
    this.store.put('script-run',run.id,next);
    this.audit('script_finished',{runId:run.id,scriptId:run.scriptId,version:run.version,registryHash:run.registryHash,status,code:error?.code||null});
    return next;
  }
  recoverLocked() {
    const now=this.clock.now();
    for(const run of this.allRuns())if(!terminal(run)){
      // A stale claim is never retried or reassigned, even after process death.
      // Its execution reservation survives until child exit is acknowledged or
      // both recorded process identities are verified gone.
      if(run.leaseUntil<=now){this.finishLocked(run,'interrupted',errorOf('SCRIPT_INTERRUPTED'));this.controllers.get(run.id)?.abort();}
      else if(run.deadlineAt<=now){this.finishLocked(run,'timed_out',errorOf('SCRIPT_TIMEOUT'));this.controllers.get(run.id)?.abort();}
    }
  }
  recover() {this.store.transaction(()=>this.recoverLocked());}
  async runtimeAvailability() {
    if(!this.config.enabled)return {available:false,runtime:'wasmtime-py',version:WASM_VERSION,abi:WASM_ABI,reason:'SCRIPT_DISABLED',message:ERRORS.SCRIPT_DISABLED};
    if(this.availability&&this.clock.now()-this.availability.at<30000)return structuredClone(this.availability.value);
    // Read-only discovery is bounded too: repeated/concurrent HTTP and MCP
    // discovery shares one child, with a short cache for either outcome.
    if(!this.discovery)this.discovery=(async()=>{
      const controller=new AbortController();
      const promise=probeWasmRuntime({pythonPath:this.config.pythonPath,signal:controller.signal});
      this.probes.set(controller,promise);
      try{
        const found=await promise;
        const value={available:found.available===true,runtime:'wasmtime-py',version:WASM_VERSION,abi:WASM_ABI,reason:found.available?null:'SCRIPT_RUNTIME_UNAVAILABLE',message:found.available?null:ERRORS.SCRIPT_RUNTIME_UNAVAILABLE};
        this.availability={at:this.clock.now(),value};return value;
      }finally{this.probes.delete(controller);}
    })().finally(()=>{this.discovery=null;});
    return structuredClone(await this.discovery);
  }
  async list(args={}) {
    this.assertOpen();ScriptList.parse(args);this.recover();
    const registry=listBundledWasm(),runtimeAvailability=await this.runtimeAvailability();
    return {enabled:this.config.enabled,runtimeAvailability,registry};
  }
  get(args) {this.assertOpen();const {runId}=ScriptRead.parse(args);this.recover();return this.runSnapshot(this.requireRun(runId));}
  listRuns(args={}) {
    this.assertOpen();const {limit,offset}=ScriptRuns.parse(args);this.recover();
    const runs=this.allRuns().sort((a,b)=>b.sequence-a.sequence);
    return {runs:runs.slice(offset,offset+limit).map(run=>this.runSnapshot(run)),total:runs.length,nextOffset:offset+limit<runs.length?offset+limit:null};
  }
  pruneLocked(runs) {
    const old=runs.filter(run=>terminal(run)&&!this.holdsSlot(run)).sort((a,b)=>a.sequence-b.sequence);let count=runs.length;
    while(count>=this.config.maxRuns&&old.length){this.store.delete('script-run',old.shift().id);count--;}
    if(count>=this.config.maxRuns)throw fail('SCRIPT_HISTORY_LIMIT','运行记录已满；请等待正在运行的脚本结束。');
  }
  run(args) {
    this.assertOpen();const input=ScriptRun.parse(args);
    if(!this.config.enabled)throw fail('SCRIPT_DISABLED',ERRORS.SCRIPT_DISABLED);
    const entry=getBundledWasm(input.scriptId,input.version);
    let parameters;
    try{parameters=JSON.parse(canonicalWasmJSON(input.parameters,{maxBytes:this.config.maxInputBytes}));}
    catch{throw fail('SCRIPT_INPUT_LIMIT',ERRORS.SCRIPT_INPUT_LIMIT);}
    const registryHash=digest(JSON.parse(canonicalWasmJSON(entry,{maxBytes:65536})));
    const fingerprint=digest({scriptId:input.scriptId,version:input.version,parameters,registryHash});let claimed=false;
    const run=this.store.transaction(()=>{
      this.recoverLocked();const prior=this.store.get('script-key',input.idempotencyKey);
      if(prior){
        if(prior.digest!==fingerprint)throw fail('SCRIPT_IDEMPOTENCY_CONFLICT','此幂等键已用于不同的脚本、版本、参数或注册模块。');
        const previous=this.store.get('script-run',prior.runId);
        if(!previous)throw fail('SCRIPT_RUN_PRUNED','此运行已被接受且历史已清理；此幂等键不会再次执行。');
        return previous;
      }
      if(this.store.count('script-key')>=this.config.maxReceipts)throw fail('SCRIPT_RECEIPT_LIMIT','幂等记录已达到运营者设置的上限；不会清理凭据或重复执行。');
      const runs=this.allRuns();
      if(runs.filter(run=>!terminal(run)||this.holdsSlot(run)).length>=this.config.maxConcurrency)throw fail('SCRIPT_CONCURRENCY_LIMIT','已达到运营者设置的同时运行上限；取消后的进程也必须先退出。');
      this.pruneLocked(runs);
      const sequence=(this.store.get('script-state','sequence')?.value||0)+1;
      if(!Number.isSafeInteger(sequence))throw fail('SCRIPT_STORAGE_LIMIT','脚本运行序号达到安全范围。');
      const now=this.clock.now(),next={id:uid('scriptrun'),scriptId:input.scriptId,version:input.version,registryHash,moduleHash:entry.sha256,parameters,status:'running',attempt:1,startedAt:iso(now),updatedAt:iso(now),finishedAt:null,result:null,error:null,sequence,owner:this.owner,ownerIdentity:this.ownerIdentity,claimToken:randomUUID(),deadlineAt:now+this.config.timeoutMs,leaseUntil:now+this.config.leaseMs,dispatchStarted:false,childIdentity:null,slotReleasedAt:null};
      this.store.put('script-state','sequence',{value:sequence});this.store.put('script-run',next.id,next);
      this.store.put('script-key',input.idempotencyKey,{runId:next.id,digest:fingerprint,registryHash});
      this.audit('script_started',{runId:next.id,scriptId:next.scriptId,version:next.version,registryHash,attempt:1});claimed=true;return next;
    });
    if(claimed)this.launch(run);return this.runSnapshot(run);
  }
  cancel(args) {
    this.assertOpen();const {runId}=ScriptCancel.parse(args);
    const run=this.store.transaction(()=>{this.recoverLocked();const current=this.requireRun(runId);return terminal(current)?current:this.finishLocked(current,'cancelled',errorOf('SCRIPT_CANCELLED'));});
    this.controllers.get(run.id)?.abort();return this.runSnapshot(run);
  }
  owns(current,run) {return current&&current.owner===this.owner&&current.claimToken===run.claimToken;}
  renew(run,controller) {
    if(this.closed||controller.signal.aborted)return false;
    const alive=this.store.transaction(()=>{
      const current=this.store.get('script-run',run.id),now=this.clock.now();
      if(!this.owns(current,run)||terminal(current))return false;
      if(current.deadlineAt<=now){this.finishLocked(current,'timed_out',errorOf('SCRIPT_TIMEOUT'));return false;}
      if(current.leaseUntil<=now){this.finishLocked(current,'interrupted',errorOf('SCRIPT_INTERRUPTED'));return false;}
      this.store.put('script-run',run.id,{...current,leaseUntil:now+this.config.leaseMs,updatedAt:iso(now)});return true;
    });
    if(!alive)controller.abort();return alive;
  }
  expire(run,controller) {
    try{if(!this.closed)this.store.transaction(()=>{const current=this.store.get('script-run',run.id);if(this.owns(current,run)&&!terminal(current))this.finishLocked(current,'timed_out',errorOf('SCRIPT_TIMEOUT'));});}
    catch{/* Abort even if persistence failed. A later read recovers the lease. */}
    finally{controller.abort();}
  }
  async checkpoint(stage,run,controller) {
    if(!this.renew(run,controller))throw fail('SCRIPT_INTERRUPTED',ERRORS.SCRIPT_INTERRUPTED);
    if(this.testCheckpoint)await abortable(this.testCheckpoint(stage,{runId:run.id,signal:controller.signal}),controller.signal);
    await yieldTurn(undefined,{signal:controller.signal});
    if(!this.renew(run,controller))throw fail('SCRIPT_INTERRUPTED',ERRORS.SCRIPT_INTERRUPTED);
  }
  launch(run) {
    const controller=new AbortController();this.controllers.set(run.id,controller);
    const promise=this.asWorker(()=>Promise.resolve().then(()=>this.execute(run,controller))).catch(()=>{}).finally(()=>{this.running.delete(run.id);this.controllers.delete(run.id);});
    this.running.set(run.id,promise);
  }
  async execute(run,controller) {
    let timeout=null,watch=null;
    try{
      timeout=this.clock.setTimeout(()=>this.expire(run,controller),Math.max(1,run.deadlineAt-this.clock.now()));timeout?.unref?.();
      watch=this.clock.setInterval(()=>{try{this.renew(run,controller);}catch{controller.abort();}},Math.max(25,Math.min(250,Math.floor(this.config.leaseMs/3))));watch?.unref?.();
      await this.checkpoint('before-dispatch',run,controller);
      this.store.transaction(()=>{
        const current=this.store.get('script-run',run.id);
        if(!this.owns(current,run)||terminal(current)||controller.signal.aborted)throw fail('SCRIPT_INTERRUPTED',ERRORS.SCRIPT_INTERRUPTED);
        this.store.put('script-run',run.id,{...current,dispatchStarted:true});
      });
      const onSpawn=({pid})=>{
        const alive=this.store.transaction(()=>{
          const current=this.store.get('script-run',run.id);
          if(!this.owns(current,run))return false;
          this.store.put('script-run',run.id,{...current,childIdentity:processIdentity(pid)});return !terminal(current);
        });
        if(!alive)controller.abort();
      };
      const result=await runBundledWasm(run.scriptId,run.parameters,{version:run.version,pythonPath:this.config.pythonPath,signal:controller.signal,onSpawn,limits:{wallMs:Math.max(1,Math.min(this.config.timeoutMs,run.deadlineAt-this.clock.now())),fuel:this.config.fuel,memoryBytes:this.config.memoryBytes,inputBytes:this.config.maxInputBytes,outputBytes:this.config.maxResultBytes}});
      // The runner's safe bounded envelope is retained; no stderr, process path,
      // environment, source code, or arbitrary exception text is persisted.
      if(result.sha256!==run.moduleHash||result.runtime!=='wasmtime-py'||result.version!==WASM_VERSION||result.abi!==WASM_ABI)throw fail('SCRIPT_INVALID_OUTPUT',ERRORS.SCRIPT_INVALID_OUTPUT);
      if(Buffer.byteLength(JSON.stringify(result))>this.config.maxResultBytes)throw fail('SCRIPT_OUTPUT_LIMIT',ERRORS.SCRIPT_OUTPUT_LIMIT);
      await this.checkpoint('before-commit',run,controller);
      this.store.transaction(()=>{
        const current=this.store.get('script-run',run.id),now=this.clock.now();
        if(!this.owns(current,run)||terminal(current)||this.closed||controller.signal.aborted)return;
        if(current.deadlineAt<=now){this.finishLocked(current,'timed_out',errorOf('SCRIPT_TIMEOUT'));return;}
        if(current.leaseUntil<=now){this.finishLocked(current,'interrupted',errorOf('SCRIPT_INTERRUPTED'));return;}
        this.finishLocked(current,'completed',null,result);
      });
    }catch(error){
      if(!this.closed)this.store.transaction(()=>{
        const current=this.store.get('script-run',run.id);
        if(!this.owns(current,run)||terminal(current))return;
        const code=Object.hasOwn(ERRORS,error?.code)?error.code:RUNTIME_ERRORS[error?.code]||'SCRIPT_INTERNAL_ERROR';
        this.finishLocked(current,code==='SCRIPT_TIMEOUT'?'timed_out':code==='SCRIPT_INTERRUPTED'?'interrupted':'failed',errorOf(code));
      });
    }finally{
      if(timeout!==null)this.clock.clearTimeout(timeout);if(watch!==null)this.clock.clearInterval(watch);controller.abort();
      // runBundledWasm resolves/rejects only after the child has closed. A slot
      // cannot be reused while cancellation is still draining that child.
      this.store.transaction(()=>{const current=this.store.get('script-run',run.id);if(this.owns(current,run))this.store.put('script-run',run.id,{...current,slotReleasedAt:iso(this.clock.now())});});
    }
  }
  async drain() {await Promise.allSettled([...this.running.values()]);}
  async close() {
    if(this.closed)return;this.closed=true;
    try{this.asWorker(()=>this.store.transaction(()=>{for(const run of this.allRuns())if(run.owner===this.owner&&!terminal(run))this.finishLocked(run,'interrupted',errorOf('SCRIPT_INTERRUPTED'));}));}
    finally{
      for(const controller of this.controllers.values())controller.abort();for(const controller of this.probes.keys())controller.abort();
      await Promise.allSettled([...this.running.values(),...this.probes.values()]);
    }
  }
}
