import { randomUUID } from 'node:crypto';
import { setImmediate as yieldTurn } from 'node:timers/promises';
import { z } from 'zod';
import { JobsConfigSchema } from './config.mjs';
import { digest, uid } from './store.mjs';
import { QGError } from './schemas.mjs';

// Every operation is implemented below. Stored titles, cards, schedules, and
// client arguments never select code, URLs, tools, connectors, or providers.
export const JOB_REGISTRY = Object.freeze([
  Object.freeze({kind:'recommendation-snapshot',title:'推荐快照',description:'读取本地卡片与推荐偏好，保存最多 10 条推荐及规则理由。',readOnly:true,localOnly:true}),
  Object.freeze({kind:'data-quality-digest',title:'资料质量摘要',description:'检查已有本地卡片的完整性、来源与证据引用，保存汇总。',readOnly:true,localOnly:true}),
]);
const kinds=JOB_REGISTRY.map(entry=>entry.kind);
const jobId=z.string().max(100).regex(/^job_[a-z0-9_-]+$/i);
const runId=z.string().max(100).regex(/^jobrun_[a-z0-9_-]+$/i);
const key=z.string().min(1).max(200);
const title=z.string().trim().min(1).max(160);
const page={limit:z.number().int().min(1).max(100).default(20),offset:z.number().int().min(0).max(1000000).default(0)};
export const JobSchedule=z.object({intervalSeconds:z.number().int().min(60).max(30*24*60*60),startAt:z.string().datetime({offset:true}).refine(value=>Number.isFinite(Date.parse(value)),'Invalid start time')}).strict();
export const JobList=z.object(page).strict();
export const JobCreate=z.object({title:title.optional(),kind:z.enum(kinds),schedule:JobSchedule,paused:z.boolean().default(true),idempotencyKey:key}).strict();
export const JobUpdate=z.object({jobId,set:z.object({title:title.optional(),paused:z.boolean().optional(),schedule:JobSchedule.optional()}).strict().refine(value=>Object.keys(value).length>0&&Object.values(value).every(entry=>entry!==undefined),'At least one field is required'),expectedRevision:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER)}).strict();
export const JobRun=z.object({jobId,idempotencyKey:key}).strict();
export const JobGet=z.object({jobId,...page}).strict();
export const JobCancel=z.object({runId}).strict();
const iso=value=>new Date(value).toISOString();
const normalSchedule=value=>({...value,startAt:iso(Date.parse(value.startAt))});
const nextAt=(schedule,now)=>{
  const anchor=Date.parse(schedule.startAt),interval=schedule.intervalSeconds*1000;
  return iso(anchor+Math.max(0,Math.ceil((now-anchor)/interval))*interval);
};
const latestAt=(schedule,now)=>{
  const anchor=Date.parse(schedule.startAt),interval=schedule.intervalSeconds*1000;
  return anchor+Math.floor((now-anchor)/interval)*interval;
};
const terminal=run=>run.status!=='running';
const fail=(code,message)=>new QGError(code,message);
const ERRORS=Object.freeze({
  JOB_CANCELLED:'任务已取消；不会自动重试。',
  JOB_TIMEOUT:'任务已超时；不会保存迟到结果或自动重试。',
  JOB_INTERRUPTED:'运行已中断；不会恢复或自动重试此运行。',
  JOB_INPUT_LIMIT:'本地资料超出运营者设置的扫描范围；未生成不完整结果。',
  JOB_OUTPUT_LIMIT:'结果超出运营者设置的保存范围；未保存截断结果。',
  JOB_INTERNAL_ERROR:'本地任务未能完成；不会自动重试。',
});
const errorOf=code=>({code,message:ERRORS[code]||ERRORS.JOB_INTERNAL_ERROR});
function abortable(promise,signal) {
  if(signal.aborted)return Promise.reject(fail('JOB_INTERRUPTED',ERRORS.JOB_INTERRUPTED));
  return new Promise((resolve,reject)=>{
    const onAbort=()=>{cleanup();reject(fail('JOB_INTERRUPTED',ERRORS.JOB_INTERRUPTED));};
    const cleanup=()=>signal.removeEventListener('abort',onAbort);
    signal.addEventListener('abort',onAbort,{once:true});
    Promise.resolve(promise).then(value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
  });
}

export class JobsEngine {
  constructor(service,config={},options={}) {
    this.service=service;this.store=service.store;this.config=JobsConfigSchema.parse(config||{});
    const clock=options.jobsClock||{};
    this.clock={now:clock.now||Date.now,setTimeout:clock.setTimeout||setTimeout,clearTimeout:clock.clearTimeout||clearTimeout,setInterval:clock.setInterval||setInterval,clearInterval:clock.clearInterval||clearInterval};
    // Trusted in-process test seam only; never part of config, an operation, or
    // any HTTP/MCP schema. It cannot substitute an operation or its result.
    this.testCheckpoint=options.jobsCheckpoint;
    this.owner=randomUUID();this.actor=service.access.owner({transport:'stdio'});
    this.running=new Map();this.controllers=new Map();this.closed=false;this.timer=null;
    this.asWorker(()=>this.recover());
    if(this.config.enabled){this.timer=this.clock.setInterval(()=>{try{this.tick();}catch{/* A failed tick never dispatches unclaimed work. */}},this.config.tickMs);this.timer?.unref?.();}
  }
  asWorker(fn) {return this.service.access.run(this.actor,fn);}
  assertOpen() {if(this.closed)throw fail('JOB_UNAVAILABLE','任务服务正在关闭。');}
  jobSnapshot(job) {
    const {id,title,kind,schedule,paused,revision,createdAt,updatedAt,lastOccurrenceAt,lastRunId,activeRunId}=job;
    return {id,title,kind,schedule,paused,revision,createdAt,updatedAt,nextRunAt:paused?null:job.nextRunAt,lastOccurrenceAt,lastRunId,activeRunId};
  }
  runSnapshot(run) {
    const {id,jobId,jobRevision,kind,trigger,status,attempt,scheduledFor,startedAt,updatedAt,finishedAt,result,error}=run;
    return {id,jobId,jobRevision,kind,trigger,status,attempt,scheduledFor,startedAt,updatedAt,finishedAt,result,error};
  }
  allJobs() {const jobs=this.store.listBounded('job',{limit:101});if(jobs.length>100)throw fail('JOB_STORAGE_LIMIT','任务记录超过安全范围。');return jobs;}
  allRuns() {const runs=this.store.listBounded('job-run',{limit:1001});if(runs.length>1000)throw fail('JOB_STORAGE_LIMIT','运行记录超过安全范围。');return runs;}
  requireJob(id) {const job=this.store.get('job',id);if(!job)throw fail('JOB_NOT_FOUND','任务不存在。');return job;}
  audit(event,detail) {this.store.audit(event,{...detail,executor:'registered-local-job',workerId:this.owner});}
  finishLocked(run,status,error=null,result=null) {
    const now=iso(this.clock.now()),next={...run,status,error,result,updatedAt:now,finishedAt:now,leaseUntil:null};
    this.store.put('job-run',run.id,next);
    const job=this.requireJob(run.jobId);
    if(job.activeRunId===run.id)this.store.put('job',job.id,{...job,activeRunId:null});
    this.audit('job_finished',{jobId:run.jobId,runId:run.id,trigger:run.trigger,status,code:error?.code||null});
    return next;
  }
  recoverLocked() {
    const now=this.clock.now();
    for(const run of this.allRuns())if(!terminal(run)){
      // A stale durable lease is interrupted, never reclaimed or retried.
      if(run.leaseUntil<=now)this.finishLocked(run,'interrupted',errorOf('JOB_INTERRUPTED'));
      else if(run.deadlineAt<=now)this.finishLocked(run,'timed_out',errorOf('JOB_TIMEOUT'));
    }
  }
  recover() {this.store.transaction(()=>this.recoverLocked());}
  list(args={}) {
    this.assertOpen();const input=JobList.parse(args);this.recover();
    const jobs=this.allJobs().sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
    return {workerEnabled:this.config.enabled,registry:JOB_REGISTRY.map(entry=>({...entry})),jobs:jobs.slice(input.offset,input.offset+input.limit).map(job=>this.jobSnapshot(job)),total:jobs.length,nextOffset:input.offset+input.limit<jobs.length?input.offset+input.limit:null};
  }
  create(args) {
    this.assertOpen();const input=JobCreate.parse(args),schedule=normalSchedule(input.schedule);
    const values={kind:input.kind,title:input.title||JOB_REGISTRY.find(entry=>entry.kind===input.kind).title,schedule,paused:input.paused},fingerprint=digest(values);
    return this.store.transaction(()=>{
      const receipt=this.store.get('job-create-key',input.idempotencyKey);
      if(receipt){if(receipt.digest!==fingerprint)throw fail('JOB_IDEMPOTENCY_CONFLICT','此幂等键已用于不同的任务。');return this.jobSnapshot(this.requireJob(receipt.id));}
      if(this.allJobs().length>=this.config.maxJobs)throw fail('JOB_LIMIT','已达到运营者设置的任务数量上限。');
      const now=this.clock.now(),job={id:uid('job'),...values,revision:1,createdAt:iso(now),updatedAt:iso(now),nextRunAt:nextAt(schedule,now),lastOccurrenceAt:null,lastRunId:null,activeRunId:null};
      this.store.put('job',job.id,job);this.store.put('job-create-key',input.idempotencyKey,{id:job.id,digest:fingerprint});
      this.audit('job_created',{jobId:job.id,kind:job.kind,paused:job.paused,revision:job.revision});return this.jobSnapshot(job);
    });
  }
  update(args) {
    this.assertOpen();const input=JobUpdate.parse(args);
    return this.store.transaction(()=>{
      this.recoverLocked();const current=this.requireJob(input.jobId);
      if(input.expectedRevision!==current.revision)throw new QGError('JOB_CONFLICT','任务已在另一处更新；请重新读取后再决定。',{current:this.jobSnapshot(current)});
      const set={...input.set,...(input.set.schedule?{schedule:normalSchedule(input.set.schedule)}:{})};
      const changed=Object.keys(set).filter(key=>JSON.stringify(set[key])!==JSON.stringify(current[key]));
      if(!changed.length)return this.jobSnapshot(current);
      if(current.revision===Number.MAX_SAFE_INTEGER)throw fail('REVISION_LIMIT','任务修订号已达到上限。');
      const next={...current,...set,revision:current.revision+1,updatedAt:iso(this.clock.now())};
      // Updating the anchor or resuming starts at the next UTC occurrence. Time
      // spent paused never becomes a backlog to execute on resume.
      if(changed.includes('schedule')){next.nextRunAt=nextAt(next.schedule,this.clock.now());next.lastOccurrenceAt=null;}
      else if(current.paused&&!next.paused)next.nextRunAt=iso(Math.max(Date.parse(current.nextRunAt),Date.parse(nextAt(next.schedule,this.clock.now()))));
      this.store.put('job',next.id,next);this.audit('job_updated',{jobId:next.id,changedKeys:changed,fromRevision:current.revision,toRevision:next.revision});return this.jobSnapshot(next);
    });
  }
  get(args) {
    this.assertOpen();const input=JobGet.parse(args);this.recover();const job=this.requireJob(input.jobId);
    const runs=this.allRuns().filter(run=>run.jobId===job.id).sort((a,b)=>b.sequence-a.sequence);
    return {job:this.jobSnapshot(job),runs:runs.slice(input.offset,input.offset+input.limit).map(run=>this.runSnapshot(run)),total:runs.length,nextOffset:input.offset+input.limit<runs.length?input.offset+input.limit:null};
  }
  pruneLocked(runs) {
    const old=runs.filter(terminal).sort((a,b)=>a.sequence-b.sequence);
    let total=runs.length;
    while(total>=this.config.maxRuns&&old.length){this.store.delete('job-run',old.shift().id);total--;}
    if(total>=this.config.maxRuns)throw fail('JOB_HISTORY_LIMIT','运行记录已满；请等待正在运行的任务结束。');
  }
  claimLocked(job,trigger,scheduledFor=null) {
    const runs=this.allRuns();
    if(runs.some(run=>run.jobId===job.id&&!terminal(run)))throw fail('JOB_BUSY','此任务已有运行；请等待结束或取消。');
    if(runs.filter(run=>!terminal(run)).length>=this.config.maxConcurrency)throw fail('JOB_CONCURRENCY_LIMIT','已达到运营者设置的同时运行上限。');
    this.pruneLocked(runs);
    const sequence=(this.store.get('job-state','sequence')?.value||0)+1;
    if(!Number.isSafeInteger(sequence))throw fail('JOB_STORAGE_LIMIT','运行序号达到安全范围。');
    const now=this.clock.now(),run={id:uid('jobrun'),jobId:job.id,jobRevision:job.revision,kind:job.kind,trigger,status:'running',attempt:1,scheduledFor,startedAt:iso(now),updatedAt:iso(now),finishedAt:null,result:null,error:null,sequence,owner:this.owner,claimToken:randomUUID(),deadlineAt:now+this.config.timeoutMs,leaseUntil:now+this.config.leaseMs};
    this.store.put('job-state','sequence',{value:sequence});this.store.put('job-run',run.id,run);
    const next={...job,activeRunId:run.id,lastRunId:run.id};
    if(scheduledFor){next.lastOccurrenceAt=scheduledFor;next.nextRunAt=iso(Date.parse(scheduledFor)+job.schedule.intervalSeconds*1000);}
    this.store.put('job',job.id,next);
    this.audit('job_started',{jobId:job.id,runId:run.id,kind:job.kind,trigger,scheduledFor,attempt:1});return run;
  }
  run(args) {
    this.assertOpen();const input=JobRun.parse(args);let claimed=false;
    const run=this.store.transaction(()=>{
      this.recoverLocked();const job=this.requireJob(input.jobId),receipt=this.store.get('job-manual-key',input.idempotencyKey);
      if(receipt){
        if(receipt.jobId!==job.id)throw fail('JOB_IDEMPOTENCY_CONFLICT','此幂等键已用于不同的任务。');
        const previous=this.store.get('job-run',receipt.runId);
        if(!previous)throw fail('JOB_RUN_PRUNED','此运行已执行且历史已清理；此幂等键不会再次执行。');
        return previous;
      }
      if(this.store.count('job-manual-key')>=this.config.maxManualReceipts)throw fail('JOB_RECEIPT_LIMIT','手动运行幂等记录已达到运营者设置的上限；不会清理记录或重复执行。');
      const next=this.claimLocked(job,'manual');this.store.put('job-manual-key',input.idempotencyKey,{jobId:job.id,runId:next.id});claimed=true;return next;
    });
    if(claimed)this.launch(run);return this.runSnapshot(run);
  }
  tick() {
    if(this.closed||!this.config.enabled)return [];
    return this.asWorker(()=>{
      const claimed=this.store.transaction(()=>{
        this.recoverLocked();const now=this.clock.now(),runs=[];
        const jobs=this.allJobs().filter(job=>!job.paused&&Date.parse(job.nextRunAt)<=now).sort((a,b)=>a.nextRunAt.localeCompare(b.nextRunAt)||a.id.localeCompare(b.id));
        for(const job of jobs){
          const latest=latestAt(job.schedule,now);
          // One high-water mark per job consumes all missed occurrences in the
          // same transaction as the claim. History pruning cannot replay them.
          try{runs.push(this.claimLocked(job,'scheduled',iso(latest)));}
          catch(error){if(['JOB_BUSY','JOB_CONCURRENCY_LIMIT','JOB_HISTORY_LIMIT'].includes(error.code))continue;throw error;}
        }
        return runs;
      });
      for(const run of claimed)this.launch(run);return claimed.map(run=>this.runSnapshot(run));
    });
  }
  cancel(args) {
    this.assertOpen();const input=JobCancel.parse(args);
    const run=this.store.transaction(()=>{
      this.recoverLocked();const current=this.store.get('job-run',input.runId);
      if(!current)throw fail('JOB_RUN_NOT_FOUND','运行不存在或已从有界历史中清理。');
      return terminal(current)?current:this.finishLocked(current,'cancelled',errorOf('JOB_CANCELLED'));
    });
    this.controllers.get(run.id)?.abort();return this.runSnapshot(run);
  }
  renew(run,controller) {
    if(this.closed||controller.signal.aborted)return false;
    const alive=this.store.transaction(()=>{
      const current=this.store.get('job-run',run.id),now=this.clock.now();
      if(!current||terminal(current)||current.owner!==this.owner||current.claimToken!==run.claimToken)return false;
      if(current.deadlineAt<=now){this.finishLocked(current,'timed_out',errorOf('JOB_TIMEOUT'));return false;}
      if(current.leaseUntil<=now){this.finishLocked(current,'interrupted',errorOf('JOB_INTERRUPTED'));return false;}
      this.store.put('job-run',run.id,{...current,leaseUntil:now+this.config.leaseMs,updatedAt:iso(now)});return true;
    });
    if(!alive)controller.abort();return alive;
  }
  expire(run,controller) {
    // The elapsed timer is authoritative even if the wall clock moves back.
    // Durable ownership/status fencing still prevents overwriting cancellation.
    try{
      if(!this.closed)this.store.transaction(()=>{
        const current=this.store.get('job-run',run.id);
        if(current&&!terminal(current)&&current.owner===this.owner&&current.claimToken===run.claimToken)this.finishLocked(current,'timed_out',errorOf('JOB_TIMEOUT'));
      });
    }catch{/* Abort even when persistence is unavailable; recovery owns the lease. */}
    finally{controller.abort();}
  }
  async checkpoint(stage,run,controller) {
    if(!this.renew(run,controller))throw fail('JOB_INTERRUPTED',ERRORS.JOB_INTERRUPTED);
    if(this.testCheckpoint)await abortable(this.testCheckpoint(stage,{runId:run.id,jobId:run.jobId,signal:controller.signal}),controller.signal);
    // Yield cooperatively even for an entirely in-memory operation. No result
    // survives a cancellation/expiry observed during the yield.
    await yieldTurn(undefined,{signal:controller.signal});
    if(!this.renew(run,controller))throw fail('JOB_INTERRUPTED',ERRORS.JOB_INTERRUPTED);
  }
  inputLocked() {
    const size=this.store.boundedSize('card',this.config.maxCards+1);
    if(size.count>this.config.maxCards||size.bytes>this.config.maxInputBytes)throw fail('JOB_INPUT_LIMIT',ERRORS.JOB_INPUT_LIMIT);
    return size.count;
  }
  async operate(run,controller) {
    await this.checkpoint('before-read',run,controller);
    if(run.kind==='recommendation-snapshot'){
      // A SQLite write transaction excludes concurrent ingest between this
      // bound check and the existing recommender's full local read.
      return this.store.transaction(()=>{
        const count=this.inputLocked(),response=this.service.recommend({limit:10});
        return {kind:run.kind,source:'local-cards',complete:true,generatedAt:iso(this.clock.now()),cardsScanned:count,selectionLimit:10,method:response.method,items:response.items.map(({card,score,reasons})=>({cardId:card.id,title:card.title.slice(0,160),titleTruncated:card.title.length>160,sourceId:card.sourceId,score,reasons:reasons.slice(0,6).map(reason=>reason.slice(0,120)),reasonsTruncated:reasons.length>6||reasons.some(reason=>reason.length>120)}))};
      });
    }
    if(run.kind==='data-quality-digest'){
      const cards=this.store.transaction(()=>{this.inputLocked();return this.store.listBounded('card',{limit:this.config.maxCards});});
      const ids=new Set(cards.map(card=>card.id));
      const counts={truncated:0,partial:0,hostAsserted:0,modelSummary:0,missingUrl:0,missingPublishedAt:0,missingEvidenceReferences:0};
      const samples=[];let affectedCards=0;
      for(let i=0;i<cards.length;i++){
        if(i%50===0)await this.checkpoint('scan',run,controller);
        const card=cards[i],issues=[];
        if(card.truncated){counts.truncated++;issues.push('truncated');}
        if(card.provenance?.partial){counts.partial++;issues.push('partial');}
        if(card.provenance?.attribution==='host-asserted')counts.hostAsserted++;
        if(card.provenance?.contentOrigin==='model-summary'||card.provenance?.summaryOrigin==='model-summary'){counts.modelSummary++;issues.push('model-summary');}
        if(!card.url){counts.missingUrl++;issues.push('missing-url');}
        if(!card.publishedAt){counts.missingPublishedAt++;issues.push('missing-published-at');}
        const missing=(card.evidenceIds||[]).filter(id=>!ids.has(id)).length;
        if(missing){counts.missingEvidenceReferences+=missing;issues.push('missing-evidence');}
        if(issues.length){affectedCards++;if(samples.length<10)samples.push({cardId:card.id,title:card.title.slice(0,160),titleTruncated:card.title.length>160,issues});}
      }
      return {kind:run.kind,source:'local-cards',complete:true,generatedAt:iso(this.clock.now()),cardsScanned:cards.length,counts,affectedCards,samples,samplesTruncated:affectedCards>samples.length};
    }
    throw fail('JOB_INTERNAL_ERROR',ERRORS.JOB_INTERNAL_ERROR);
  }
  launch(run) {
    const controller=new AbortController();this.controllers.set(run.id,controller);
    const promise=this.asWorker(()=>Promise.resolve().then(()=>this.execute(run,controller))).catch(()=>{}).finally(()=>{this.running.delete(run.id);this.controllers.delete(run.id);});
    this.running.set(run.id,promise);
  }
  async execute(run,controller) {
    let timeout=null,watch=null;
    const stop=()=>{
      try{this.renew(run,controller);}catch{controller.abort();}
    };
    try{
      timeout=this.clock.setTimeout(()=>this.expire(run,controller),Math.max(1,run.deadlineAt-this.clock.now()));timeout?.unref?.();
      watch=this.clock.setInterval(stop,Math.max(25,Math.min(1000,Math.floor(this.config.leaseMs/3))));watch?.unref?.();
      const result=await this.operate(run,controller);
      if(Buffer.byteLength(JSON.stringify(result))>this.config.maxResultBytes)throw fail('JOB_OUTPUT_LIMIT',ERRORS.JOB_OUTPUT_LIMIT);
      await this.checkpoint('before-commit',run,controller);
      this.store.transaction(()=>{
        const current=this.store.get('job-run',run.id),now=this.clock.now();
        if(!current||terminal(current)||current.owner!==this.owner||current.claimToken!==run.claimToken||this.closed||controller.signal.aborted)return;
        if(current.deadlineAt<=now){this.finishLocked(current,'timed_out',errorOf('JOB_TIMEOUT'));return;}
        if(current.leaseUntil<=now){this.finishLocked(current,'interrupted',errorOf('JOB_INTERRUPTED'));return;}
        this.finishLocked(current,'completed',null,result);
      });
    }catch(error){
      if(!this.closed)this.store.transaction(()=>{
        const current=this.store.get('job-run',run.id);
        if(!current||terminal(current)||current.owner!==this.owner||current.claimToken!==run.claimToken)return;
        const code=Object.hasOwn(ERRORS,error?.code)?error.code:'JOB_INTERNAL_ERROR';
        this.finishLocked(current,code==='JOB_TIMEOUT'?'timed_out':code==='JOB_INTERRUPTED'?'interrupted':'failed',errorOf(code));
      });
    }finally{
      if(timeout!==null)this.clock.clearTimeout(timeout);if(watch!==null)this.clock.clearInterval(watch);controller.abort();
    }
  }
  async drain() {await Promise.allSettled([...this.running.values()]);}
  async close() {
    if(this.closed)return;this.closed=true;if(this.timer!==null){this.clock.clearInterval(this.timer);this.timer=null;}
    try{this.asWorker(()=>this.store.transaction(()=>{for(const run of this.allRuns())if(run.owner===this.owner&&!terminal(run))this.finishLocked(run,'interrupted',errorOf('JOB_INTERRUPTED'));}));}
    finally{for(const controller of this.controllers.values())controller.abort();await this.drain();}
  }
}
