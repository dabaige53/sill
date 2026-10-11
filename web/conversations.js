/* Standalone, application-owned history. Never a host thread or automatic AI call. */
window.initQuietGlassConversations=({app,store,esc,api,post})=>{
  const storageKey='quiet-glass-conversations-v1';
  let saved={};try{saved=JSON.parse(localStorage.getItem(storageKey)||'{}')||{};}catch{}
  const drafts=saved.drafts&&typeof saved.drafts==='object'&&!Array.isArray(saved.drafts)?saved.drafts:{};
  let activeKey=typeof saved.activeKey==='string'?saved.activeKey:'draft_'+crypto.randomUUID();
  let active=null,epoch=0,loading=false,polling=false,firstOffset=0,messages=new Map(),listOffset=0,listSequence=0,lastPaint=null;
  const inFlight=new Set();
  const draft=key=>drafts[key]&&typeof drafts[key]==='object'?drafts[key]:{question:'',cardIds:[],version:0,createKey:crypto.randomUUID()};
  const persist=()=>{try{localStorage.setItem(storageKey,JSON.stringify({activeKey,drafts}));}catch{app.toast('浏览器无法保留草稿，请在离开前复制问题');}};
  const field=()=>document.getElementById('ai-input');
  function saveDraft(){
    const previous=draft(activeKey);
    const question=field().value,cardIds=app.contexts.slice();
    const changed=question!==previous.question||JSON.stringify(cardIds)!==JSON.stringify(previous.cardIds);
    drafts[activeKey]={...previous,question,cardIds,version:(previous.version||0)+(changed?1:0)};persist();
  }
  function restoreDraft(){
    const value=draft(activeKey);drafts[activeKey]=value;
    field().value=typeof value.question==='string'?value.question:'';
    app.contexts=Array.isArray(value.cardIds)?value.cardIds.filter(id=>typeof id==='string'):[];persist();
  }
  function readingAnchor(){
    const view=document.getElementById('ai-messages'),edge=view.getBoundingClientRect().top;
    const index=[...view.children].findIndex(node=>node.getBoundingClientRect().bottom>edge);
    return index<0?null:{id:app.messages[index]?.id,offset:view.children[index].getBoundingClientRect().top-edge};
  }
  function paint(anchor=null){
    app.messages=[...messages.values()].sort((a,b)=>a.sequence-b.sequence).flatMap(message=>{
      const references=message.role==='user'&&message.cardRefs?.length?'\n引用卡片：'+message.cardRefs.map(ref=>ref.title||ref.id||ref.cardId).join('、'):'';
      const shown=[{id:message.id,kind:message.role==='assistant'?'assistant':'user',text:message.text+references}];
      if(message.role==='user'&&message.status==='pending')shown.push({id:message.id+':pending',kind:'assistant',text:`已保存请求 ${message.requestId}。\n等待 Codex 或已连接的工作者处理；网页不会自动调用模型。`});
      return shown;
    });
    app.aiBusy=inFlight.has(activeKey);
    const signature=JSON.stringify([app.messages,app.contexts,app.aiBusy]);
    if(signature!==lastPaint){const view=document.getElementById('ai-messages'),top=view.scrollTop,atBottom=view.scrollHeight-view.clientHeight-top<32;app.paintAI();if(!atBottom)view.scrollTop=top;lastPaint=signature;}
    document.getElementById('conversation-title').textContent=loading?'正在读取…':active?.title||'新对话草稿';
    document.querySelector('[data-action="conversation-older"]').hidden=firstOffset<=0;
    document.querySelector('[data-action="ai-send"]').disabled=app.aiBusy||loading;
    if(anchor){
      const view=document.getElementById('ai-messages'),index=app.messages.findIndex(message=>message.id===anchor.id),node=view.children[index];
      if(node)view.scrollTop+=node.getBoundingClientRect().top-view.getBoundingClientRect().top-anchor.offset;
    }
  }
  async function readLatest(id,token,viewKey=activeKey){
    let page=await api('/api/conversations/'+encodeURIComponent(id)+'?limit=50&offset=0');
    let offset=Math.max(0,page.total-50);
    if(offset)page=await api('/api/conversations/'+encodeURIComponent(id)+'?limit=50&offset='+offset);
    if(token!==epoch||activeKey!==viewKey)return;
    active=page.conversation;
    if(!messages.size)firstOffset=offset;
    page.messages.forEach(message=>messages.set(message.id,message));
    const answered=new Set([...messages.values()].filter(message=>message.role==='assistant').map(message=>message.requestId));
    for(const message of messages.values())if(message.role==='user'&&answered.has(message.requestId))message.status='answered';
    paint();
  }
  async function select(id,{keepDraft=false}={}){
    if(!keepDraft)saveDraft();
    activeKey=id;const token=++epoch;active=null;messages=new Map();firstOffset=0;restoreDraft();
    const conversationId=draft(id).conversationId||(!id.startsWith('draft_')?id:null);loading=!!conversationId;paint();
    if(!loading)return;
    try{await readLatest(conversationId,token,id);}catch(error){if(token===epoch)app.toast(`对话暂时无法读取；草稿已保留：${error.message}`);}
    finally{if(token===epoch){loading=false;paint();}}
  }
  async function restore(){await select(activeKey,{keepDraft:true});}
  async function list(offset=0){
    const token=epoch,sequence=++listSequence,modalToken=app.modalToken;listOffset=offset;
    try{
      const result=await api('/api/conversations?limit=20&offset='+offset);
      if(token!==epoch||sequence!==listSequence||modalToken!==app.modalToken)return;
      const localDrafts=Object.entries(drafts).filter(([id,value])=>id.startsWith('draft_')&&(value.question||value.attempt||value.cardIds?.length));
      const rows=result.conversations.map(c=>`<button class="text-button" style="max-width:100%;white-space:normal;overflow-wrap:anywhere" data-action="conversation-open" data-id="${esc(c.id)}">${esc(c.title)} · ${c.messageCount} 条${c.pendingCount?' · 待处理 '+c.pendingCount:''}</button>`).join('<br>');
      const unsent=localDrafts.map(([id,value])=>`<button class="text-button" style="max-width:100%;white-space:normal;overflow-wrap:anywhere" data-action="conversation-open" data-id="${esc(id)}">未提交草稿：${esc(String(value.question||(value.attempt?'待确认的请求':'已选'+(value.cardIds?.length||0)+'张卡片')).slice(0,80))}</button>`).join('<br>');
      app.openModal(`<div class="dialog-close"><button class="icon-button" data-action="close" aria-label="关闭对话列表">×</button></div><div class="panel-content"><h1 id="modal-title">Quiet Glass 对话</h1><p class="settings-note">应用自己的历史，不是宿主聊天记录。待处理请求不会自动调用模型。</p>${rows||'<p>还没有已保存的对话</p>'}${unsent?'<h2>本浏览器草稿</h2>'+unsent:''}<div class="panel-footer">${offset?'<button class="text-button" data-action="conversation-prev">上一页</button>':''}${result.nextOffset!==null?`<button class="text-button" data-action="conversation-next" data-id="${result.nextOffset}">下一页</button>`:''}</div></div>`,'conversations');
    }catch(error){if(token===epoch)app.toast('对话列表未读取：'+error.message);}
  }
  async function older(){
    if(!active||firstOffset<=0||loading)return;
    const token=epoch,id=active.id,viewKey=activeKey,offset=Math.max(0,firstOffset-50);let anchor=null;loading=true;paint();
    try{const page=await api('/api/conversations/'+encodeURIComponent(id)+'?limit='+Math.min(50,firstOffset)+'&offset='+offset);
      if(token!==epoch||activeKey!==viewKey)return;
      // Capture what is being read now; the user may scroll while HTTP is pending.
      anchor=readingAnchor();page.messages.forEach(message=>messages.set(message.id,message));firstOffset=offset;
    }catch(error){if(token===epoch)app.toast('更早的消息未读取：'+error.message);}
    finally{if(token===epoch){loading=false;paint(anchor);}}
  }
  const originalOpen=app.openAI.bind(app),originalAttach=app.attach.bind(app),originalAction=app.action.bind(app);
  app.openAI=()=>{originalOpen();paint();};
  app.attach=ids=>{const unique=[...new Set([...app.contexts,...ids.filter(id=>store.card(id))])];if(unique.length>20)app.toast('每个问题最多引用20张卡片，请分批讨论');originalAttach(unique.slice(0,20));saveDraft();};
  app.action=(name,id='',...rest)=>{
    if(name==='conversation-list'){saveDraft();return list();}
    if(name==='conversation-next')return list(Number(id));
    if(name==='conversation-prev')return list(Math.max(0,listOffset-20));
    if(name==='conversation-open'){app.closeModal();const result=select(id);app.openAI();return result;}
    if(name==='conversation-new'||name==='ai-clear'){const result=select('draft_'+crypto.randomUUID());app.openAI();return result;}
    if(name==='conversation-older')return older();
    const result=originalAction(name,id,...rest);if(name==='ai-remove')saveDraft();return result;
  };
  app.sendAI=async()=>{
    if(loading||inFlight.has(activeKey))return;
    saveDraft();let key=activeKey,value=draft(key),token=epoch;
    if(!value.question.trim()&&!value.attempt)return;
    if(!value.attempt&&(value.question.trim().length>4000||value.cardIds.length>20)){app.toast('问题最多4000字符、20张引用；草稿完整保留，请缩短后再提交');return;}
    inFlight.add(key);paint();
    try{
      if(!value.attempt){value={...value,attempt:{question:value.question.trim(),cardIds:value.cardIds.slice(),idempotencyKey:crypto.randomUUID(),draftVersion:value.version}};drafts[key]=value;persist();}
      if(key.startsWith('draft_')&&!value.conversationId){
        if(!value.createAttempt){value={...value,createAttempt:{title:(value.question.trim()||'新对话').slice(0,200),idempotencyKey:value.createKey}};drafts[key]=value;persist();}
        const created=await post('/api/conversations',value.createAttempt);
        const newer=drafts[key]||value;
        if(drafts[created.id]){
          // History can expose the committed ID before its create response arrives.
          // Keep both drafts rather than overwrite a destination edited in the meantime.
          drafts[key]={...newer,conversationId:created.id};
          if(activeKey===key)active=created;
        }else{
          drafts[created.id]={...newer,conversationId:created.id};delete drafts[key];
          inFlight.delete(key);inFlight.add(created.id);
          if(activeKey===key){activeKey=created.id;active=created;}
          key=created.id;
        }
        persist();value=draft(key);
      }
      const attempt=value.attempt;
      const request=await post('/api/requests',{conversationId:value.conversationId||key,question:attempt.question,cardIds:attempt.cardIds,idempotencyKey:attempt.idempotencyKey});
      const latest=draft(key);
      if(latest.attempt?.idempotencyKey===attempt.idempotencyKey){
        const unchanged=latest.version===attempt.draftVersion;
        drafts[key]={...latest,attempt:null,...(unchanged?{question:''}:{})};persist();
        if(activeKey===key&&unchanged)field().value='';
      }
      if(activeKey===key){await readLatest(value.conversationId||key,epoch,key);app.toast('请求已保存；等待工作者处理');}
    }catch(error){
      if(['INVALID_INPUT','CARD_NOT_FOUND'].includes(error.code)&&drafts[key]?.attempt){drafts[key]={...drafts[key],attempt:null};persist();}
      if(activeKey===key&&token===epoch)app.toast('请求未确认；草稿已保留，重试不会重复创建：'+error.message);
    }finally{inFlight.delete(key);if(activeKey===key)paint();}
  };
  document.querySelector('.ai-header').insertAdjacentHTML('afterend','<div class="conversation-toolbar" style="display:flex;gap:12px;align-items:center;padding:10px 22px;border-top:1px solid rgba(0,0,0,.06)"><span id="conversation-title" style="min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">新对话草稿</span><button class="text-button" data-action="conversation-list">历史</button><button class="text-button" data-action="conversation-new">新对话</button></div><button class="text-button" data-action="conversation-older" hidden>加载更早消息</button>');
  document.querySelector('[data-action="ai-clear"]').setAttribute('aria-label','开始新的应用对话（历史保留）');
  document.querySelector('.ai-header small').textContent='应用历史 · 待处理队列，不自动调用模型';
  document.addEventListener('input',event=>{if(event.target.id==='ai-input')saveDraft();});
  window.addEventListener('pagehide',saveDraft);
  const refresh=async()=>{if(polling||loading||!active||document.hidden)return;polling=true;const token=epoch;try{await readLatest(active.id,token);}catch{}finally{polling=false;}};
  window.addEventListener('focus',refresh);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  restoreDraft();paint();
  return {restore,refresh};
};
