/** Page and agents share one loopback service. Browser storage remains a migration backup. */
const LocalSync={
  revision:0,baseline:null,pending:[],busy:false,app:null,ready:false,failed:false,
  snapshot(){return JSON.parse(JSON.stringify({cards:Store.state.cards,items:Store.state.items,seconds:Store.state.seconds,preferences:Store.state.preferences,sources:Store.state.sources||[]}));},
  async request(path,body){
    const response=await fetch('/api/local/'+path,{signal:AbortSignal.timeout(5000),...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
    const value=await response.json();if(!response.ok)throw new Error(value.error||'本地同步失败');return value;
  },
  async connect(app){
    this.app=app;
    try{
      let value=await this.request('state');
      if(!value.state)value=await this.request('initialize',this.snapshot());
      this.adopt(value);this.ready=true;
      const save=Store.save.bind(Store);
      Store.save=()=>{save();this.capture();};
      this.timer=setInterval(()=>this.refresh().catch(()=>{}),1000);
      window.addEventListener('focus',()=>this.refresh().catch(()=>{}));
    }catch(error){app.toast('无法连接本地数据：'+error.message);}
  },
  capture(){
    if(!this.ready)return;
    const next=this.snapshot(),before=this.baseline,operations=[];
    // Cards created or edited on the page (capture, import, inline notes) travel as whole cards.
    const oldCards=new Map(before.cards.map(card=>[card.id,JSON.stringify(card)])),newIds=new Set(next.cards.map(card=>card.id));
    for(const card of next.cards.slice().reverse())if(oldCards.get(card.id)!==JSON.stringify(card))operations.push({op:'card.upsert',card});
    for(const id of oldCards.keys())if(!newIds.has(id))operations.push({op:'card.delete',id});
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
    if(operations.length){this.app.grid.dataset.sync='pending';this.pending.push({operations});if(!this.failed)this.flush();}
  },
  async flush(){
    if(this.busy||!this.pending.length)return;
    this.busy=true;
    try{
      while(this.pending.length){
        const value=await this.request('operations',this.pending[0]);this.pending.shift();this.revision=value.revision;
        if(!this.pending.length)this.adopt(value);
      }
      this.app.grid.dataset.sync='saved';this.app.setOffline(false);
    }catch(error){
      this.failed=true;
      try{localStorage.setItem('quiet-glass-unsynced',JSON.stringify({state:this.snapshot(),pending:this.pending}));}catch{}
      this.app.grid.dataset.sync='error';this.app.setOffline(true);this.app.toast('修改尚未同步：'+error.message+'；本地草稿已保留');
    }finally{this.busy=false;}
  },
  async refresh(manual=false){
    if(!this.ready)throw new Error('本地数据尚未连接，请重新打开页面');
    if(this.busy)return;
    if(this.failed&&!manual)return;
    if(manual)this.failed=false;
    if(this.pending.length){await this.flush();if(this.pending.length)throw new Error('仍有未同步修改');return;}
    // Keep an editor's original values until its save can be checked for conflicts.
    if(this.app.modalKind==='editor')return;
    const value=await this.request('state');
    if(!this.busy&&!this.pending.length&&this.app.modalKind!=='editor'&&value.revision!==this.revision)this.adopt(value);
  },
  adopt(value){
    if(!value.state)return;
    const changed=JSON.stringify([Store.state.cards,Store.state.items,Store.state.preferences,Store.state.sources])!==JSON.stringify([value.state.cards,value.state.items,value.state.preferences,value.state.sources||[]]);
    this.revision=value.revision;Object.assign(Store.state,value.state);Store.state.sources=value.state.sources||[];Store.state.storageAvailable=true;
    this.baseline=this.snapshot();
    // Write the browser backup without enqueueing another remote operation.
    try{localStorage.setItem(Store.key,JSON.stringify(Store.serialized()));}catch{}
    const app=this.app;app.grid.dataset.sync='saved';app.grid.dataset.revision=value.revision;
    if(!changed)return;
    app.feedNow=Date.now();app.applyPreferences();
    if(!app.editingId)app.withFeedAnchor(()=>{});
    if(['sources','source','settings'].includes(app.modalKind))app.repaintSources();
    if(app.modalKind==='preview'){
      const card=Store.card(app.currentId);
      if(!card){app.closeNative();history.replaceState({glass:true,prev:null},'','#feed');}
      else{
        const toast=document.getElementById('toast');if(toast&&app.dialog.contains(toast))document.body.appendChild(toast);
        app.dialog.innerHTML=Panels.preview(app,card);
      }
    }
    app.checkReminders();app.grid.dataset.sync='saved';app.grid.dataset.revision=value.revision;
  }
};
