import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { ConfigSchema } from '../server/config.mjs';
import { Service } from '../server/service.mjs';
import { Store } from '../server/store.mjs';
import { makeBackup } from '../server/backup-format.mjs';
import { RESTORE_LIMITS } from '../server/backups.mjs';

async function fixture(t,options={},extra={}) {
  const dir=await mkdtemp(join(tmpdir(),'qg-backups-')),config=ConfigSchema.parse({dataDir:dir,...extra}),services=[];
  const open=()=>{const service=new Service(config,{fetchImpl:async()=>{throw new Error('No network allowed');},...options});services.push(service);return service;};
  const s=open();t.after(async()=>{for(const service of services.reverse())await service.close();await rm(dir,{recursive:true,force:true});});return {s,dir,config,open};
}
const note=(s,title='PRIVATE original',key=title)=>s.createNote({title,content:`PRIVATE content ${title}`,tags:['Personal'],idempotencyKey:key});
const commitInput=(p,key='commit')=>({planId:p.planId,expectedPlanDigest:p.planDigest,approvalToken:p.approvalToken,approved:true,acknowledgeVisibility:true,idempotencyKey:key});
const undoInput=(r,key='undo')=>({restoreId:r.restoreId,expectedEpoch:r.afterEpoch,approved:true,idempotencyKey:key});
const code=(fn,expected)=>assert.throws(fn,error=>error.code===expected);
const exportPayload=s=>s.exportBackup({}).payload;
const epoch=s=>s.store.mutationState().mutationEpoch;
const rows=s=>s.store.db.prepare('SELECT * FROM records ORDER BY kind,id').all();

test('store identity is durable; mutation epochs include every real records mutation across connections and rollback',async t=>{
  const {s,open,dir}=await fixture(t),other=open(),initial=s.store.mutationState();
  assert.deepEqual(other.store.mutationState(),initial);
  const raw=new DatabaseSync(join(dir,'quiet-glass.sqlite'));t.after(()=>raw.close());
  const insert=raw.prepare('INSERT INTO records VALUES (?,?,?)'),update=raw.prepare('UPDATE records SET value=? WHERE kind=? AND id=?'),del=raw.prepare('DELETE FROM records WHERE kind=? AND id=?');
  for(const kind of ['card','settings','annotation','note-key','job','jobrun','script-run','request','conversation','message','host-import-receipt','backup-key:principal','backup-plan-other']){
    const before=epoch(s);insert.run(kind,'synthetic','{}');assert.equal(epoch(other),before+1,kind);
    update.run('{}',kind,'synthetic');assert.equal(epoch(s),before+1,'same bytes do not change epoch');
    update.run('{"changed":true}',kind,'synthetic');assert.equal(epoch(s),before+2);del.run(kind,'synthetic');assert.equal(epoch(s),before+3);
  }
  for(const kind of ['backup-plan','backup-restore','backup-key']){const before=epoch(s);insert.run(kind,'synthetic','{}');update.run('{"changed":true}',kind,'synthetic');del.run(kind,'synthetic');assert.equal(epoch(s),before);}
  const before=epoch(s);s.store.audit('fixture',{});assert.equal(epoch(s),before);
  assert.throws(()=>other.store.transaction(()=>{other.store.put('pending','temp',{});throw Error('rollback');}),/rollback/);assert.equal(epoch(s),before);assert.equal(s.store.get('pending','temp'),null);
  raw.prepare('UPDATE store_metadata SET mutation_epoch=? WHERE singleton=1').run(Number.MAX_SAFE_INTEGER);
  assert.throws(()=>insert.run('pending','overflow','{}'),/MUTATION_EPOCH_LIMIT/);assert.equal(s.store.get('pending','overflow'),null);assert.equal(epoch(s),Number.MAX_SAFE_INTEGER);
});

