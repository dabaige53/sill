class AppController{
 constructor(){
   this.mode=window.__PAGE__||'feed';this.baseMode=this.mode;
   this.filter={type:'all',status:'all',tag:'',query:''};this.selected=new Set();
   this.contexts=[];this.messages=[];this.pendingCards=[];this.refreshIndex=0;this.refreshBusy=false;
   this.modalKind='';this.currentId='';this.panelReturn=null;this.lastFocus=null;
   this.mediaIndex=0;this.mediaTimer=null;this.lastActivity=Date.now();this.aiBusy=false;
   this.touchDockExpanded=false;this.modalToken=0;this.routeScroll={};
   this.sort='priority';this.feedNow=Date.now();this.pendingReminders=[];
 }
 init(){
   Store.load();this.sort=Store.state.preferences.sort;document.body.classList.toggle('opaque',Store.state.preferences.reduceTransparency);
   document.body.innerHTML=`<main aria-label="个人信息空间"><h1 class="sr-only" id="page-title">卡片信息流</h1><div class="feed-grid" id="feed-grid"></div></main>
   <div id="dock"><div class="dock-tools" role="group" aria-label="全局工具">
     ${button('filter','筛选与搜索','filter')}${button('refresh','刷新演示内容','refresh')}${button('up','返回顶部','top')}${button('layers','组件实验室','view-library')}${button('info','使用说明与设置','settings')}
   </div><button type="button" class="icon-button glass" id="orb" data-action="orb" data-drop="ai" aria-label="AI 与全局工具" aria-expanded="false">${icon('sparkles',24)}</button><button id="new-count" class="glass" data-action="show-new" hidden aria-label="查看新增卡片"></button></div>
   <div id="selection-bar" class="glass" hidden><span class="selection-count"></span>${button('sparkles','将选中的卡片加入 AI','selected-ai')}${button('bookmark','收藏选中的卡片','selected-bookmark')}${button('x','取消选择','clear-selection')}</div>
   <div id="drop-targets" class="drop-targets" hidden><div class="drop-target glass" data-drop="bookmark" aria-label="收藏接收区">${icon('bookmark',22)}</div><div class="drop-target glass" data-drop="later" aria-label="稍后阅读接收区">${icon('clock',22)}</div><div class="drop-target glass" data-drop="tag" aria-label="标签接收区">${icon('tag',22)}</div></div>
   ${AIView.shell()}<dialog id="modal" aria-labelledby="modal-title"></dialog><div id="toast" role="status" aria-live="polite" hidden><span id="toast-text"></span><span id="toast-action"></span></div><div class="sr-only" id="announcer" aria-live="polite"></div>`;
   this.grid=document.getElementById('feed-grid');this.dialog=document.getElementById('modal');
   this.layout=new FeedLayout(this.grid);this.drag=new DragManager(this);
   document.addEventListener('click',e=>this.click(e));
   document.addEventListener('input',e=>this.input(e));
   document.addEventListener('keydown',e=>this.key(e));   ['pointerdown','keydown','wheel','touchstart'].forEach(type=>document.addEventListener(type,()=>this.lastActivity=Date.now(),{passive:true}));
   this.dialog.addEventListener('cancel',e=>{e.preventDefault();this.closeModal();});
   this.dialog.addEventListener('click',e=>{
     if(e.target!==this.dialog)return;
     const r=this.dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)this.closeModal();
   });
   const dock=document.getElementById('dock');
   dock.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch')this.openDock();});
   dock.addEventListener('pointerleave',e=>{if(e.pointerType!=='touch')this.hideDock();});
   dock.addEventListener('focusin',()=>this.openDock());
   dock.addEventListener('focusout',()=>setTimeout(()=>{if(!dock.contains(document.activeElement))this.hideDock();},0));
   window.addEventListener('popstate',()=>this.route());
   window.addEventListener('hashchange',()=>this.route());
   document.addEventListener('visibilitychange',()=>{if(document.hidden){Store.save();this.pauseMedia();}else this.checkReminders();});
   window.addEventListener('pagehide',()=>Store.save());
   this.readTicker=setInterval(()=>this.tick(),1000);
   if(!location.hash)history.replaceState({glass:true,prev:null},'','#'+this.mode);
   this.renderCurrent();this.route();this.checkReminders();
   window.__app=this; // Deliberate test hook, no network credentials or private data.
 }
 announce(text){document.getElementById('announcer').textContent=text;}
 openDock(){clearTimeout(this.dockTimer);document.getElementById('dock').classList.add('is-open');document.getElementById('orb').setAttribute('aria-expanded','true');}
 hideDock(){clearTimeout(this.dockTimer);this.dockTimer=setTimeout(()=>{document.getElementById('dock').classList.remove('is-open');document.getElementById('orb').setAttribute('aria-expanded','false');this.touchDockExpanded=false;},420);}
 filtered(){
   const f=this.filter,q=f.query.trim().toLocaleLowerCase();
   return FeedPolicy.sort(Store.state.cards.filter(c=>{
     const s=Store.item(c.id);
     return FeedPolicy.visible(c,s,f.status)&&(f.type==='all'||c.type===f.type)&&(['all','snoozed','dismissed','done'].includes(f.status)||f.status==='unread'&&!s.read||f.status==='read'&&s.read||f.status==='saved'&&s.bookmarked||f.status==='later'&&s.later)&&(!f.tag||Store.tags(c).includes(f.tag))&&(!q||[c.title,c.summary,c.source,s.note,...Store.tags(c)].join(' ').toLocaleLowerCase().includes(q));
   }),this.sort,Store.state.items,this.feedNow);
 }
 renderCurrent(animate=false){
   if(this.mode==='library'){this.grid.innerHTML=LibraryView.render();document.getElementById('page-title').textContent='组件实验室';}
   else if(this.mode==='sources'){this.grid.innerHTML=SourcesView.render();document.getElementById('page-title').textContent='研究资料';}
   else{
     const cards=this.filtered();this.grid.innerHTML=cards.length?cards.map(cardHTML).join(''):emptyState('这里暂时很安静','没有符合条件的卡片。换一个标签，或清除当前筛选。');
     document.getElementById('page-title').textContent='卡片信息流';
   }
   this.grid.querySelectorAll('img').forEach(img=>img.addEventListener('load',()=>this.layout.schedule(false),{once:true}));
   this.layout.layout(false);this.updateSelection();this.updateFilterIndicator();
   if(animate)[...this.grid.children].slice(0,12).forEach((n,i)=>MotionEngine.enter(n,Math.min(i*22,160)));
 }
 refreshCard(id){
   if(this.mode==='feed'){
     const before=[...this.grid.querySelectorAll('[data-card]')].map(n=>n.dataset.card).join(',');
     const after=this.filtered().map(c=>c.id).join(',');
     if(before!==after){this.withFeedAnchor(()=>{});return;}
   }
   const old=this.grid.querySelector(`[data-card="${CSS.escape(id)}"]`),c=Store.card(id);if(!old||!c)return;
   const focus=old.contains(document.activeElement)?document.activeElement.dataset.action:null;
   const temp=document.createElement('div');temp.innerHTML=cardHTML(c);const node=temp.firstElementChild;
   node.style.cssText=old.style.cssText;old.replaceWith(node);
   this.layout.schedule(true);this.updateSelection();
   if(focus)node.querySelector(`[data-action="${focus}"]`)?.focus({preventScroll:true});
   const digest=this.grid.querySelector('[data-card="digest-01"]');
   if(id!=='digest-01'&&digest){
     const temp2=document.createElement('div');temp2.innerHTML=cardHTML(Store.card('digest-01'));temp2.firstElementChild.style.cssText=digest.style.cssText;digest.replaceWith(temp2.firstElementChild);
   }
 }
 updateFilterIndicator(){const f=this.filter;document.getElementById('dock').classList.toggle('filter-active',f.type!=='all'||f.status!=='all'||!!f.tag||!!f.query);}
 updateSelection(){
   this.grid.querySelectorAll('[data-card]').forEach(n=>n.classList.toggle('is-selected',this.selected.has(n.dataset.card)));
   const bar=document.getElementById('selection-bar');bar.hidden=this.selected.size===0;
   bar.querySelector('.selection-count').textContent=`${this.selected.size} 张`;
 }
 navigate(hash){
   if(this.mode==='feed'||this.mode==='library'||this.mode==='sources')this.routeScroll[this.mode]=scrollY;
   history.pushState({glass:true,prev:location.hash},'',hash);this.route(true);
 }
 route(force=false){
   const hash=location.hash;
   // Back/forward emits both popstate and hashchange; handle one transition only.
   if(!force&&this.lastRouteHash===hash)return;
   this.lastRouteHash=hash;
   if(/^#(card|read)\//.test(hash)){
     const [,kind,id]=hash.match(/^#(card|read)\/(.+)$/)||[];
     if(!id||!Store.card(id)){history.replaceState({glass:true,prev:null},'','#feed');this.route();return;}
     this.showPreview(id,kind==='read');return;
   }
   const mode=hash==='#library'?'library':hash==='#sources'?'sources':'feed';
   this.closeNative();
   if(this.mode!==mode){this.mode=mode;this.baseMode=mode;this.renderCurrent(true);window.scrollTo(0,this.routeScroll[mode]||0);}
 }
 openModal(html,kind,origin=null){
   this.modalToken++;this.pauseMedia();
   if(!this.dialog.open){this.lastFocus=document.activeElement;this.lockedScroll=scrollY;document.documentElement.style.overflow='hidden';}
   const liveToast=document.getElementById('toast');if(liveToast&&this.dialog.contains(liveToast))document.body.appendChild(liveToast);
   this.modalKind=kind;this.dialog.className=kind==='reader'?'reader':kind==='preview'?'preview':'panel';
   this.dialog.innerHTML=html;
   if(!this.dialog.open)this.dialog.showModal();
   MotionEngine.openPanel(this.dialog,origin);
   const focus=kind==='filter'?this.dialog.querySelector('input'):this.dialog.querySelector('h1');
   if(focus){if(focus.tagName==='H1')focus.tabIndex=-1;focus.focus({preventScroll:true});}
 }
 closeNative(){
   if(!this.dialog.open)return;
   this.modalToken++;this.pauseMedia();
   const toast=document.getElementById('toast');if(this.dialog.contains(toast))document.body.appendChild(toast);
   this.dialog.close();document.documentElement.style.overflow='';this.modalKind='';this.panelReturn=null;
   const focus=this.lastFocus?.isConnected?this.lastFocus:this.grid.querySelector(`[data-card="${CSS.escape(this.currentId||'')}"]`);
   focus?.focus({preventScroll:true});
 }
 closeModal(){
   if(['preview','reader'].includes(this.modalKind)){
     if(history.state?.glass&&history.state.prev!==null)history.back();
     else{history.replaceState({glass:true,prev:null},'','#'+this.baseMode);this.closeNative();}
   }else if(this.panelReturn){
     const back=this.panelReturn;this.panelReturn=null;
     this.showPreview(back.id,back.reading);
   }else this.closeNative();
 }
 openPanel(kind,id=''){
   if(['preview','reader'].includes(this.modalKind))this.panelReturn={id:this.currentId,reading:this.modalKind==='reader'};
   this.editId=id;
   const html=kind==='filter'?Panels.filter(this):kind==='editor'?Panels.editor(this,id):Panels.settings(this);
   this.openModal(html,kind);
 }
 showPreview(id,reading=false){
   const c=Store.card(id);if(!c)return;
   const source=this.grid.querySelector(`[data-card="${CSS.escape(id)}"]`);
   const rect=source?.getBoundingClientRect();
   this.currentId=id;Store.patch(id,{seen:true});this.refreshCard(id);
   this.openModal(Panels.preview(this,c,reading),reading?'reader':'preview',rect);
   if(reading){
     this.lastActivity=Date.now();
     const scroll=this.dialog.querySelector('#reader-scroll');
     requestAnimationFrame(()=>{
       const saved=Store.item(id).progress;
       scroll.scrollTop=(scroll.scrollHeight-scroll.clientHeight)*(saved>=.98?0:saved);
       scroll.addEventListener('scroll',()=>{this.lastActivity=Date.now();this.updateReading(id,scroll);},{passive:true});
     });
   }else if(c.type==='media'){this.mediaIndex=Math.min(3,Math.floor(Store.item(id).progress*4));this.paintMedia();}
 }
 updateReading(id,scroll){
   const available=scroll.scrollHeight-scroll.clientHeight;
   const actual=available>2?Math.min(1,scroll.scrollTop/available):1;
   const p=Math.max(Store.item(id).progress,actual);
   Store.patch(id,{progress:p,read:p>=.985||Store.item(id).read});
   const percent=document.getElementById('reader-percent');if(percent)percent.textContent=Math.round(p*100)+'%';
   const rings=this.dialog.querySelectorAll('.progress-ring');rings.forEach(n=>{
     n.setAttribute('aria-valuenow',String(Math.round(p*100)));n.querySelector('circle:last-child').setAttribute('stroke-dashoffset',String(50.265*(1-p)));
   });
   this.refreshCard(id);
 }
 toast(text,undo=null){
   clearTimeout(this.toastTimer);this.undoAction=undo;
   const toast=document.getElementById('toast');
   (this.dialog.open?this.dialog:document.body).appendChild(toast);
   document.getElementById('toast-text').textContent=text;
   document.getElementById('toast-action').innerHTML=undo?button('undo','撤销操作','undo'):'';
   toast.hidden=false;MotionEngine.enter(toast);
   this.toastTimer=setTimeout(()=>{toast.hidden=true;},undo?5500:3200);
 }
 setFlag(id,key,value){
   const before=Store.item(id)[key];Store.patch(id,{[key]:value});this.refreshCard(id);
   this.toast(key==='bookmarked'?(value?'已收藏':'已取消收藏'):(value?'留到稍后':'已取消稍后读'),()=>{Store.patch(id,{[key]:before});this.refreshCard(id);});
   this.syncPreviewButtons(id);
 }
 syncPreviewButtons(id){
   const s=Store.item(id);
   this.dialog.querySelectorAll(`[data-id="${CSS.escape(id)}"][data-action="bookmark"]`).forEach(n=>{n.classList.toggle('active',s.bookmarked);n.setAttribute('aria-label',s.bookmarked?'取消收藏':'收藏');});
   this.dialog.querySelectorAll(`[data-id="${CSS.escape(id)}"][data-action="later"]`).forEach(n=>n.classList.toggle('active',s.later));
 }
 toggleTask(id,taskId){
   const c=Store.card(id),before=Store.tasks(c).filter(t=>t.done).map(t=>t.id);
   const after=before.includes(taskId)?before.filter(t=>t!==taskId):[...before,taskId];
   Store.patch(id,{taskDone:after});this.refreshCard(id);
   if(this.dialog.open&&this.currentId===id&&this.modalKind==='preview'){
     const holder=this.dialog.querySelector('.detail-task-list');if(holder)holder.innerHTML=Store.tasks(c).map(t=>checkItem(c,t)).join('');
   }
   if(after.length===c.tasks.length)this.toast('这件事，完成了',()=>{Store.patch(id,{taskDone:before});this.refreshCard(id);});
 }
 more(id){
   const c=this.grid.querySelector(`[data-card="${CSS.escape(id)}"]`);if(!c)return;
   const existing=c.querySelector('.card-more-menu');
   if(existing){existing.remove();c.classList.remove('tools-open');return;}
   this.grid.querySelectorAll('.card-more-menu').forEach(n=>n.remove());
   c.classList.add('tools-open');
   const menu=document.createElement('div');menu.className='card-more-menu glass';menu.setAttribute('role','group');menu.setAttribute('aria-label','更多卡片操作');
   menu.innerHTML=button('tag','编辑标签与备注','edit',id)+button('clock','切换稍后阅读','later',id)+button('check','切换已读状态','toggle-read',id)+button('select','选择这张卡片','select',id);
   c.appendChild(menu);MotionEngine.enter(menu);
 }
 refresh(){
   if(this.refreshBusy)return;
   this.refreshBusy=true;const btn=document.querySelector('[data-action="refresh"]');
   MotionEngine.animate(btn?.querySelector('svg'),[{transform:'rotate(0deg)'},{transform:'rotate(360deg)'}],{duration:600});
   setTimeout(()=>{
     this.refreshBusy=false;
     while(this.refreshIndex<FreshCards.length&&Store.card(FreshCards[this.refreshIndex].id))this.refreshIndex++;
     if(this.refreshIndex>=FreshCards.length){this.toast('已经是最新的演示内容');return;}
     const fresh=FreshCards[this.refreshIndex++];
     if(!Store.card(fresh.id)&&!this.pendingCards.some(c=>c.id===fresh.id))this.pendingCards.push({...fresh,time:Date.now()});
     this.paintPending();
     this.announce(`有${this.pendingCards.length}张新卡片，点击入口旁的数字查看。`);
   },650);
 }
 checkReminders(now=Date.now()){
   const next=Store.state.cards.filter(c=>FeedPolicy.eligible(c,Store.item(c.id),now)).map(c=>c.id);
   const added=next.some(id=>!this.pendingReminders.includes(id));
   this.pendingReminders=next;this.paintPending();
   if(added)this.announce(`有 ${next.length} 项提醒到期，点击玻璃入口旁的数字查看。`);
 }
 paintPending(){
   const count=this.pendingCards.length+this.pendingReminders.length,n=document.getElementById('new-count');
   const signature=this.pendingCards.map(c=>c.id).join(',')+'|'+this.pendingReminders.join(',');
   if(n.dataset.pending===signature)return;n.dataset.pending=signature;
   n.hidden=!count;n.innerHTML=icon(this.pendingReminders.length?'bell':'up',13)+count;
   n.setAttribute('aria-label',`查看 ${this.pendingCards.length} 张新卡片和 ${this.pendingReminders.length} 项到期提醒`);
 }
 withFeedAnchor(change){
   const nodes=[...this.grid.querySelectorAll('[data-card]')];
   const anchors=nodes.filter(n=>n.getBoundingClientRect().bottom>0).map(n=>({id:n.dataset.card,top:n.getBoundingClientRect().top}));
   const oldY=scrollY,focus=document.activeElement;
   const focusCard=focus?.closest('[data-card]')?.dataset.card,focusAction=focus?.dataset.action;
   change();
   this.renderCurrent(false);
   if(oldY>50){
     const anchor=anchors.find(a=>this.grid.querySelector(`[data-card="${CSS.escape(a.id)}"]`));
     if(anchor){const node=this.grid.querySelector(`[data-card="${CSS.escape(anchor.id)}"]`);window.scrollBy({top:node.getBoundingClientRect().top-anchor.top,behavior:'instant'});}
   }
   if(focusCard&&!this.dialog.open){
     const card=this.grid.querySelector(`[data-card="${CSS.escape(focusCard)}"]`);
     (card?.querySelector(`[data-action="${CSS.escape(focusAction||'')}"]`)||card||document.getElementById('orb')).focus({preventScroll:true});
   }
 }
 showNew(){
   if(this.dialog.open||this.drag.active)return;
   this.checkReminders();
   if(!this.pendingCards.length&&!this.pendingReminders.length)return;
   const reminderCount=this.pendingReminders.length;
   let count=0;
   this.withFeedAnchor(()=>{
     count=Store.insert(this.pendingCards);this.pendingCards=[];
     for(const id of this.pendingReminders){
       const c=Store.card(id);
       Store.patch(id,{snoozedUntil:0,lastReminderKey:FeedPolicy.key(c),lastNotifiedAt:Date.now()});
     }
     this.pendingReminders=[];this.feedNow=Date.now();
     this.mode='feed';this.baseMode='feed';history.replaceState({glass:true,prev:null},'','#feed');
   });
   this.paintPending();
   this.toast(`已加入 ${count} 张新卡片，更新 ${reminderCount} 项提醒${this.filter.status!=='all'||this.filter.type!=='all'||this.filter.tag||this.filter.query?' · 当前筛选保持不变':''}`);
 }
 changeReminder(id,action){
   const c=Store.card(id);if(!c||!FeedPolicy.supports(c))return;
   const item=Store.item(id),keys=['snoozedUntil','dismissed','reminderDone','lastReminderKey','lastNotifiedAt'];
   const before=Object.fromEntries(keys.map(k=>[k,item[k]]));
   const now=Date.now();
   const patch=action==='snooze'?{snoozedUntil:now+600000,dismissed:false,reminderDone:false}:
     action==='dismiss-reminder'?{dismissed:true,snoozedUntil:0}:
     action==='complete-reminder'?{reminderDone:true,snoozedUntil:0}:
     {snoozedUntil:0,dismissed:false,reminderDone:false,lastReminderKey:FeedPolicy.key(c),lastNotifiedAt:now};
   Store.patch(id,patch);this.selected.delete(id);
   // End the active preview before hiding its source card.
   if(this.dialog.open){history.replaceState({glass:true,prev:null},'','#'+this.baseMode);this.closeNative();}
   this.withFeedAnchor(()=>{});this.checkReminders();
   const label={'snooze':'已延后十分钟','dismiss-reminder':'已忽略此提醒','complete-reminder':'提醒已完成','restore-reminder':'已恢复提醒'}[action];
   this.toast(label+(Store.state.storageAvailable?'':' · 本次有效，浏览器无法保存'),()=>{
     Store.patch(id,before);this.withFeedAnchor(()=>{});this.checkReminders();
   });
 }
 attach(ids){
   ids.filter(id=>Store.card(id)).forEach(id=>{if(!this.contexts.includes(id))this.contexts.push(id);});
   if(this.dialog.open){
     this.closeNative();
     if(/^#(card|read)\//.test(location.hash))history.replaceState({glass:true,prev:null},'','#'+this.baseMode);
   }
   this.openAI();this.selected.clear();this.updateSelection();
   this.announce(`已将${ids.length}张卡片加入 AI 上下文，尚未发送。`);
 }
 openAI(){
   const panel=document.getElementById('ai-panel'),wasHidden=panel.hidden;panel.hidden=false;this.paintAI();
   if(wasHidden)MotionEngine.enter(panel);
   requestAnimationFrame(()=>document.getElementById('ai-input').focus({preventScroll:true}));
   this.hideDock();
 }
 closeAI(){document.getElementById('ai-panel').hidden=true;document.getElementById('orb').focus({preventScroll:true});}
 paintAI(){
   document.getElementById('ai-contexts').innerHTML=AIView.contexts(this.contexts);
   document.getElementById('ai-empty').hidden=this.contexts.length>0||this.messages.length>0;
   const messages=document.getElementById('ai-messages');
   messages.innerHTML=this.messages.map(m=>`<div class="message ${m.kind}">${m.kind==='demo'?'<span class="message-label">本地演示回复</span>':''}${esc(m.text)}</div>`).join('');
   messages.scrollTop=messages.scrollHeight;
   document.querySelector('[data-action="ai-send"]').disabled=this.aiBusy;
 }
 async sendAI(){
   const field=document.getElementById('ai-input'),q=field.value.trim();if(!q||this.aiBusy)return;
   this.aiBusy=true;this.messages.push({kind:'user',text:q});field.value='';this.paintAI();
   const version=this.aiVersion||0;
   const response=await DemoAI.respond({question:q,cards:this.contexts.map(id=>Store.card(id)).filter(Boolean)});
   if((this.aiVersion||0)!==version){this.aiBusy=false;return;}
   this.messages.push({kind:'demo',text:response});this.aiBusy=false;this.paintAI();
 }
 drop(ids,target){
   if(target==='ai'){this.attach(ids);return;}
   if(target==='tag'){
     this.bulkEditIds=ids.slice();this.openPanel('editor',ids[0]);return;
   }
   const key=target==='bookmark'?'bookmarked':'later',old=ids.map(id=>[id,Store.item(id)[key]]);
   ids.forEach(id=>{Store.patch(id,{[key]:true});this.refreshCard(id);});
   this.toast(target==='bookmark'?`已收藏 ${ids.length} 张卡片`:`${ids.length} 张卡片留到稍后`,()=>old.forEach(([id,v])=>{Store.patch(id,{[key]:v});this.refreshCard(id);}));
 }
 paintMedia(){
   const c=Store.card(this.currentId),el=document.getElementById('media-slide');if(!el||!c)return;
   const labels=['浏览','提起','靠近','松手'];
   el.innerHTML=`${icon(['grid','grip','sparkles','check'][this.mediaIndex],32)}<b>${labels[this.mediaIndex]}</b><span>${esc(c.body[this.mediaIndex])}</span>`;
   document.getElementById('media-step').textContent=`${this.mediaIndex+1} / 4`;
   MotionEngine.enter(el);
 }
 pauseMedia(){clearInterval(this.mediaTimer);this.mediaTimer=null;const b=this.dialog?.querySelector('[data-action="media-play"]');if(b){b.innerHTML=icon('play');b.setAttribute('aria-label','播放演示片段');}}
 playMedia(){
   if(this.mediaTimer){this.pauseMedia();return;}
   if(this.mediaIndex===3)this.mediaIndex=0;
   this.paintMedia();const b=this.dialog.querySelector('[data-action="media-play"]');b.innerHTML=icon('pause');b.setAttribute('aria-label','暂停演示片段');
   this.mediaTimer=setInterval(()=>{
     if(document.hidden)return;
     if(this.mediaIndex<3){this.mediaIndex++;this.paintMedia();Store.patch(this.currentId,{progress:(this.mediaIndex+1)/4,read:this.mediaIndex===3});this.refreshCard(this.currentId);}
     else this.pauseMedia();
   },2500);
 }
 tick(){
   if(!document.hidden){
     this.checkReminders();
     const minute=Math.floor(Date.now()/60000);
     if(this.clockMinute!==minute){this.clockMinute=minute;
       this.grid.querySelectorAll('[data-card]').forEach(node=>{
         const c=Store.card(node.dataset.card);
         const label=node.querySelector(c?.type==='event'?'.event-meta span':'.reminder-row .eyebrow');
         if(label)label.textContent=c.type==='event'?eventRelative(c):FeedPolicy.label(c,Store.item(c.id),Date.now());
       });
     }
   }
   if(this.modalKind==='reader'&&this.dialog.open&&!document.hidden&&Date.now()-this.lastActivity<60000){
     Store.state.seconds++;
     document.querySelectorAll('[data-live-time]').forEach(n=>n.textContent=minutes(Store.state.seconds));
     if(Store.state.seconds%5===0)Store.save();
   }
 }
 download(name,text,type='text/plain'){
   const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 click(e){
   if(Date.now()<this.drag.suppressUntil)return;
   const el=e.target.closest?.('[data-action]');
   if(el){e.preventDefault();e.stopPropagation();this.action(el.dataset.action,el.dataset.id,el.dataset.extra,el,e);return;}
   const card=e.target.closest?.('[data-card]');
   if(card&&!e.target.closest('button,a,input,textarea')){this.navigate('#card/'+card.dataset.card);return;}
   if(!e.target.closest?.('#dock')&&!e.target.closest?.('.card-more-menu')){
     this.grid.querySelectorAll('.card-more-menu').forEach(n=>n.remove());
     this.grid.querySelectorAll('.tools-open').forEach(n=>n.classList.remove('tools-open'));
   }
 }
 action(name,id='',extra='',el=null,event=null){
   switch(name){
     case 'orb':{
       const touch=event?.pointerType==='touch'||event?.sourceCapabilities?.firesTouchEvents||matchMedia('(hover:none)').matches;
       if(touch&&!this.touchDockExpanded){this.touchDockExpanded=true;this.openDock();}else this.openAI();break;
     }
     case 'ai':this.openAI();break;
     case 'filter':this.openPanel('filter');break;
     case 'settings':this.openPanel('settings');break;
     case 'refresh':this.refresh();break;
     case 'show-new':this.showNew();break;
     case 'top':window.scrollTo({top:0,behavior:MotionEngine.reduced?'instant':'smooth'});break;
     case 'view-feed':case 'view-library':case 'view-sources':this.closeNative();this.navigate('#'+name.slice(5));break;
     case 'preview':this.navigate('#card/'+id);break;
     case 'reader':this.navigate('#read/'+id);break;
     case 'close':this.closeModal();break;
     case 'card-ai':this.attach([id]);break;
     case 'bookmark':this.setFlag(id,'bookmarked',!Store.item(id).bookmarked);break;
     case 'later':this.setFlag(id,'later',!Store.item(id).later);break;
     case 'task':this.toggleTask(id,extra);break;
     case 'edit':this.bulkEditIds=null;this.openPanel('editor',id);break;
     case 'card-more':this.more(id);break;
     case 'toggle-read':{
       const before={...Store.item(id)},read=!before.read;Store.patch(id,{read,seen:read,progress:read?1:0});this.refreshCard(id);
       this.toast(read?'已标记为已读':'已恢复为未读',()=>{Store.patch(id,before);this.refreshCard(id);});break;
     }
     case 'select':this.selected.has(id)?this.selected.delete(id):this.selected.add(id);this.updateSelection();break;
     case 'clear-selection':this.selected.clear();this.updateSelection();break;
     case 'selected-ai':this.attach([...this.selected]);break;
     case 'selected-bookmark':this.drop([...this.selected],'bookmark');this.selected.clear();this.updateSelection();break;
     case 'sort-feed':if(FeedPolicy.sorts.includes(extra)){this.sort=extra;this.feedNow=Date.now();Store.state.preferences.sort=extra;Store.save();this.repaintFilter();}break;
     case 'filter-type':this.filter.type=extra;this.repaintFilter();break;
     case 'filter-status':this.filter.status=extra;this.repaintFilter();break;
     case 'filter-tag':this.filter.tag=this.filter.tag===extra?'':extra;this.repaintFilter();break;
     case 'clear-filter':this.filter={type:'all',status:'all',tag:'',query:''};if(this.modalKind==='filter')this.repaintFilter();else this.renderCurrent(true);break;
     case 'apply-filter':this.closeNative();this.mode='feed';this.baseMode='feed';history.replaceState({glass:true,prev:null},'','#feed');this.renderCurrent(true);window.scrollTo(0,0);break;
     case 'editor-tag':this.editTags.has(extra)?this.editTags.delete(extra):this.editTags.add(extra);el.classList.toggle('active',this.editTags.has(extra));el.setAttribute('aria-pressed',this.editTags.has(extra));break;
     case 'add-tag':{
       const field=document.getElementById('tag-new'),value=field.value.trim().slice(0,30);if(!value)return;
       if(this.editTags.size>=20){this.toast('最多保留 20 个标签');return;}
       this.editTags.add(value);const tags=document.getElementById('editor-tags');
       const b=[...tags.querySelectorAll('button')].find(n=>n.dataset.extra===value);
       if(b){b.classList.add('active');b.setAttribute('aria-pressed','true');}else tags.insertAdjacentHTML('beforeend',tagChip(value,true,'editor-tag'));
       field.value='';break;
     }
     case 'save-note':{
       const note=document.getElementById('note-editor').value.slice(0,4000);
       const ids=this.bulkEditIds||[id];
       ids.forEach((cardId,i)=>{Store.patch(cardId,{tags:[...this.editTags],tagsEdited:true,...(i===0?{note}:{})});this.refreshCard(cardId);});
       this.bulkEditIds=null;this.closeModal();this.toast(Store.state.storageAvailable?'标签与备注已保存':'本次已保存；当前环境不能持久存储');break;
     }
     case 'toggle-transparency':Store.state.preferences.reduceTransparency=!Store.state.preferences.reduceTransparency;Store.save();document.body.classList.toggle('opaque',Store.state.preferences.reduceTransparency);el.setAttribute('aria-checked',Store.state.preferences.reduceTransparency);break;
     case 'undo':if(this.undoAction){const fn=this.undoAction;this.undoAction=null;fn();this.toast('已撤销');}break;
     case 'ai-close':this.closeAI();break;
     case 'ai-clear':this.contexts=[];this.messages=[];this.aiVersion=(this.aiVersion||0)+1;this.aiBusy=false;this.paintAI();break;
     case 'ai-remove':this.contexts=this.contexts.filter(x=>x!==id);this.paintAI();break;
     case 'ai-send':this.sendAI();break;
     case 'external':{const url=Store.card(id)?.url;if(url&&url.startsWith('https://'))window.open(url,'_blank','noopener,noreferrer');break;}
     case 'download-calendar':{
       const c=Store.card(id),date=x=>new Date(x).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
       this.download('quiet-glass-demo.ics',`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Quiet Glass//Demo//ZH\r\nBEGIN:VEVENT\r\nUID:${c.id}@quiet-glass.demo\r\nDTSTAMP:${date(Date.now())}\r\nDTSTART:${date(c.start)}\r\nDTEND:${date(c.end)}\r\nSUMMARY:演示-${c.title}\r\nDESCRIPTION:演示日程，不包含真实会议链接。\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`,'text/calendar');this.toast('已生成演示日程文件');break;
     }
     case 'download-attachment':{
       const c=Store.card(id);
       if(c.attachment.endsWith('.csv'))this.download('demo-analysis.csv','\ufeff方案,演示评价\n常驻工具,干扰较多\n按需显现,保留内容重点\n仅手势,需要替代入口\n','text/csv');
       else this.download(c.attachment,'方案对比 · 演示附件\n\n方向一：常驻导航。容易发现功能，但会占据阅读空间。\n方向二：按需显现。内容优先，操作在需要时出现。\n方向三：仅靠手势。视觉最干净，但需要提供等价的点击入口。\n\n这是本地交互演示内容，不是来自真实邮箱的文件。');
       this.toast('已生成演示附件');break;
     }
     case 'snooze':case 'dismiss-reminder':case 'complete-reminder':case 'restore-reminder':this.changeReminder(id,name);break;
     case 'media-play':this.playMedia();break;
     case 'media-next':this.pauseMedia();this.mediaIndex=Math.min(3,this.mediaIndex+1);this.paintMedia();break;
     case 'media-prev':this.pauseMedia();this.mediaIndex=Math.max(0,this.mediaIndex-1);this.paintMedia();break;
     case 'lab-icon':MotionEngine.press(el);if(extra==='refresh')MotionEngine.animate(el.querySelector('svg'),[{transform:'rotate(0)'},{transform:'rotate(360deg)'}],{duration:550});else el.classList.toggle('active');break;
     case 'lab-tag':el.classList.toggle('active');el.setAttribute('aria-pressed',el.classList.contains('active'));break;
     case 'lab-motion':{
       const n=document.getElementById('motion-cube');
       if(extra==='enter')MotionEngine.enter(n);
       else if(extra==='lift')MotionEngine.animate(n,[{transform:'translateY(0)'},{transform:'translateY(-17px) scale(1.06)',offset:.5},{transform:'translateY(0)'}],{duration:520});
       else MotionEngine.animate(n,[{transform:'scale(1)'},{transform:'scale(.82)',offset:.25},{transform:'scale(1.06)',offset:.7},{transform:'scale(1)'}],{duration:450});break;
     }
   }
 }
 repaintFilter(){
   const active=document.activeElement,searchFocused=active?.id==='filter-search',pos=active?.selectionStart;
   const action=active?.dataset.action,extra=active?.dataset.extra;
   const liveToast=document.getElementById('toast');if(liveToast&&this.dialog.contains(liveToast))document.body.appendChild(liveToast);
   this.dialog.innerHTML=Panels.filter(this);
   if(searchFocused){const n=document.getElementById('filter-search');n.focus();try{n.setSelectionRange(pos,pos);}catch{}}
   if(!searchFocused&&action){[...this.dialog.querySelectorAll('[data-action]')].find(n=>n.dataset.action===action&&n.dataset.extra===extra)?.focus({preventScroll:true});}
   if(this.mode==='feed')this.renderCurrent(false);this.updateFilterIndicator();
 }
 input(e){
   const name=e.target.dataset.input;
   if(name==='search'){
     this.filter.query=e.target.value;
     document.getElementById('filter-result').textContent=`${this.filtered().length} 张卡片`;
     clearTimeout(this.searchTimer);this.searchTimer=setTimeout(()=>{if(this.mode==='feed')this.renderCurrent(false);this.updateFilterIndicator();},140);
   }else if(name==='lab-ring'){
     const value=Number(e.target.value)/100;
     document.getElementById('lab-rings').innerHTML=ring(value,24)+ring(value,36)+ring(value,52)+ring(value,22);
   }
 }
 key(e){
   if(e.key==='Tab'&&this.dialog.open){
     const focusable=[...this.dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter(n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden');
     const first=focusable[0],last=focusable[focusable.length-1],active=document.activeElement;
     if(first&&last){
       if(e.shiftKey&&(active===first||!focusable.includes(active))){e.preventDefault();last.focus();return;}
       if(!e.shiftKey&&active===last){e.preventDefault();first.focus();return;}
     }
   }
   if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();this.openPanel('filter');return;}
   if(e.isComposing)return;
   if(e.target.id==='ai-input'&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();this.sendAI();return;}
   if(e.target.id==='tag-new'&&e.key==='Enter'){e.preventDefault();this.action('add-tag',this.editId);return;}
   if(e.key==='Escape'&&!this.dialog.open){document.getElementById('ai-panel').hidden=true;this.hideDock();this.grid.querySelectorAll('.card-more-menu').forEach(n=>n.remove());return;}
   if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-card]')){e.preventDefault();this.navigate('#card/'+e.target.dataset.card);}
 }
}
