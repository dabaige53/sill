import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { hostIdentity, QGError } from './schemas.mjs';
import { auditAttribution, idempotencyAddress } from './access.mjs';

export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const uid = prefix => `${prefix}_${randomUUID()}`;
const decode = row => row ? JSON.parse(row.value) : null;
const originalFields = item => ({
  externalId:item.externalId,title:item.title,content:item.content,url:item.url,kind:item.kind,
  publishedAt:item.publishedAt,start:item.start,end:item.end,allDay:item.allDay,startDate:item.startDate,endDate:item.endDate,
  tags:item.tags,summary:item.provenance.summaryOrigin==='upstream-original'?item.summary:null,
});
const sourceEnrichment = (previous,item) => item.provenance.contentOrigin==='upstream-original'&&
  ((previous.truncated&&previous.provenance.contentOrigin==='upstream-original'&&item.content.startsWith(previous.content))||
    (previous.provenance.contentOrigin==='model-summary'&&previous.content===''))&&
  digest({...originalFields(previous),content:''})===digest({...originalFields(item),content:''});

export class Store {
  constructor(directory) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(join(directory, 'quiet-glass.sqlite'));
    chmodSync(join(directory, 'quiet-glass.sqlite'), 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS audit (seq INTEGER PRIMARY KEY, time TEXT NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL);`);
  }
  close() { this.db.close(); }
  get(kind, id) { if(kind.endsWith('-key'))[kind,id]=idempotencyAddress(kind,id);return decode(this.db.prepare('SELECT value FROM records WHERE kind=? AND id=?').get(kind,id)); }
  list(kind) { return this.db.prepare('SELECT value FROM records WHERE kind=? ORDER BY id').all(kind).map(decode); }
  count(kind) { return Number(this.db.prepare('SELECT COUNT(*) AS total FROM records WHERE kind=?').get(kind).total); }
  // LIMIT is applied in SQLite, before allocating or decoding record contents.
  listBounded(kind,{limit,offset=0}={}) {
    if(!Number.isSafeInteger(limit)||limit<1||limit>10001||!Number.isSafeInteger(offset)||offset<0||offset>1000000)throw new QGError('STORE_BOUND','Invalid bounded record request');
    return this.db.prepare('SELECT value FROM records WHERE kind=? ORDER BY id LIMIT ? OFFSET ?').all(kind,limit,offset).map(decode);
  }
  boundedSize(kind,limit) {
    if(!Number.isSafeInteger(limit)||limit<1||limit>10001)throw new QGError('STORE_BOUND','Invalid bounded size request');
    const rows=this.db.prepare('SELECT length(CAST(value AS BLOB)) AS bytes FROM records WHERE kind=? ORDER BY id LIMIT ?').all(kind,limit);
    return {count:rows.length,bytes:rows.reduce((sum,row)=>sum+Number(row.bytes),0)};
  }
  delete(kind,id) { return this.db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind,id); }
  put(kind,id,value) { if(kind.endsWith('-key'))[kind,id]=idempotencyAddress(kind,id);this.db.prepare('INSERT INTO records VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value').run(kind,id,JSON.stringify(value)); return value; }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  audit(event, detail) { const attribution=auditAttribution();if(attribution)detail={...detail,...attribution};this.db.prepare('INSERT INTO audit(time,event,detail) VALUES(?,?,?)').run(new Date().toISOString(),event,JSON.stringify(detail)); }
  history(limit=30) { return this.db.prepare('SELECT * FROM audit ORDER BY seq DESC LIMIT ?').all(limit).map(r=>({...r,detail:JSON.parse(r.detail)})); }
  ingest(sourceId, items) {
    return this.transaction(() => items.map(item => {
      const id = `card_${digest([sourceId,item.externalId]).slice(0,32)}`;
      const previous = this.get('card',id);
      const now = new Date().toISOString();
      const contentHash = digest(item);
      if (previous?.contentHash === contentHash) return previous;
      const card = { ...item, id, sourceId, contentHash, collectedAt: now, firstCollectedAt: previous?.firstCollectedAt || now, state: previous?.state || { read:false, bookmarked:false, dismissed:false, snoozedUntil:null } };
      this.put('card',id,card);
      return card;
    }));
  }
  // Host data has a separate identity namespace and receipts. BEGIN IMMEDIATE
  // covers evidence lookup, revision comparison, card/receipt writes and audit,
  // including a whole batch. A replay returns the latest record, never the old
  // successful payload. Caller-provided attribution is not authentication.
  ingestHost(sourceId,items) {
    return this.transaction(()=>{
      const identities=new Set();
      for(const item of items){
        const identity=digest(hostIdentity(item.provenance));
        if(identities.has(identity))throw new QGError('INGEST_CONFLICT','同一批次不能重复导入同一上游记录',{reason:'duplicate-identity'});
        identities.add(identity);
        for(const evidenceId of item.evidenceIds)if(!this.get('card',evidenceId))throw new QGError('EVIDENCE_NOT_FOUND','引用的证据卡片不存在');
      }
      return items.map(item=>{
        const identity=hostIdentity(item.provenance),id=`card_${digest(['host-assisted',...identity]).slice(0,32)}`;
        const receiptId=digest([identity,item.expectedRevision]),fingerprint=digest(item);
        const previous=this.get('card',id),receipt=this.get('host-import-receipt',receiptId);
        const conflict=(reason,message)=>{throw new QGError('INGEST_CONFLICT',message,{reason,...(previous?{current:previous}:{})});};
        if(receipt){
          if(receipt.digest!==fingerprint)conflict('used-revision','此导入版本已用于不同载荷；请核对当前卡片后再决定');
          if(!previous)throw new QGError('IMPORT_RECEIPT_INVALID','导入记录与卡片不一致；请检查本地数据库');
          return {card:previous,replayed:true};
        }
        if(item.expectedRevision!==(previous?.revision||0))conflict('revision','来源卡片已在另一处更新；请核对当前修订号后再决定');
        if(previous){
          if(previous.revision===Number.MAX_SAFE_INTEGER)throw new QGError('REVISION_LIMIT','导入卡片修订号已达到上限');
          const before=previous.provenance,after=item.provenance;
          if(!before||before.mode!=='host-assisted'||digest(hostIdentity(before))!==digest(identity))conflict('identity','来源身份与现有卡片不一致');
          if(Date.parse(after.retrievedAt)<Date.parse(before.retrievedAt))conflict('stale-retrieval','读取时间早于当前卡片，不能覆盖较新的导入');
          if(before.upstreamUpdatedAt&&!after.upstreamUpdatedAt)conflict('missing-upstream-version','不能移除已保存的上游更新时间');
          if(before.upstreamUpdatedAt&&Date.parse(after.upstreamUpdatedAt)<Date.parse(before.upstreamUpdatedAt))conflict('stale-upstream','上游版本早于当前卡片，不能覆盖较新的来源内容');
          if(before.contentOrigin==='upstream-original'&&after.contentOrigin==='model-summary')conflict('original-loss','已有来源原文不能被仅含模型摘要的导入覆盖');
          const sameVersion=before.upstreamUpdatedAt&&after.upstreamUpdatedAt&&Date.parse(before.upstreamUpdatedAt)===Date.parse(after.upstreamUpdatedAt);
          const sameRetrieval=Date.parse(before.retrievedAt)===Date.parse(after.retrievedAt);
          if((sameVersion||sameRetrieval)&&digest(originalFields(previous))!==digest(originalFields(item))&&!sourceEnrichment(previous,item))conflict('source-version','相同来源版本或读取时间对应不同原文，不能覆盖；请重新读取来源');
        }
        const {expectedRevision,...values}=item,now=new Date().toISOString();
        const evidenceIds=[...new Set([...(previous?.evidenceIds||[]),...values.evidenceIds])];
        if(evidenceIds.length>100)throw new QGError('EVIDENCE_LIMIT','保留的证据引用不能超过 100 条');
        const provenance={...values.provenance,mode:'host-assisted',attribution:'host-asserted'};
        const card={...values,evidenceIds,provenance,id,sourceId,revision:expectedRevision+1,
          contentHash:digest({...values,evidenceIds,provenance}),collectedAt:now,firstCollectedAt:previous?.firstCollectedAt||now,
          state:previous?.state||{read:false,bookmarked:false,dismissed:false,snoozedUntil:null}};
        this.put('card',id,card);
        this.put('host-import-receipt',receiptId,{id,digest:fingerprint,fromRevision:expectedRevision,toRevision:card.revision});
        this.audit(previous?'host_import_updated':'host_import_created',{id,sourceId,provider:provenance.provider,fromRevision:expectedRevision,toRevision:card.revision,truncated:card.truncated,partial:provenance.partial});
        return {card,replayed:false};
      });
    });
  }
}
