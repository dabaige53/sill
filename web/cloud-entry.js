/* Authenticated cloud build only. No credentials or private cards in browser storage. */
// Invitation/legacy implicit fragments are never accepted as app sessions.
if(/(?:access_token|refresh_token|error_description)=/.test(location.hash))history.replaceState(null,'',location.pathname);
window.__QG_LOCAL__=false;
window.__QG_RUNTIME__=false;
Store.load=function(){this.state=this.fresh();this.state.preferences.onboarded=true;return this.state;};
Store.save=function(){};
// Automatic reading observations remain transient; explicit cloud edits own persisted state.
const transientPatch=Store.patch;
Store.patch=function(id,values){const safe={};for(const key of ['seen','progress'])if(key in values)safe[key]=values[key];transientPatch.call(this,id,safe);};
const Cloud={user:null,records:new Map(),edit:null,pending:null,busy:false,epoch:0,loading:false,loginUntil:0};
const callbackFailed=new URL(location.href).searchParams.has('login_error');
if(callbackFailed)history.replaceState(null,'',location.pathname+location.hash);
function cloudWelcome(){
 if(window.__SILL_HOST__&&!Cloud.user)return welcomeHTML({actions:'<button type="button" class="solid-button" data-action="refresh">重新连接云端</button>',detail:'<p class="cloud-detail">通过 Codex 授权连接 Sill 云端账号。</p>'});
 return welcomeHTML({actions:Cloud.user?'<button type="button" class="solid-button" data-action="capture">记下第一条内容</button>':`<form id="cloud-login"><label for="cloud-email">用已有账号登录</label><input id="cloud-email" name="email" type="email" autocomplete="email" required placeholder="你的邮箱" aria-describedby="cloud-login-status"><button class="solid-button" type="submit">发送登录链接</button><p id="cloud-login-status" role="status">${callbackFailed?'登录链接未能完成验证。请在发送链接的浏览器打开最新邮件，或重新发送。':'登录后，你的内容会出现在这里。'}</p></form>`,detail:Cloud.user?'<p class="cloud-detail">窗台还是空的，从一条笔记开始。</p>':''});
}
const app=new AppController();
const originalDeskHTML=app.deskHTML.bind(app);
app.deskHTML=function(){
 if(!Cloud.user||!Store.state.cards.length)return cloudWelcome();
 return originalDeskHTML();
};
app.init();
const messages={rate_limited:'请求较频繁，请稍等一分钟再发送。',unauthenticated:'登录已过期，请重新登录。',forbidden:'该账号或客户端没有此操作权限。',revision_conflict:'内容已在另一处修改。草稿仍保留，请刷新并核对后再保存。',idempotency_conflict:'原请求已被处理或需要核对，未覆盖数据。',not_found:'内容已不存在。',unavailable:'连接暂时不可用；写入结果可能尚未确认。'};
async function cloudApi(path,options={}){
 if(window.__SILL_HOST__) {try{return await window.__SILL_HOST__.request(path,options);}catch(error){error.message=messages[error.code]||error.message;throw error;}}
 const response=await fetch(path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers}});
 const data=await response.json();
 if(!response.ok)throw Object.assign(new Error(messages[data.error?.code]||'请求未完成'),{status:response.status,code:data.error?.code});
 return data;
}
function accountView(){document.body.classList.toggle('cloud-signed-in',!!Cloud.user);}

