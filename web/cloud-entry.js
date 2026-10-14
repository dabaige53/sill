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
const Cloud={user:null,records:new Map(),edit:null,pending:null,busy:false};
const app=new AppController();
const originalDeskHTML=app.deskHTML.bind(app);
app.deskHTML=function(){
 if(!Cloud.user)return emptyState('登录后查看你的云端内容','请在上方输入已有账号的邮箱。');
 if(!Store.state.cards.length)return emptyState('还没有云端内容','点击上方「新建笔记」开始。');
 return originalDeskHTML();
};
app.init();
const account=document.createElement('section');account.id='cloud-account';document.body.prepend(account);
const messages={unauthenticated:'登录已过期，请重新登录。',forbidden:'该账号或客户端没有此操作权限。',revision_conflict:'内容已在另一处修改。草稿仍保留，请刷新并核对后再保存。',idempotency_conflict:'原请求已被处理或需要核对，未覆盖数据。',not_found:'内容已不存在。',unavailable:'连接暂时不可用；写入结果可能尚未确认。'};
async function cloudApi(path,options={}){
 const response=await fetch(path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers}});
 const data=await response.json();
 if(!response.ok)throw Object.assign(new Error(messages[data.error?.code]||'请求未完成'),{status:response.status,code:data.error?.code});
 return data;
}
function accountView(){
 account.innerHTML=Cloud.user?'<span>云端工作台 · 内容修改提交后才保存；收藏、外部来源与 MCP 尚未接通</span><button class="soft-button" id="cloud-new">新建笔记</button><button class="soft-button" id="cloud-refresh">刷新</button><button class="soft-button" id="cloud-logout">退出登录</button>':'<form id="cloud-login"><label>登录 Sill <input name="email" type="email" autocomplete="email" required placeholder="已有账号的邮箱"></label><button class="solid-button">发送登录链接</button></form><p id="cloud-login-status" role="status">内容仅在登录并获得授权后显示。</p>';
}
function clearCloud(){Cloud.user=null;Cloud.pending=null;Cloud.edit=null;Cloud.records.clear();Store.load();app.closeNative();app.renderCurrent(true);accountView();}
function paintRecords(){
 Store.state.cards=[...Cloud.records.values()].filter(c=>!c.deleted&&!c.state.archived).map(c=>({id:c.id,type:c.type,kind:'web',title:c.title,body:c.body,summary:c.body?.[0]||'',url:c.url,source:'Sill 云端',time:Date.parse(c.updated_at),meta:'已保存',revision:c.revision}));
 Store.state.items=Object.fromEntries([...Cloud.records.values()].map(c=>[c.id,{read:!!c.state.read}]));app.withFeedAnchor(()=>{},true);
}
async function loadCloud({initial=false}={}){
 let checkingSession=true;
 try{
  const session=await cloudApi('/auth/session');checkingSession=false;Cloud.user=session.userId;
  const records=new Map();let cursor=null;
  do{const query=cursor?'?cursor='+encodeURIComponent(cursor):'';const page=await cloudApi('/api/v1/contents'+query);for(const c of page.items)records.set(c.id,c);cursor=page.next_cursor;}while(cursor);
  Cloud.records=records;paintRecords();accountView();
 }catch(error){if(error.status===401||error.status===403)clearCloud();if(!(initial&&checkingSession&&error.status===401))app.toast(error.message);}
}
function editCloud(id){
 if(!Cloud.user){app.toast('请先登录');return;}
 if(Cloud.pending){app.toast('上次保存结果未确认，请先重试核对原请求。');return;}
 const record=id?Cloud.records.get(id):null;if(id&&!record)return;
 Cloud.edit=record?structuredClone(record):{id:null,revision:null,title:'',body:[],state:{read:false}};
 app.openModal(`<div class="sheet"><div class="panel-content"><h1 id="modal-title">${id?'修改内容':'新建笔记'}</h1><form id="cloud-editor"><label>标题<input id="cloud-title" required maxlength="1000" value="${esc(Cloud.edit.title)}"></label><label>正文<textarea id="cloud-body" rows="10">${esc(Cloud.edit.body.join('\n'))}</textarea></label><label><input id="cloud-read" type="checkbox" ${Cloud.edit.state.read?'checked':''}> 标记已读</label><p id="cloud-save-status" role="status"></p><button class="solid-button" type="submit">保存到云端</button>${id?'<button class="soft-button" type="button" id="cloud-delete">删除内容</button>':''}<button type="button" class="soft-button" data-action="close">关闭</button></form></div></div>`,'cloud-editor',null,'panel wide');
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
const originalClose=app.closeNative.bind(app);
app.closeNative=function(...args){if(Cloud.pending){app.toast('先核对本次保存结果，再关闭草稿。');return;}return originalClose(...args);};
const originalAction=app.action.bind(app);
app.action=function(name,id,...args){
 if(Cloud.pending){app.toast('先核对本次保存结果。');return;}
 if(name==='capture'){editCloud();return;}
 if(name==='edit'||name==='card-more'){editCloud(id);return;}
 if(name==='refresh'){loadCloud();return;}
 if(Cloud.pending&&['close','back'].includes(name)){app.toast('先核对本次保存结果，再关闭草稿。');return;}
 const unsupported=['bookmark','later','save-note','task','source-connect','source-authorize','permission-allow','feed-add','source-toggle','source-pause','import-pick','demo','welcome-start','welcome-pick','welcome-continue','welcome-demo','clear-confirm','selected-bookmark','selected-later','selected-tag'];
 if(unsupported.includes(name)){app.toast('此操作尚未接入云端');return;}
 return originalAction(name,id,...args);
};
app.refresh=loadCloud;app.capture=()=>{editCloud();return null;};app.importFiles=async()=>app.toast('文件导入尚未接入云端');app.drop=()=>app.toast('拖拽操作尚未接入云端');
account.addEventListener('click',async e=>{
 if(e.target.id==='cloud-new')editCloud();
 if(e.target.id==='cloud-refresh')loadCloud();
 if(e.target.id==='cloud-logout'){
  try{const result=await cloudApi('/auth/logout',{method:'POST'});clearCloud();app.toast(result.revoked?'已退出登录':'已退出当前浏览器；上游撤销尚未确认');}catch(error){app.toast(error.message);}
 }
});
document.addEventListener('submit',async e=>{
 if(e.target.id==='cloud-editor'){e.preventDefault();await saveCloud();}
 if(e.target.id==='cloud-login'){
  e.preventDefault();const button=e.target.querySelector('button');button.disabled=true;
  try{const result=await cloudApi('/auth/login',{method:'POST',body:JSON.stringify({email:new FormData(e.target).get('email')})});document.getElementById('cloud-login-status').textContent=result.message;}
  catch(error){document.getElementById('cloud-login-status').textContent=error.message;}finally{button.disabled=false;}
 }
});
document.addEventListener('click',e=>{if(e.target.id==='cloud-delete'&&confirm('确认删除这条内容？'))saveCloud(true);});
window.addEventListener('beforeunload',e=>{if(Cloud.pending){e.preventDefault();e.returnValue='';}});
accountView();loadCloud({initial:true});