test('bounded export includes only complete typed cards, annotations and ordinary settings',async t=>{
  const {s}=await fixture(t),a=note(s);s.updateAnnotation({cardId:a.id,set:{note:'PRIVATE annotation'},expectedRevision:0});s.updateSettings({set:{sort:'time'},expectedRevision:0});
  for(const kind of ['job','jobrun','script-run','workflow','request','conversation','message','action','ai-run','connector','credentials','principal','note-key','host-import-receipt'])s.store.put(kind,'operational',{secret:'DO_NOT_EXPORT',id:'operational'});
  const before=epoch(s),backup=s.exportBackup({});assert.equal(epoch(s),before);assert.equal(backup.payload.cards.length,1);assert.equal(backup.payload.annotations.length,1);assert.equal(backup.payload.settings.values.sort,'time');assert.ok(!JSON.stringify(backup).includes('DO_NOT_EXPORT'));
  s.store.put('card',a.id,{...s.store.get('card',a.id),id:'wrong'});code(()=>s.exportBackup({}),'BACKUP_RECORD_INVALID');
});

test('export bounds all rows before decoding; rejects oversized or malformed rows and broken evidence graphs',async t=>{
  const {s}=await fixture(t);let decodes=0;const original=s.store.decodeTypedRow.bind(s.store);s.store.decodeTypedRow=(...args)=>{decodes++;return original(...args);};
  for(let i=0;i<101;i++)s.store.put('card',`bad_${i}`,{malformed:true});code(()=>s.exportBackup({}),'BACKUP_CAPACITY');assert.equal(decodes,0);
  s.store.db.exec("DELETE FROM records WHERE kind='card'");s.store.db.prepare('INSERT INTO records VALUES (?,?,?)').run('card','oversized','x'.repeat(262145));code(()=>s.exportBackup({}),'BACKUP_CAPACITY');assert.equal(decodes,0);
  s.store.delete('card','oversized');const id=s.ingest({sourceId:'fixture',items:[{externalId:'one',title:'Broken',content:'x'}]}).cardIds[0];s.store.put('card',id,{...s.store.get('card',id),evidenceIds:['missing']});assert.throws(()=>s.exportBackup({}));
});

test('preview is metadata-only; additive conflicts reject atomically rather than applying a subset',async t=>{
  const source=await fixture(t),target=await fixture(t),one=note(source.s,'PRIVATE one'),two=note(source.s,'PRIVATE two'),backup=source.s.exportBackup({});
  target.s.store.put('card',one.id,{...source.s.store.get('card',one.id),title:'PRIVATE different'});
  const before=epoch(target.s),p=target.s.previewRestore({backup});assert.equal(p.mode,'additive');assert.equal(p.conflicts.length,1);assert.equal(p.counts.cardsAdded,1);assert.equal(epoch(target.s),before);assert.ok(!JSON.stringify(p).includes('PRIVATE'));
  code(()=>target.s.commitRestore(commitInput(p)),'BACKUP_CONFLICT');assert.equal(target.s.store.get('card',two.id),null);assert.equal(target.s.store.count('backup-restore'),0);assert.equal(epoch(target.s),before);
});

test('overwrite and undo preserve additions, monotonically revise existing values, and explicitly default missing settings/annotations',async t=>{
  const {s}=await fixture(t),one=note(s),original=s.store.get('card',one.id),source=await fixture(t);
  source.s.store.put('card',one.id,{...original,title:'PRIVATE restored',revision:30});const added=note(source.s,'PRIVATE added');
  source.s.updateAnnotation({cardId:one.id,set:{note:'PRIVATE imported annotation'},expectedRevision:0});source.s.updateSettings({set:{sort:'time'},expectedRevision:0});
  const p=s.previewRestore({backup:source.s.exportBackup({}),mode:'overwrite'}),input=commitInput(p),r=s.commitRestore(input);
  assert.equal(s.store.get('card',one.id).revision,31);assert.equal(s.store.get('card',added.id).revision,2);assert.equal(s.readSettings().revision,2);assert.equal(s.readAnnotation({cardId:one.id}).revision,2);
  const undo=undoInput(r),u=s.undoRestore(undo);assert.equal(s.store.get('card',one.id).title,original.title);assert.equal(s.store.get('card',one.id).revision,32);assert.ok(s.store.get('card',added.id));
  assert.deepEqual(s.readSettings(),{values:{sort:'priority',reduceTransparency:false},revision:3});assert.deepEqual(s.readAnnotation({cardId:one.id}),{cardId:one.id,values:{note:'',tags:[]},revision:3});assert.equal(u.status,'undone');
  assert.deepEqual(s.commitRestore(input),r,'commit replay returns historical result after undo');
  s.updateNote({cardId:one.id,set:{title:'PRIVATE later edit'},expectedRevision:32});assert.deepEqual(s.undoRestore(undo),u,'undo replay must not reapply after edits');assert.equal(s.getCard(one.id).title,'PRIVATE later edit');
  code(()=>s.undoRestore({...undo,expectedEpoch:undo.expectedEpoch+1}),'IDEMPOTENCY_CONFLICT');code(()=>s.commitRestore({...input,acknowledgeVisibility:false}),'IDEMPOTENCY_CONFLICT');
  const audit=JSON.stringify(s.store.history());assert.ok(!audit.includes('PRIVATE'));assert.ok(!audit.includes(p.approvalToken));
});

