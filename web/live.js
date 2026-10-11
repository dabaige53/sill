/* Same-origin live adapter. No provider credentials or model keys enter browser storage. */
window.initQuietGlassLive = () => {
  if(!window.__QG_RUNTIME__ || !window.__quietGlass)return;
  const {app,store,panels,esc}=window.__quietGlass;
  let status=null,requestTimer=null,contentAdapter=null,contentEpoch=0,contentSync=null,conversations=null,preferencesAdapter=null;
  const api=async(path,options={})=>{
    if(window.__QG_TRANSPORT__)return window.__QG_TRANSPORT__(path,options);
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
    preferencesAdapter?.consume(snapshot);
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
  // All service settings use one queue and CAS revision, including recommendation drafts.
  const recommendation=value=>value||{interests:[],sourcePriorities:{},excludedSourceIds:[],includeRead:false};
  const sameRecommendation=(a,b)=>JSON.stringify([a.interests,Object.entries(a.sourcePriorities).sort(),a.excludedSourceIds,a.includeRead])===JSON.stringify([b.interests,Object.entries(b.sourcePriorities).sort(),b.excludedSourceIds,b.includeRead]);
  function writeSettings(set,{expectedRevision,baseRecommendation}={}) {
    settingsWrites++;
    const epoch=settingsEpoch;
    const operation=settingsQueue.catch(()=>{}).then(async()=>{
      if(epoch!==settingsEpoch)throw Object.assign(new Error('设置已有更新，请检查后再次保存'),{code:'SETTINGS_CONFLICT',current:settingsSnapshot});
      if(!status||!settingsSnapshot)throw new Error('连接后才能保存服务设置');
      // Unrelated sort/transparency writes may advance the shared revision safely.
      const revision=expectedRevision===undefined||(baseRecommendation&&sameRecommendation(recommendation(settingsSnapshot.values.recommendation),baseRecommendation))?settingsSnapshot.revision:expectedRevision;
      try {
        const snapshot=await api('/api/settings',{method:'PATCH',body:JSON.stringify({set:typeof set==='function'?set():set,expectedRevision:revision})});
        applySettings(snapshot);return snapshot;
      }catch(error){
        if(error.code==='SETTINGS_CONFLICT'&&error.current){settingsEpoch++;applySettings(error.current);}
        throw error;
      }
    }).finally(()=>{settingsWrites--;});
    settingsQueue=operation.catch(()=>{});return operation;
  }
  const originalAction=app.action.bind(app);
  app.action=(name,id='',extra='',...rest)=>{
    if(!['sort-feed','toggle-transparency'].includes(name))return originalAction(name,id,extra,...rest);
    if(!status||!settingsSnapshot){app.openPanel('settings');app.toast('连接后才能保存服务设置');return;}
    if(name==='sort-feed'&&!['priority','unread','time'].includes(extra))return;
    return writeSettings(()=>name==='sort-feed'?{sort:extra}:{reduceTransparency:!settingsSnapshot.values.reduceTransparency}).catch(error=>{
      app.toast(error.code==='SETTINGS_CONFLICT'?'设置已在另一处更新，已显示最新值；如需修改，请再操作一次。':`设置未保存：${error.message}`);
    });
  };
  const refreshSettings=()=>{if(status&&!settingsWrites)readSettings().catch(()=>{});};
  window.addEventListener('focus',refreshSettings);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshSettings();});
  const mapCardBase=c=>({id:c.id,sourceId:c.sourceId,type:c.kind==='event'&&!c.allDay?'event':c.kind==='task'?'note':c.allDay?'note':c.kind,form:'standard',title:c.title,summary:c.summary||(c.content||'').slice(0,240),body:(c.content||c.summary||'暂无正文').split('\n').filter(Boolean),source:c.local?'本地笔记':status?.connectors.find(x=>x.id===c.sourceId)?.label||c.sourceId,tags:c.tags||[],url:c.url,start:c.start?Date.parse(c.start):undefined,end:c.end?Date.parse(c.end):undefined,people:[],related:c.evidenceIds||[],time:Date.parse(c.publishedAt||c.collectedAt),meta:c.local?'本地保存':c.allDay?`全天 · ${c.startDate} 至 ${c.endDate}（结束日不含）`:c.truncated||c.contentTruncated?'内容节选 · 可查看原文':'已采集',live:true,local:!!c.local,revision:c.revision,contentTruncated:c.contentTruncated});
  const hostNames={'notion':'Notion','google-calendar':'Google Calendar','linear':'Linear'};
  const mapCard=c=>{
    const card=mapCardBase(c),p=c.provenance;
    if(p){
      card.provenance=p;card.externalId=c.externalId;card.importRevision=c.revision;card.truncated=!!c.truncated||!!c.contentTruncated;
      card.source=(hostNames[p.provider]||p.provider)+' · 宿主导入';
      card.meta=[p.contentOrigin==='model-summary'?'模型摘要':'原始内容',c.truncated||c.contentTruncated?'内容节选':'',p.partial?'采集未完整':'',c.allDay?card.meta:''].filter(Boolean).join(' · ');
      card.summary=c.summary?(p.summaryOrigin==='model-summary'?'模型摘要：':'来源摘要：')+c.summary:(c.content||'').slice(0,240);
      card.body=(c.content||(p.contentOrigin==='model-summary'?'来源正文未导入；请核对来源链接。':'导入方提供的原始正文为空。')).split('\n').filter(Boolean);card.sourceSummary=c.summary||'';
    }
    return card;
  };
  const basePreview=panels.preview.bind(panels);
  panels.preview=(controller,card,reading=false)=>{
    const html=basePreview(controller,card,reading),p=card.provenance;if(!p)return html;
    const field=(name,label,value)=>`<p class="settings-note" data-provenance-field="${name}">${label}：${esc(value)}</p>`;
    const scope=Object.entries(p.scope||{}).map(([key,value])=>key+'='+value).join(' · ');
    const evidence=(card.related||[]).slice(0,20).map(id=>`<button type="button" class="text-button" data-action="card-open" data-id="${esc(id)}">${esc(store.state.cards.find(c=>c.id===id)?.title||id)}</button>`).join(' · ');
    const detail=`<section data-provenance style="padding:12px 0;overflow-wrap:anywhere">${field('provider','宿主提供方',hostNames[p.provider]||p.provider)}${field('scope','来源范围',scope)}${field('upstreamId','上游 ID',p.upstreamId)}${field('retrievedAt','导入方读取时间',p.retrievedAt)}${field('contentOrigin','正文类型',p.contentOrigin==='model-summary'?'未导入原文，仅有模型摘要':'上游原始内容')}${p.summaryOrigin?field('summaryOrigin','摘要类型',p.summaryOrigin==='model-summary'?'模型生成，需核对来源':'上游原始摘要'):''}${field('truncated','正文覆盖',card.truncated?'内容已截断，仅含节选':'导入方未标记截断')}${field('partial','采集覆盖',p.partial?'采集未完整，仍有未覆盖内容':'仅此条记录；不表示完整来源')}${card.url?`<p><a class="text-button" data-provenance-source data-id="${esc(card.id)}" href="${esc(card.url)}" target="_blank" rel="noopener noreferrer">打开上游来源</a></p>`:''}${evidence?`<p class="settings-note" data-provenance-evidence>引用证据：${evidence}</p>`:''}${reading&&card.sourceSummary?`<p class="preview-lead" data-provenance-summary>${esc(p.summaryOrigin==='model-summary'?'模型摘要：':'来源摘要：')}${esc(card.sourceSummary)}</p>`:''}<p class="settings-note">导入方提供的来源信息，未验证宿主授权；不代表 Quiet Glass 已连接该应用。</p></section>`;
    return html.replace('</h1>','</h1>'+detail);
  };
  function stateFor(c){store.state.items[c.id]={...store.item(c.id),...c.state};contentAdapter?.consumeCard(c);}
  async function loadCards(initial=false,quiet=false) {
    const epoch=contentEpoch,before=JSON.stringify([store.state.cards,store.state.items]);
    const cards=[];let offset=0;
    do {const response=await api(`/api/feed?offset=${offset}`);cards.push(...response.items);offset=response.nextOffset;}while(offset!==null&&cards.length<1000);
    if(epoch!==contentEpoch)return;
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
      if(!quiet&&app.pendingCards.length)app.toast(`已采集 ${app.pendingCards.length} 张新卡片，点击入口旁的数字查看`);
      else if(!quiet)app.toast('内容已同步；阅读位置保留');
      if(before!==JSON.stringify([store.state.cards,store.state.items]))app.withFeedAnchor(()=>{});
    }
    store.save();
    if(window.__QG_HOST__)app.paintAI();
    if(offset!==null&&!quiet)app.toast('当前展示前 1000 张卡片，可在 Codex 中继续查询');
  }
  const originalSettings=panels.settings.bind(panels);
  panels.settings=()=>{
    const summary=status?status.connectors.map(c=>`<p>${esc(c.label)} · ${c.enabled?(c.credentialConfigured?'凭据已配置，采集时验证':'待授权'):'已停用'}${c.allowWrites?' · 可准备写入草稿':''}</p>`).join('')||'<p>还没有配置数据源。请按仓库接入说明配置日历、Notion 或 MCP。</p>':window.__QG_HOST__?'<p>宿主连接尚未完成，请关闭后重新打开此视图。</p>':'<label class="field-label" for="qg-token">服务访问密钥</label><input id="qg-token" type="password" autocomplete="off" aria-label="Quiet Glass 服务访问密钥"><button class="solid-button" type="button" data-qg-action="login">连接</button>';
    return originalSettings().replace(/<p class="settings-note"><strong>演示边界<\/strong>[\s\S]*?<\/p>/,`<div class="settings-note"><strong>数据源连接</strong>${summary}<p>宿主协助导入与服务器连接器分开：只可使用宿主当前可用且已授权的应用工具；这里不会读取其凭据。刷新按钮仅采集服务器已配置来源。</p><p>对话推理由 Codex 完成。这里提交的问题会进入待处理队列；在 Codex 中调用 Quiet Glass 后，结果会返回此处。</p><p>已读和收藏会同步到本地服务；备注与个人标签保存在本地服务，不改写来源；阅读位置仍保存在本浏览器。</p></div>`);
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
      stateFor(c);originalPreview(id,reading);contentAdapter?.afterPreview(c);
      document.querySelector('.reading-caption')?.replaceChildren(document.createTextNode(c.provenance?.contentOrigin==='model-summary'?'来源正文未导入 · 模型摘要需核对来源':c.truncated?'已采集的正文节选 · 来源标注见卡片':'采集正文 · 本地阅读记录'));
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
  if(!window.__QG_HOST__)app.sendAI=()=>app.toast('对话界面正在连接，请稍后重试');
  requestTimer=setInterval(async()=>{
    if(document.hidden)return;
    refreshSettings();refreshContent();
    conversations?.refresh();
  },2500);
  window.addEventListener('pagehide',()=>clearInterval(requestTimer),{once:true});
  document.addEventListener('click',async event=>{
    if(!event.target.closest('[data-qg-action="login"]'))return;
    const field=document.getElementById('qg-token');
    try{await post('/api/session',{token:field.value});field.value='';status=await api('/api/status');await contentReady;await preferenceReady;await conversationReady;await loadInitialSettings();app.closeModal();await loadCards(true);await conversations?.restore();}
    catch(error){field.value='';app.toast(error.message);}
  });
  const contentReady=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='/web/content.js';
    const initialize=()=>{
      try{contentAdapter=window.initQuietGlassContent({app,store,panels,esc,api,post,isConnected:()=>!!status,onMutation:()=>contentEpoch++,onSaved:card=>{
        contentEpoch++;stateFor(card);const mapped=mapCard(card),index=store.state.cards.findIndex(item=>item.id===card.id);
        app.withFeedAnchor(()=>{if(index>=0)store.state.cards[index]=mapped;else store.state.cards.unshift(mapped);});store.save();
      }});resolve();}catch(error){reject(error);}
    };
    if(window.initQuietGlassContent)initialize();
    else {script.onload=initialize;script.onerror=()=>reject(new Error('本地内容界面未加载，请重新加载页面'));document.body.appendChild(script);}
  });
  const preferenceReady=new Promise((resolve,reject)=>{
    const initialize=()=>{
      try {
        preferencesAdapter=window.initQuietGlassPreferences({app,store,panels,esc,post,writeSettings,isConnected:()=>!!status,getSources:()=>status?.connectors||[]});
        if(settingsSnapshot)preferencesAdapter.consume(settingsSnapshot);
        resolve();
      }catch(error){reject(error);}
    };
    if(window.initQuietGlassPreferences)initialize();
    else {
      const script=document.createElement('script');script.src='/web/preferences.js';
      script.onload=initialize;script.onerror=()=>reject(new Error('推荐偏好界面未加载，请重新加载页面'));document.body.appendChild(script);
    }
  }).catch(error=>{app.toast(error.message+'；内容仍可浏览，重新加载可恢复推荐设置。');});
  const conversationReady=window.__QG_HOST__?Promise.resolve():new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='/web/conversations.js';
    script.onload=()=>{try{conversations=window.initQuietGlassConversations({app,store,esc,api,post});resolve();}catch(error){reject(error);}};
    script.onerror=()=>reject(new Error('对话界面未加载，请重新加载页面'));document.body.appendChild(script);
  });
  const refreshContent=()=>{
    if(!status||!contentAdapter||app.refreshBusy||contentSync)return;
    contentSync=loadCards(false,true).catch(()=>{}).finally(()=>{contentSync=null;});
  };
  window.addEventListener('focus',refreshContent);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshContent();});
  api('/api/status').then(async value=>{status=value;await contentReady;await preferenceReady;await conversationReady;await loadInitialSettings();await loadCards(true);await conversations?.restore();}).catch(()=>app.openPanel('settings'));
};
if(!window.__QG_HOST__)window.initQuietGlassLive();
