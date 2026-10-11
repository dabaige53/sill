/* Same-origin live adapter. No provider credentials or model keys enter browser storage. */
(() => {
  if(!window.__QG_RUNTIME__ || !window.__quietGlass)return;
  const {app,store,panels,esc}=window.__quietGlass;
  let status=null,requestTimer=null;
  const pendingUpdates=new Map();
  const api=async(path,options={})=>{
    const response=await fetch(path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers}});
    const result=await response.json();
    if(!response.ok)throw Object.assign(new Error(result.message||result.error||'连接未完成'),{code:result.code,current:result.current});
    return result;
  };
  const post=(path,data)=>api(path,{method:'POST',body:JSON.stringify(data)});
  let settingsSnapshot=null,settingsQueue=Promise.resolve(),settingsWrites=0,settingsRead=null,settingsEpoch=0;
  function applySettings(snapshot) {
    // A response started before a later write must never roll preferences back.
    if(settingsSnapshot&&snapshot.revision<=settingsSnapshot.revision)return;
    const sortChanged=app.sort!==snapshot.values.sort;
    settingsSnapshot=snapshot;
    Object.assign(store.state.preferences,snapshot.values);
    app.sort=snapshot.values.sort;app.feedNow=Date.now();store.save();
    document.body.classList.toggle('opaque',snapshot.values.reduceTransparency);
    document.querySelectorAll('[data-action="toggle-transparency"]').forEach(node=>node.setAttribute('aria-checked',snapshot.values.reduceTransparency));
    if(sortChanged){
      if(app.modalKind==='filter'&&app.dialog.open)app.repaintFilter();
      else if(app.mode==='feed')app.withFeedAnchor(()=>{});
    }
  }
  async function readSettings() {
    if(settingsRead)return settingsRead;
    settingsRead=api('/api/settings').then(snapshot=>{if(!settingsWrites)applySettings(snapshot);}).finally(()=>{settingsRead=null;});
    return settingsRead;
  }
  const loadInitialSettings=()=>readSettings().catch(()=>app.toast('设置暂时无法读取；内容仍可浏览，连接恢复后会同步。'));
  const originalAction=app.action.bind(app);
  app.action=(name,id='',extra='',...rest)=>{
    if(!['sort-feed','toggle-transparency'].includes(name))return originalAction(name,id,extra,...rest);
    if(!status||!settingsSnapshot){app.openPanel('settings');app.toast('连接后才能保存服务设置');return;}
    if(name==='sort-feed'&&!['priority','unread','time'].includes(extra))return;
    settingsWrites++;
    const epoch=settingsEpoch;
    settingsQueue=settingsQueue.then(async()=>{
      if(epoch!==settingsEpoch){settingsWrites--;return;}
      const set=name==='sort-feed'?{sort:extra}:{reduceTransparency:!settingsSnapshot.values.reduceTransparency};
      try{
        const updated=await api('/api/settings',{method:'PATCH',body:JSON.stringify({set,expectedRevision:settingsSnapshot.revision})});
        applySettings(updated);
      }catch(error){
        if(error.code==='SETTINGS_CONFLICT'&&error.current){settingsEpoch++;applySettings(error.current);}
        app.toast(error.code==='SETTINGS_CONFLICT'?'设置已在另一处更新，已显示最新值；如需修改，请再操作一次。':`设置未保存：${error.message}`);
      }finally{settingsWrites--;}
    });
    return settingsQueue;
  };
  const refreshSettings=()=>{if(status&&!settingsWrites)readSettings().catch(()=>{});};
  window.addEventListener('focus',refreshSettings);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshSettings();});
  const mapCard=c=>({id:c.id,type:c.kind==='event'&&!c.allDay?'event':c.kind==='task'?'note':c.allDay?'note':c.kind,form:'standard',title:c.title,summary:c.summary||(c.content||'').slice(0,240),body:(c.content||c.summary||'暂无正文').split('\n').filter(Boolean),source:status?.connectors.find(x=>x.id===c.sourceId)?.label||c.sourceId,tags:c.tags||[],url:c.url,start:c.start?Date.parse(c.start):undefined,end:c.end?Date.parse(c.end):undefined,people:[],related:c.evidenceIds||[],time:Date.parse(c.publishedAt||c.collectedAt),meta:c.allDay?`全天 · ${c.startDate} 至 ${c.endDate}（结束日不含）`:c.truncated||c.contentTruncated?'内容节选 · 可查看原文':'已采集',live:true,contentTruncated:c.contentTruncated});
  function stateFor(c){store.state.items[c.id]={...store.item(c.id),...c.state};}
  async function loadCards(initial=false) {
    const cards=[];let offset=0;
    do {const response=await api(`/api/feed?offset=${offset}`);cards.push(...response.items);offset=response.nextOffset;}while(offset!==null&&cards.length<1000);
    const known=new Set(store.state.cards.map(c=>c.id));
    cards.forEach(stateFor);
    const mapped=cards.map(mapCard);
    if(initial||!store.state.cards.length){store.state.cards=mapped;app.renderCurrent(false);}
    else {
      const latest=new Map(mapped.map(c=>[c.id,c]));
      store.state.cards=store.state.cards.map(c=>latest.get(c.id)||c);
      const waiting=new Set(app.pendingCards.map(c=>c.id));
      app.pendingCards.push(...mapped.filter(c=>!known.has(c.id)&&!waiting.has(c.id)));
      app.paintPending();
      if(app.pendingCards.length)app.toast(`已采集 ${app.pendingCards.length} 张新卡片，点击入口旁的数字查看`);
      else app.toast('内容已同步；阅读位置保留');
    }
    if(offset!==null)app.toast('当前展示前 1000 张卡片，可在 Codex 中继续查询');
  }
  const originalSettings=panels.settings.bind(panels);
  panels.settings=()=>{
    const summary=status?status.connectors.map(c=>`<p>${esc(c.label)} · ${c.enabled?(c.credentialConfigured?'凭据已配置，采集时验证':'待授权'):'已停用'}${c.allowWrites?' · 可准备写入草稿':''}</p>`).join('')||'<p>还没有配置数据源。请按仓库接入说明配置日历、Notion 或 MCP。</p>':'<label class="field-label" for="qg-token">服务访问密钥</label><input id="qg-token" type="password" autocomplete="off" aria-label="Quiet Glass 服务访问密钥"><button class="solid-button" type="button" data-qg-action="login">连接</button>';
    return originalSettings().replace(/<p class="settings-note"><strong>演示边界<\/strong>[\s\S]*?<\/p>/,`<div class="settings-note"><strong>数据源连接</strong>${summary}<p>对话推理由 Codex 完成。这里提交的问题会进入待处理队列；在 Codex 中调用 Quiet Glass 后，结果会返回此处。</p><p>已读和收藏会同步到本地服务；备注、标签和阅读位置仍保存在本浏览器。</p></div>`);
  };
  document.querySelector('.ai-header small').textContent='Codex 待处理请求 · 需在 Codex 中继续';
  document.querySelector('[data-action="ai-send"]').setAttribute('aria-label','将问题保存到 Codex 待处理队列');
  document.querySelector('[data-action="refresh"]').setAttribute('aria-label','同步已配置的数据源');
  const originalPreview=app.showPreview.bind(app);
  let previewSequence=0;
  app.showPreview=async(id,reading=false)=>{
    const seq=++previewSequence,route=location.hash,modalToken=app.modalToken;
    try{
      const c=await api(`/api/cards/${encodeURIComponent(id)}`);
      if(seq!==previewSequence||location.hash!==route||app.modalToken!==modalToken)return;
      const index=store.state.cards.findIndex(c=>c.id===id);
      if(index>=0)store.state.cards[index]=mapCard(c);
      originalPreview(id,reading);
      document.querySelector('.reading-caption')?.replaceChildren(document.createTextNode(c.truncated?'已采集的正文节选 · 来源标注见卡片':'采集正文 · 本地阅读记录'));
    }catch(error){app.toast(error.message);}
  };
  const rawPatch=store.patch.bind(store);
  let feedbackQueue=Promise.resolve();
  store.patch=(id,values)=>{
    rawPatch(id,values);
    const patch=Object.fromEntries(['read','bookmarked'].filter(k=>typeof values[k]==='boolean').map(k=>[k,values[k]]));
    if(Object.keys(patch).length)feedbackQueue=feedbackQueue.then(()=>post('/api/feedback',{cardId:id,state:patch})).catch(error=>app.toast(`状态尚未同步：${error.message}`));
  };
  app.refresh=async()=>{
    if(app.refreshBusy)return;
    if(!status){app.openPanel('settings');return;}
    const connectorIds=status.connectors.filter(c=>c.enabled&&c.credentialConfigured&&c.collectionConfigured).map(c=>c.id);
    if(!connectorIds.length){app.toast('请先配置并授权数据源');app.openPanel('settings');return;}
    app.refreshBusy=true;
    try{
      const workflow=await post('/api/collect',{connectorIds});app.toast('正在采集，当前阅读位置不会移动');
      const poll=async()=>{
        try{
          const w=await api(`/api/workflows/${workflow.id}`);
          if(w.status==='running'||w.status==='pending'){setTimeout(poll,1500);return;}
          app.refreshBusy=false;await loadCards();
          if(w.status==='failed')app.toast('部分采集未完成，可在 Codex 中查看任务并继续');
          else if(w.steps.some(s=>s.output?.partial))app.toast('已同步首批内容；更多内容可在 Codex 中继续采集');
        }catch(error){app.refreshBusy=false;app.toast(error.message);}
      };setTimeout(poll,500);
    }catch(error){app.refreshBusy=false;app.toast(error.message);}
  };
  app.sendAI=async()=>{
    const field=document.getElementById('ai-input'),question=field.value.trim();
    if(!question||app.aiBusy)return;
    if(!status){app.openPanel('settings');return;}
    const version=app.aiVersion||0;
    app.aiBusy=true;app.messages.push({kind:'user',text:question});field.value='';app.paintAI();
    try{
      const request=await post('/api/requests',{question,cardIds:app.contexts.slice()});
      if((app.aiVersion||0)!==version)return;
      app.messages.push({kind:'assistant',text:`已保存请求 ${request.id}。\n在 Codex 中说：“用 Quiet Glass 处理待回答的问题”。Codex 回答后，结果会出现在这里。`});
      pendingUpdates.set(request.id,version);
    }catch(error){if((app.aiVersion||0)===version)app.messages.push({kind:'assistant',text:error.message});}
    finally{if((app.aiVersion||0)===version){app.aiBusy=false;app.paintAI();}}
  };
  requestTimer=setInterval(async()=>{
    if(document.hidden)return;
    refreshSettings();
    for(const [id,version] of pendingUpdates) {
      if((app.aiVersion||0)!==version){pendingUpdates.delete(id);continue;}
      try{const r=await api(`/api/requests/${id}`);if(r.status==='answered'){pendingUpdates.delete(id);app.messages.push({kind:'assistant',text:r.answer});app.paintAI();}}
      catch{pendingUpdates.delete(id);app.toast('连接中断；请求仍保留，可稍后在 Codex 中查看');}
    }
  },2500);
  window.addEventListener('pagehide',()=>clearInterval(requestTimer),{once:true});
  document.addEventListener('click',async event=>{
    if(!event.target.closest('[data-qg-action="login"]'))return;
    const field=document.getElementById('qg-token');
    try{await post('/api/session',{token:field.value});field.value='';status=await api('/api/status');await loadInitialSettings();app.closeModal();await loadCards(true);}
    catch(error){field.value='';app.toast(error.message);}
  });
  api('/api/status').then(async value=>{status=value;await loadInitialSettings();await loadCards(true);}).catch(()=>app.openPanel('settings'));
})();