test('same values ignore incoming revision, nullable settings never erase target settings, overflow is rejected before writes',async t=>{
  const {s}=await fixture(t),one=note(s);s.updateSettings({set:{sort:'time'},expectedRevision:0});
  const payload={cards:[{...s.store.get('card',one.id),revision:900}],annotations:[],settings:null};const p=s.previewRestore({backup:makeBackup(payload),mode:'overwrite'});assert.equal(p.counts.cardsUnchanged,1);const r=s.commitRestore(commitInput(p));assert.equal(r.beforeEpoch,r.afterEpoch);assert.equal(s.getCard(one.id).revision,1);assert.equal(s.readSettings().values.sort,'time');
  payload.cards[0].title='changed';payload.cards[0].revision=Number.MAX_SAFE_INTEGER;const before=rows(s);code(()=>s.previewRestore({backup:makeBackup(payload),mode:'overwrite'}),'REVISION_LIMIT');assert.deepEqual(rows(s),before);
});

test('plan token/hash/store binding, expiry and mutable policy are rechecked; exact commit replay wins over expiry and later edits',async t=>{
  let now=Date.parse('2026-10-11T00:00:00Z');const {s,open}=await fixture(t,{backupNow:()=>now}),source=await fixture(t);note(source.s);const p=s.previewRestore({backup:source.s.exportBackup({})}),input=commitInput(p);
  code(()=>s.commitRestore({...input,expectedPlanDigest:'0'.repeat(64)}),'BACKUP_PLAN_MISMATCH');code(()=>s.commitRestore({...input,approvalToken:'fake'}),'BACKUP_PLAN_MISMATCH');
  const other=open(),r=other.commitRestore(input);now+=RESTORE_LIMITS.planTtlMs+1;s.store.put('request','future',{id:'future'});assert.deepEqual(s.commitRestore(input),r);assert.equal(s.store.count('backup-restore'),1);assert.equal(s.getRestore({restoreId:r.restoreId}).undo.available,false);code(()=>s.undoRestore(undoInput(r)),'BACKUP_STALE');
  const next=s.previewRestore({backup:source.s.exportBackup({})});now+=RESTORE_LIMITS.planTtlMs+1;code(()=>s.commitRestore(commitInput(next,'expired')),'BACKUP_PLAN_EXPIRED');
});

test('commit and undo failures roll back content, epoch, receipt, key and audit at every checkpoint',async t=>{
  let failure=null;const {s}=await fixture(t,{backupCheckpoint:stage=>{if(stage===failure)throw Error('synthetic crash');}}),one=note(s),source=await fixture(t);
  source.s.store.put('card',one.id,{...s.store.get('card',one.id),title:'Imported'});const p=s.previewRestore({backup:source.s.exportBackup({}),mode:'overwrite'}),input=commitInput(p);
  for(const stage of ['after-write','before-receipt','before-audit']){failure=stage;const before=rows(s),state=s.store.mutationState(),history=s.store.history();assert.throws(()=>s.commitRestore(input),/synthetic crash/);assert.deepEqual(rows(s),before);assert.deepEqual(s.store.mutationState(),state);assert.deepEqual(s.store.history(),history);}
  failure=null;const r=s.commitRestore(input);
  for(const stage of ['undo-after-write','undo-before-receipt','undo-before-audit']){failure=stage;const before=rows(s),state=s.store.mutationState(),history=s.store.history();assert.throws(()=>s.undoRestore(undoInput(r)),/synthetic crash/);assert.deepEqual(rows(s),before);assert.deepEqual(s.store.mutationState(),state);assert.deepEqual(s.store.history(),history);}
  failure=null;s.undoRestore(undoInput(r));
});

