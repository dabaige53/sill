/** F11 state-machine checks; Chromium + real HTTP/MCP coverage is separate. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
const source=await readFile(new URL('../web/backups.js',import.meta.url),'utf8');
const key='sill-backup-draft-v1:web';
const plan={planId:'plan_test',planDigest:'a'.repeat(64),approvalToken:'b'.repeat(64),restoreId:'restore_test',mode:'additive',expiresAt:'2030-01-01T00:00:00.000Z',counts:{cardsAdded:1},conflicts:[],visibility:{requiresAcknowledgement:false,principals:[]}};
const receipt={restoreId:plan.restoreId,planId:plan.planId,status:'committed',counts:plan.counts,undo:{available:true,expectedEpoch:10}};
const bundle={format:'sill-content-backup',version:1,payload:{cards:[],annotations:[],settings:null}};
const wait=()=>new Promise(resolve=>setImmediate(resolve));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function harness(t,{saved,post=async()=>structuredClone(plan),api=async()=>structuredClone(receipt),storageFailure=false}={}){
  const dom=new JSDOM('<!doctype html><div id="modal"></div>',{url:'https://fixture.invalid',runScripts:'outside-only'}),w=dom.window;t.after(()=>w.close());
  w.TextEncoder=TextEncoder;w.structuredClone=structuredClone;w.crypto.randomUUID=randomUUID;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const panels={settings:()=>'<div class="panel-footer"></div>'};
  const app={dialog:{open:false},modalKind:null,modalToken:0,toast(){},action(){},openPanel(kind){this.modalKind=kind;this.modalToken++;this.dialog.open=true;w.document.getElementById('modal').innerHTML=kind==='settings'?panels.settings():'filter';}};
  const calls=[];if(saved)w.localStorage.setItem(key,saved);
  if(storageFailure)w.Storage.prototype.setItem=()=>{throw new Error('quota');};
  w.eval(source);w.initSillBackups({app,panels,esc,isConnected:()=>true,post:async(path,body)=>{calls.push({path,body:structuredClone(body),saved:w.localStorage.getItem(key)});return post(path,body);},api:async path=>{calls.push({path});return api(path);}});
  const open=()=>{app.openPanel('settings');w.document.querySelector('#qg-backups-settings').open=true;};open();
  const node=id=>w.document.getElementById(id),action=name=>app.action('backups-'+name);
  const fill=(value,id='qg-backup-json')=>{node(id).value=typeof value==='string'?value:JSON.stringify(value);node(id).dispatchEvent(new w.Event(id==='qg-backup-mode'?'change':'input',{bubbles:true}));};
  const button=name=>w.document.querySelector(`[data-action="backups-${name}"]`);
  return {w,app,calls,open,node,action,fill,button,saved:()=>w.localStorage.getItem(key)};
}
test('F11 file/data limits precede reads; drafts/reload/preview failures never automatically upload',async t=>{
  const h=harness(t);assert.equal(h.calls.length,0);
  h.fill('{');await h.action('preview');assert.equal(h.calls.length,0);assert.match(h.node('qg-backups-status').textContent,/有效 JSON/);
  for(const invalid of ['[]','null','"text"']){h.fill(invalid);await h.action('preview');assert.equal(h.calls.length,0);assert.match(h.node('qg-backups-status').textContent,/JSON 对象/);}
  h.fill({...bundle,payload:{...bundle.payload,cards:Array(101).fill({})}});await h.action('preview');assert.equal(h.calls.length,0);
  h.fill(JSON.stringify(bundle));let reads=0;
  Object.defineProperty(h.node('qg-backup-file'),'files',{configurable:true,value:[{size:256*1024+1,text:async()=>{reads++;return '{}';}}]});
  h.node('qg-backup-file').dispatchEvent(new h.w.Event('change',{bubbles:true}));await wait();assert.equal(reads,0);assert.equal(h.calls.length,0);assert.equal(h.node('qg-backup-json').value,JSON.stringify(bundle));
  Object.defineProperty(h.node('qg-backup-file'),'files',{configurable:true,value:[{size:2,text:async()=>{reads++;return '[]';}}]});
  h.node('qg-backup-file').dispatchEvent(new h.w.Event('change',{bubbles:true}));await wait();assert.equal(reads,1);assert.equal(h.calls.length,0);assert.equal(h.node('qg-backup-json').value,JSON.stringify(bundle));
  const reloaded=harness(t,{saved:h.saved()});assert.equal(reloaded.node('qg-backup-json').value,JSON.stringify(bundle));assert.equal(reloaded.calls.length,0);assert.equal(reloaded.button('commit').disabled,true);
});
test('F11 stale preview, navigation and edited mode invalidate approval; additive conflicts fail closed',async t=>{
  const hold=deferred(),h=harness(t,{post:()=>hold.promise});h.fill(bundle);const preview=h.action('preview');
  h.fill({...bundle,version:2});hold.resolve(structuredClone(plan));await preview;assert.equal(h.node('qg-backup-preview').textContent,'');assert.equal(h.button('commit').disabled,true);
  const other=harness(t);other.fill(bundle);await other.action('preview');assert.equal(other.button('commit').disabled,false);other.fill('overwrite','qg-backup-mode');assert.equal(other.button('commit').disabled,true);
  const conflict=harness(t,{post:async()=>({...plan,conflicts:[{kind:'card',id:'one',reason:'differs'}]})});conflict.fill(bundle);await conflict.action('preview');assert.equal(conflict.button('commit').disabled,true);await conflict.action('commit');assert.equal(conflict.calls.length,1);assert.match(conflict.node('qg-backup-preview').textContent,/拒绝整批/);
  const nav=deferred(),late=harness(t,{post:()=>nav.promise});late.fill(bundle);const read=late.action('preview');late.app.openPanel('filter');nav.resolve(plan);await read;assert.equal(late.app.modalKind,'filter');late.open();assert.equal(late.button('commit').disabled,true);
});
test('F11 durable immutable requests, duplicate gestures and lost-response recovery preserve explicit approval',async t=>{
  const hold=deferred(),h=harness(t,{post:async(path)=>path.endsWith('/preview')?{...plan,visibility:{requiresAcknowledgement:true,principals:[{id:'agent_a',sourceIds:['local-notes'],newlyVisibleCount:1,affectedVisibleCount:1,newlyVisibleCardIds:['one'],annotationsVisible:true}]}}:hold.promise});
  h.fill(bundle);await h.action('preview');assert.equal(h.button('commit').disabled,true);await h.action('commit');assert.equal(h.calls.length,1);
  h.node('qg-backup-visibility').checked=true;h.node('qg-backup-visibility').dispatchEvent(new h.w.Event('change',{bubbles:true}));
  const first=h.action('commit');await h.action('commit');assert.equal(h.calls.length,2);const attempted=h.calls.at(-1);
  assert.deepEqual(JSON.parse(attempted.saved).pending.request,attempted.body);assert.equal(attempted.body.acknowledgeVisibility,true);assert.equal(h.node('qg-backup-json').disabled,true);
  hold.reject(new Error('response lost'));await first;assert.match(h.node('qg-backups-status').textContent,/尚未确认/);
  const reload=harness(t,{saved:h.saved(),post:async()=>receipt});assert.equal(reload.calls.length,0);assert.equal(reload.node('qg-backup-json').disabled,true);assert.equal(reload.button('commit').textContent,'重试原恢复请求');
  await reload.action('commit');assert.equal(reload.calls.length,1);assert.deepEqual(reload.calls[0].body,attempted.body);assert.equal(reload.node('qg-backup-json').disabled,false);assert.match(reload.node('qg-backup-result').textContent,/新增卡片仍会保留/);
});
test('F11 modified DOM cannot reuse preview; definitive stale errors preserve draft for a fresh preview',async t=>{
  const h=harness(t,{post:async path=>{if(path.endsWith('/preview'))return plan;throw Object.assign(new Error('changed'),{code:'BACKUP_STALE'});}});
  h.fill(bundle);await h.action('preview');h.node('qg-backup-json').value='{}';await h.action('commit');assert.equal(h.calls.length,1);assert.equal(h.button('commit').disabled,true);
  h.fill(bundle);await h.action('preview');await h.action('commit');assert.equal(h.node('qg-backup-json').disabled,false);assert.equal(h.node('qg-backup-json').value,JSON.stringify(bundle));assert.equal(h.button('commit').disabled,true);assert.match(h.node('qg-backups-status').textContent,/重新校验/);
});
test('F11 status is explicit; undo keeps its key after lost response; later-write conflict cannot force undo',async t=>{
  const saved=JSON.stringify({draft:{text:JSON.stringify(bundle),mode:'additive'},restoreId:plan.restoreId});
  const h=harness(t,{saved,post:async()=>{throw new Error('lost undo');}});assert.equal(h.calls.length,0);await h.action('status');assert.equal(h.button('undo').disabled,false);await h.action('undo');
  const attempt=h.calls.at(-1);assert.deepEqual(JSON.parse(attempt.saved).pendingUndo.request,attempt.body);
  const reload=harness(t,{saved:h.saved(),post:async()=>({...receipt,status:'undone',undo:{available:false,expectedEpoch:11}})});assert.equal(reload.calls.length,0);await reload.action('undo');assert.deepEqual(reload.calls[0].body,attempt.body);assert.equal(reload.button('undo').disabled,true);assert.match(reload.node('qg-backups-status').textContent,/新增卡片仍保留/);
  const conflict=harness(t,{saved,post:async()=>{throw Object.assign(new Error('<img onerror=x> later record write'),{code:'BACKUP_UNDO_CONFLICT'});}});await conflict.action('status');await conflict.action('undo');assert.equal(conflict.button('undo').disabled,true);assert.equal(conflict.node('qg-backup-result').querySelector('img'),null);assert.match(conflict.node('qg-backups-status').textContent,/没有强制/);
});
test('F11 local storage failure blocks commit before any server mutation; optional module is standalone',async t=>{
  const h=harness(t,{storageFailure:true});h.fill(bundle);await h.action('preview');await h.action('commit');assert.equal(h.calls.length,1);assert.match(h.node('qg-backups-status').textContent,/提交已阻止/);
});

test('F11 exact-key retries release definitive no-commit/no-undo errors but retain pre-replay failures',async t=>{
  const pending={restoreId:plan.restoreId,request:{planId:plan.planId,expectedPlanDigest:plan.planDigest,approvalToken:plan.approvalToken,approved:true,acknowledgeVisibility:false,idempotencyKey:'never-arrived'}};
  const saved=JSON.stringify({draft:{text:JSON.stringify(bundle),mode:'additive'},pending});
  for(const code of ['BACKUP_PLAN_EXPIRED','BACKUP_STALE','BACKUP_POLICY_CHANGED']){
    const h=harness(t,{saved,post:async()=>{throw Object.assign(new Error(code),{code});}});await h.action('commit');assert.equal(h.node('qg-backup-json').disabled,false);assert.equal(h.button('commit').disabled,true);assert.equal(h.node('qg-backup-json').value,JSON.stringify(bundle));assert.deepEqual(h.calls[0].body,pending.request);
  }
  for(const code of ['INVALID_INPUT','BACKUP_RECORD_INVALID','BACKUP_CAPACITY']){
    const h=harness(t,{saved,post:async()=>{throw Object.assign(new Error(code),{code});}});await h.action('commit');assert.equal(h.node('qg-backup-json').disabled,true);assert.equal(h.button('commit').textContent,'重试原恢复请求');
  }
  const pendingUndo={restoreId:plan.restoreId,attempted:true,request:{expectedEpoch:10,approved:true,idempotencyKey:'undo-never-arrived'}};
  const undo=harness(t,{saved:JSON.stringify({draft:{text:'{}',mode:'additive'},restoreId:plan.restoreId,pendingUndo}),post:async()=>{throw Object.assign(new Error('later write'),{code:'BACKUP_STALE'});}});await undo.action('undo');assert.equal(undo.node('qg-backup-json').disabled,false);assert.equal(undo.button('undo').disabled,true);assert.deepEqual(undo.calls[0].body,pendingUndo.request);
});

test('F11 delayed commit and undo settle the current Settings view without replacing drafts or reopening panels',async t=>{
  for(const operation of ['commit','undo'])for(const outcome of ['success','rejected','unknown'])for(const destination of ['settings','filter','closed'])await t.test(`${operation}: ${outcome} into ${destination}`,async t=>{
    const hold=deferred(),saved=JSON.stringify({draft:{text:JSON.stringify(bundle),mode:'additive'},restoreId:plan.restoreId});
    const h=harness(t,{saved,post:async path=>path.endsWith('/preview')?plan:hold.promise});
    if(operation==='commit')await h.action('preview');else await h.action('status');
    const request=h.action(operation),attempt=h.calls.at(-1),pendingName=operation==='commit'?'pending':'pendingUndo';
    assert.deepEqual(JSON.parse(attempt.saved)[pendingName].request,attempt.body);
    h.app.openPanel('filter');
    if(destination!=='filter')h.open();
    if(destination==='closed')h.app.dialog.open=false;
    const token=h.app.modalToken,modal=h.node('modal'),currentSection=h.node('qg-backups-settings');
    if(destination==='settings'){
      modal.insertAdjacentHTML('beforeend','<input id="unsent-preference" value="new preference draft">');
      assert.equal(h.node('qg-backup-json').disabled,true);
    }
    // Drain the details toggle event before settling the response: it must not
    // accidentally rescue a finalizer that only renders the old Settings node.
    await wait();
    if(outcome==='success')hold.resolve({...receipt,status:operation==='undo'?'undone':'committed',undo:{...receipt.undo,available:operation==='commit'}});
    else hold.reject(Object.assign(new Error('delayed result'),outcome==='rejected'?{code:operation==='undo'?'BACKUP_UNDO_CONFLICT':'BACKUP_STALE'}:{}));
    await request;
    assert.equal(h.app.modalToken,token);assert.equal(h.node('modal'),modal);
    if(destination==='filter'){
      assert.equal(h.app.modalKind,'filter');assert.equal(modal.textContent,'filter');
      h.open();
    }else if(destination==='closed'){
      assert.equal(h.app.dialog.open,false);assert.equal(h.node('qg-backups-settings'),currentSection);
      h.open();
    }else{
      assert.equal(h.node('qg-backups-settings'),currentSection);
      assert.equal(h.node('unsent-preference').value,'new preference draft');
    }
    assert.equal(h.node('qg-backup-json').value,JSON.stringify(bundle));
    assert.equal(h.node('qg-backup-json').disabled,outcome==='unknown');
    assert.equal(h.button('status').disabled,false);
    assert.match(h.node('qg-backups-status').textContent,outcome==='success'?/已确认/:outcome==='rejected'?/恢复未提交|撤销被保护条件阻止/:/尚未确认/);
    if(outcome==='success')assert.match(h.node('qg-backup-result').textContent,operation==='undo'?/已确认撤销覆盖/:/已确认恢复/);
    if(outcome==='unknown')assert.deepEqual(JSON.parse(h.saved())[pendingName].request,attempt.body);
    assert.equal(h.calls.filter(call=>call.path.endsWith(operation==='commit'?'/commit':'/undo')).length,1);
  });
});

test('F11 stale status completion releases current controls without consuming a newer draft or preview',async t=>{
  const hold=deferred(),saved=JSON.stringify({draft:{text:JSON.stringify(bundle),mode:'additive'},restoreId:plan.restoreId});
  const h=harness(t,{saved,api:()=>hold.promise,post:async(path,body)=>({...plan,mode:body.mode})});
  const read=h.action('status');h.app.openPanel('filter');h.open();
  const newer={...bundle,version:2};h.fill(newer);h.fill('overwrite','qg-backup-mode');await h.action('preview');
  const preview=h.node('qg-backup-preview').innerHTML,notice=h.node('qg-backups-status').textContent,token=h.app.modalToken;
  assert.equal(h.button('status').disabled,true);assert.equal(h.button('commit').disabled,false);
  await wait();hold.resolve(receipt);await read;
  assert.equal(h.app.modalToken,token);assert.equal(h.node('qg-backup-json').value,JSON.stringify(newer));
  assert.equal(h.node('qg-backup-mode').value,'overwrite');assert.equal(h.node('qg-backup-preview').innerHTML,preview);
  assert.equal(h.node('qg-backups-status').textContent,notice);assert.equal(h.button('commit').disabled,false);
  assert.equal(h.button('status').disabled,false);assert.doesNotMatch(h.node('qg-backup-result').textContent,/已确认恢复/);
  assert.equal(h.calls.length,2);
});

test('F11 stale preview and export completions release reopened controls without applying old payloads',async t=>{
  for(const operation of ['preview','export'])for(const failed of [false,true])await t.test(`${operation}: ${failed?'failure':'success'}`,async t=>{
    const hold=deferred(),h=harness(t,{post:()=>hold.promise});h.fill(bundle);
    const request=h.action(operation);h.app.openPanel('filter');h.open();
    const newer={...bundle,version:2};h.fill(newer);h.fill('overwrite','qg-backup-mode');
    const notice=h.node('qg-backups-status').textContent,token=h.app.modalToken;
    assert.equal(h.button(operation).disabled,true);await wait();
    if(failed)hold.reject(new Error('old request failed'));else hold.resolve(operation==='preview'?plan:bundle);
    await request;
    assert.equal(h.app.modalToken,token);assert.equal(h.node('qg-backup-json').value,JSON.stringify(newer));
    assert.equal(h.node('qg-backup-mode').value,'overwrite');assert.equal(h.node('qg-backups-status').textContent,notice);
    assert.equal(h.button(operation).disabled,false);assert.equal(h.button('commit').disabled,true);
    assert.equal(h.node('qg-backup-preview').textContent,'');assert.equal(h.node('qg-backup-export').hidden,true);
    assert.equal(h.calls.length,1);
  });
});