function clearCloud(){Cloud.epoch++;Cloud.user=null;Cloud.pending=null;Cloud.edit=null;Cloud.records.clear();Store.load();app.closeNative();app.renderCurrent(true);accountView();}
function paintRecords(){
 Store.state.cards=[...Cloud.records.values()].filter(c=>!c.deleted&&!c.state.archived).map(c=>({id:c.id,type:c.type,kind:'web',title:c.title,body:c.body,summary:c.body?.[0]||'',url:c.url,source:'Sill 云端',time:Date.parse(c.updated_at),meta:'已保存',revision:c.revision}));
 Store.state.items=Object.fromEntries([...Cloud.records.values()].map(c=>[c.id,{read:!!c.state.read}]));app.withFeedAnchor(()=>{},true);
}
async function loadCloud({initial=false}={}){
 if(Cloud.loading||Cloud.busy||Cloud.pending)return;
 Cloud.loading=true;const epoch=Cloud.epoch;let checkingSession=true;
 try{
  const session=await cloudApi('/auth/session');checkingSession=false;
  const records=new Map();let cursor=null;
  do{const query=cursor?'?cursor='+encodeURIComponent(cursor):'';const page=await cloudApi('/api/v1/contents'+query);for(const c of page.items)records.set(c.id,c);cursor=page.next_cursor;}while(cursor);
  if(epoch!==Cloud.epoch)return;
  Cloud.scopes=session.scopes||null;Cloud.user=session.userId;Cloud.records=records;paintRecords();accountView();
 }catch(error){if(epoch!==Cloud.epoch)return;if(error.status===401||error.status===403)clearCloud();if(!(initial&&checkingSession&&error.status===401))app.toast(error.message);}
 finally{Cloud.loading=false;}
}
function editCloud(id){
 if(!Cloud.user){app.toast('请先登录');return;}
 if(Cloud.scopes&&!Cloud.scopes.includes('content:write')){app.toast('当前授权仅允许读取，请在 Codex 重新授权后编辑');return;}
 if(Cloud.pending){app.toast('上次保存结果未确认，请先重试核对原请求。');return;}
 const record=id?Cloud.records.get(id):null;if(id&&!record)return;
 Cloud.edit=record?structuredClone(record):{id:null,revision:null,title:'',body:[],state:{read:false}};
 app.openModal(`<div class="sheet"><div class="panel-content"><h1 id="modal-title">${id?'修改内容':'新建笔记'}</h1><form id="cloud-editor"><label>标题<input id="cloud-title" required maxlength="1000" value="${esc(Cloud.edit.title)}"></label><label>正文<textarea id="cloud-body" rows="10">${esc(Cloud.edit.body.join('\n'))}</textarea></label><label><input id="cloud-read" type="checkbox" ${Cloud.edit.state.read?'checked':''}> 标记已读</label><p id="cloud-save-status" role="status"></p><button class="solid-button" type="${window.__SILL_HOST__?'button':'submit'}" id="cloud-save">保存到云端</button>${id&&(!Cloud.scopes||Cloud.scopes.includes('content:delete'))?'<button class="soft-button" type="button" id="cloud-delete">删除内容</button>':''}<button type="button" class="soft-button" data-action="close">关闭</button></form></div></div>`,'cloud-editor',null,'panel wide');
}
async function saveCloud(deleting=false){
 if(Cloud.busy||!Cloud.edit)return;const draft=Cloud.edit;
 if(!Cloud.pending){
  const changes={title:document.getElementById('cloud-title').value.trim(),body:document.getElementById('cloud-body').value.split('\n'),state:{read:document.getElementById('cloud-read').checked}};
  if(!changes.title&&!deleting)return;
  const payload=deleting?{expectedRevision:draft.revision}:draft.id?{expectedRevision:draft.revision,changes}:{type:'note',...changes};
  Cloud.pending={path:'/api/v1/contents'+(draft.id?'/'+draft.id:''),method:deleting?'DELETE':draft.id?'PATCH':'POST',body:JSON.stringify(payload),key:crypto.randomUUID()};
 }
 Cloud.busy=true;const status=document.getElementById('cloud-save-status');status.textContent='正在保存…';
 document.querySelectorAll('#cloud-editor input,#cloud-editor textarea').forEach(e=>e.disabled=true);
 try{
  const pending=Cloud.pending;
  const record=await cloudApi(pending.path,{method:pending.method,body:pending.body,headers:{'Idempotency-Key':pending.key}});
  Cloud.pending=null;Cloud.records.set(record.id,record);paintRecords();app.closeNative();app.toast('已保存到云端');
 }catch(error){
  status.textContent=error.message+(error.status>=500||!error.status?' 点击保存将用同一请求核对，不会重复创建。':'');
  if(error.status===401||error.status===403){clearCloud();app.toast(error.message);return;}
  if(error.status&&error.status<500){Cloud.pending=null;document.querySelectorAll('#cloud-editor input,#cloud-editor textarea').forEach(e=>e.disabled=false);}
 }finally{Cloud.busy=false;}
}
const originalOpen=app.openModal.bind(app);
app.openModal=function(...args){if(Cloud.pending){app.toast('先核对本次保存结果。');return;}return originalOpen(...args);};
const originalClose=app.closeNative.bind(app);
app.closeNative=function(...args){if(Cloud.pending){app.toast('先核对本次保存结果，再关闭草稿。');return;}return originalClose(...args);};
const originalAction=app.action.bind(app);
app.action=function(name,id,...args){
 if(Cloud.pending){app.toast('先核对本次保存结果。');return;}
 if(name==='capture'){editCloud();return;}
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
app.openPanel=function(kind,...args){if(kind==='capture'){editCloud();return;}return localOpenPanel(kind,...args);};
const localSettings=Panels.settings.bind(Panels);
Panels.sourceRows=()=>'<p class="panel-sub">尚未连接外部来源。云端内容只来自你明确保存的记录。</p>';
Panels.settings=function(app,group){
 const html=localSettings(app,group),doc=document.createElement('template');doc.innerHTML=html;
 if(group==='data')doc.content.querySelector('.settings-main').innerHTML='<h1 id="modal-title">数据与隐私</h1><p class="panel-sub">内容保存在你的云端工作区。此浏览器不将账号令牌或卡片写入 localStorage。</p><p class="panel-sub">'+(window.__SILL_HOST__?'通过 Codex 授权连接云端。外部来源尚未连接。':'外部来源和远程 MCP 尚未连接。')+'外观与桌面偏好只在本次页面访问中生效。</p>'+ (Cloud.user?'<div class="settings-card"><div class="setting-row"><span>Sill 账号</span><button type="button" class="text-link" id="cloud-logout">'+(window.__SILL_HOST__?'管理插件授权':'退出登录')+'</button></div></div>':'');
 return doc.innerHTML;
};
app.refresh=loadCloud;app.capture=()=>{editCloud();return null;};app.importFiles=async()=>app.toast('文件导入尚未接入云端');app.drop=()=>app.toast('拖拽操作尚未接入云端');
document.addEventListener('click',async e=>{
 const target=e.target.closest('button');if(!target)return;
 if(window.__SILL_HOST__&&target.id==='cloud-save'){if(target.form.reportValidity())await saveCloud();return;}
 if(target.id==='cloud-logout'){
  if(window.__SILL_HOST__){await window.__SILL_HOST__.manageAccess();return;}
  try{const result=await cloudApi('/auth/logout',{method:'POST'});clearCloud();app.toast(result.revoked?'已退出登录':'已退出当前浏览器；上游撤销尚未确认');}catch(error){app.toast(error.message);}
 }
});
document.addEventListener('submit',async e=>{
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
document.addEventListener('click',e=>{if(e.target.id==='cloud-delete'&&confirm('确认删除这条内容？'))saveCloud(true);});
window.addEventListener('beforeunload',e=>{if(Cloud.pending){e.preventDefault();e.returnValue='';}});
accountView();loadCloud({initial:true});

// MCP App sandboxes can block native form submission; keep saves inside the bridge.
if(window.__SILL_HOST__)document.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing&&e.target.matches('#cloud-title')){e.preventDefault();if(e.target.form.reportValidity())saveCloud();}});
