/* Optional standalone provider controls. No key or direct provider connection in this file. */
window.initSillAi=({app,api,post,esc,refreshHistory})=>{
  let current=null,generation=0,config=null,reading=null,lastRead=0,stopped=false,readError=false;
  const runs=new Map(),streams=new Map(),writes=new Set();
  const labels={idle:'尚未调用',running:'正在生成',completed:'已完成',failed:'失败',cancelled:'本地已取消',interrupted:'结果未确认',superseded:'已有其他回答',refused:'模型拒绝',incomplete:'未完整完成'};
  const container=document.createElement('div');container.id='ai-runtime';container.style.cssText='max-height:180px;overflow:auto;min-height:0;flex:0 1 auto;padding:0 16px;overflow-wrap:anywhere';
  document.querySelector('.ai-compose').before(container);
  function closeStreams(){for(const stream of streams.values())stream.close();streams.clear();}
  function render(){
    if(!config){container.textContent='独立 AI 状态尚未读取；待处理队列仍可使用';return;}
    const rows=(current?.messages||[]).filter(m=>m.role==='user').map(message=>{
      const run=runs.get(message.requestId);if(!run||run.status==='idle'&&message.status!=='pending')return '';
      const active=run.status==='running',partial=run.status!=='completed'&&run.output;
      const start=config.ready&&run.status==='idle'&&run.canStart;
      return `<section data-ai-request="${esc(message.requestId)}" data-ai-status="${esc(run.status)}" style="padding:8px 0;border-top:1px solid rgba(0,0,0,.06)"><p class="settings-note">${esc(message.text.slice(0,80))}<br><strong>${esc(labels[run.status]||'未知状态')}</strong>${run.error?' · '+esc(run.error.message):''}</p>${partial?`<pre style="white-space:pre-wrap;font:inherit;font-size:13px" data-ai-output>${esc(run.output)}</pre>`:''}${start?`<button class="text-button" data-action="ai-run-start" data-id="${esc(message.requestId)}" ${writes.has(message.requestId)||config.budget.remaining<1?'disabled':''}>调用 OpenAI API（可能计费）</button>`:''}${active?`<button class="text-button" data-action="ai-run-cancel" data-id="${esc(message.requestId)}" ${writes.has(message.requestId)?'disabled':''}>停止本地生成</button>`:''}${run.billingMayContinue&&!active?'<p class="settings-note">已停止本地等待，无法保证提供方已停止处理或计费；不会自动重试。</p>':''}${['failed','interrupted','incomplete','refused','cancelled'].includes(run.status)?'<p class="settings-note">此问题不会再次自动调用 API；可继续交给队列工作者处理。</p>':''}${run.status==='completed'?'<p class="settings-note">AI 答案已保存到应用历史；未执行工具或外部写入。</p>':''}</section>`;
    }).join('');
    container.innerHTML=`${readError?'<p class="settings-note">AI 状态暂时无法读取；保留上次状态，不会自动重试调用。</p>':''}${!config.ready?`<p class="settings-note">独立 AI ${config.enabled?'尚未配置完成':'未启用'}；问题仍在待处理队列。请由服务管理员配置，勿在网页输入 API 密钥。</p>`:''}<p class="settings-note">OpenAI · ${esc(config.model)} · 今日剩余 ${config.budget.remaining} 次<br>点击调用会把问题、有界历史与引用发给 OpenAI；不执行工具或写入。次数限制不是金额估算。</p>${rows}`;
  }
  function accept(id,run){
    const prior=runs.get(id);
    if(prior&&((prior.status!=='idle'&&run.status==='idle')||(prior.status!=='idle'&&prior.status!=='running'&&run.status==='running')||(prior.updatedAt&&run.updatedAt&&prior.updatedAt>run.updatedAt)))return prior;
    runs.set(id,run);return run;
  }
  function observe(id,run,token){
    if(run.status!=='running'){streams.get(id)?.close();streams.delete(id);return;}
    if(streams.has(id)||typeof EventSource==='undefined')return;
    const stream=new EventSource('/api/requests/'+encodeURIComponent(id)+'/ai/events');streams.set(id,stream);
    stream.addEventListener('snapshot',event=>{
      if(token!==generation||stopped)return;
      try{let snapshot=JSON.parse(event.data);if(snapshot.requestId!==id||snapshot.conversationId!==current?.conversationId)return;
        snapshot=accept(id,snapshot);render();
        if(snapshot.status!=='running'){stream.close();streams.delete(id);refreshHistory();}
      }catch{stream.close();streams.delete(id);}
    });
    stream.onerror=()=>{stream.close();streams.delete(id);lastRead=0;};
  }
  async function sync(force=false){
    if(stopped||reading===generation||!current?.conversationId||(!force&&Date.now()-lastRead<1500))return;
    const token=generation,view=current;reading=token;
    try{
      const status=await api('/api/ai');if(token!==generation)return;config=status;
      for(const message of view.messages.filter(m=>m.role==='user')){
        let run=await api('/api/requests/'+encodeURIComponent(message.requestId)+'/ai');
        if(token!==generation)return;run=accept(message.requestId,run);observe(message.requestId,run,token);
      }
      lastRead=Date.now();readError=false;render();
    }catch{if(token===generation){readError=true;render();}}
    finally{if(reading===token)reading=null;}
  }
  const originalAction=app.action.bind(app);
  app.action=(name,id='',...rest)=>{
    if(!['ai-run-start','ai-run-cancel'].includes(name))return originalAction(name,id,...rest);
    if(writes.has(id)||!current?.messages.some(message=>message.requestId===id))return;
    const token=generation;writes.add(id);render();
    return post('/api/requests/'+encodeURIComponent(id)+'/ai/'+(name==='ai-run-start'?'start':'cancel'),{}).then(run=>{
      if(token!==generation)return;run=accept(id,run);observe(id,run,token);render();if(run.status!=='running')refreshHistory();
    }).catch(error=>{if(token===generation)app.toast('AI 操作结果未确认，将读取已有状态；不会重复调用：'+error.message);})
      .finally(()=>{writes.delete(id);if(token===generation){render();sync(true);}});
  };
  window.addEventListener('focus',()=>sync(true));
  window.addEventListener('pagehide',()=>{stopped=true;closeStreams();});
  return {view(value){
    if(current?.viewKey!==value.viewKey){generation++;closeStreams();runs.clear();config=null;readError=false;lastRead=0;}
    current=value;render();sync();
    if(!value.conversationId&&!config){const token=generation;api('/api/ai').then(status=>{if(token===generation){config=status;render();}}).catch(()=>{});}
  }};
};
