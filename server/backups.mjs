import { randomBytes, timingSafeEqual } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import { digest, uid } from './store.mjs';
import { hostIdentity, QGError } from './schemas.mjs';
import { BACKUP_LIMITS, validateBackupCard, validateBackupAnnotation, validateBackupSettings, validateBackupPayload, makeBackup, parseBackup, backupDigest } from './backup-format.mjs';

const safeInteger=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const id=z.string().min(1).max(100).regex(/^[a-z0-9_-]+$/i),hash=z.string().regex(/^[a-f0-9]{64}$/),key=z.string().min(1).max(200);
const mode=z.enum(['additive','overwrite']);
export const BackupExport=z.object({}).strict();
export const BackupPreview=z.object({backup:z.unknown(),mode:mode.default('additive')}).strict();
export const BackupCommit=z.object({planId:id,expectedPlanDigest:hash,approvalToken:z.string().min(1).max(200),approved:z.literal(true),acknowledgeVisibility:z.boolean().optional(),idempotencyKey:key}).strict();
export const BackupGet=z.object({restoreId:id}).strict();
export const BackupUndo=z.object({restoreId:id,expectedEpoch:safeInteger,approved:z.literal(true),idempotencyKey:key}).strict();
export const RESTORE_LIMITS=Object.freeze({planTtlMs:600000,plans:20,receipts:20,recordBytes:1048576,totalBytes:16777216,targetCards:1000,targetBytes:8388608});
export const UNDO_CAVEAT='撤销仅恢复原有卡片、设置和备注的先前值；本次新增的卡片会保留，不会删除。原先没有设置或备注时，撤销写入更高修订号的默认设置或空备注。';
const fail=(code,message)=>{throw new QGError(code,message);};
const bytes=value=>Buffer.byteLength(JSON.stringify(value));
const clone=value=>structuredClone(value);
const equal=(a,b)=>isDeepStrictEqual(a,b);
const values=value=>{if(value===null)return null;const {revision,...other}=value;return other;};
const nextRevision=(current,incoming=0)=>{
  const previous=Math.max(current||0,incoming||0);
  if(!Number.isSafeInteger(previous)||previous>=Number.MAX_SAFE_INTEGER)fail('REVISION_LIMIT','恢复后的修订号超出安全范围');
  return previous+1;
};
const typed=(kind,value)=>{if(value===null)fail('BACKUP_RECORD_INVALID','已保存记录不能为空');return kind==='card'?validateBackupCard(value):kind==='annotation'?validateBackupAnnotation(value):validateBackupSettings(value);};
const Change=z.object({kind:z.enum(['card','annotation','settings']),id, before:z.unknown().nullable(),after:z.unknown()}).strict();
const Counts=z.object(Object.fromEntries(['cardsAdded','cardsOverwritten','cardsUnchanged','annotationsAdded','annotationsOverwritten','annotationsUnchanged','settingsAdded','settingsOverwritten','settingsUnchanged'].map(name=>[name,safeInteger]))).strict();
const Visibility=z.object({policyDigest:hash,principals:z.array(z.unknown()).max(100),requiresAcknowledgement:z.boolean(),notice:z.string().max(1000)}).strict();
const conflictSchema=z.object({kind:z.enum(['card','annotation','settings']),id,reason:z.literal('existing-differs')}).strict();
const scopeSchema=z.object({cardIds:z.array(id).max(100),annotationIds:z.array(id).max(100),settings:z.boolean()}).strict();
const Plan=z.object({id,restoreId:id,createdAt:z.string(),expiresAt:z.string(),inputHash:hash,scope:scopeSchema,mode,storeInstanceId:z.string().max(100),mutationEpoch:safeInteger,policyDigest:hash,changes:z.array(Change).max(201),counts:Counts,conflicts:z.array(conflictSchema).max(201),visibility:Visibility,undoCaveat:z.string().max(1000),approvalTokenDigest:hash,planDigest:hash}).strict();
const UndoStatus=z.object({available:z.boolean(),expectedEpoch:safeInteger,reason:z.string().nullable(),undoneAt:z.string().optional()}).strict();
const Result=z.object({restoreId:id,planId:id,status:z.enum(['committed','undone']),mode,createdAt:z.string(),beforeEpoch:safeInteger,afterEpoch:safeInteger,counts:Counts,visibility:Visibility,undoCaveat:z.string().max(1000),undo:UndoStatus}).strict();
const Receipt=z.object({id,storeInstanceId:z.string().max(100),policyDigest:hash,changes:z.array(Change).max(201),commitResult:Result,undoResult:Result.nullable(),undoReserveBytes:safeInteger,receiptDigest:hash}).strict();
const KeyRecord=z.object({id:hash,restoreId:id,storeInstanceId:z.string().max(100),operation:z.enum(['commit','undo']),fingerprint:hash,result:Result}).strict();
function validateChanges(changes) {
  const seen=new Set();
  for(const change of changes){
    const identity=`${change.kind}:${change.id}`;
    if(seen.has(identity))fail('BACKUP_RECORD_INVALID','恢复记录存在重复身份');seen.add(identity);
    for(const value of [change.before,change.after])if(value!==null){
      typed(change.kind,value);
      if(change.kind==='card'&&value.id!==change.id||change.kind==='annotation'&&value.cardId!==change.id||change.kind==='settings'&&change.id!=='workspace')fail('BACKUP_RECORD_INVALID','恢复记录身份不一致');
    }
    if(change.after===null)fail('BACKUP_RECORD_INVALID','恢复记录不能删除内容');
  }
}
function validatePlan(value) {
  const plan=Plan.parse(value),{planDigest,...body}=plan;
  if(digest(body)!==planDigest)fail('BACKUP_RECORD_INVALID','恢复预览记录已损坏');validateChanges(plan.changes);return plan;
}
function validateReceipt(value) {
  const receipt=Receipt.parse(value),{receiptDigest,...body}=receipt;
  if(digest(body)!==receiptDigest||receipt.undoResult!==null&&receipt.undoReserveBytes!==0)fail('BACKUP_RECORD_INVALID','恢复回执记录已损坏');validateChanges(receipt.changes);return receipt;
}
const sealReceipt=body=>({...body,receiptDigest:digest(body)});
const category=card=>card.local===true?'local':card.provenance?.mode==='host-assisted'?'host':'source';
function sameIdentity(before,after) {
  return before.id===after.id&&category(before)===category(after)&&before.sourceId===after.sourceId&&before.externalId===after.externalId&&before.kind===after.kind&&
    (category(before)!=='host'||equal(hostIdentity(before.provenance),hostIdentity(after.provenance)));
}
function assertGraph(cards) {
  const ids=new Set(cards.map(card=>card.id));
  for(const card of cards)for(const evidenceId of card.evidenceIds)if(!ids.has(evidenceId))fail('BACKUP_GRAPH_INVALID','证据引用不完整；未导出或恢复任何内容');
}

