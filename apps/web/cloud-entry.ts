import { Store } from "./data/store.ts";
import { esc, button } from "./atoms/primitives.ts";
import { welcomeHTML, Panels } from "./interactions/panels.ts";
import { AppController } from "./views/app.ts";
/* Authenticated cloud build only. No credentials or private cards in browser storage. */
// Invitation/legacy implicit fragments are never accepted as app sessions.
if(/(?:access_token|refresh_token|error_description)=/.test(location.hash))history.replaceState(null,'',location.pathname);
window.__QG_LOCAL__=false;
window.__QG_RUNTIME__=false;
Store.load=function(){this.state=this.fresh();this.state.preferences.onboarded=true;return this.state;};
Store.save=function(){};
// Automatic reading observations remain transient; explicit cloud edits own persisted state.
const transientPatch=Store.patch;
Store.patch=function(id?: any,values?: any){const safe: Record<string, any>={};for(const key of ['seen','progress'])if(key in values)safe[key]=values[key];transientPatch.call(this,id,safe);};
const Cloud: Record<string, any>={user:null,records:new Map<any, any>(),drafts:new Map<any, any>(),edit:null,editOwner:null,editLocked:false,pending:null,busy:false,epoch:0,writeVersion:0,loading:false,connectionError:false,loginUntil:0};
const callbackFailed=new URL(location.href).searchParams.has('login_error');
if(callbackFailed)history.replaceState(null,'',location.pathname+location.hash);
function cloudWelcome(){
 const recovery=[...Cloud.drafts].filter(([,draft]: any)=>draft.locked).map(([key,draft]: any)=>`<button type="button" class="soft-button" data-action="resume-draft" data-id="${esc(key)}">继续查看草稿：${esc(draft.values.title||'未命名笔记')}</button>`).join('');
 if(window.__SILL_HOST__&&!Cloud.user&&!Cloud.connectionError)return welcomeHTML({actions:recovery,detail:'<p class="cloud-detail" role="status">正在连接云端工作区…</p>'});
 if(window.__SILL_HOST__&&!Cloud.user)return welcomeHTML({actions:'<button type="button" class="solid-button" data-action="refresh">重新连接云端</button>'+recovery,detail:'<p class="cloud-detail">请通过当前应用的授权入口连接 Sill 云端账号。未保存的草稿仍留在本次窗口。</p>'});
 return welcomeHTML({actions:(Cloud.user?'<button type="button" class="solid-button" data-action="capture">记下第一条内容</button>':`<a class="solid-button" href="/auth/login">使用账号密码登录</a><form id="cloud-login"><label for="cloud-email">用已有账号登录</label><input id="cloud-email" name="email" type="email" autocomplete="email" required placeholder="你的邮箱" aria-describedby="cloud-login-status"><button class="solid-button" type="submit">发送登录链接</button><p id="cloud-login-status" role="status">${callbackFailed?'登录链接未能完成验证。请在发送链接的浏览器打开最新邮件，或重新发送。':'登录后，你的内容会出现在这里。'}</p></form>`)+recovery,detail:recovery?'<p class="cloud-detail">草稿仍在本次窗口。重新登录前请先复制保留文字。</p>':Cloud.user?'<p class="cloud-detail">窗台还是空的，从一条笔记开始。</p>':''});
}
const app=new AppController();
const originalDeskHTML=app.deskHTML.bind(app);
app.deskHTML=function(){
 if(!Cloud.user||!Store.state.cards.length)return cloudWelcome();
 return originalDeskHTML();
};
app.init();
const messages: Record<string, any>={rate_limited:'请求较频繁，请稍等一分钟再发送。',unauthenticated:'登录已过期，请重新登录。',forbidden:'该账号或客户端没有此操作权限。',revision_conflict:'内容已在另一处修改。草稿仍保留，请刷新并核对后再保存。',idempotency_conflict:'原请求已被处理或需要核对，未覆盖数据。',not_found:'内容已不存在。',unavailable:'连接暂时不可用；写入结果可能尚未确认。'};
async function cloudApi(path?: any,options: any={}){
 const controller=new AbortController();let timer;
 const request=async()=>{
  if(window.__SILL_HOST__)return window.__SILL_HOST__.request(path,options);
  const response=await fetch(path,{credentials:'same-origin',...options,signal:controller.signal,headers:{'Content-Type':'application/json',...options.headers}});
  const data=await response.json();
  if(!response.ok)throw Object.assign(new Error(messages[data.error?.code]||'请求未完成'),{status:response.status,code:data.error?.code});
  return data;
 };
 try{
  return await Promise.race([request(),new Promise((_?: any,reject?: any)=>{timer=window.setTimeout(()=>{
   reject(Object.assign(new Error('连接等待超时；保存结果尚未确认，请核对原请求。'),{code:'request_timeout'}));controller.abort();
  },20000);})]);
 }catch(error){error.message=messages[error.code]||(error.code==='request_timeout'?error.message:error.status?error.message:'连接中断；保存结果尚未确认，请核对原请求。');throw error;}
 finally{clearTimeout(timer);}
}
function accountView(){document.body.classList.toggle('cloud-signed-in',!!Cloud.user);}

