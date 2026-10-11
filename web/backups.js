/* Bounded content backup controls. Files/drafts never trigger a server request.
 * Only explicit gestures export, preview, commit, recover or undo. */
window.initQuietGlassBackups=({app,panels,esc,api,post,isConnected,onRestored})=>{
  const maxBytes=256*1024,key='quiet-glass-backup-draft-v1:'+(window.__QG_HOST__?'host':'web');
  const scope='仅包含卡片（本地笔记、已采集与宿主导入内容及来源标注、已读／收藏等卡片状态）、备注／个人标签和普通设置（排序、透明度、推荐偏好）。不含对话、消息、AI 请求、任务／脚本定义与运行记录、工作流、审计、浏览器草稿或阅读位置；不含凭据、访问授权或服务器配置。';
  const caveat='立即受保护撤销只恢复被覆盖的原值；新增卡片仍会保留。原先没有设置或备注时，写入更高修订号的默认设置或空备注。任何后续记录写入（包括后台任务）都可能阻止撤销；不能强制撤销，也不能收回他人已经读取的信息。';
  const labels={cardsAdded:'新增卡片',cardsOverwritten:'覆盖卡片',cardsUnchanged:'保留原卡片',annotationsAdded:'新增备注／标签',annotationsOverwritten:'覆盖备注／标签',annotationsUnchanged:'保留原备注／标签',settingsAdded:'新增普通设置',settingsOverwritten:'覆盖普通设置',settingsUnchanged:'保留原设置'};
  const id=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,200}$/.test(value);
  const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
  const object=value=>!!value&&typeof value==='object'&&!Array.isArray(value);
  const bytes=value=>new TextEncoder().encode(value).length;
  const validDraft=value=>object(value)&&typeof value.text==='string'&&value.text.length<=maxBytes&&bytes(value.text)<=maxBytes&&['additive','overwrite'].includes(value.mode);
  const validCommit=value=>object(value)&&Object.keys(value).sort().join(',')==='acknowledgeVisibility,approvalToken,approved,expectedPlanDigest,idempotencyKey,planId'&&id(value.planId)&&digest(value.expectedPlanDigest)&&typeof value.approvalToken==='string'&&value.approvalToken.length>=16&&value.approvalToken.length<=200&&value.approved===true&&typeof value.acknowledgeVisibility==='boolean'&&id(value.idempotencyKey);
  const validUndo=value=>object(value)&&Object.keys(value).sort().join(',')==='approved,expectedEpoch,idempotencyKey'&&Number.isSafeInteger(value.expectedEpoch)&&value.expectedEpoch>=0&&value.approved===true&&id(value.idempotencyKey);
  // These errors occur after a durable replay-key lookup in the shared engine.
  const retryRejection=new Set(['BACKUP_PLAN_NOT_FOUND','BACKUP_PLAN_EXPIRED','BACKUP_PLAN_MISMATCH','BACKUP_STALE','BACKUP_POLICY_CHANGED','BACKUP_VISIBILITY_ACK_REQUIRED','BACKUP_CONFLICT','REVISION_LIMIT']);
  const safeRejection=new Set(['BACKUP_CONFLICT','BACKUP_PLAN_NOT_FOUND','BACKUP_PLAN_EXPIRED','BACKUP_PLAN_MISMATCH','BACKUP_STALE','BACKUP_POLICY_CHANGED','BACKUP_VISIBILITY_ACK_REQUIRED','BACKUP_CAPACITY','BACKUP_RECORD_INVALID','BACKUP_GRAPH_INVALID','REVISION_LIMIT','INVALID_INPUT']);
  let draft={text:'',mode:'additive'},pending=null,pendingUndo=null,restoreId=null,notice='',storageFailed=false;
  try{
    const raw=localStorage.getItem(key);if(raw&&raw.length<=maxBytes*2+12000){const saved=JSON.parse(raw);
      if(validDraft(saved?.draft))draft=saved.draft;
      if(id(saved?.restoreId))restoreId=saved.restoreId;
      if(id(saved?.pending?.restoreId)&&validCommit(saved.pending.request))pending=saved.pending;
      if(id(saved?.pendingUndo?.restoreId)&&validUndo(saved.pendingUndo.request))pendingUndo=saved.pendingUndo;
      if(typeof saved?.notice==='string')notice=saved.notice.slice(0,1500);
    }
  }catch{/* Untrusted local data is never submitted automatically. */}
  let preview=null,result=null,exportText='',version=0,fileVersion=0,readVersion=0;
  const busy=new Set();
  const persist=()=>{try{localStorage.setItem(key,JSON.stringify({draft,pending,pendingUndo,restoreId,notice:notice.slice(0,1500)}));storageFailed=false;return true;}catch{storageFailed=true;return false;}};
  const section=()=>app.modalKind==='settings'&&app.dialog.open?document.getElementById('qg-backups-settings'):null;
  const view=()=>({node:section(),token:app.modalToken});
  const sameView=target=>!!target.node&&target.node===section()&&target.token===app.modalToken;
  const locked=()=>!!pending||!!pendingUndo||busy.has('commit')||busy.has('undo');
  const button=(name,title,solid=false)=>`<button type="button" class="${solid?'solid-button':'text-button'}" data-action="backups-${name}">${title}</button>`;
  const style='box-sizing:border-box;max-width:100%;width:100%;min-width:0';
  const controls='display:flex;flex-wrap:wrap;gap:8px;align-items:center';
  function markup(){
    return `<details id="qg-backups-settings" style="margin:18px 0;min-width:0;overflow-wrap:anywhere"><summary style="cursor:pointer">内容与设置备份（不含对话/运行记录）</summary><p class="settings-note" id="qg-backups-scope">${scope}</p><p class="settings-note">备份是未加密的私人内容。结构会排除已配置的凭据与服务器配置，但用户正文可能包含密码或其他秘密；请自行检查并妥善保存，不要公开分享。导入草稿会保留在本浏览器。</p><p class="settings-note">上限 256 KiB、100 张卡片、100 条备注；超限会拒绝，不会部分恢复。选择文件或编辑 JSON 不会上传；只有点击“校验并预览”才发送到当前 Quiet Glass 服务。</p><div style="${controls}">${button('export','准备导出 JSON')}</div><div id="qg-backup-export" hidden><p class="settings-note">导出已准备。点击下载保存；若宿主不支持文件下载／选择或剪贴板，请手动复制下方 JSON，保存为 .json 文件或粘贴到导入框。原生宿主文件能力尚未验证。</p><div style="${controls}">${button('download','下载 JSON')}${button('copy','复制导出 JSON')}</div><label class="field-label" for="qg-backup-export-text">导出 JSON（未加密）</label><textarea id="qg-backup-export-text" readonly rows="4" spellcheck="false" style="${style};resize:vertical"></textarea></div><label class="field-label" for="qg-backup-file">选择 JSON 备份（最多 256 KiB）</label><input id="qg-backup-file" type="file" accept=".json,application/json" style="${style}"><label class="field-label" for="qg-backup-json">导入 JSON 草稿（也可手动粘贴）</label><textarea id="qg-backup-json" rows="5" maxlength="${maxBytes}" spellcheck="false" style="${style};resize:vertical">${esc(draft.text)}</textarea><label class="field-label" for="qg-backup-mode">恢复方式</label><select id="qg-backup-mode" style="${style}"><option value="additive"${draft.mode==='additive'?' selected':''}>仅追加：遇到已有不同内容时整批拒绝</option><option value="overwrite"${draft.mode==='overwrite'?' selected':''}>覆盖：明确替换冲突内容与普通设置</option></select><p class="settings-note" id="qg-backup-undo-caveat">${caveat}</p><div style="${controls}">${button('preview','校验并预览')}${button('clear','清除导入草稿')}</div><p id="qg-backups-status" class="settings-note" role="status" aria-live="polite"></p><div id="qg-backup-preview"></div><label id="qg-backup-visibility-label" class="settings-note" style="display:none;align-items:flex-start;gap:8px;margin:12px 0"><input type="checkbox" id="qg-backup-visibility">我确认上述访问主体可按当前来源／卡片及证据权限读取恢复内容；撤销不能收回已被读取的信息。</label><div style="${controls}">${button('commit','确认恢复',true)}${button('status','查询上次恢复状态')}${button('undo','确认立即撤销覆盖')}</div><div id="qg-backup-result" role="status" aria-live="polite"></div></details>`;
  }
  function replace(node,html){if(node&&node.__qgBackupMarkup!==html){node.innerHTML=html;node.__qgBackupMarkup=html;}}
  function counts(value){return Object.entries(labels).map(([name,label])=>`${label} ${Number.isSafeInteger(value?.[name])?value[name]:'—'}`).join(' · ');}
  function visibilityMarkup(value){
    const principals=Array.isArray(value?.principals)?value.principals:[];
    return `<p class="settings-note">恢复内容会立即适用当前访问主体与来源权限；证据引用也会影响可见性。${value?.requiresAcknowledgement?'以下可见性变化需要明确确认。':'服务未报告需要额外确认的可见性变化。'}这仅描述已配置且受影响的启用权限，不验证凭据是否可用。</p>`+principals.slice(0,100).map(principal=>`<p class="settings-note" data-backup-principal>访问主体：${esc(principal.id)}<br>来源范围：${esc((principal.sourceIds||[]).join('、')||'按卡片权限')}<br>新增可见卡片 ${esc(principal.newlyVisibleCount)}；受影响的可见卡片 ${esc(principal.affectedVisibleCount)}；备注可见：${principal.annotationsVisible?'是':'否'}<br>新增可见 ID：${esc((principal.newlyVisibleCardIds||[]).slice(0,20).join('、')||'无')}<br>受影响 ID：${esc((principal.affectedVisibleCardIds||[]).slice(0,20).join('、')||'无')}${principal.idsTruncated?'（ID 列表为节选）':''}</p>`).join('');
  }
  function render(){
    const root=section();if(!root)return;
    root.querySelector('#qg-backups-status').textContent=(notice||'没有自动上传、预览或恢复。先检查文件与恢复方式，再明确预览和确认。')+(storageFailed?' 浏览器无法保留请求凭据，提交已阻止；请恢复本地存储并保留草稿。':'');
    const exporting=busy.has('export');root.querySelector('[data-action="backups-export"]').disabled=!isConnected()||exporting;
    root.querySelector('#qg-backup-export').hidden=!exportText;
    const exported=root.querySelector('#qg-backup-export-text');if(exported.value!==exportText)exported.value=exportText;
    root.querySelectorAll('#qg-backup-file,#qg-backup-json,#qg-backup-mode').forEach(node=>node.disabled=locked());
    root.querySelector('[data-action="backups-preview"]').disabled=locked()||busy.has('preview')||busy.has('file')||!isConnected()||!draft.text;
    root.querySelector('[data-action="backups-clear"]').disabled=locked()||busy.has('file');
    const commit=root.querySelector('[data-action="backups-commit"]'),ack=root.querySelector('#qg-backup-visibility');
    root.querySelector('#qg-backup-visibility-label').style.display=preview?.visibility?.requiresAcknowledgement?'flex':'none';ack.disabled=locked();
    commit.textContent=busy.has('commit')?'正在确认恢复…':pending?'重试原恢复请求':'确认恢复';
    commit.disabled=!isConnected()||busy.has('commit')||!!pendingUndo||(!pending&&(!preview||(preview.mode==='additive'&&preview.conflicts?.length>0)||(preview.visibility?.requiresAcknowledgement&&!ack.checked)));
    root.querySelector('[data-action="backups-status"]').disabled=!isConnected()||busy.has('status')||busy.has('commit')||busy.has('undo')||!(restoreId||pending?.restoreId||pendingUndo?.restoreId);
    const undo=root.querySelector('[data-action="backups-undo"]');undo.textContent=pendingUndo?'重试原撤销请求':'确认立即撤销覆盖';
    undo.disabled=!isConnected()||busy.has('undo')||!!pending||(!pendingUndo&&(!result||result.status!=='committed'||result.undo?.available!==true));
    replace(root.querySelector('#qg-backup-preview'),preview?`<p class="settings-note"><strong>预览已校验 · ${preview.mode==='overwrite'?'覆盖恢复':'仅追加恢复'}</strong><br>${esc(counts(preview.counts))}<br>计划：${esc(preview.planId)}<br>摘要：${esc(preview.planDigest)}<br>有效至：${esc(preview.expiresAt)}</p>${preview.conflicts?.length?`<p class="settings-note">冲突 ${preview.conflicts.length} 项；仅追加模式会拒绝整批恢复。需明确选择覆盖并重新预览。</p>`+preview.conflicts.slice(0,40).map(item=>`<p class="settings-note">${esc(item.kind)} · ${esc(item.id)}：${esc(item.reason)}</p>`).join('')+(preview.conflicts.length>40?'<p class="settings-note">其余冲突未展开。</p>':''):''}${visibilityMarkup(preview.visibility)}<p class="settings-note">${caveat}</p>`:'');
    const outcome=result?`<p class="settings-note"><strong>${result.status==='undone'?'已确认撤销覆盖':'已确认恢复'}</strong><br>恢复 ID：${esc(result.restoreId)}<br>${esc(counts(result.counts))}</p><p class="settings-note">${caveat}</p><p class="settings-note">${result.status==='undone'?'新增卡片仍保留。':result.undo?.available?'当前回执允许立即受保护撤销；提交时仍会重新检查。':'撤销目前不可用：'+esc(result.undo?.reason||'请查询最新状态。')}</p>`:'';
    const recovery=pending?`<p class="settings-note">上次恢复尚待确认。请求键：${esc(pending.request.idempotencyKey)}；恢复 ID：${esc(pending.restoreId)}。草稿已锁定；请查询状态，或明确重试同一请求。不会自动重发。</p>`:pendingUndo?`<p class="settings-note">上次撤销尚待确认。请求键：${esc(pendingUndo.request.idempotencyKey)}。请查询状态，或明确重试相同撤销请求。不会自动重发。</p>`:restoreId&&!result?`<p class="settings-note">保留了恢复 ID：${esc(restoreId)}。点击查询可读取状态；重新打开不会自动提交。</p>`:'';
    replace(root.querySelector('#qg-backup-result'),outcome+recovery);
  }
  function setNotice(value){notice=value;persist();}
  function refreshRestored(){Promise.resolve().then(()=>onRestored?.()).catch(()=>{app.toast('恢复回执已保留；最新内容暂未读取，请稍后重新打开或刷新页面。');});}
  function invalidatePreview(){version++;preview=null;const ack=section()?.querySelector('#qg-backup-visibility');if(ack)ack.checked=false;}
  function capture(){
    const root=section();if(!root||locked())return;
    const value={text:root.querySelector('#qg-backup-json').value,mode:root.querySelector('#qg-backup-mode').value};
    if(!validDraft(value)){invalidatePreview();setNotice('导入文本超过 256 KiB，未保留超限修改，也不会上传；请缩小文件。');render();return;}
    draft=value;invalidatePreview();notice='草稿已修改，之前的预览已失效；需要重新校验。';persist();render();
  }
  function parse(text){
    if(typeof text!=='string'||text.length>maxBytes||bytes(text)>maxBytes)throw new Error('文件或文本超过 256 KiB 上限。');
    let value;try{value=JSON.parse(text);}catch{throw new Error('请输入有效 JSON，草稿仍保留；没有发送到服务。');}
    if(!object(value))throw new Error('备份必须是 JSON 对象，不能是数组、字符串或 null。');
    if(Array.isArray(value.payload?.cards)&&value.payload.cards.length>100||Array.isArray(value.payload?.annotations)&&value.payload.annotations.length>100)throw new Error('备份最多包含 100 张卡片和 100 条备注。');
    return value;
  }
  async function chooseFile(file){
    if(!file||locked())return;
    const token=++fileVersion,target=view(),before=version;busy.add('file');invalidatePreview();render();
    try{
      // File.size is checked before text() or JSON.parse() can consume the file.
      if(file.size>maxBytes)throw new Error('文件超过 256 KiB，未读取也未上传。');
      const text=await file.text();parse(text);
      if(token!==fileVersion||version!==before+1||!sameView(target))return;
      draft={...draft,text};setNotice('文件已载入本浏览器草稿；尚未上传或预览。');section().querySelector('#qg-backup-json').value=text;
    }catch(error){if(token===fileVersion&&sameView(target))setNotice(error.message+' 原草稿仍保留。');}
    finally{if(token===fileVersion){busy.delete('file');if(sameView(target)){section().querySelector('#qg-backup-file').value='';render();}}}
  }
  async function prepareExport(){
    if(!isConnected()||busy.has('export'))return;
    const target=view();busy.add('export');render();
    try{const value=await post('/api/backups/export',{}),text=JSON.stringify(value);parse(text);if(sameView(target)){exportText=text;setNotice('导出已准备；点击下载或复制，文件未加密。');}}
    catch(error){if(sameView(target))setNotice(`导出未完成：${error.message}`);}
    finally{busy.delete('export');if(sameView(target))render();}
  }
  function download(){
    if(!exportText)return;
    let url;
    try{parse(exportText);url=URL.createObjectURL(new Blob([exportText],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='quiet-glass-content-backup.json';document.body.appendChild(link);link.click();link.remove();setNotice('已请求浏览器下载；请检查是否保存成功。若宿主未响应，可复制下方 JSON 手动保存。');}
    catch{setNotice('此环境未完成下载，请复制下方 JSON 手动保存。');}
    finally{if(url)setTimeout(()=>URL.revokeObjectURL(url),1000);render();}
  }
  async function copy(){
    if(!exportText)return;const target=view();
    try{await navigator.clipboard.writeText(exportText);if(sameView(target))setNotice('已复制导出 JSON；请保存到安全位置。');}
    catch{if(sameView(target)){const field=section().querySelector('#qg-backup-export-text');field.focus();field.select();setNotice('剪贴板不可用；已选中 JSON，请手动复制并安全保存。');}}
    if(sameView(target))render();
  }
  async function previewDraft(){
    if(locked()||busy.has('preview')||busy.has('file')||!isConnected())return;
    capture();let backup;try{backup=parse(section().querySelector('#qg-backup-json').value);}catch(error){setNotice(error.message);render();return;}
    const submitted={text:draft.text,mode:draft.mode},token=version,target=view();busy.add('preview');setNotice('正在校验并预览；尚未恢复。');render();
    try{
      const value=await post('/api/backups/preview',{backup,mode:submitted.mode});
      if(token!==version||draft.text!==submitted.text||draft.mode!==submitted.mode||!sameView(target))return;
      if(!id(value.planId)||!id(value.restoreId)||!digest(value.planDigest)||typeof value.approvalToken!=='string'||value.approvalToken.length<16||value.approvalToken.length>200||value.mode!==submitted.mode||typeof value.visibility?.requiresAcknowledgement!=='boolean')throw new Error('服务预览不完整，不能确认恢复。');
      preview=structuredClone(value);setNotice('请检查预览、冲突与访问范围；点击确认恢复才会写入。');
    }catch(error){if(token===version&&sameView(target)){preview=null;setNotice(`预览未完成：${error.message}。草稿仍保留。`);}}
    finally{busy.delete('preview');if(sameView(target))render();}
  }
  async function commit(){
    if(!isConnected()||busy.has('commit')||pendingUndo)return;
    const target=view(),recovering=!!pending;
    if(!pending){
      const root=section();if(!preview||!root||(preview.mode==='additive'&&preview.conflicts?.length>0))return;
      if(root.querySelector('#qg-backup-json').value!==draft.text||root.querySelector('#qg-backup-mode').value!==draft.mode){capture();return;}
      const acknowledgeVisibility=root.querySelector('#qg-backup-visibility').checked;
      if(preview.visibility.requiresAcknowledgement&&!acknowledgeVisibility)return;
      pending={restoreId:preview.restoreId,request:{planId:preview.planId,expectedPlanDigest:preview.planDigest,approvalToken:preview.approvalToken,approved:true,acknowledgeVisibility,idempotencyKey:crypto.randomUUID()}};
    }
    // The immutable attempt must survive reload BEFORE any POST is dispatched.
    if(!persist()){render();return;}
    const submitted=structuredClone(pending);busy.add('commit');readVersion++;setNotice('正在确认恢复…');render();
    try{
      const value=await post('/api/backups/commit',submitted.request);
      if(value.restoreId!==submitted.restoreId||!['committed','undone'].includes(value.status))throw new Error('服务返回的恢复回执不匹配');
      pending=null;restoreId=value.restoreId;result=value;invalidatePreview();
      setNotice('已确认恢复。新增卡片会保留；如需撤销覆盖，请立即检查并明确点击撤销。');refreshRestored();
    }catch(error){
      if((!recovering&&safeRejection.has(error.code))||(recovering&&retryRejection.has(error.code))){pending=null;invalidatePreview();setNotice(`恢复未提交：${error.message}。草稿仍保留；请重新校验预览，不会自动重试。`);}
      else setNotice(`恢复结果尚未确认：${error.message}。请查询状态或手动重试原请求；不会生成新请求键或自动重发。`);
    }finally{busy.delete('commit');persist();if(sameView(target))render();}
  }
  async function readStatus(){
    const selected=pending?.restoreId||pendingUndo?.restoreId||restoreId;
    if(!selected||!isConnected()||busy.has('status')||busy.has('commit')||busy.has('undo'))return;
    const token=++readVersion,target=view();busy.add('status');render();
    try{
      const value=await api('/api/backups/restores/'+encodeURIComponent(selected));
      if(token!==readVersion||!sameView(target))return;
      if(value.restoreId!==selected||!['committed','undone'].includes(value.status))throw new Error('服务返回的恢复状态不匹配');
      result=value;restoreId=value.restoreId;pending=null;if(value.status==='undone')pendingUndo=null;invalidatePreview();
      setNotice(value.status==='undone'?'已查询确认撤销覆盖；新增卡片仍保留。':'已查询确认恢复状态；查询没有再次恢复。');refreshRestored();
    }catch(error){if(token===readVersion&&sameView(target))setNotice(`状态暂未确认：${error.message}。原请求与草稿仍保留，请勿据此假定从未提交。`);}
    finally{busy.delete('status');persist();if(sameView(target))render();}
  }
  async function undo(){
    if(!isConnected()||busy.has('undo')||pending)return;
    if(!pendingUndo){if(!result||result.status!=='committed'||result.undo?.available!==true||!Number.isSafeInteger(result.undo.expectedEpoch))return;pendingUndo={restoreId:result.restoreId,request:{expectedEpoch:result.undo.expectedEpoch,approved:true,idempotencyKey:crypto.randomUUID()}};}
    if(!persist()){render();return;}
    const submitted=structuredClone(pendingUndo),target=view(),recovering=!!pendingUndo.attempted;
    pendingUndo.attempted=true;if(!persist()){render();return;}busy.add('undo');readVersion++;setNotice('正在确认立即撤销覆盖；新增卡片不会删除。');render();
    try{
      const value=await post('/api/backups/restores/'+encodeURIComponent(submitted.restoreId)+'/undo',submitted.request);
      if(value.restoreId!==submitted.restoreId||value.status!=='undone')throw new Error('服务返回的撤销回执不匹配');
      pendingUndo=null;result=value;restoreId=value.restoreId;setNotice('已确认撤销覆盖；原值已恢复，新增卡片仍保留。');refreshRestored();
    }catch(error){
      if((!recovering&&['BACKUP_UNDO_CONFLICT','BACKUP_UNDO_UNAVAILABLE','BACKUP_STALE','BACKUP_POLICY_CHANGED','REVISION_LIMIT','INVALID_INPUT'].includes(error.code))||(recovering&&['BACKUP_STALE','BACKUP_POLICY_CHANGED','REVISION_LIMIT'].includes(error.code))){pendingUndo=null;if(result)result={...result,undo:{...result.undo,available:false,reason:error.message}};setNotice(`撤销被保护条件阻止：${error.message}。新增卡片保留；没有强制撤销。`);}
      else setNotice(`撤销结果尚未确认：${error.message}。请查询状态或手动重试相同请求；不会自动重发。`);
    }finally{busy.delete('undo');persist();if(sameView(target))render();}
  }
  const originalSettings=panels.settings.bind(panels);panels.settings=()=>originalSettings().replace('<div class="panel-footer">',markup()+'<div class="panel-footer">');
  const originalOpen=app.openPanel.bind(app);app.openPanel=(...args)=>{invalidatePreview();readVersion++;fileVersion++;busy.delete('file');const value=originalOpen(...args);if(args[0]==='settings')render();return value;};
  const originalAction=app.action.bind(app);app.action=(name,...args)=>{
    if(!name.startsWith('backups-'))return originalAction(name,...args);if(!section())return;
    if(name==='backups-export')return prepareExport();if(name==='backups-download')return download();if(name==='backups-copy')return copy();
    if(name==='backups-preview')return previewDraft();if(name==='backups-commit')return commit();if(name==='backups-status')return readStatus();if(name==='backups-undo')return undo();
    if(name==='backups-clear'&&!locked()){draft={text:'',mode:'additive'};invalidatePreview();setNotice('导入草稿已清除。');const root=section();root.querySelector('#qg-backup-json').value='';root.querySelector('#qg-backup-mode').value='additive';render();}
  };
  document.addEventListener('input',event=>{if(event.target.id==='qg-backup-json')capture();});
  document.addEventListener('change',event=>{if(event.target.id==='qg-backup-file')chooseFile(event.target.files?.[0]);if(event.target.id==='qg-backup-mode')capture();if(event.target.id==='qg-backup-visibility')render();});
  document.addEventListener('toggle',event=>{if(event.target.id==='qg-backups-settings'&&event.target.open)render();},true);
  if(app.modalKind==='settings'&&app.dialog.open&&!document.getElementById('qg-backups-settings'))document.querySelector('#modal .panel-footer')?.insertAdjacentHTML('beforebegin',markup());
  render();return {render};
};
