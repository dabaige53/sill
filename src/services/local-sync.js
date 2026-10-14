/** Page and agents share one loopback service. Browser storage remains a migration backup. */
const LocalSync={
  revision:0,baseline:null,pending:[],busy:false,app:null,ready:false,failed:false,
  snapshot(){return JSON.parse(JSON.stringify({cards:Store.state.cards,items:Store.state.items,seconds:Store.state.seconds,preferences:Store.state.preferences,sources:Store.state.sources||[]}));},
  async request(path,body){
    const response=await fetch('/api/local/'+path,{signal:AbortSignal.timeout(5000),...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
    const value=await response.json();if(!response.ok)throw new Error(value.error||'本地同步失败');return value;
  },
  persist(){
    try{localStorage.setItem('quiet-glass-unsynced',JSON.stringify({state:this.snapshot(),pending:this.pending,revision:this.unversioned?null:this.revision}));this.durable=true;return true;}
    catch{this.durable=false;this.app.toast('无法持久保存草稿，请导出备份后再关闭页面');return false;}
  },
  status(message){
    let bar=document.getElementById('sync-status');
    if(!bar){bar=document.createElement('section');bar.id='sync-status';bar.setAttribute('aria-label','本地同步');document.querySelector('main').prepend(bar);}
    bar.hidden=!message;
    if(message)bar.innerHTML=`<span role="status">${esc(message)}</span> <button type="button" class="text-link" data-action="sync-retry">重试同步</button> <button type="button" class="text-link" data-action="sync-export">导出草稿</button> <button type="button" class="text-link" data-action="sync-discard">使用服务端版本…</button>`;
  },
  async discard(){
    if(this.busy||this.discarding)throw new Error('正在核对同步结果，请稍后再确认放弃草稿');
    const journal=JSON.stringify([this.pending,this.snapshot()]);this.discarding=true;
    try{
      const value=await this.request('state');
      if(journal!==JSON.stringify([this.pending,this.snapshot()]))throw new Error('读取期间有新修改，请重新确认是否放弃草稿');
      this.pending=[];this.failed=false;this.unversioned=false;this.recovering=false;
      localStorage.removeItem('quiet-glass-unsynced');this.adopt(value);this.status('');this.app.setOffline(false);
    }finally{this.discarding=false;}
  },
  connect(app){
    if(this.connection)return this.connection;
    this.connection=this.connectOnce(app).finally(()=>{this.connection=null;});return this.connection;
  },
  async connectOnce(app){
    this.app=app;
    // Restore and journal before any request: a read outage must not disable saving.
    if(!this.saveWrapped){
      let draft,revision=null;
      try{draft=JSON.parse(localStorage.getItem('quiet-glass-unsynced')||'null');revision=JSON.parse(localStorage.getItem('quiet-glass-sync-revision')||'null');}catch{}
      if(draft?.state&&Array.isArray(draft.pending)&&draft.pending.length){
        this.pending=draft.pending;this.recovering=true;this.unversioned=!Number.isInteger(draft.revision);
        this.adopt({state:draft.state,revision:draft.revision},{draft:true});
      }else{this.baseline=this.snapshot();this.revision=revision;this.unversioned=!Number.isInteger(revision);}
      const save=Store.save.bind(Store);Store.save=()=>{save();this.capture();};this.saveWrapped=true;
      if(this.pending.length)this.status('已恢复本机草稿，等待连接');
    }
    try{
      let value=await this.request('state');
      if(!value.state){
        if(this.pending.length)throw new Error('服务尚无数据，草稿仍保留，请先导出');
        value=await this.request('initialize',this.snapshot());
      }
      // In-memory edits made during this request are newer than the initial journal.
      if(!this.pending.length){this.adopt(value);this.unversioned=false;}
      this.ready=true;
      clearInterval(this.timer);this.timer=setInterval(()=>this.refresh().catch(()=>{}),1000);
      if(!this.focusListener){window.addEventListener('focus',()=>this.refresh().catch(()=>{}));this.focusListener=true;}
      if(this.pending.length)await this.flush();
      else{this.failed=false;this.status('');app.setOffline(false);}
    }catch(error){this.failed=true;app.grid.dataset.sync='error';app.setOffline(true);this.status('未连接本地服务；本次修改会保留为草稿，可导出或重试连接');app.toast('无法连接本地数据：'+error.message);}
  },
  capture(){
    if(!this.baseline)return;
    const next=this.snapshot(),before=this.baseline,operations=[];
    // Cards created or edited on the page (capture, import, inline notes) travel as whole cards.
    const oldCards=new Map(before.cards.map(card=>[card.id,JSON.stringify(card)])),newIds=new Set(next.cards.map(card=>card.id));
    for(const card of next.cards.slice().reverse())if(oldCards.get(card.id)!==JSON.stringify(card))operations.push({op:'card.upsert',card,before:before.cards.find(old=>old.id===card.id)||null});
    for(const id of oldCards.keys())if(!newIds.has(id))operations.push({op:'card.delete',id,before:before.cards.find(old=>old.id===id)});
    const oldSources=new Map((before.sources||[]).map(source=>[source.id,JSON.stringify(source)])),newSources=new Set(next.sources.map(source=>source.id));
    for(const source of next.sources)if(oldSources.get(source.id)!==JSON.stringify(source))operations.push({op:'source.upsert',source});
    for(const id of oldSources.keys())if(!newSources.has(id))operations.push({op:'source.delete',id});
    for(const [id,item] of Object.entries(next.items)){
      if(!next.cards.some(card=>card.id===id))continue;
      const values={},previous={};
      for(const [key,value] of Object.entries(item))if(JSON.stringify(value)!==JSON.stringify(before.items[id]?.[key])){values[key]=value;previous[key]=before.items[id]?.[key];}
      if(Object.keys(values).length)operations.push({op:'item.patch',id,values,before:previous});
    }
    const values={},previous={};
    for(const [key,value] of Object.entries(next.preferences))if(value!==before.preferences[key]){values[key]=value;if(before.preferences[key]!==undefined)previous[key]=before.preferences[key];}
    if(Object.keys(values).length)operations.push({op:'preferences.patch',values,before:previous});
    const seconds=next.seconds-before.seconds;if(seconds>0)operations.push({op:'reading.add',seconds});
    this.baseline=next;
    if(operations.length){this.app.grid.dataset.sync='pending';this.pending.push({operations,idempotencyKey:crypto.randomUUID()});if(!this.ready)this.recovering=true;this.persist();if(this.failed||!this.ready)this.status(this.durable?'已保存在本机，尚未同步':'草稿仅在本次页面，请立即导出');else this.flush();}
  },
  async flush(){
    if(this.busy||this.discarding||!this.pending.length)return;
    this.busy=true;
    try{
      while(this.pending.length){
        if(this.unversioned)throw new Error('旧草稿缺少版本信息，请先导出并与服务端版本比较');
        const entry=this.pending[0];
        // Freeze exactly one wire request. Online before guards allow unrelated edits;
        // recovery and deletion additionally require the original global revision.
        entry.request??={operations:entry.operations,...(entry.idempotencyKey?{idempotencyKey:entry.idempotencyKey}:{}),...((this.recovering||entry.operations.some(op=>op.op==='card.delete'))?{expectedRevision:entry.expectedRevision??this.revision}:{})};
        const batch=entry.request;this.persist();
        const value=await this.request('operations',batch);this.pending.shift();this.revision=value.revision;this.persist();
        if(!this.pending.length){if(!this.app.editingId&&this.app.modalKind!=='editor')this.adopt(value);else this.needsAdopt=true;}
      }
      localStorage.removeItem('quiet-glass-unsynced');this.status('');this.failed=false;this.recovering=false;
      this.app.grid.dataset.sync='saved';this.app.setOffline(false);
      const inline=document.getElementById('inline-state');if(inline)inline.textContent='已同步到本地服务';
    }catch(error){
      this.failed=true;this.recovering=true;
      this.persist();this.status('修改尚未同步：'+error.message+(this.durable?'。本机草稿仍保留，可导出或重试。':'。草稿仅在本次页面，请立即导出，关闭页面可能丢失。'));
      this.app.grid.dataset.sync='error';this.app.setOffline(true);this.app.toast('修改尚未同步：'+error.message+(this.durable?'；本地草稿已保留':'；请立即导出草稿'));
    }finally{this.busy=false;}
  },
  async refresh(manual=false){
    if(!this.ready){if(manual)return this.connect(this.app);throw new Error('本地数据尚未连接');}
    if(this.busy||this.discarding)return;
    if(this.failed&&!manual)return;
    if(manual)this.failed=false;
    if(this.pending.length){await this.flush();if(this.pending.length)throw new Error('仍有未同步修改');return;}
    // Keep an editor's original values until its save can be checked for conflicts.
    if(this.app.modalKind==='editor'||this.app.editingId)return;
    const value=await this.request('state');
    if(!this.busy&&!this.discarding&&!this.pending.length&&this.app.modalKind!=='editor'&&!this.app.editingId&&(value.revision>this.revision||this.needsAdopt&&value.revision===this.revision))this.adopt(value);
  },
  adopt(value,{draft=false}={}){
    if(!value.state)return;
    const app=this.app;
    const previewBefore=JSON.stringify([Store.card(app.currentId),Store.state.items[app.currentId]]);
    const changed=JSON.stringify([Store.state.cards,Store.state.items,Store.state.preferences,Store.state.sources])!==JSON.stringify([value.state.cards,value.state.items,value.state.preferences,value.state.sources||[]]);
    this.revision=value.revision;this.needsAdopt=false;
    if(!draft)try{localStorage.setItem('quiet-glass-sync-revision',JSON.stringify(value.revision));}catch{}
    Object.assign(Store.state,value.state);Store.state.sources=value.state.sources||[];Store.state.storageAvailable=true;
    this.baseline=this.snapshot();
    // Write the browser backup without enqueueing another remote operation.
    try{localStorage.setItem(Store.key,JSON.stringify(Store.serialized()));}catch{}
    app.grid.dataset.sync='saved';app.grid.dataset.revision=value.revision;
    if(!changed)return;
    app.feedNow=Date.now();app.applyPreferences();
    if(!app.editingId)app.withFeedAnchor(()=>{});
    if(['sources','source','settings'].includes(app.modalKind))app.repaintSources();
    if(app.modalKind==='preview'&&!app.sheetLeaving){
      const card=Store.card(app.currentId);
      if(!card){app.closeNative();history.replaceState({glass:true,prev:null},'','#feed');}
      else if(previewBefore!==JSON.stringify([card,Store.state.items[app.currentId]])){
        app.modalToken++;app.replacePanelContent(Panels.preview(app,card));app.bindPreview(card.id);app.gestures.bindPullDown();
      }
    }
    app.checkReminders();app.grid.dataset.sync='saved';app.grid.dataset.revision=value.revision;
  }
};
