/* Browser adapter for local content. All durable rules live in the shared service. */
window.initSillContent=({app,store,panels,esc,api,post,onSaved,onMutation,isConnected})=>{
  const snapshots=new Map(),draftKey='sill-content-drafts-v1',legacyKey='sill-legacy-annotations-v1';
  const read=key=>{try{const value=JSON.parse(localStorage.getItem(key)||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}};
  const drafts=read(draftKey),legacy=read(legacyKey);
  const persist=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{app.toast('当前浏览器不能保留草稿，请在离开前复制内容。');}};
  let editor=null,noteEditor=null,openSequence=0;
  const tagsInput=values=>values.join('，');
  const draftId=id=>'annotation:'+id;
  function captureLegacy(id) {
    if(Object.hasOwn(legacy,id))return;
    const item=store.item(id);
    legacy[id]={note:item.note||'',tags:Array.isArray(item.tags)?item.tags:[],tagsEdited:!!item.tagsEdited};
    persist(legacyKey,legacy);
  }
  function consumeAnnotation(snapshot) {
    if((snapshots.get(snapshot.cardId)?.revision||0)>snapshot.revision)return;
    captureLegacy(snapshot.cardId);snapshots.set(snapshot.cardId,snapshot);
    Object.assign(store.item(snapshot.cardId),{note:snapshot.values.note,tags:snapshot.values.tags.slice(),tagsEdited:false});
  }
  function consumeCard(card){if(card.annotation)consumeAnnotation(card.annotation);}
  function saveAnnotationDraft() {
    if(!editor||app.modalKind!=='editor'||!document.getElementById('note-editor'))return;
    const value={note:document.getElementById('note-editor').value,tags:[...app.editTags],expectedRevision:editor.revisions.get(editor.id)};
    drafts[draftId(editor.id)]=value;persist(draftKey,drafts);
  }
  const chip=(tag,active)=>`<button type="button" class="tag-chip ${active?'active':''}" data-action="editor-tag" data-extra="${esc(tag)}" aria-pressed="${active}">${esc(tag)}</button>`;
  panels.editor=(controller,id)=>{
    const card=store.card(id),snapshot=snapshots.get(id),draft=drafts[draftId(id)],values=draft||snapshot.values;
    controller.editTags=new Set(values.tags);
    if(draft)editor.revisions.set(id,draft.expectedRevision);
    const options=[...new Set([...values.tags,'工作','阅读','想法','设计','AI','生活'])];
    const prior=legacy[id],hasLegacy=prior&&(prior.note||prior.tags.length);
    return `<div class="dialog-close"><button class="icon-button" data-action="close" aria-label="关闭标签与备注">×</button></div><div class="panel-content"><h1 id="modal-title">留下一点线索</h1><p class="settings-note">${esc(card.title)}<br>备注与个人标签保存在 Sill，不会修改来源正文或来源标签。</p>${card.tags.length?`<p class="settings-note">来源标签：${card.tags.map(esc).join('、')}</p>`:''}<span class="field-label">个人标签</span><div class="chips" id="editor-tags">${options.map(tag=>chip(tag,controller.editTags.has(tag))).join('')}</div><div class="tag-add"><input id="tag-new" aria-label="新的标签" placeholder="添加个人标签" maxlength="30"><button type="button" class="icon-button" data-action="add-tag" aria-label="添加个人标签">+</button></div><label class="field-label" for="note-editor">备注</label><textarea class="editor-note" id="note-editor" maxlength="4000">${esc(values.note)}</textarea>${hasLegacy?'<p class="settings-note">检测到旧版浏览器备注，尚未上传。<button type="button" class="text-button" data-action="annotation-import">将旧备注载入草稿</button></p>':''}<div id="content-conflict" role="status"></div><div class="panel-footer"><p>${draft?'已恢复未提交草稿':'仅保存到本地服务'}</p><button type="button" class="solid-button" data-action="save-note" data-id="${esc(id)}">保存</button></div></div>`;
  };
  const originalOpenPanel=app.openPanel.bind(app);
  app.openPanel=async(kind,id='')=>{
    const sequence=++openSequence;
    if(kind!=='editor')return originalOpenPanel(kind,id);
    if(!isConnected()){app.toast('请先连接服务');return;}
    const token=app.modalToken,route=location.hash,ids=(app.bulkEditIds||[id]).slice();
    try {
      const values=await Promise.all(ids.map(cardId=>api(`/api/cards/${encodeURIComponent(cardId)}/annotation`)));
      if(sequence!==openSequence||token!==app.modalToken||route!==location.hash)return;
      values.forEach(consumeAnnotation);
      editor={id,ids,revisions:new Map(values.map(value=>[value.cardId,value.revision])),busy:false,conflicts:new Map()};
      originalOpenPanel(kind,id);
    }catch(error){app.toast(`备注暂未打开：${error.message}`);}
  };
  function annotationConflict(current,count) {
    editor.conflicts.set(current.cardId,current);
    document.getElementById('content-conflict').innerHTML=`<p class="settings-note">${count?`已保存 ${count} 张卡片。`:''}另一处已修改备注；你的草稿仍保留。最新备注：${esc(current.values.note||'（空）')}；个人标签：${current.values.tags.map(esc).join('、')||'（无）'}</p><button class="text-button" data-action="annotation-latest">载入最新版本</button><button class="text-button" data-action="annotation-retry">确认保留当前草稿并重试</button>`;
  }
  async function saveAnnotation() {
    if(!editor||editor.busy)return;
    saveAnnotationDraft();const active=editor,token=app.modalToken,key=draftId(editor.id),submittedDraft=drafts[draftId(editor.id)];
    const note=document.getElementById('note-editor').value,tags=[...app.editTags];
    active.busy=true;let count=0;
    try {
      for(const [index,id] of active.ids.entries()) {
        const value=await api(`/api/cards/${encodeURIComponent(id)}/annotation`,{method:'PATCH',body:JSON.stringify({set:{tags,...(index===0?{note}:{})},expectedRevision:active.revisions.get(id)})});
        active.revisions.set(id,value.revision);
        if(editor?.ids.includes(id))editor.revisions.set(id,value.revision);
        if(index===0&&drafts[key])drafts[key].expectedRevision=value.revision;
        onMutation();consumeAnnotation(value);count++;
      }
      const newerDraft=drafts[key]!==submittedDraft;
      store.save();if(!newerDraft)delete drafts[key];persist(draftKey,drafts);
      active.ids.forEach(id=>app.refreshCard(id));
      if(!newerDraft&&editor===active&&app.modalToken===token){app.bulkEditIds=null;app.closeModal();}
      app.toast(newerDraft?'提交时的备注已保存；之后的编辑仍在草稿中，请再次保存。':'备注与个人标签已保存到 Sill');
    }catch(error){
      if(editor===active&&app.modalToken===token&&error.code==='ANNOTATION_CONFLICT'&&error.current)annotationConflict(error.current,count);
      app.toast(error.code==='ANNOTATION_CONFLICT'?'备注有更新；草稿已保留，请选择如何继续。':`未全部保存${count?`（已保存 ${count} 张）`:''}：${error.message}`);
    }finally{active.busy=false;}
  }
  function saveNoteDraft() {
    if(!noteEditor||app.modalKind!=='local-note')return;
    const title=document.getElementById('local-note-title'),content=document.getElementById('local-note-content'),tags=document.getElementById('local-note-tags');
    if(!title||!content||!tags)return;
    Object.assign(noteEditor,{title:title.value,content:content.value,tagsText:tags.value});
    drafts[noteEditor.draftKey]={...noteEditor,busy:false,current:null};persist(draftKey,drafts);
  }
  async function openNote(id=null) {
    if(!isConnected()){app.toast('请先连接服务');return;}
    const sequence=++openSequence,token=app.modalToken,route=location.hash;
    try {
      const card=id?await api('/api/cards/'+encodeURIComponent(id)):null;
      if(sequence!==openSequence||token!==app.modalToken||route!==location.hash)return;
      if(card&&!card.local){app.toast('来源正文不可直接修改，可添加独立备注');return;}
      const key='note:'+(id||'new'),draft=drafts[key];
      noteEditor={title:card?.title||'',content:card?.content||'',tagsText:tagsInput(card?.tags||[]),expectedRevision:card?.revision,idempotencyKey:crypto.randomUUID(),...draft,id,draftKey:key,busy:false,current:null};
      app.openModal(`<div class="dialog-close"><button class="icon-button" data-action="close" aria-label="关闭本地笔记">×</button></div><div class="panel-content"><h1 id="modal-title">${id?'编辑本地笔记':'新建本地笔记'}</h1><p class="settings-note">只保存在 Sill，不会写入 Notion、日历或其他来源。${draft?'已恢复未提交草稿。':''}</p><label class="field-label" for="local-note-title">标题</label><div class="tag-add"><input id="local-note-title" maxlength="500" value="${esc(noteEditor.title)}"></div><label class="field-label" for="local-note-content">正文</label><textarea class="editor-note" id="local-note-content" maxlength="50000">${esc(noteEditor.content)}</textarea><label class="field-label" for="local-note-tags">标签（用逗号分隔）</label><div class="tag-add"><input id="local-note-tags" value="${esc(noteEditor.tagsText)}"></div><div id="content-conflict" role="status"></div><div class="panel-footer"><p>草稿保留在本浏览器</p><button type="button" class="solid-button" data-action="local-note-save">保存笔记</button></div></div>`,'local-note');
      saveNoteDraft();
    }catch(error){app.toast(error.message);}
  }
  async function saveNote() {
    if(!noteEditor||noteEditor.busy)return;
    saveNoteDraft();const active=noteEditor,token=app.modalToken,oldKey=noteEditor.draftKey;
    const values={title:active.title,content:active.content,tags:active.tagsText.split(/[,，]/).map(value=>value.trim()).filter(Boolean)};
    if(!active.id&&!active.attempt){active.attempt={values,idempotencyKey:active.idempotencyKey};saveNoteDraft();}
    const submittedDraft=drafts[oldKey];
    active.busy=true;
    try {
      const card=active.id?await api('/api/notes/'+encodeURIComponent(active.id),{method:'PATCH',body:JSON.stringify({set:values,expectedRevision:active.expectedRevision})}):await post('/api/notes',{...active.attempt.values,idempotencyKey:active.attempt.idempotencyKey});
      const newerDraft=drafts[oldKey]!==submittedDraft||(!active.id&&JSON.stringify(values)!==JSON.stringify(active.attempt.values));
      const newKey='note:'+card.id,latest=drafts[oldKey];
      if(newerDraft&&latest)drafts[newKey]={...latest,id:card.id,draftKey:newKey,expectedRevision:card.revision,attempt:null,busy:false,current:null};
      if(oldKey!==newKey||!newerDraft)delete drafts[oldKey];
      if(noteEditor?.draftKey===oldKey){
        Object.assign(noteEditor,{id:card.id,draftKey:newKey,expectedRevision:card.revision,attempt:null});
        if(app.modalKind==='local-note')document.getElementById('modal-title').textContent='编辑本地笔记';
      }
      persist(draftKey,drafts);onSaved(card);
      if(!newerDraft&&noteEditor===active&&app.modalToken===token)app.closeModal();
      app.toast(newerDraft?'已确认保存的笔记；之后的编辑仍在草稿中，请再次保存。':'本地笔记已保存');
    }catch(error){
      if(!active.id&&error.code==='INVALID_INPUT'){
        active.attempt=null;
        if(drafts[oldKey]?.idempotencyKey===active.idempotencyKey)drafts[oldKey].attempt=null;
        if(noteEditor?.idempotencyKey===active.idempotencyKey)noteEditor.attempt=null;
        persist(draftKey,drafts);
      }
      if(noteEditor===active&&app.modalToken===token&&error.code==='NOTE_CONFLICT'&&error.current){
        active.current=error.current;
        document.getElementById('content-conflict').innerHTML=`<p class="settings-note">笔记已在另一处修改；你的草稿仍保留。最新标题：${esc(error.current.title)}<br>最新正文：${esc(error.current.content)}<br>最新标签：${error.current.tags.map(esc).join('、')}</p><button class="text-button" data-action="local-note-latest">载入最新版本</button><button class="text-button" data-action="local-note-retry">确认保留当前草稿并重试</button>`;
      }
      app.toast(error.code==='NOTE_CONFLICT'?'笔记有更新；草稿已保留，请选择如何继续。':`笔记未保存：${error.message}`);
    }finally{active.busy=false;}
  }
  const originalAction=app.action.bind(app);
  app.action=(name,id='',...rest)=>{
    if(name==='local-note-new')return openNote();
    if(name==='local-note-edit')return openNote(id);
    if(name==='local-note-save')return saveNote();
    if(name==='save-note')return saveAnnotation();
    if(name==='annotation-import'&&editor){const prior=legacy[editor.id];if(prior){document.getElementById('note-editor').value=prior.note;app.editTags=new Set(prior.tags);document.getElementById('editor-tags').innerHTML=prior.tags.map(tag=>chip(tag,true)).join('');saveAnnotationDraft();app.toast('旧备注已载入草稿，点击保存才会写入服务');}return;}
    if(name==='annotation-retry'&&editor){editor.conflicts.forEach(current=>editor.revisions.set(current.cardId,current.revision));editor.conflicts.clear();return saveAnnotation();}
    if(name==='annotation-latest'&&editor){delete drafts[draftId(editor.id)];persist(draftKey,drafts);return app.openPanel('editor',editor.id);}
    if(name==='local-note-retry'&&noteEditor?.current){noteEditor.expectedRevision=noteEditor.current.revision;noteEditor.current=null;return saveNote();}
    if(name==='local-note-latest'&&noteEditor){delete drafts[noteEditor.draftKey];persist(draftKey,drafts);return openNote(noteEditor.id);}
    const result=originalAction(name,id,...rest);
    if(['editor-tag','add-tag'].includes(name))saveAnnotationDraft();
    return result;
  };
  document.addEventListener('input',event=>{
    if(['note-editor','tag-new'].includes(event.target.id))saveAnnotationDraft();
    if(event.target.id.startsWith('local-note-'))saveNoteDraft();
  });
  const originalSettings=panels.settings.bind(panels);
  panels.settings=()=>originalSettings().replace('<div class="panel-footer">','<div class="panel-footer"><button class="text-button" data-action="local-note-new">新建本地笔记</button>');
  function afterPreview(card) {
    if(card.local)document.querySelector('#modal .dialog-tools .tools-cluster')?.insertAdjacentHTML('beforeend',`<button type="button" class="text-button" data-action="local-note-edit" data-id="${esc(card.id)}">编辑本地笔记</button>`);
  }
  return {consumeCard,afterPreview};
};