test('bounded plan and receipt capacities never silently evict replay keys',async t=>{
  let now=Date.parse('2026-10-11T00:00:00Z');const {s}=await fixture(t,{backupNow:()=>now}),backup=s.exportBackup({});
  const plans=Array.from({length:20},()=>s.previewRestore({backup}));code(()=>s.previewRestore({backup}),'BACKUP_CAPACITY');assert.equal(s.store.count('backup-plan'),20);
  for(let i=0;i<plans.length;i++)s.commitRestore(commitInput(plans[i],`key${i}`));const first=s.commitRestore(commitInput(plans[0],'key0'));assert.equal(s.store.count('backup-restore'),20);
  now+=RESTORE_LIMITS.planTtlMs+1;const p=s.previewRestore({backup});assert.equal(s.store.count('backup-plan'),1);code(()=>s.commitRestore(commitInput(p,'overflow')),'BACKUP_CAPACITY');assert.deepEqual(s.commitRestore(commitInput(plans[0],'key0')),first);assert.equal(s.store.count('backup-key'),20);
});

test('target-card count and raw bytes are bounded before parsing for preview',async t=>{
  const {s}=await fixture(t),backup=s.exportBackup({});for(let i=0;i<1001;i++)s.store.put('card',`invalid_${i}`,{});
  let decodes=0;s.store.decodeTypedRow=()=>{decodes++;throw Error('must not decode');};code(()=>s.previewRestore({backup}),'BACKUP_CAPACITY');assert.equal(decodes,0);
  s.store.db.exec("DELETE FROM records WHERE kind='card'");s.store.db.prepare('INSERT INTO records VALUES (?,?,?)').run('card','oversized','x'.repeat(8388609));code(()=>s.previewRestore({backup}),'BACKUP_CAPACITY');assert.equal(decodes,0);
});

test('host restores preserve provenance and existing import receipts while raising revisions, and legacy kinds cannot be converted',async t=>{
  const {s}=await fixture(t),item={externalId:'QG-101',title:'PRIVATE host source',content:'PRIVATE current body',summary:'',kind:'task',url:'https://linear.app/workspace/issue/QG-101',truncated:false,expectedRevision:0,provenance:{provider:'linear',upstreamId:'QG-101',scope:{accountId:'fixture-account',workspaceId:'fixture-workspace'},retrievedAt:'2026-10-11T00:00:00Z',partial:false,contentOrigin:'upstream-original'}};
  const result=s.ingest({mode:'host-assisted',sourceId:'host-linear',items:[item]}),id=result.cardIds[0],before=s.store.get('card',id),originalReceipts=s.store.list('host-import-receipt');
  const restored={...before,content:'PRIVATE historical body',revision:20};const p=s.previewRestore({backup:makeBackup({cards:[restored],annotations:[],settings:null}),mode:'overwrite'}),r=s.commitRestore(commitInput(p));
  assert.equal(s.getCard(id).revision,21);assert.deepEqual(s.getCard(id).provenance,before.provenance);assert.deepEqual(s.store.list('host-import-receipt'),originalReceipts);const replay=s.ingest({mode:'host-assisted',sourceId:'host-linear',items:[item]});assert.equal(replay.items[0].replayed,true);assert.equal(s.getCard(id).revision,21);code(()=>s.ingest({mode:'host-assisted',sourceId:'host-linear',items:[{...item,content:'stale different body'}]}),'INGEST_CONFLICT');s.undoRestore(undoInput(r));assert.equal(s.getCard(id).content,before.content);assert.equal(s.getCard(id).revision,22);assert.deepEqual(s.store.list('host-import-receipt'),originalReceipts);s.ingest({mode:'host-assisted',sourceId:'host-linear',items:[{...item,content:'fresh source body',expectedRevision:22,provenance:{...item.provenance,retrievedAt:'2026-10-11T01:00:00Z'}}]});assert.equal(s.getCard(id).revision,23);
  const legacy=s.ingest({sourceId:'fixture',items:[{externalId:'legacy',title:'Legacy'}]}).cardIds[0],card=s.store.get('card',legacy),converted={...card,kind:'task'};
  code(()=>s.previewRestore({backup:makeBackup({cards:[converted],annotations:[],settings:null}),mode:'overwrite'}),'BACKUP_IDENTITY_CONFLICT');
});