function clearCloud({retainDrafts=false}: any={}){
 if(retainDrafts)stashCloudDraft();
 const keepEditor=retainDrafts&&app.modalKind==='cloud-editor'&&Cloud.drafts.has(Cloud.edit?.id||'new');
 Cloud.epoch++;Cloud.user=null;Cloud.pending=null;Cloud.connectionError=retainDrafts;Cloud.records.clear();Store.load();
 if(retainDrafts){for(const draft of Cloud.drafts.values())draft.locked=true;Cloud.editLocked=true;}
 else{Cloud.edit=null;Cloud.editOwner=null;Cloud.editLocked=false;Cloud.drafts.clear();}
 if(!keepEditor){Cloud.edit=null;app.closeNative();}
 app.renderCurrent(true);accountView();
 if(keepEditor){
  document.querySelectorAll('#cloud-editor input,#cloud-editor textarea').forEach((e?: any)=>e.disabled=false);
  document.getElementById('cloud-save-status').textContent='账号连接已失效，草稿没有丢失。请先复制标题和正文；重新连接后再继续保存。';
  paintCloudDraft();
 }
}
function cloudConnection(){
 const refresh=document.querySelector('.dock-tools [data-action=refresh]');
 refresh?.setAttribute('aria-busy',String(Cloud.loading));
 const offline=document.getElementById('offline');offline.dataset.action='refresh';offline.hidden=!Cloud.connectionError||!Cloud.user;offline.textContent='连接中断 · 重试';
}
function paintRecords(){
 Store.state.cards=[...Cloud.records.values()].filter((c?: any)=>!c.deleted&&!c.state.archived).map((c?: any)=>({id:c.id,type:c.type,title:c.title,body:c.body,summary:c.body?.[0]||'',url:c.url,sources: [{name: 'Sill 云端', kind: 'web'}],time:Date.parse(c.updated_at),meta:'已保存',revision:c.revision}));
 Store.state.items=Object.fromEntries([...Cloud.records.values()].map((c?: any)=>[c.id,{read:!!c.state.read}]));app.withFeedAnchor(()=>{},true);
}
async function loadCloud({initial=false}: any={}){
 if(Cloud.loading||Cloud.busy||Cloud.pending)return;
 Cloud.loading=true;cloudConnection();const epoch=Cloud.epoch,writeVersion=Cloud.writeVersion;let checkingSession=true;
 try{
  const session=await cloudApi('/auth/session');checkingSession=false;
  const records=new Map<any, any>();let cursor=null;
  do{const query=cursor?'?cursor='+encodeURIComponent(cursor):'';const page=await cloudApi('/api/v1/contents'+query);for(const c of page.items)records.set(c.id,c);cursor=page.next_cursor;}while(cursor);
  if(epoch!==Cloud.epoch||writeVersion!==Cloud.writeVersion)return;
  const changed=Cloud.user!==session.userId||JSON.stringify([...records])!==JSON.stringify([...Cloud.records]);
  Cloud.connectionError=false;Cloud.scopes=session.scopes||null;Cloud.user=session.userId;Cloud.records=records;if(changed)paintRecords();accountView();
 }catch(error){if(epoch!==Cloud.epoch||writeVersion!==Cloud.writeVersion)return;Cloud.connectionError=true;if(!Cloud.user)app.renderCurrent(false);if(error.status===401||error.status===403)clearCloud({retainDrafts:true});if(!(initial&&checkingSession&&error.status===401))app.toast(error.message);}
 finally{Cloud.loading=false;cloudConnection();}
}
function cloudDraftValues(){
 const title=document.getElementById('cloud-title'),body=document.getElementById('cloud-body'),read=document.getElementById('cloud-read');
 if(!title||!body||!read)return null;
 return {title:(title as HTMLInputElement).value,body:(body as HTMLInputElement).value,read:(read as HTMLInputElement).checked};
}
function stashCloudDraft(){
 if(!Cloud.edit||app.modalKind!=='cloud-editor')return false;
 const values=cloudDraftValues();if(!values)return false;
 const key=Cloud.edit.id||'new',dirty=values.title!==Cloud.edit.title||values.body!==Cloud.edit.body.join('\n')||values.read!==!!Cloud.edit.state.read;
 if(dirty)Cloud.drafts.set(key,{record:structuredClone(Cloud.edit),values,owner:Cloud.editOwner,locked:Cloud.editLocked});else Cloud.drafts.delete(key);
 return dirty;
}
function paintCloudDraft(){
 const dirty=stashCloudDraft(),count=document.getElementById('cloud-word-count'),label=document.getElementById('cloud-draft-state');
 if(count)count.textContent=Array.from((document.getElementById('cloud-body') as HTMLInputElement).value).length.toLocaleString()+' 字';
 if(label)label.textContent=Cloud.editLocked?'账号未连接 · 草稿仍保留':dirty?'未保存 · 草稿留在本次窗口':'关闭后可随时继续';
 const discard=document.getElementById('cloud-discard');if(discard)discard.hidden=!dirty;
 const save=document.getElementById('cloud-save');if(save)(save as HTMLInputElement).disabled=Cloud.busy||Cloud.editLocked;
}
function editCloud(id?: any){
 if(Cloud.pending){app.toast('上次保存结果未确认，请先重试核对原请求。');return;}
 stashCloudDraft();
 const saved=Cloud.drafts.get(id||'new');
 if(!Cloud.user&&!saved){app.toast('请先登录');return;}
 if(!saved&&Cloud.scopes&&!Cloud.scopes.includes('content:write')){app.toast('当前授权仅允许读取，请在当前应用重新授权后编辑');return;}
 const record=id?Cloud.records.get(id):null;if(id&&!record&&!saved)return;
 Cloud.edit=saved?.record||(record?structuredClone(record):{id:null,revision:null,title:'',body:[],state:{read:false}});
 Cloud.editOwner=saved?.owner||Cloud.user;
 // A different account must never receive the previous account's recovered draft.
 // The MCP host exposes no stable user ID, so its expired drafts stay copy-only.
 Cloud.editLocked=!Cloud.user||!!(saved&&(saved.owner!==Cloud.user||saved.locked&&window.__SILL_HOST__))||!!(Cloud.scopes&&!Cloud.scopes.includes('content:write'));
 const values=saved?.values||{title:Cloud.edit.title,body:Cloud.edit.body.join('\n'),read:!!Cloud.edit.state.read};
 originalOpen(`<div class="sheet cloud-compose"><header class="cloud-compose-head"><h1 id="modal-title">${id?'修改内容':'新建笔记'}</h1><span id="cloud-draft-state" role="status"></span>${button('x','收起编辑器，保留草稿','close')}</header><form id="cloud-editor"><div class="cloud-compose-body"><label class="sr-only" for="cloud-title">标题</label><input id="cloud-title" required maxlength="1000" placeholder="给想法一个标题" value="${esc(values.title)}"><label class="sr-only" for="cloud-body">正文</label><textarea id="cloud-body" rows="10" placeholder="从这里开始写…">${esc(values.body)}</textarea><div class="cloud-compose-meta"><label><input id="cloud-read" type="checkbox" ${values.read?'checked':''}> 标记已读</label><span id="cloud-word-count" class="num"></span></div><p id="cloud-save-status" role="status"></p></div><footer class="cloud-compose-actions"><button class="solid-button" type="${window.__SILL_HOST__?'button':'submit'}" id="cloud-save">保存到云端</button><button type="button" class="soft-button" data-action="close">关闭</button><button type="button" class="text-link" id="cloud-discard" hidden>放弃草稿</button>${id&&(!Cloud.scopes||Cloud.scopes.includes('content:delete'))?'<button class="text-link cloud-delete" type="button" id="cloud-delete">删除内容</button>':''}<span class="cloud-save-hint">⌘ / Ctrl + Enter</span></footer></form></div>`,'cloud-editor',null,'panel wide');
 paintCloudDraft();if(Cloud.editLocked)document.getElementById('cloud-save-status').textContent='这份草稿仍可复制和编辑。为避免写入错误的账号，恢复原账号连接前不会提交。';document.getElementById('cloud-title').focus({preventScroll:true});
}
async function saveCloud(deleting: any=false){
 if(Cloud.busy||!Cloud.edit||Cloud.editLocked||!Cloud.user)return;const draft=Cloud.edit;
 if(!Cloud.pending){
  const values=cloudDraftValues();
  const changes: Record<string, any>={title:values.title.trim(),body:values.body===draft.body.join('\n')?draft.body:values.body?values.body.split('\n'):[],state:{read:values.read}};
  if(!changes.title&&!deleting)return;
  const payload=deleting?{expectedRevision:draft.revision}:draft.id?{expectedRevision:draft.revision,changes}:{type:'note',...changes};
  Cloud.pending={path:'/api/v1/contents'+(draft.id?'/'+draft.id:''),method:deleting?'DELETE':draft.id?'PATCH':'POST',body:JSON.stringify(payload),key:crypto.randomUUID()};
 }
 stashCloudDraft();Cloud.busy=true;Cloud.writeVersion++;const status=document.getElementById('cloud-save-status');status.textContent=deleting?'正在删除…':'正在保存…';
 const save=document.getElementById('cloud-save');(save as HTMLInputElement).disabled=true;save.setAttribute('aria-busy','true');
 document.querySelectorAll('#cloud-delete,#cloud-discard').forEach((e?: any)=>e.disabled=true);
 document.querySelectorAll('#cloud-editor input,#cloud-editor textarea').forEach((e?: any)=>e.disabled=true);
 try{
  const pending=Cloud.pending;
  const record=await cloudApi(pending.path,{method:pending.method,body:pending.body,headers:{'Idempotency-Key':pending.key}});
  Cloud.pending=null;Cloud.drafts.delete(draft.id||'new');Cloud.edit=null;Cloud.records.set(record.id,record);paintRecords();app.closeNative();app.toast(record.deleted?'已删除内容':'已保存到云端');
 }catch(error){
  status.textContent=error.message+(error.status>=500||!error.status?' 点击保存将用同一请求核对，不会重复创建。':'');
  if(error.status===401||error.status===403){clearCloud({retainDrafts:true});app.toast(error.message);return;}
  if(error.status&&error.status<500){Cloud.pending=null;document.querySelectorAll('#cloud-editor input,#cloud-editor textarea').forEach((e?: any)=>e.disabled=false);}
 }finally{Cloud.busy=false;if(save.isConnected){(save as HTMLInputElement).disabled=Cloud.editLocked;save.setAttribute('aria-busy','false');save.textContent=Cloud.pending?'核对上次保存':'保存到云端';document.querySelectorAll('#cloud-delete,#cloud-discard').forEach((e?: any)=>e.disabled=!!Cloud.pending||e.id==='cloud-delete'&&Cloud.editLocked);}}
}
const originalOpen=app.openModal.bind(app);
app.openModal=function(...args: any[]){if(Cloud.pending){app.toast('先核对本次保存结果。');return;}stashCloudDraft();return originalOpen(...args);};
const originalClose=app.closeNative.bind(app);
app.closeNative=function(...args: any[]){if(Cloud.pending){app.toast('先核对本次保存结果，再关闭草稿。');return;}const dirty=stashCloudDraft();const result=originalClose(...args);if(dirty)app.toast('草稿已保留在本次窗口，重新编辑可继续');return result;};
const originalAction=app.action.bind(app);
app.action=function(name?: any,id?: any,...args: any[]){
 if(Cloud.pending){app.toast('先核对本次保存结果。');return;}
 if(name==='capture'){editCloud();return;}
 if(name==='resume-draft'){editCloud(id==='new'?null:id);return;}
 if(name==='edit'||name==='card-more'||name==='toggle-read'){editCloud(id);return;}
 if(name==='refresh'){loadCloud();return;}
 if(Cloud.pending&&['close','back'].includes(name)){app.toast('先核对本次保存结果，再关闭草稿。');return;}
 const unsupported=['archive-all','restore-card','less-like','never-show','snooze','dismiss-reminder','complete-reminder','restore-reminder','clear-all','sources-add','source-flag','source-set','source-remove','source-drop','permission-later','import-run','bookmark','later','save-note','task','source-connect','source-authorize','permission-allow','feed-add','source-toggle','source-pause','import-pick','demo','welcome-start','welcome-pick','welcome-continue','welcome-demo','clear-confirm','selected-bookmark','selected-later','selected-tag'];
 if(unsupported.includes(name)){app.toast('此操作尚未接入云端');return;}
 return originalAction(name,id,...args);
};
// Every editing entrance, including the keyboard shortcut and note body, uses the same cloud editor.
app.startInlineEdit=editCloud;
const localOpenPanel=app.openPanel.bind(app);
app.openPanel=function(kind?: any,...args: any[]){if(kind==='capture'){editCloud();return;}return localOpenPanel(kind,...args);};
const localSettings=Panels.settings.bind(Panels);
Panels.sourceRows=()=>'<p class="panel-sub">尚未连接外部来源。云端内容只来自你明确保存的记录。</p>';
Panels.settings=function(app?: any,group?: any){
 const html=localSettings(app,group),doc=document.createElement('template');doc.innerHTML=html;
 if(group==='data')doc.content.querySelector('.settings-main').innerHTML='<h1 id="modal-title">数据与隐私</h1><p class="panel-sub">内容保存在你的云端工作区。此浏览器不将账号令牌或卡片写入 localStorage。</p><p class="panel-sub">'+(window.__SILL_HOST__?'通过当前应用授权连接云端。外部来源尚未连接。':'外部来源和远程 MCP 尚未连接。')+'外观与桌面偏好只在本次页面访问中生效。</p>'+ (Cloud.user?'<div class="settings-card"><div class="setting-row"><span>Sill 账号</span><button type="button" class="text-link" id="cloud-logout">'+(window.__SILL_HOST__?'管理插件授权':'退出登录')+'</button></div></div>':'');
 return doc.innerHTML;
};
app.refresh=loadCloud;app.capture=()=>{editCloud();return null;};app.importFiles=async()=>app.toast('文件导入尚未接入云端');app.drop=()=>app.toast('拖拽操作尚未接入云端');
// The host sandbox may disallow window.confirm. Reuse Sill's existing accessible
// confirmation panel, with an explicit return path to the untouched editor.
function confirmCloud(title?: any,detail?: any,label?: any,action?: any,back?: any){
 if(Cloud.pending||Cloud.busy)return;
 stashCloudDraft();Cloud.confirmAction=action;
 app.panelReturn=()=>{Cloud.confirmAction=null;back();};
 app.swapPanel(Panels.confirm(title,detail,`<button type="button" class="soft-button" data-action="close">取消</button><button type="button" class="solid-button" id="cloud-confirm">${esc(label)}</button>`),'confirm','panel narrow');
}
async function logoutCloud(){
 try{const result=await cloudApi('/auth/logout',{method:'POST'});clearCloud();app.toast(result.revoked?'已退出登录':'已退出当前浏览器；上游撤销尚未确认');}catch(error){app.openPanel('settings');app.toast(error.message);}
}
document.addEventListener('click',async (e?: any)=>{
 const target=e.target.closest('button');if(!target)return;
 if(target.id==='cloud-confirm'){
  const action=Cloud.confirmAction;Cloud.confirmAction=null;app.panelReturn=null;target.disabled=true;if(action)await action();return;
 }
 if(target.id==='cloud-discard'){
  if(Cloud.pending||Cloud.busy)return;
  const id=Cloud.edit.id;
  confirmCloud('放弃未保存的草稿？','已保存的云端内容不会改变。','放弃草稿',()=>{Cloud.drafts.delete(id||'new');Cloud.edit=null;app.closeNative();app.renderCurrent(false);},()=>editCloud(id));return;
 }
 if(target.id==='cloud-delete'){
  const id=Cloud.edit?.id;if(!id||Cloud.editLocked)return;
  confirmCloud('删除这条内容？','云端删除后无法撤销。尚未保存的修改也会一并放弃。','删除内容',async()=>{editCloud(id);await saveCloud(true);},()=>editCloud(id));return;
 }
 if(window.__SILL_HOST__&&target.id==='cloud-save'){if(target.form.reportValidity())await saveCloud();return;}
 if(target.id==='cloud-logout'){
  if(window.__SILL_HOST__){await window.__SILL_HOST__.manageAccess();return;}
  if(Cloud.drafts.size){confirmCloud('退出并放弃未保存的草稿？','本次窗口中的草稿将被清除，云端已保存的内容不变。','退出登录',logoutCloud,()=>app.openPanel('settings'));return;}
  await logoutCloud();
 }
});
document.addEventListener('submit',async (e?: any)=>{
 if(e.target.id==='cloud-editor'){e.preventDefault();await saveCloud();}
 if(e.target.id==='cloud-login'){
  e.preventDefault();const button=e.target.querySelector('button'),status=document.getElementById('cloud-login-status');
  if(Date.now()<Cloud.loginUntil)return;
  button.disabled=true;Cloud.loginUntil=Date.now()+60000;
  const timer=setInterval(()=>{if(!button.isConnected){clearInterval(timer);return;}const left=Math.ceil((Cloud.loginUntil-Date.now())/1000);button.disabled=left>0;button.textContent=left>0?`${left} 秒后可重发`:'发送登录链接';if(left<=0)clearInterval(timer);},250);
  try{const result=await cloudApi('/auth/login',{method:'POST',body:JSON.stringify({email:new FormData(e.target).get('email')})});status.textContent=result.message+' 请在当前浏览器打开最新链接。';}
  catch(error){status.textContent=error.message;}

 }
});
document.addEventListener('input',(e?: any)=>{if(e.target.closest('#cloud-editor'))paintCloudDraft();});
document.addEventListener('keydown',(e?: any)=>{
 if(app.modalKind==='cloud-editor'&&!e.isComposing&&(e.metaKey||e.ctrlKey)&&['Enter','s'].includes(e.key)){
  e.preventDefault();if((document.getElementById('cloud-editor') as HTMLFormElement).reportValidity())saveCloud();
 }
});
window.addEventListener('beforeunload',(e?: any)=>{stashCloudDraft();if(Cloud.pending||Cloud.drafts.size){e.preventDefault();e.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Cloud.user)loadCloud();});
window.addEventListener('online',()=>loadCloud());
accountView();loadCloud({initial:true});

// MCP App sandboxes can block native form submission; keep saves inside the bridge.
if(window.__SILL_HOST__)document.addEventListener('keydown',(e?: any)=>{if(e.key==='Enter'&&!e.isComposing&&e.target.matches('#cloud-title')){e.preventDefault();if(e.target.form.reportValidity())saveCloud();}});

export { transientPatch, Cloud, callbackFailed, cloudWelcome, app, originalDeskHTML, messages, cloudApi, accountView, clearCloud, cloudConnection, paintRecords, loadCloud, cloudDraftValues, stashCloudDraft, paintCloudDraft, editCloud, saveCloud, originalOpen, originalClose, originalAction, localOpenPanel, localSettings, confirmCloud, logoutCloud };
