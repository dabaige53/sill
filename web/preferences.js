/* Owner recommendation preferences. Browser storage contains drafts, never an automatic write. */
window.initQuietGlassPreferences=({app,store,panels,esc,post,writeSettings,isConnected,getSources})=>{
  const key='quiet-glass-recommendation-draft-v1:'+(window.__QG_HOST__?'host':'web');
  const defaults=()=>({interests:[],sourcePriorities:{},excludedSourceIds:[],includeRead:false});
  const effective=snapshot=>snapshot?.values.recommendation||defaults();
  const same=(a,b)=>JSON.stringify([a.interests,Object.entries(a.sourcePriorities).sort(),a.excludedSourceIds,a.includeRead])===JSON.stringify([b.interests,Object.entries(b.sourcePriorities).sort(),b.excludedSourceIds,b.includeRead]);
  const raw=values=>({interests:values.interests.join('\n'),priorities:Object.entries(values.sourcePriorities).map(([id,weight])=>`${id}=${weight}`).join('\n'),excluded:values.excludedSourceIds.join('\n'),includeRead:values.includeRead});
  const validRaw=value=>value&&typeof value.interests==='string'&&value.interests.length<=2400&&typeof value.priorities==='string'&&value.priorities.length<=2000&&typeof value.excluded==='string'&&value.excluded.length<=6500&&typeof value.includeRead==='boolean';
  const validBase=value=>value&&Array.isArray(value.interests)&&value.interests.length<=20&&value.interests.every(x=>typeof x==='string'&&x.length<=100)&&value.sourcePriorities&&typeof value.sourcePriorities==='object'&&!Array.isArray(value.sourcePriorities)&&Object.keys(value.sourcePriorities).length<=20&&Object.entries(value.sourcePriorities).every(([id,n])=>/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)&&Number.isInteger(n)&&n>=-30&&n<=30)&&Array.isArray(value.excludedSourceIds)&&value.excludedSourceIds.length<=100&&value.excludedSourceIds.every(x=>typeof x==='string'&&/^[a-z0-9][a-z0-9_-]{0,63}$/.test(x))&&typeof value.includeRead==='boolean';
  let saved=null,draft=null,undo=null,busy=false,previewBusy=false,version=0,previewVersion=0,notice='',storageFailed=false;
  try {
    const cached=JSON.parse(localStorage.getItem(key)||'null');
    if(validRaw(cached?.draft?.raw)&&validBase(cached.draft.base)&&Number.isSafeInteger(cached.draft.expectedRevision)&&cached.draft.expectedRevision>=0)draft=cached.draft;
    if(validRaw(cached?.undo))undo=cached.undo;
  }catch{/* Invalid local data is ignored, never uploaded. */}
  function persist(){
    try{if(draft||undo)localStorage.setItem(key,JSON.stringify({draft,undo}));else localStorage.removeItem(key);}
    catch{if(!storageFailed)app.toast('浏览器无法保留推荐草稿；离开前请复制内容。');storageFailed=true;}
  }
  const conflict=()=>!!(draft&&saved&&!same(draft.base,effective(saved)));
  const currentRaw=()=>draft?.raw||raw(effective(saved));
  function summary(values){
    return `关注词：${values.interests.join('、')||'无'}；来源权重：${Object.entries(values.sourcePriorities).map(([id,n])=>`${id} ${n>0?'+':''}${n}`).join('、')||'默认'}；排除来源 ID：${values.excludedSourceIds.join('、')||'无'}；已读：${values.includeRead?'包含':'不包含'}`;
  }
  function sourceText(){
    const sources=new Map((getSources()||[]).map(c=>[c.id,c.label]));
    store.state.cards.forEach(c=>{if(c.sourceId&&!sources.has(c.sourceId))sources.set(c.sourceId,c.source||c.sourceId);});
    return [...sources].map(([id,label])=>label===id?id:`${label}（${id}）`).join('、')||'暂无已采集来源；可输入稳定来源 ID';
  }
  function statusText(){
    if(!saved)return '连接并读取服务设置后可保存；浏览器中的草稿不会自动上传。';
    if(conflict())return '另一处已修改推荐偏好。你的草稿仍保留；请比较最新保存值后选择如何继续。';
    if(busy)return '正在保存提交时的版本；可以继续编辑，后续修改会保留为草稿。';
    return notice||(draft?'本浏览器有未提交草稿；点击保存才写入服务。':'当前显示服务已保存值。');
  }
  function markup(){
    const value=currentRaw();
    return `<details id="qg-recommendation-settings" style="margin:18px 0;overflow-wrap:anywhere"><summary style="cursor:pointer">推荐偏好</summary><p class="settings-note">只影响服务推荐与下方预览；不会改变当前信息流排序。草稿仅在本浏览器保留，保存后独立网页与宿主视图共用。</p><p class="settings-note" id="qg-recommendation-saved"></p><p class="settings-note" id="qg-recommendation-sources"></p><label class="field-label" for="qg-recommendation-interests">关注词（每行一个，最多 20 个）</label><textarea class="editor-note" id="qg-recommendation-interests" data-preference-field="interests" maxlength="2400" rows="3" style="min-height:76px;height:76px" placeholder="设计\n阅读">${esc(value.interests)}</textarea><label class="field-label" for="qg-recommendation-priorities">来源权重（来源 ID=整数，−30 到 30，最多 20 个）</label><textarea class="editor-note" id="qg-recommendation-priorities" data-preference-field="priorities" maxlength="2000" rows="2" style="min-height:64px;height:64px" placeholder="local-notes=10">${esc(value.priorities)}</textarea><label class="field-label" for="qg-recommendation-excluded">排除来源 ID（每行一个，最多 100 个）</label><textarea class="editor-note" id="qg-recommendation-excluded" data-preference-field="excluded" maxlength="6500" rows="2" style="min-height:64px;height:64px">${esc(value.excluded)}</textarea><label class="settings-note" style="display:flex;align-items:center;gap:10px;margin:14px 0"><input type="checkbox" id="qg-recommendation-read" data-preference-field="includeRead" ${value.includeRead?'checked':''}>包含已读卡片</label><p class="settings-note" id="qg-recommendation-status" role="status" aria-live="polite"></p><div style="display:flex;flex-wrap:wrap;gap:8px"><button type="button" class="solid-button" data-action="recommendation-save">保存推荐偏好</button><button type="button" class="text-button" data-action="recommendation-preview">预览当前草稿</button><button type="button" class="text-button" data-action="recommendation-reset">恢复默认到草稿</button><button type="button" class="text-button" data-action="recommendation-undo">撤销恢复默认</button><button type="button" class="text-button" data-action="recommendation-latest">载入最新保存值</button><button type="button" class="text-button" data-action="recommendation-retry">确认保留草稿并保存</button></div><div id="qg-recommendation-preview" role="status" aria-live="polite"></div></details>`;
  }
  function refresh({fields=false}={}){
    let section=document.getElementById('qg-recommendation-settings');
    if(!section&&app.modalKind==='settings'){
      document.querySelector('#modal .panel-footer')?.insertAdjacentHTML('beforebegin',markup());section=document.getElementById('qg-recommendation-settings');
    }
    if(!section)return;
    if(fields){const value=currentRaw();for(const input of section.querySelectorAll('[data-preference-field]')){const name=input.dataset.preferenceField;if(name==='includeRead')input.checked=value[name];else input.value=value[name];}}
    document.getElementById('qg-recommendation-saved').textContent=saved?`服务已保存 · 版本 ${saved.revision}：${summary(effective(saved))}`:'服务保存值尚未读取。';
    document.getElementById('qg-recommendation-sources').textContent='可用来源及 ID：'+sourceText();
    document.getElementById('qg-recommendation-status').textContent=statusText()+(storageFailed?' 浏览器草稿存储不可用，请复制后再离开。':'');
    section.querySelector('[data-action="recommendation-save"]').disabled=busy||!saved||!isConnected()||conflict();
    section.querySelector('[data-action="recommendation-preview"]').disabled=previewBusy||!saved||!isConnected();
    section.querySelector('[data-action="recommendation-undo"]').hidden=!undo;
    section.querySelector('[data-action="recommendation-retry"]').hidden=!conflict();
    section.querySelector('[data-action="recommendation-retry"]').disabled=busy||!isConnected();
    section.querySelector('[data-action="recommendation-latest"]').hidden=!conflict();
  }
  function invalidatePreview(){
    previewVersion++;
    const target=document.getElementById('qg-recommendation-preview');if(target)target.textContent='';
  }
  function consume(snapshot){
    if(saved&&snapshot.revision<saved.revision)return;
    // A clean editor follows service values. Its old preview must not remain
    // labelled as a preview of newly displayed preferences, even if still in flight.
    if(!draft&&!same(effective(saved),effective(snapshot)))invalidatePreview();
    saved=snapshot;
    if(draft&&same(draft.base,effective(saved))){draft.expectedRevision=saved.revision;persist();}
    refresh({fields:!draft});
  }
  function stage(value){
    draft={raw:{...value},base:draft?.base||structuredClone(effective(saved)),expectedRevision:draft?.expectedRevision??saved?.revision??0};
    version++;invalidatePreview();notice='';persist();
    refresh();
  }
  function capture(){
    const section=document.getElementById('qg-recommendation-settings');if(!section)return;
    const value={};section.querySelectorAll('[data-preference-field]').forEach(input=>{value[input.dataset.preferenceField]=input.type==='checkbox'?input.checked:input.value;});
    stage(value);
  }
  function parse(value){
    const lines=text=>text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean),interests=lines(value.interests),excludedSourceIds=lines(value.excluded),sourcePriorities=Object.create(null);
    if(interests.length>20||interests.some(x=>x.length>100)||new Set(interests.map(x=>x.toLocaleLowerCase())).size!==interests.length)throw new Error('关注词最多 20 个，每个最多 100 字，不能重复。');
    const priorities=lines(value.priorities);if(priorities.length>20)throw new Error('来源权重最多 20 个。');
    for(const line of priorities){const match=line.match(/^([a-z0-9][a-z0-9_-]{0,63})\s*=\s*([+-]?\d+)$/);if(!match||!Number.isSafeInteger(Number(match[2]))||Number(match[2]) < -30||Number(match[2])>30)throw new Error('来源权重格式应为 source-id=10，整数范围 −30 到 30。');if(Object.hasOwn(sourcePriorities,match[1]))throw new Error('同一来源 ID 只能设置一次权重。');sourcePriorities[match[1]]=Number(match[2]);}
    if(excludedSourceIds.length>100||new Set(excludedSourceIds).size!==excludedSourceIds.length||excludedSourceIds.some(id=>!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)))throw new Error('排除来源最多 100 个，ID 不可重复；仅使用小写字母、数字、连字符和下划线，最多 64 字。');
    return {interests,sourcePriorities,excludedSourceIds,includeRead:value.includeRead};
  }
  async function save(retry=false){
    if(busy)return;
    if(!saved||!isConnected()){notice='服务尚未连接，草稿已保留。';refresh();return;}
    if(!draft)stage(currentRaw());
    if(conflict()&&!retry){refresh();return;}
    let values;try{values=parse(draft.raw);}catch(error){notice=error.message;refresh();return;}
    if(retry){draft.base=structuredClone(effective(saved));draft.expectedRevision=saved.revision;persist();}
    const submitted=version,base=structuredClone(draft.base),expectedRevision=draft.expectedRevision;
    busy=true;notice='';refresh();
    try {
      const snapshot=await writeSettings({recommendation:values},{expectedRevision,baseRecommendation:base});
      if(!saved||snapshot.revision>=saved.revision)saved=snapshot;
      if(version===submitted)draft=null;
      else if(draft&&snapshot.revision>=draft.expectedRevision){draft.base=structuredClone(effective(snapshot));draft.expectedRevision=snapshot.revision;}
      notice=draft?'提交时的偏好已保存；之后的修改仍在草稿中。':'推荐偏好已保存。';persist();
    }catch(error){
      if(error.current)consume(error.current);
      notice=error.code==='SETTINGS_CONFLICT'?'设置有更新；草稿仍保留，请检查最新保存值后重试。':`未保存：${error.message}。草稿仍保留，连接恢复后请手动保存。`;
    }finally{busy=false;refresh({fields:!draft});}
  }
  async function preview(){
    if(previewBusy||!saved||!isConnected())return;
    let values;try{values=parse(currentRaw());}catch(error){notice=error.message;refresh();return;}
    const token=++previewVersion,modal=app.modalToken;previewBusy=true;refresh();
    document.getElementById('qg-recommendation-preview').textContent='正在按当前草稿预览…';
    try {
      const result=await post('/api/recommend',{...values,limit:3});
      const target=document.getElementById('qg-recommendation-preview');
      if(token!==previewVersion||modal!==app.modalToken||!target)return;
      target.innerHTML=`<p class="settings-note">当前草稿预览 · 未保存偏好。${esc(result.method||'')}</p>`+(result.items?.length?result.items.map(item=>`<p class="settings-note"><strong>${esc(item.card?.title||item.evidence?.cardId||'卡片')}</strong><br>来源 ID：${esc(item.evidence?.sourceId||item.card?.sourceId||'未知')} · 分值：${esc(item.score)}<br>${(item.reasons||[]).map(esc).join('；')||'默认排序'}</p>`).join(''):'<p class="settings-note">当前偏好下暂无推荐卡片。</p>');
    }catch(error){const target=document.getElementById('qg-recommendation-preview');if(token===previewVersion&&modal===app.modalToken&&target)target.textContent=`预览暂不可用：${error.message}。草稿仍保留。`;}
    finally{previewBusy=false;refresh();}
  }
  const originalSettings=panels.settings.bind(panels);
  panels.settings=()=>originalSettings().replace('<div class="panel-footer">',markup()+'<div class="panel-footer">');
  const originalOpen=app.openPanel.bind(app);
  app.openPanel=(...args)=>{const result=originalOpen(...args);if(args[0]==='settings')refresh();return result;};
  const originalAction=app.action.bind(app);
  app.action=(name,...args)=>{
    if(name==='recommendation-save')return save();
    if(name==='recommendation-retry')return save(true);
    if(name==='recommendation-preview')return preview();
    if(name==='recommendation-reset'){undo={...currentRaw()};stage(raw(defaults()));notice='默认值已载入草稿；保存后生效，可撤销恢复默认。';refresh({fields:true});return;}
    if(name==='recommendation-undo'&&undo){const prior=undo;undo=null;stage(prior);notice='已恢复之前的内容到草稿；点击保存才生效。';refresh({fields:true});return;}
    if(name==='recommendation-latest'&&saved){draft=null;version++;invalidatePreview();notice='已载入最新保存值。';persist();refresh({fields:true});return;}
    return originalAction(name,...args);
  };
  document.addEventListener('input',event=>{if(event.target.matches?.('[data-preference-field]'))capture();});
  document.addEventListener('change',event=>{if(event.target.matches?.('[data-preference-field="includeRead"]'))capture();});
  document.addEventListener('toggle',event=>{if(event.target.id==='qg-recommendation-settings'&&event.target.open)refresh();},true);
  refresh();
  return {consume};
};