test('visibility is metadata-only, acknowledges transitive exposure, and policy changes invalidate commit and undo',async t=>{
  const source=await fixture(t),config={access:{principals:[{id:'researcher',enabled:true,tokenEnv:'FIXTURE_RESEARCHER',tools:['qg_search','qg_get_card','qg_read_annotation'],resources:{sourceIds:['fixture']}}]}},env=new Proxy({}, {get(){throw Error('Backup must never read token values');}}),{s,config:targetConfig}=await fixture(t,{env},config);
  const upstream=source.s.ingest({sourceId:'fixture',items:[{externalId:'evidence',title:'PRIVATE evidence'}]}).cardIds[0],evidence=source.s.store.get('card',upstream);
  const dependent=s.ingest({sourceId:'fixture',items:[{externalId:'dependent',title:'PRIVATE dependent'}]}).cardIds[0];s.store.put('card',dependent,{...s.store.get('card',dependent),evidenceIds:[upstream]});
  const backup=makeBackup({cards:[evidence],annotations:[],settings:null}),p=s.previewRestore({backup});assert.equal(p.visibility.requiresAcknowledgement,true);assert.equal(p.visibility.principals[0].newlyVisibleCount,2);assert.ok(p.visibility.principals[0].newlyVisibleCardIds.includes(dependent));assert.ok(!JSON.stringify(p).includes('PRIVATE'));assert.ok(!JSON.stringify(p).includes('FIXTURE_RESEARCHER'));
  code(()=>s.commitRestore({...commitInput(p),acknowledgeVisibility:false}),'BACKUP_VISIBILITY_ACK_REQUIRED');targetConfig.access.principals[0].resources.sourceIds=[];code(()=>s.commitRestore(commitInput(p)),'BACKUP_POLICY_CHANGED');targetConfig.access.principals[0].resources.sourceIds=['fixture'];
  const r=s.commitRestore(commitInput(p));targetConfig.access.principals[0].enabled=false;code(()=>s.undoRestore(undoInput(r)),'BACKUP_POLICY_CHANGED');assert.equal(s.getRestore({restoreId:r.restoreId}).undo.reason,'policy-changed');
});

test('copied plans cannot commit in another database and non-backup record writes invalidate both commit and undo',async t=>{
  const {s}=await fixture(t),source=await fixture(t),other=await fixture(t);note(source.s);const backup=source.s.exportBackup({}),p=s.previewRestore({backup}),stored=s.store.get('backup-plan',p.planId);other.s.store.put('backup-plan',p.planId,stored);code(()=>other.s.commitRestore(commitInput(p)),'BACKUP_STALE');
  s.store.put('background-lease','lease',{owner:'synthetic'});code(()=>s.commitRestore(commitInput(p)),'BACKUP_STALE');
  const fresh=s.previewRestore({backup}),r=s.commitRestore(commitInput(fresh,'fresh'));s.store.db.prepare('INSERT INTO records VALUES (?,?,?)').run('conversation-reference','new-reference','{}');code(()=>s.undoRestore(undoInput(r)),'BACKUP_STALE');
});