// Synchronous local-only transactions. No connector, job, AI, script or network
// operation is ever dispatched by export, preview, commit or undo.
export class BackupsEngine {
  constructor(service,options={}) {this.service=service;this.store=service.store;this.now=options.backupNow||Date.now;this.checkpoint=options.backupCheckpoint||(()=>{});}
  guard(tool) {this.service.access.assertOperation(tool);}
  read(kind,id) {return this.store.readTypedRecord(kind,id,{maxBytes:RESTORE_LIMITS.recordBytes,validate:kind==='backup-plan'?validatePlan:kind==='backup-restore'?validateReceipt:KeyRecord.parse.bind(KeyRecord)});}
  targetCards(limit=RESTORE_LIMITS.targetCards) {
    const cards=this.store.readTypedBounded('card',{limit,maxBytes:RESTORE_LIMITS.targetBytes,validate:validateBackupCard});return cards;
  }
  contentRecord(kind,id) {
    return this.store.readTypedRecord(kind,id,{maxBytes:RESTORE_LIMITS.recordBytes,validate:value=>typed(kind,value),idField:kind==='settings'?null:kind==='annotation'?'cardId':'id',...(kind==='settings'?{fixedId:'workspace'}:{})});
  }
  export(args={}) {
    this.guard('qg_export_content_backup');BackupExport.parse(args);
    return this.store.transaction(()=>{
      const bounds=[['card',100],['annotation',100],['settings',1]],sizes=bounds.map(([kind,limit])=>this.store.boundedSize(kind,limit+1));
      if(sizes.some((size,index)=>size.count>bounds[index][1])||sizes.reduce((sum,size)=>sum+size.bytes,0)>BACKUP_LIMITS.bytes)fail('BACKUP_CAPACITY','全部资料超出单次备份限制；不会生成不完整备份');
      const cards=this.store.readTypedBounded('card',{limit:100,maxBytes:BACKUP_LIMITS.bytes,validate:validateBackupCard});
      const annotations=this.store.readTypedBounded('annotation',{limit:100,maxBytes:BACKUP_LIMITS.bytes,validate:validateBackupAnnotation,idField:'cardId'});
      const settings=this.store.readTypedBounded('settings',{limit:1,maxBytes:BACKUP_LIMITS.bytes,validate:value=>typed('settings',value),idField:null,fixedId:'workspace'})[0]||null;
      return makeBackup(validateBackupPayload({cards,annotations,settings}),{exportedAt:new Date(this.now()).toISOString()});
    });
  }
  buildChanges(payload,mode,beforeCards) {
    const changes=[],conflicts=[],counts=Object.fromEntries(Object.keys(Counts.shape).map(name=>[name,0])),cards=new Map(beforeCards.map(card=>[card.id,card]));
    const add=(kind,id,before,incoming)=>{
      const prefix=kind==='card'?'cards':kind==='annotation'?'annotations':'settings';
      if(before&&kind==='card'&&!sameIdentity(before,incoming))fail('BACKUP_IDENTITY_CONFLICT','恢复不能转换现有卡片的身份、类别或来源');
      if(before&&equal(values(before),values(incoming))){counts[`${prefix}Unchanged`]++;return;}
      if(before&&mode==='additive'){conflicts.push({kind,id,reason:'existing-differs'});return;}
      const after=clone(incoming);
      if(kind!=='card'||Object.hasOwn(before||{},'revision')||Object.hasOwn(incoming,'revision'))after.revision=nextRevision(before?.revision,incoming.revision);
      if((kind!=='card'||before!==null)&&after.revision===Number.MAX_SAFE_INTEGER)fail('REVISION_LIMIT','恢复需要保留一个安全修订号用于立即撤销');
      typed(kind,after);changes.push({kind,id,before:clone(before),after});counts[`${prefix}${before?'Overwritten':'Added'}`]++;
    };
    for(const card of payload.cards)add('card',card.id,cards.get(card.id)||null,card);
    for(const annotation of payload.annotations)add('annotation',annotation.cardId,this.contentRecord('annotation',annotation.cardId),annotation);
    if(payload.settings!==null)add('settings','workspace',this.contentRecord('settings','workspace'),payload.settings);
    return {changes,counts,conflicts};
  }
  proposedCards(beforeCards,changes) {
    const cards=new Map(beforeCards.map(card=>[card.id,card]));for(const change of changes)if(change.kind==='card')cards.set(change.id,change.after);
    const after=[...cards.values()].sort((a,b)=>a.id.localeCompare(b.id));
    if(after.length>RESTORE_LIMITS.targetCards+BACKUP_LIMITS.cards||bytes(after)>RESTORE_LIMITS.targetBytes)fail('BACKUP_CAPACITY','恢复后的卡片图超出安全分析范围');assertGraph(after);return after;
  }
  visibility(beforeCards,afterCards,changes) {return Visibility.parse(this.service.access.backupVisibility(beforeCards,afterCards,[...new Set(changes.filter(change=>change.kind!=='settings').map(change=>change.id))]));}
  capacity(kind,record,{replaceId=null,maxCount=RESTORE_LIMITS.receipts}={}) {
    const size=this.store.boundedSize(kind,maxCount+1),old=replaceId?this.store.db.prepare('SELECT length(CAST(value AS BLOB)) AS bytes FROM records WHERE kind=? AND id=?').get(kind,replaceId):null;
    if(bytes(record)>RESTORE_LIMITS.recordBytes||size.count+(old?0:1)>maxCount||size.bytes-(old?.bytes||0)+bytes(record)>RESTORE_LIMITS.totalBytes)fail('BACKUP_CAPACITY','恢复记录容量已满；为保留安全撤销和重试回执，本次操作未写入');
  }
  receiptCapacity(receipt,keyRecord,replaceId=null) {
    this.capacity('backup-restore',receipt,{replaceId});this.capacity('backup-key',keyRecord,{maxCount:RESTORE_LIMITS.receipts*2});
    const receipts=this.store.boundedSize('backup-restore',RESTORE_LIMITS.receipts+1),keys=this.store.boundedSize('backup-key',RESTORE_LIMITS.receipts*2+1);
    const previous=replaceId?this.store.db.prepare('SELECT length(CAST(value AS BLOB)) AS bytes FROM records WHERE kind=? AND id=?').get('backup-restore',replaceId):null;
    const existing=this.store.readTypedBounded('backup-restore',{limit:RESTORE_LIMITS.receipts,maxBytes:RESTORE_LIMITS.totalBytes,validate:validateReceipt});
    // Every un-undone receipt retains its own future receipt/key allowance.
    // Later backup-only writes cannot consume another restore's undo reserve.
    const reserved=existing.filter(row=>row.id!==replaceId).reduce((sum,row)=>sum+row.undoReserveBytes,receipt.undoReserveBytes);
    if(!Number.isSafeInteger(reserved)||receipts.bytes+keys.bytes-(previous?.bytes||0)+bytes(receipt)+bytes(keyRecord)+reserved>RESTORE_LIMITS.totalBytes)fail('BACKUP_CAPACITY','恢复回执与幂等记录总容量已满；本次操作未写入');
  }
  undoChanges(originals) {
    const changes=[];
    for(const original of originals){
      if(original.kind==='card'&&original.before===null)continue;
      const after=clone(original.before||(original.kind==='settings'?{values:{sort:'priority',reduceTransparency:false},revision:0}:{cardId:original.id,values:{note:'',tags:[]},revision:0}));
      if(original.kind!=='card'||Object.hasOwn(original.after,'revision'))after.revision=nextRevision(original.after.revision);
      typed(original.kind,after);changes.push({kind:original.kind,id:original.id,before:original.after,after});
    }
    return changes;
  }
  undoResult(receipt,undoEpoch,undoneAt) {
    return {...clone(receipt.commitResult),status:'undone',undo:{available:false,expectedEpoch:undoEpoch,reason:'already-undone',undoneAt}};
  }
  reserveUndo(body,undoEpoch) {
    const baseline=sealReceipt({...body,undoReserveBytes:0});
    // ECMAScript ISO timestamps are at most 27 ASCII bytes. Hashed keys and
    // fingerprints have a fixed size independent of the user's eventual key.
    const result=this.undoResult(baseline,undoEpoch,'+999999-12-31T23:59:59.999Z');
    const projected=sealReceipt({...body,undoResult:result,undoReserveBytes:0});
    const projectedKey={id:'0'.repeat(64),restoreId:body.id,storeInstanceId:body.storeInstanceId,operation:'undo',fingerprint:'0'.repeat(64),result};
    if(bytes(projected)>RESTORE_LIMITS.recordBytes)fail('BACKUP_CAPACITY','恢复回执无法保留安全撤销所需空间；本次操作未写入');
    const undoReserveBytes=Math.max(0,bytes(projected)-bytes(baseline))+bytes(projectedKey);
    return sealReceipt({...body,undoReserveBytes});
  }
  preview(args) {
    this.guard('qg_preview_content_restore');const input=BackupPreview.parse(args),backup=parseBackup(input.backup),payload=backup.payload;
    return this.store.transaction(()=>{
      const beforeCards=this.targetCards(),built=this.buildChanges(payload,input.mode,beforeCards),afterCards=this.proposedCards(beforeCards,built.changes),visibility=this.visibility(beforeCards,afterCards,built.changes),state=this.store.mutationState();
      this.proposedCards(afterCards,this.undoChanges(built.changes));
      const createdAt=new Date(this.now()).toISOString(),expiresAt=new Date(this.now()+RESTORE_LIMITS.planTtlMs).toISOString(),approvalToken=randomBytes(32).toString('hex');
      const body={id:uid('backup_plan'),restoreId:uid('backup_restore'),createdAt,expiresAt,inputHash:backupDigest(backup),scope:{cardIds:payload.cards.map(card=>card.id),annotationIds:payload.annotations.map(annotation=>annotation.cardId),settings:payload.settings!==null},mode:input.mode,...state,policyDigest:visibility.policyDigest,...built,visibility,undoCaveat:UNDO_CAVEAT,approvalTokenDigest:digest(approvalToken)};
      const plan={...body,planDigest:digest(body)};
      validatePlan(plan);
      // Bounded scan; only expired preview records may be reclaimed. Receipts
      // and idempotency keys are never silently evicted.
      const plans=this.store.readTypedBounded('backup-plan',{limit:RESTORE_LIMITS.plans,maxBytes:RESTORE_LIMITS.totalBytes,validate:validatePlan});
      for(const old of plans)if(Date.parse(old.expiresAt)<=this.now())this.store.delete('backup-plan',old.id);
      this.capacity('backup-plan',plan,{maxCount:RESTORE_LIMITS.plans});this.store.put('backup-plan',plan.id,plan);
      return {planId:plan.id,planDigest:plan.planDigest,approvalToken,restoreId:plan.restoreId,expiresAt,storeInstanceId:plan.storeInstanceId,mutationEpoch:plan.mutationEpoch,mode:plan.mode,counts:clone(plan.counts),conflicts:clone(plan.conflicts),visibility:clone(visibility),undoCaveat:UNDO_CAVEAT};
    });
  }
  replay(operation,input) {
    const id=digest([operation,input.idempotencyKey]),fingerprint=digest(input),prior=this.read('backup-key',id);
    if(prior){if(prior.storeInstanceId!==this.store.mutationState().storeInstanceId)fail('BACKUP_STALE','恢复回执不属于当前数据库');if(prior.operation!==operation||prior.fingerprint!==fingerprint)fail('IDEMPOTENCY_CONFLICT','相同幂等键不能对应不同恢复请求');return {id,fingerprint,result:clone(prior.result)};}
    return {id,fingerprint,result:null};
  }
  assertState(storeInstanceId,epoch) {
    const current=this.store.mutationState();
    if(current.storeInstanceId!==storeInstanceId||current.mutationEpoch!==epoch)fail('BACKUP_STALE','本地资料已变化；请重新预览恢复，或保留当前内容');
  }
  assertImages(changes,which) {for(const change of changes)if(!equal(this.contentRecord(change.kind,change.id),change[which]))fail('BACKUP_STALE','恢复目标已变化；未写入任何内容');}
  keyRecord(operation,replay,result) {return {id:replay.id,restoreId:result.restoreId,storeInstanceId:this.store.mutationState().storeInstanceId,operation,fingerprint:replay.fingerprint,result};}
  commit(args) {
    this.guard('qg_commit_content_restore');const input=BackupCommit.parse(args);
    return this.store.transaction(()=>{
      const replay=this.replay('commit',input);if(replay.result)return replay.result;
      const plan=this.read('backup-plan',input.planId);if(!plan)fail('BACKUP_PLAN_NOT_FOUND','恢复预览不存在；请重新预览');
      const candidate=Buffer.from(digest(input.approvalToken),'hex'),expected=Buffer.from(plan.approvalTokenDigest,'hex');
      if(plan.planDigest!==input.expectedPlanDigest||!timingSafeEqual(candidate,expected))fail('BACKUP_PLAN_MISMATCH','恢复确认与预览不匹配');
      if(Date.parse(plan.expiresAt)<=this.now())fail('BACKUP_PLAN_EXPIRED','恢复预览已过期；请重新预览');
      this.assertState(plan.storeInstanceId,plan.mutationEpoch);this.assertImages(plan.changes,'before');
      const beforeCards=this.targetCards(),afterCards=this.proposedCards(beforeCards,plan.changes),visibility=this.visibility(beforeCards,afterCards,plan.changes);
      if(visibility.policyDigest!==plan.policyDigest)fail('BACKUP_POLICY_CHANGED','外部身份的访问规则已变化；请重新预览');
      if(plan.conflicts.length)fail('BACKUP_CONFLICT','追加恢复存在冲突；请检查后重新选择明确覆盖');
      if(visibility.requiresAcknowledgement&&!input.acknowledgeVisibility)fail('BACKUP_VISIBILITY_ACK_REQUIRED','请先确认恢复内容在现有授权下的可见性');
      if(this.read('backup-restore',plan.restoreId))fail('BACKUP_PLAN_USED','该预览已提交；请使用原幂等键查看结果');
      const afterEpoch=plan.mutationEpoch+plan.changes.length,undoWrites=plan.changes.filter(change=>change.kind!=='card'||change.before!==null).length;if(!Number.isSafeInteger(afterEpoch)||!Number.isSafeInteger(afterEpoch+undoWrites))fail('REVISION_LIMIT','数据库修改版本达到上限');
      const result={restoreId:plan.restoreId,planId:plan.id,status:'committed',mode:plan.mode,createdAt:new Date(this.now()).toISOString(),beforeEpoch:plan.mutationEpoch,afterEpoch,counts:plan.counts,visibility,undoCaveat:UNDO_CAVEAT,undo:{available:true,expectedEpoch:afterEpoch,reason:null}};
      const undoChanges=this.undoChanges(plan.changes);this.proposedCards(afterCards,undoChanges);
      const receipt=this.reserveUndo({id:plan.restoreId,storeInstanceId:plan.storeInstanceId,policyDigest:plan.policyDigest,changes:plan.changes,commitResult:result,undoResult:null},afterEpoch+undoWrites),keyRecord=this.keyRecord('commit',replay,result);
      this.receiptCapacity(receipt,keyRecord);
      for(const change of plan.changes){this.store.put(change.kind,change.id,change.after);this.checkpoint('after-write');}
      if(this.store.mutationState().mutationEpoch!==afterEpoch)fail('BACKUP_STALE','数据库修改版本不符合恢复计划');
      this.checkpoint('before-receipt');this.store.put('backup-restore',receipt.id,receipt);this.store.put('backup-key',keyRecord.id,keyRecord);
      this.checkpoint('before-audit');this.store.audit('content_backup_restored',{restoreId:result.restoreId,planId:plan.id,mode:plan.mode,counts:plan.counts,beforeEpoch:plan.mutationEpoch,afterEpoch});
      return clone(result);
    });
  }
  availability(receipt) {
    if(receipt.undoResult)return {available:false,expectedEpoch:receipt.undoResult.undo.expectedEpoch,reason:'already-undone',undoneAt:receipt.undoResult.undo.undoneAt};
    try {
      this.assertState(receipt.storeInstanceId,receipt.commitResult.afterEpoch);this.assertImages(receipt.changes,'after');
      const cards=this.targetCards(RESTORE_LIMITS.targetCards+BACKUP_LIMITS.cards),visibility=this.visibility(cards,cards,[]);
      if(visibility.policyDigest!==receipt.policyDigest)return {available:false,expectedEpoch:receipt.commitResult.afterEpoch,reason:'policy-changed'};
      return {available:true,expectedEpoch:receipt.commitResult.afterEpoch,reason:null};
    } catch(error) {if(error instanceof QGError)return {available:false,expectedEpoch:receipt.commitResult.afterEpoch,reason:'store-changed'};throw error;}
  }
  get(args) {
    this.guard('qg_get_content_restore');const {restoreId}=BackupGet.parse(args);
    return this.store.transaction(()=>{const receipt=this.read('backup-restore',restoreId);if(!receipt)fail('BACKUP_RESTORE_NOT_FOUND','恢复回执不存在');return {...clone(receipt.undoResult||receipt.commitResult),undo:this.availability(receipt)};});
  }
  undo(args) {
    this.guard('qg_undo_content_restore');const input=BackupUndo.parse(args);
    return this.store.transaction(()=>{
      const replay=this.replay('undo',input);if(replay.result)return replay.result;
      const receipt=this.read('backup-restore',input.restoreId);if(!receipt)fail('BACKUP_RESTORE_NOT_FOUND','恢复回执不存在');
      if(receipt.undoResult)fail('BACKUP_ALREADY_UNDONE','本次恢复已经撤销；请使用原幂等键查看结果');
      if(input.expectedEpoch!==receipt.commitResult.afterEpoch)fail('BACKUP_STALE','撤销确认版本与恢复回执不匹配');
      this.assertState(receipt.storeInstanceId,receipt.commitResult.afterEpoch);this.assertImages(receipt.changes,'after');
      const cards=this.targetCards(RESTORE_LIMITS.targetCards+BACKUP_LIMITS.cards),visibility=this.visibility(cards,cards,[]);
      if(visibility.policyDigest!==receipt.policyDigest)fail('BACKUP_POLICY_CHANGED','访问规则已变化，不能使用旧恢复回执撤销');
      const changes=this.undoChanges(receipt.changes);
      this.proposedCards(cards,changes);
      const undoEpoch=receipt.commitResult.afterEpoch+changes.length;if(!Number.isSafeInteger(undoEpoch))fail('REVISION_LIMIT','数据库修改版本达到上限');
      const result=this.undoResult(receipt,undoEpoch,new Date(this.now()).toISOString());
      const {receiptDigest,...previousBody}=receipt;const stored=sealReceipt({...previousBody,undoResult:result,undoReserveBytes:0}),keyRecord=this.keyRecord('undo',replay,result);
      this.receiptCapacity(stored,keyRecord,receipt.id);
      for(const change of changes){this.store.put(change.kind,change.id,change.after);this.checkpoint('undo-after-write');}
      if(this.store.mutationState().mutationEpoch!==undoEpoch)fail('BACKUP_STALE','数据库修改版本不符合撤销计划');
      this.checkpoint('undo-before-receipt');this.store.put('backup-restore',receipt.id,stored);this.store.put('backup-key',keyRecord.id,keyRecord);
      this.checkpoint('undo-before-audit');this.store.audit('content_backup_undone',{restoreId:receipt.id,restoredRecords:changes.length,addedCardsRemain:receipt.changes.filter(change=>change.kind==='card'&&change.before===null).length,beforeEpoch:receipt.commitResult.afterEpoch,afterEpoch:undoEpoch});
      return clone(result);
    });
  }
}