test('large current before-images fail bounded plan construction before writes and undo revision capacity is reserved',async t=>{
  const {s}=await fixture(t),cards=[];
  for(let i=0;i<23;i++){const created=s.createNote({title:`Large ${i}`,content:'x'.repeat(50000),idempotencyKey:`large-${i}`});const stored=s.store.get('card',created.id);cards.push({...stored,content:'small',summary:'small'});}
  const before=rows(s),state=s.store.mutationState();code(()=>s.previewRestore({backup:makeBackup({cards,annotations:[],settings:null}),mode:'overwrite'}),'BACKUP_CAPACITY');assert.deepEqual(rows(s),before);assert.deepEqual(s.store.mutationState(),state);
  const card={...cards[0],revision:Number.MAX_SAFE_INTEGER-1};code(()=>s.previewRestore({backup:makeBackup({cards:[card],annotations:[],settings:null}),mode:'overwrite'}),'REVISION_LIMIT');
});

test('typed readers reject malformed annotation/settings row identities rather than exporting partial data',async t=>{
  const {s}=await fixture(t),a=note(s);s.store.put('annotation',a.id,{cardId:'different',values:{note:'',tags:[]},revision:1});code(()=>s.exportBackup({}),'BACKUP_RECORD_INVALID');s.store.delete('annotation',a.id);
  s.store.put('settings','other',{values:{sort:'priority',reduceTransparency:false},revision:0});code(()=>s.exportBackup({}),'BACKUP_RECORD_INVALID');s.store.delete('settings','other');s.store.put('settings','workspace',null);code(()=>s.exportBackup({}),'BACKUP_RECORD_INVALID');
});


test('preview rejects a restore whose immediate undo would reintroduce a missing evidence edge',async t=>{
  const {s}=await fixture(t),id=s.ingest({sourceId:'fixture',items:[{externalId:'dangling',title:'Dangling'}]}).cardIds[0],valid=s.store.get('card',id);
  s.store.put('card',id,{...valid,evidenceIds:['missing']});const before=rows(s),state=s.store.mutationState();
  code(()=>s.previewRestore({backup:makeBackup({cards:[valid],annotations:[],settings:null}),mode:'overwrite'}),'BACKUP_GRAPH_INVALID');assert.deepEqual(rows(s),before);assert.deepEqual(s.store.mutationState(),state);
});

test('an allowed 1000-card target plus new card can still be read and undone without removing the addition',async t=>{
  const {s}=await fixture(t),source=await fixture(t),added=note(source.s,'New after target cap');
  for(let i=0;i<1000;i++)s.ingest({sourceId:'fixture',items:[{externalId:`row-${i}`,title:`Row ${i}`} ]});
  const p=s.previewRestore({backup:source.s.exportBackup({})}),r=s.commitRestore(commitInput(p));assert.equal(s.store.count('card'),1001);assert.equal(s.getRestore({restoreId:r.restoreId}).undo.available,true);
  s.undoRestore(undoInput(r));assert.equal(s.store.count('card'),1001);assert.ok(s.store.get('card',added.id));
});

test('projected undo graph uses its actual next revision at the exact 8MiB boundary',async t=>{
  const {s}=await fixture(t),cards=[];
  for(let i=0;i<170;i++){const created=note(s,`Graph ${i}`);cards.push({...s.store.get('card',created.id),content:'',summary:'',revision:8});}
  for(let i=0;i<160;i++){cards[i].content='x'.repeat(50000);cards[i].summary='x'.repeat(300);}
  let remaining=RESTORE_LIMITS.targetBytes-Buffer.byteLength(JSON.stringify(cards));assert.ok(remaining>0);
  for(let i=160;i<cards.length&&remaining>0;i++){
    const length=Math.min(50000,remaining>=600?remaining-300:Math.floor(remaining/2));
    cards[i].content='x'.repeat(length);cards[i].summary=cards[i].content.slice(0,300);remaining-=length+Math.min(length,300);
    if(remaining===1){cards[i].title+='x';remaining--;}
  }
  assert.equal(remaining,0);assert.equal(Buffer.byteLength(JSON.stringify(cards)),RESTORE_LIMITS.targetBytes);
  s.store.transaction(()=>{for(const card of cards)s.store.put('card',card.id,card);});
  const target={...cards[0],title:`X${cards[0].title.slice(1)}`},before=epoch(s);
  code(()=>s.previewRestore({backup:makeBackup({cards:[target],annotations:[],settings:null}),mode:'overwrite'}),'BACKUP_CAPACITY');
  assert.equal(epoch(s),before);assert.equal(s.store.count('backup-plan'),0);assert.equal(s.store.get('card',target.id).revision,8);
});

test('per-receipt bound reserves projected undo-result growth before admitting a commit',async t=>{
  const {s}=await fixture(t),p=s.previewRestore({backup:s.exportBackup({})}),r=s.commitRestore(commitInput(p)),receipt=s.store.get('backup-restore',r.restoreId),changes=[];
  for(let i=0;i<21;i++){
    const created=note(s,`Receipt ${i}`),card=s.store.get('card',created.id),content=i<20?'x'.repeat(50000):'';
    changes.push({kind:'card',id:card.id,before:{...card,content,summary:content.slice(0,300)},after:{...card,content:'',summary:'',revision:2}});
  }
  const {receiptDigest,undoReserveBytes,...base}=receipt,body={...base,changes};
  const projection=()=>({...body,undoResult:s.backups.undoResult(body,21,'+999999-12-31T23:59:59.999Z'),undoReserveBytes:0,receiptDigest:'0'.repeat(64)});
  const baselineSize=Buffer.byteLength(JSON.stringify(projection())),extra=RESTORE_LIMITS.recordBytes+1-baselineSize;
  assert.ok(extra>=600&&extra<=50300);changes[20].before.content='x'.repeat(extra-300);changes[20].before.summary='x'.repeat(300);
  assert.equal(Buffer.byteLength(JSON.stringify(projection())),RESTORE_LIMITS.recordBytes+1);
  assert.ok(Buffer.byteLength(JSON.stringify({...body,undoReserveBytes:0,receiptDigest:'0'.repeat(64)}))<=RESTORE_LIMITS.recordBytes);
  code(()=>s.backups.reserveUndo(body,21),'BACKUP_CAPACITY');
});

test('global receipt capacity preserves outstanding undo reserves across metadata-only restores',async t=>{
  const {s}=await fixture(t),backup=s.exportBackup({}),first=s.previewRestore({backup}),firstInput=commitInput(first,'first'),r=s.commitRestore(firstInput),receipt=s.store.get('backup-restore',r.restoreId),firstKey=s.store.list('backup-key')[0];
  assert.ok(receipt.undoReserveBytes>0);
  const rowBytes=kind=>s.store.boundedSize(kind,41).bytes,actualCandidate=Buffer.byteLength(JSON.stringify(receipt))+Buffer.byteLength(JSON.stringify(firstKey));
  // Synthetic, typed backup-key rows with harmless JSON whitespace let this
  // test place the raw SQLite byte budget within one byte of the reservation.
  const targetUsed=RESTORE_LIMITS.totalBytes-receipt.undoReserveBytes-actualCandidate-receipt.undoReserveBytes+1;
  let fill=targetUsed-rowBytes('backup-restore')-rowBytes('backup-key');
  for(let i=0;fill>0;i++){
    const id=`${i+1}`.padStart(64,'0'),text=JSON.stringify({...firstKey,id}),length=Math.min(RESTORE_LIMITS.recordBytes,fill);
    assert.ok(length>=Buffer.byteLength(text));s.store.db.prepare('INSERT INTO records VALUES (?,?,?)').run('backup-key',id,text+' '.repeat(length-Buffer.byteLength(text)));fill-=length;
  }
  const next=s.previewRestore({backup}),before=epoch(s),receiptCount=s.store.count('backup-restore');
  code(()=>s.commitRestore(commitInput(next,'second')),'BACKUP_CAPACITY');assert.equal(epoch(s),before);assert.equal(s.store.count('backup-restore'),receiptCount);
  assert.equal(s.getRestore({restoreId:r.restoreId}).undo.available,true);s.undoRestore(undoInput(r));
  assert.equal(s.store.get('backup-restore',r.restoreId).undoReserveBytes,0);assert.ok(rowBytes('backup-restore')+rowBytes('backup-key')<=RESTORE_LIMITS.totalBytes);
});
