class AppController{
 constructor(){
   this.mode=window.__PAGE__||'feed';this.baseMode=this.mode;
   this.filter={type:'all',status:'all',tag:'',query:''};this.selected=new Set();
   this.pendingCards=[];this.refreshBusy=false;this.openStacks=new Set();
   this.modalKind='';this.currentId='';this.panelReturn=null;this.lastFocus=null;
   this.mediaIndex=0;this.mediaTimer=null;this.podcastTimer=null;this.lastActivity=Date.now();
   this.modalToken=0;this.routeScroll={};this.photoIndex=0;
   this.sort='priority';this.feedNow=Date.now();this.pendingReminders=[];
   this.welcomePicked=new Set();this.importing=null;this.importPicked=new Set();this.importRange='30d';
   this.settingsGroup='desk';this.editingId='';this.loadedImages=new Set();
 }
 init(){
   if(window.__QG_RUNTIME__)Store.key='quiet-glass-live-v1';
   Store.load();
   if(window.__QG_RUNTIME__)Store.state.cards=[];
   this.sort=Store.pref('sort');
   document.body.innerHTML=`<main aria-label="Sill 桌面"><h1 class="sr-only" id="page-title">桌面</h1><div class="feed-grid" id="feed-grid"></div><div class="feed-end" aria-hidden="true"></div></main>
   <div id="dock"><button type="button" id="offline" class="glass" data-action="retry" hidden>未连接</button><button type="button" id="new-count" class="glass" data-action="show-new" hidden aria-label="查看新内容"></button>
   <div class="orb-wrap"><div class="dock-tools" role="group" aria-label="全局工具">${button('filter','筛选与搜索','filter')}${button('plus','记一笔','capture')}${button('refresh','刷新卡片','refresh')}${button('up','返回顶部','top')}${button('gear','设置','settings')}</div>
   <button type="button" class="icon-button glass" id="orb" data-action="orb" data-drop="bookmark" aria-label="全局工具" aria-expanded="false">${icon('grid',22)}</button><svg class="orb-arc" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" pathLength="100"/></svg></div></div>
   <div id="selection-bar" class="glass" hidden role="toolbar" aria-label="多选"><span class="selection-count num"></span>${button('bookmark','收藏选中的卡片','selected-bookmark')}${button('glasses','稍后读选中的卡片','selected-later')}${button('tag','给选中的卡片加标签','selected-tag')}<span class="toolbar-sep" aria-hidden="true"></span>${button('x','取消选择','clear-selection')}</div>
   <div id="drop-targets" class="drop-targets" hidden><div class="drop-target glass" data-drop="bookmark" aria-label="收藏接收区">${icon('bookmark',22)}</div><div class="drop-target glass" data-drop="later" aria-label="稍后阅读接收区">${icon('glasses',22)}</div><div class="drop-target glass" data-drop="tag" aria-label="标签接收区">${icon('tag',22)}</div></div>
   <div id="import-rings" class="import-rings glass" hidden aria-hidden="true"></div><div class="drop-hint" id="drop-hint" hidden><span>放下即导入</span><small>RSS、书签、Markdown、日历、链接</small></div>
   <input type="file" id="file-input" hidden multiple accept=".opml,.xml,.csv,.html,.htm,.md,.markdown,.txt,.ics">
   <dialog id="modal" aria-labelledby="modal-title"></dialog><div id="toast" class="glass" role="status" aria-live="polite" hidden><span id="toast-text"></span><span id="toast-action"></span></div><div class="sr-only" id="announcer" aria-live="polite"></div>`;
   this.grid=document.getElementById('feed-grid');this.dialog=document.getElementById('modal');
   this.applyPreferences();
   this.layout=new FeedLayout(this.grid);this.pageLimit=40;this.drag=new DragManager(this);this.gestures=new Gestures(this);
   document.addEventListener('click',e=>this.click(e));this.bindStacks();
   document.addEventListener('input',e=>this.input(e));
   document.addEventListener('keydown',e=>this.key(e));
   document.addEventListener('paste',e=>this.paste(e));
   ['pointerdown','keydown','wheel','touchstart'].forEach(type=>document.addEventListener(type,()=>this.lastActivity=Date.now(),{passive:true}));
   document.addEventListener('focusin',e=>{
     const menu=this.grid.querySelector('.card-more-menu');
     if(menu&&!menu.contains(e.target)&&!e.target.closest?.('[data-action="card-more"]'))this.closeMore();
     if(this.editingId&&!e.target.closest?.('.is-editing'))this.finishInlineEdit();
   });
   this.dialog.addEventListener('cancel',e=>{e.preventDefault();this.closeModal();});
   this.dialog.addEventListener('click',e=>{
     if(e.target!==this.dialog)return;
     if(this.modalKind==='lightbox')return;
     // A click on the dim area, outside the sheet and its toolbar, closes the overlay.
     const inside=[...this.dialog.children].some(n=>{const r=n.getBoundingClientRect();return e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;});
     if(!inside)this.closeModal();
   });
   const dock=document.getElementById('dock');
   dock.addEventListener('pointerenter',e=>{if(e.pointerType!=='touch')this.openDock();});
   dock.addEventListener('pointerleave',e=>{if(e.pointerType!=='touch')this.hideDock();});
   dock.addEventListener('focusin',e=>{if(e.target.closest('.orb-wrap'))this.openDock();});
   dock.addEventListener('focusout',()=>setTimeout(()=>{if(!dock.contains(document.activeElement))this.hideDock();},0));
   window.addEventListener('popstate',()=>this.route());
   window.addEventListener('hashchange',()=>this.route());
   document.addEventListener('visibilitychange',()=>{if(document.hidden){Store.save();this.pauseMedia();}else this.checkReminders();});
   window.addEventListener('pagehide',()=>Store.save());
   let lastY=scrollY;
   window.addEventListener('scroll',()=>{
     // Scrolling down, the entrance steps back; it returns when you stop or scroll up.
     const down=scrollY>lastY+2;lastY=scrollY;dock.classList.toggle('is-quiet',down&&scrollY>120&&!dock.classList.contains('is-open'));
     clearTimeout(this.quietTimer);this.quietTimer=setTimeout(()=>dock.classList.remove('is-quiet'),900);
     this.paintPending();
     if(this.hasMore&&!this.dialog.open&&scrollY+innerHeight*2>document.documentElement.scrollHeight){this.pageLimit+=40;this.renderCurrent(false);}
   },{passive:true});
   this.bindFileDrop();
   document.getElementById('file-input').addEventListener('change',e=>{const files=[...e.target.files];e.target.value='';this.importFiles(files);});
   this.themeQuery=matchMedia('(prefers-color-scheme: dark)');this.themeQuery.addEventListener?.('change',()=>this.applyPreferences());
   this.readTicker=setInterval(()=>this.tick(),1000);
   if(!location.hash)history.replaceState({glass:true,prev:null},'','#'+this.mode);
   this.renderCurrent(true);this.route();this.checkReminders();
   window.__app=this;window.__store=Store; // Deliberate test hooks, no network credentials or private data.
 }
 applyPreferences(){
   const theme=Store.pref('theme'),dark=theme==='dark'||(theme==='system'&&this.themeQuery?.matches);
   document.documentElement.dataset.theme=dark?'dark':'light';
   document.body.classList.toggle('opaque',!!Store.pref('reduceTransparency'));
   document.body.classList.toggle('reduce-motion',!!Store.pref('reduceMotion'));
   document.body.dataset.density=Store.pref('density');
   this.sort=Store.pref('floatTimely')?Store.pref('sort'):'time';
 }
 announce(text){document.getElementById('announcer').textContent=text;}
 openDock(){clearTimeout(this.dockTimer);document.getElementById('dock').classList.add('is-open');document.getElementById('orb').setAttribute('aria-expanded','true');}
 hideDock(){clearTimeout(this.dockTimer);this.dockTimer=setTimeout(()=>{document.getElementById('dock').classList.remove('is-open');document.getElementById('orb').setAttribute('aria-expanded','false');},420);}
 /* ——— What is on the desk ——— */
 shelfOf(c){return FeedPolicy.shelf(c,Store.item(c.id),this.feedNow,Store.pref('archiveAfter'));}
 shelved(which){return Store.state.cards.filter(c=>this.shelfOf(c)===which&&FeedPolicy.visible(c,Store.item(c.id)));}
 matches(c,q){const s=Store.item(c.id);return [c.title,c.summary,c.source,s.note,...(c.body||[]),...Store.tags(c)].join(' ').toLocaleLowerCase().includes(q.toLocaleLowerCase());}
 searchAll(q){
   const all=Store.state.cards.filter(c=>this.matches(c,q)&&!Store.item(c.id).dismissed);
   return {desk:all.filter(c=>this.shelfOf(c)==='desk'),shelved:all.filter(c=>this.shelfOf(c)!=='desk')};
 }
 filtering(){const f=this.filter;return f.type!=='all'||f.status!=='all'||!!f.tag||!!f.query;}
 filtered(){
   const f=this.filter,q=f.query.trim();
   const statusOnly=['snoozed','dismissed','done'].includes(f.status);
   return FeedPolicy.sort(Store.state.cards.filter(c=>{
     const s=Store.item(c.id);
     // Searching reaches every shelf; browsing shows only the desk.
     if(!q&&!statusOnly&&this.shelfOf(c)!=='desk')return false;
     return FeedPolicy.visible(c,s,f.status)&&(f.type==='all'||c.type===f.type)&&(statusOnly||f.status==='all'||f.status==='unread'&&!s.read||f.status==='read'&&s.read||f.status==='saved'&&s.bookmarked||f.status==='later'&&s.later)&&(!f.tag||Store.tags(c).includes(f.tag))&&(!q||this.matches(c,q));
   }),this.sort,Store.state.items,this.feedNow);
 }
 deskHTML(){
   if(!Store.state.cards.length&&!window.__QG_RUNTIME__)return welcomeHTML();
   const cards=this.filtered();
   if(!cards.length)return this.filtering()?emptyState(this.filter.query?`没有找到「${this.filter.query}」`:'没有符合条件的卡片','',`<button type="button" class="text-link" data-action="clear-filter">清除筛选</button>`):emptyState('桌面上都处理完了')+shelfHTML(this.shelved('read').length,this.shelved('stale').length);
   const stacks=Store.pref('stack')&&!this.filtering()?FeedPolicy.stacks(cards.filter(c=>Store.source(`src-${c.kind}`)?.stack!==false),Store.state.items):new Map();
   const inStack=new Map();for(const [key,list] of stacks)for(const c of list)inStack.set(c.id,key);
   const html=[],done=new Set();
   for(const c of cards){
     const key=inStack.get(c.id);
     if(!key){html.push(cardHTML(c,{now:this.feedNow}));continue;}
     if(done.has(key))continue;done.add(key);
     html.push(this.openStacks.has(key)?stackOpenHTML(key,stacks.get(key)):stackHTML(key,stacks.get(key)));
   }
   // A large desk is laid out a screen ahead of the reader, never all at once.
   this.hasMore=html.length>this.pageLimit;
   if(this.hasMore)html.length=this.pageLimit;
   else if(!this.filtering())html.push(shelfHTML(this.shelved('read').length,this.shelved('stale').length));
   document.body.classList.toggle('feed-more',this.hasMore);
   return html.join('');
 }
 renderCurrent(animate=false){
   this.closeMore();
   // An anchored reflow may temporarily need extra room below the final row.
   this.grid.style.removeProperty('min-height');
   document.body.dataset.view=this.mode;
   this.grid.innerHTML=this.deskHTML();
   this.revealImages(this.grid);
   this.layout.layout(false);this.restoreStacks();this.updateSelection();this.updateFilterIndicator();
   // Only the first screen enters; cards below the fold are simply there when scrolled to.
   if(animate)[...this.grid.children].filter(n=>n.getBoundingClientRect().top<innerHeight).forEach((n,i)=>MotionEngine.enter(n,Math.min(i*60,240)));
 }
 // Covers sharpen once decoded; a cover seen before appears at once, without replaying the blur.
 revealImages(root){
   root.querySelectorAll('img.card-image').forEach(img=>{
     if(this.loadedImages.has(img.src)){img.classList.add('is-loaded');return;}
     const done=()=>{this.loadedImages.add(img.src);img.classList.add('is-loaded');this.layout.schedule(false);};
     if(img.complete&&img.naturalWidth)requestAnimationFrame(done);else img.addEventListener('load',done,{once:true});
   });
 }
 refreshCard(id){
   if(this.mode==='feed'){
     const before=[...this.grid.querySelectorAll('[data-card],[data-stack]')].map(n=>n.dataset.card||n.dataset.stack).join(',');
     const probe=document.createElement('div');probe.innerHTML=this.deskHTML();
     const after=[...probe.querySelectorAll('[data-card],[data-stack]')].map(n=>n.dataset.card||n.dataset.stack).join(',');
     if(before!==after){this.withFeedAnchor(()=>{});return;}
   }
   const old=this.grid.querySelector(`[data-card="${CSS.escape(id)}"]`),c=Store.card(id);if(!old||!c)return;
   const active=old.contains(document.activeElement)?document.activeElement:null;
   const focus=active?.dataset.action,focusExtra=active?.dataset.extra,focusId=active?.dataset.id;
   const focusTitle=active?.classList.contains('card-title-button');
   const temp=document.createElement('div');temp.innerHTML=cardHTML(c,{compact:old.classList.contains('is-compact'),now:this.feedNow});const node=temp.firstElementChild;
   // Start from the old classes so a read/unread change settles as a color transition.
   const nextClass=node.className;node.className=old.className;
   node.style.cssText=old.style.cssText;old.replaceWith(node);this.revealImages(node);
   void node.offsetWidth;node.className=nextClass;
   this.layout.schedule(true);this.updateSelection();
   if(active){
     const target=focusTitle?node.querySelector('.card-title-button'):[...node.querySelectorAll('[data-action]')].find(n=>n.dataset.action===focus&&n.dataset.extra===focusExtra&&n.dataset.id===focusId);
     node.focus({preventScroll:true});
     (target||node.querySelector('.card-title-button')||node).focus({preventScroll:true});
   }
   const digest=this.grid.querySelector('.type-digest[data-card]');
   if(digest&&digest.dataset.card!==id){const d=Store.card(digest.dataset.card);if(d){const t=document.createElement('div');t.innerHTML=cardHTML(d,{now:this.feedNow});t.firstElementChild.style.cssText=digest.style.cssText;digest.replaceWith(t.firstElementChild);}}
 }
 updateFilterIndicator(){document.getElementById('dock').classList.toggle('filter-active',this.filtering());}
 updateSelection(){
   this.grid.querySelectorAll('[data-card]').forEach(n=>n.classList.toggle('is-selected',this.selected.has(n.dataset.card)));
   const bar=document.getElementById('selection-bar');bar.hidden=this.selected.size===0;
   bar.querySelector('.selection-count').textContent=String(this.selected.size);
 }
 /* ——— Routes: #feed · #card/<id> · #read/<id> ——— */
 navigate(hash){
   this.routeScroll[this.mode]=scrollY;
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
     this.openCard(id,kind==='read');return;
   }
   if(['preview','reader','lightbox'].includes(this.modalKind))this.closeNative();
   if(this.mode!=='feed'){this.mode='feed';this.baseMode='feed';this.renderCurrent(true);window.scrollTo(0,this.routeScroll.feed||0);}
 }
 /* ——— Overlays ——— */
 openModal(html,kind,origin=null,shape=''){
   this.closeMore(true);this.modalToken++;this.pauseMedia();MotionEngine.cancelPanel(this.dialog);this.skipReturnMotion=false;
   this.sheetLeaving=false;this.dialog.style.removeProperty('--backdrop');this.dialog.style.translate='';
   if(!this.dialog.open){this.lastFocus=document.activeElement;this.lockedScroll=scrollY;document.documentElement.style.overflow='hidden';}
   const liveToast=document.getElementById('toast');if(liveToast&&this.dialog.contains(liveToast))document.body.appendChild(liveToast);
   this.modalKind=kind;
   this.dialog.className=shape||(['reader','preview','lightbox','search'].includes(kind)?kind:'panel');
   this.dialog.innerHTML=html;
   if(!this.dialog.open)this.dialog.showModal();
   if(kind==='search')MotionEngine.enter(this.dialog);else MotionEngine.openPanel(this.dialog,origin);
   const focus=this.dialog.querySelector(kind==='search'?'#filter-search':kind==='capture'?'#capture-text':kind==='editor'?'#tag-new':'#modal-title');
   if(focus){if(!/INPUT|TEXTAREA|BUTTON/.test(focus.tagName))focus.tabIndex=-1;focus.focus({preventScroll:true});}
 }
 closeNative(animate=true){
   if(!this.dialog.open)return;
   // A sheet already dragged off screen closes as it is: no return motion.
   if(this.skipReturnMotion){animate=false;this.skipReturnMotion=false;}
   // Phone sheet: it slides back down past the bottom edge while the dim fades, then the dialog closes.
   if(this.sheetLeaving)return;
   if(animate&&this.modalKind==='preview'&&MotionEngine.phoneSheet(this.dialog)&&!MotionEngine.reduced){
     const sheet=this.dialog.querySelector('.preview-sheet'),token=this.modalToken;
     this.sheetLeaving=true;sheet.classList.remove('is-drag');sheet.classList.add('is-off');sheet.style.translate='';
     this.dialog.querySelector(':scope > .float-bar')?.classList.add('is-hidden');this.dialog.style.setProperty('--backdrop','0');
     setTimeout(()=>{this.sheetLeaving=false;if(this.modalToken===token&&this.dialog.open){this.skipReturnMotion=true;this.closeNative();}},300);
     return;
   }
   this.modalToken++;this.pauseMedia();
   const toast=document.getElementById('toast');if(this.dialog.contains(toast))document.body.appendChild(toast);
   const source=this.grid.querySelector(`[data-card="${CSS.escape(this.currentId||'')}"]`);
   if(animate&&['preview','reader'].includes(this.modalKind))MotionEngine.closePanel(this.dialog,MotionEngine.capture(source),()=>MotionEngine.lift(null));
   else{MotionEngine.cancelPanel(this.dialog);MotionEngine.lift(null);}
   this.dialog.close();document.documentElement.style.overflow='';this.modalKind='';this.panelReturn=null;
   // Leftovers of a drag or swipe are cleared only now that nothing is on screen.
   this.dialog.style.removeProperty('--backdrop');this.dialog.style.transform='';this.dialog.style.translate='';this.dialog.classList.remove('is-drag');
   this.dialog.getAnimations({subtree:true}).forEach(a=>{if(a.effect?.pseudoElement==='::backdrop')a.cancel();});
   let focus=this.lastFocus?.isConnected&&this.lastFocus!==document.body?this.lastFocus:source?.querySelector('.card-title-button')||source;
   if(focus&&(!focus.getClientRects().length||getComputedStyle(focus).visibility==='hidden'))focus=focus.closest('[data-card]')?.querySelector('.card-title-button')||document.getElementById('orb');
   (focus||document.getElementById('orb')).focus({preventScroll:true});
 }
 // Leave a card for the desk directly, wherever it was opened from.
 closeToDesk(animate=true){
   history.replaceState({glass:true,prev:null},'','#'+this.baseMode);this.lastRouteHash='#'+this.baseMode;this.closeNative(animate);
 }
 closeModal(){
   if(['preview','reader','lightbox'].includes(this.modalKind)){
     if(history.state?.prev!==undefined&&/^#(card|read)\//.test(location.hash))history.back();
     else{history.replaceState({glass:true,prev:null},'','#'+this.baseMode);this.closeNative();}
   }else if(this.panelReturn){
     const back=this.panelReturn;this.panelReturn=null;back();
   }else this.closeNative();
 }
 openPanel(kind,id=''){
   if(['preview','reader'].includes(this.modalKind)){const cardId=this.currentId,reading=this.modalKind==='reader';this.panelReturn=()=>this.openCard(cardId,reading);}
   this.editId=id;
   if(kind==='editor')this.editTags=new Set(Store.tags(Store.card(id)));
   const narrow=['editor','why','capture','confirm','permission'].includes(kind),wide=kind==='settings';
   const html=kind==='search'?Panels.search(this):kind==='editor'?Panels.editor(this,id):kind==='why'?Panels.why(this,Store.card(id)):kind==='settings'?Panels.settings(this,this.settingsGroup):kind==='capture'?Panels.capture(this):kind==='sources'?Panels.sources():kind==='sources-add'?Panels.sourcesAdd():kind==='archive'?Panels.archive(this,id):kind==='welcome'?Panels.welcomePick(this):'';
   this.openModal(html,kind,null,kind==='search'?'search':`panel${narrow?' narrow':wide?' wide':''}`);
 }
 swapPanel(html,kind,shape='panel'){
   // Move inside the same sheet without re-animating from a card.
   const toast=document.getElementById('toast');if(this.dialog.contains(toast))document.body.appendChild(toast);
   this.modalKind=kind;this.dialog.className=shape;this.dialog.innerHTML=html;
   if(!this.dialog.open){this.lastFocus=document.activeElement;document.documentElement.style.overflow='hidden';this.dialog.showModal();}
   MotionEngine.enter(this.dialog.firstElementChild);
   const focus=this.dialog.querySelector('#modal-title');if(focus){focus.tabIndex=-1;focus.focus({preventScroll:true});}
 }
 openCard(id,reading=false){
   const c=Store.card(id);if(!c)return;
   const source=this.grid.querySelector(`[data-card="${CSS.escape(id)}"]`);
   // A quick note opens where it is: the card becomes its own editor.
   if(!reading&&c.type==='note'&&c.kind==='capture'&&c.form!=='quote'&&source&&!this.dialog.open){
     history.replaceState({glass:true,prev:null},'','#feed');this.lastRouteHash='#feed';this.startInlineEdit(id);return;
   }
   const sourceKind=Store.source(`src-${c.kind}`);
   if(!reading&&sourceKind?.open==='web'&&c.url){history.replaceState({glass:true,prev:null},'','#feed');this.lastRouteHash='#feed';this.openExternal(c);Store.patch(id,{seen:true,read:true});this.refreshCard(id);return;}
   const origin=MotionEngine.capture(this.dialog.open&&this.currentId===id&&['preview','reader'].includes(this.modalKind)?MotionEngine.surface(this.dialog):source);
   this.currentId=id;Store.patch(id,{seen:true});this.refreshCard(id);
   if(c.type==='photo'&&!reading){this.photoIndex=0;this.openModal(Panels.lightbox(c,0),'lightbox',null,'lightbox');Store.patch(id,{read:true,progress:1});this.refreshCard(id);return;}
   if(reading){
     // Bodies are on this device, so the page opens complete. The skeleton is kept for bodies fetched from a source.
     this.openModal(Panels.reader(this,c,false),'reader',origin);this.bindReader(id);this.gestures.bindPullDown();
     return;
   }
   this.openModal(Panels.preview(this,c),'preview',origin);this.bindPreview(id);this.gestures.bindPullDown();
   if(c.type==='media'&&c.media!=='podcast'){this.mediaIndex=Math.min((c.body.length||1)-1,Math.floor(Store.item(id).progress*(c.body.length||1)));this.paintMedia();}
   // Short content is read in the preview itself.
   if(['mail','note'].includes(c.type)&&!Store.item(id).read&&!(c.body?.length>2&&c.type==='note')){Store.patch(id,{read:true,progress:1});this.refreshCard(id);}
 }
 // The preview holds the full text, so reading it there counts the same as in full screen.
 bindPreview(id){
   const scroll=this.dialog.querySelector('.preview-sheet .sheet-scroll');
   if(!scroll||!this.dialog.querySelector('#reader-end'))return;
   requestAnimationFrame(()=>{
     // Short pieces fit on one screen: staying a moment is reading them.
     this.gestures.bindPush(id,scroll);
     if(scroll.scrollHeight-scroll.clientHeight<=2){const token=this.modalToken;setTimeout(()=>{if(this.modalToken===token&&this.modalKind==='preview')this.updateReading(id,scroll);},3000);return;}
     scroll.addEventListener('scroll',()=>{this.lastActivity=Date.now();this.updateReading(id,scroll);},{passive:true});
   });
 }
 bindReader(id){
   this.lastActivity=Date.now();
   const scroll=this.dialog.querySelector('#reader-scroll');if(!scroll)return;
   requestAnimationFrame(()=>{
     const saved=Store.item(id).progress;
     scroll.scrollTop=(scroll.scrollHeight-scroll.clientHeight)*(saved>=.98?0:saved);
     this.gestures.bindPush(id,scroll);
     scroll.addEventListener('scroll',()=>{this.lastActivity=Date.now();this.updateReading(id,scroll);},{passive:true});
   });
 }
 updateReading(id,scroll){
   const available=scroll.scrollHeight-scroll.clientHeight;
   const actual=available>2?Math.min(1,scroll.scrollTop/available):1;
   const p=Math.max(Store.item(id).progress,actual);
   Store.patch(id,{progress:p,read:p>=.985||Store.item(id).read});
   const bar=document.getElementById('reader-progress');if(bar)bar.style.width=Math.round(actual*100)+'%';
   document.getElementById('reader-end')?.classList.toggle('is-done',Store.item(id).read);
   this.dialog.querySelectorAll('.progress-ring').forEach(n=>{n.setAttribute('aria-valuenow',String(Math.round(p*100)));n.querySelector('circle:last-child').setAttribute('stroke-dashoffset',String(50.265*(1-p)));});
   this.refreshCard(id);
 }
 openExternal(c){if(c?.url&&/^https?:\/\//.test(c.url))window.open(c.url,'_blank','noopener,noreferrer');}
 toast(text,undo=null,actionLabel='撤销'){
   clearTimeout(this.toastTimer);this.undoAction=undo;
   const toast=document.getElementById('toast');
   (this.dialog.open?this.dialog:document.body).appendChild(toast);
   document.getElementById('toast-text').textContent=text;
   document.getElementById('toast-action').innerHTML=undo?`<button type="button" class="text-link" data-action="undo" aria-label="${actionLabel==='撤销'?'撤销操作':esc(actionLabel)}">${esc(actionLabel)}</button>`:'';
   toast.hidden=false;MotionEngine.enter(toast);
   this.toastTimer=setTimeout(()=>{toast.hidden=true;},undo?5500:3200);
 }
 setFlag(id,key,value){
   const before=Store.item(id)[key];Store.patch(id,{[key]:value});this.refreshCard(id);
   this.toast(key==='bookmarked'?(value?'已收藏':'已取消收藏'):(value?'已放进稍后读':'已移出稍后读'),()=>{Store.patch(id,{[key]:before});this.refreshCard(id);this.syncPreviewButtons(id);});
   this.syncPreviewButtons(id);
 }
 syncPreviewButtons(id){
   const s=Store.item(id);
   this.dialog.querySelectorAll(`[data-id="${CSS.escape(id)}"][data-action="bookmark"]`).forEach(n=>{n.classList.toggle('active',s.bookmarked);n.setAttribute('aria-label',s.bookmarked?'取消收藏':'收藏');});
   this.dialog.querySelectorAll(`[data-id="${CSS.escape(id)}"][data-action="later"]`).forEach(n=>{n.classList.toggle('active',s.later);n.setAttribute('aria-label',s.later?'取消稍后读':'稍后读');});
 }
 toggleTask(id,taskId){
   const c=Store.card(id),before=Store.tasks(c).filter(t=>t.done).map(t=>t.id);
   const after=before.includes(taskId)?before.filter(t=>t!==taskId):[...before,taskId];
   Store.patch(id,{taskDone:after});this.refreshCard(id);
   if(this.dialog.open&&this.currentId===id&&this.modalKind==='preview'){
     const holder=this.dialog.querySelector('.detail-task-list');
     if(holder)for(const t of Store.tasks(c)){const node=[...holder.querySelectorAll('[data-extra]')].find(n=>n.dataset.extra===t.id);if(node){node.classList.toggle('is-done',t.done);node.setAttribute('aria-checked',String(t.done));node.querySelector('.check-dot').outerHTML=checkMark(t.done);}}
   }
   if(after.length===c.tasks.length)this.toast('这件事，完成了',()=>{Store.patch(id,{taskDone:before});this.refreshCard(id);});
 }
 closeMore(restoreFocus=false){
   const menu=this.grid?.querySelector('.card-more-menu');
   if(!menu)return;
   const card=menu.closest('[data-card]'),trigger=card?.querySelector('[data-action="card-more"]');
   if(restoreFocus)trigger?.focus({preventScroll:true});
   // The menu leaves faster than it came, toward its anchor.
   menu.classList.replace('card-more-menu','card-more-leaving');menu.removeAttribute('id');menu.inert=true;
   const out=MotionEngine.animate(menu,[{opacity:1,transform:'none'},{opacity:0,transform:'translateY(-4px)'}],{duration:120,easing:'ease-in'});
   if(out)out.finished.then(()=>menu.remove(),()=>menu.remove());else menu.remove();
   card?.classList.remove('tools-open');
   trigger?.setAttribute('aria-expanded','false');trigger?.removeAttribute('aria-controls');
 }
 more(id){
   const c=this.grid.querySelector(`[data-card="${CSS.escape(id)}"]`),card=Store.card(id);if(!c||!card)return;
   if(c.querySelector('.card-more-menu')){this.closeMore(true);return;}
   this.closeMore();
   c.classList.add('tools-open');
   const menu=document.createElement('div');menu.className='card-more-menu glass';menu.setAttribute('role','group');menu.setAttribute('aria-label','更多卡片操作');
   menu.id='card-menu-'+id;
   const s=Store.item(id),items=[
     ...(card.why?[['info','为什么看到','why']]:[]),
     ['bookmark',s.bookmarked?'取消收藏':'收藏','bookmark'],['glasses',s.later?'移出稍后读':'稍后读','later'],['tag','标签与备注','edit'],
     ...(CardTypes[card.type].readable?[[s.read?'undo':'circle',s.read?'标为未读':'标为已读','toggle-read']]:[]),
     ['check-circle',this.selected.has(id)?'取消选择':'选择','select']];
   menu.innerHTML=items.map(([symbol,label,action])=>`<button type="button" class="card-menu-item" data-action="${action}" data-id="${esc(id)}"><span>${label}</span></button>`).join('');
   c.appendChild(menu);
   const trigger=c.querySelector('[data-action="card-more"]');trigger?.setAttribute('aria-expanded','true');trigger?.setAttribute('aria-controls',menu.id);
   MotionEngine.animate(menu,[{opacity:0,transform:'translateY(-4px)'},{opacity:1,transform:'none'}],{duration:180});menu.querySelector('button')?.focus({preventScroll:true});
 }
 /* ——— Refresh, new content, reminders ——— */
 async refresh(){
   if(this.refreshBusy)return;
   this.refreshBusy=true;
   // Background work shows as a thin arc on the orb; success needs no sentence.
   const dock=document.getElementById('dock'),started=Date.now();
   dock.classList.add('is-busy');
   try{
     if(window.__QG_LOCAL__)await LocalSync.refresh(true);
     else{
       // Demo: the next unseen sample arrives as new content; nothing jumps into the desk.
       const next=FreshCards.find(f=>!Store.card(f.id)&&!this.pendingCards.some(p=>p.id===f.id));
       if(next)this.pendingCards.push({...next,time:Date.now()});
       this.feedNow=Date.now();this.withFeedAnchor(()=>{});
       if(scrollY<40&&Store.pref('newHint')!=='off'&&!this.dialog.open&&this.pendingCards.length&&!this.pendingReminders.length)this.showNew(true);
     }
     this.paintPending();this.announce('卡片已刷新');
   }catch(error){this.setOffline(true);this.toast('无法刷新：'+error.message);}
   finally{
     this.refreshBusy=false;
     setTimeout(()=>dock.classList.remove('is-busy'),Math.max(0,600-(Date.now()-started)));
   }
 }
 setOffline(on){const n=document.getElementById('offline');n.hidden=!on;n.classList.remove('is-retrying');}
 checkReminders(now=Date.now()){
   const next=Store.state.cards.filter(c=>FeedPolicy.eligible(c,Store.item(c.id),now)).map(c=>c.id);
   const added=next.some(id=>!this.pendingReminders.includes(id));
   this.pendingReminders=next;this.paintPending();
   if(added)this.announce(`有 ${next.length} 项提醒到期，点玻璃入口旁的提示查看。`);
 }
 paintPending(){
   const count=this.pendingCards.length+this.pendingReminders.length,n=document.getElementById('new-count');
   const hide=!count||(Store.pref('newHint')==='off'&&!this.pendingReminders.length);
   const signature=`${count}|${this.pendingReminders.length}|${hide}`;
   if(n.dataset.pending===signature)return;n.dataset.pending=signature;
   n.hidden=hide;n.innerHTML=this.pendingReminders.length?`${icon('bell',14)}<span class="num">${count}</span> 项到点`:`${icon('up',14)}<span class="num">${count}</span> 条新内容`;
   n.setAttribute('aria-label',`查看 ${this.pendingCards.length} 条新内容和 ${this.pendingReminders.length} 项到期提醒`);
 }
 withFeedAnchor(change,animate=false){
   const nodes=[...this.grid.querySelectorAll('[data-card]')];
   const positions=animate?new Map(nodes.map(n=>[n.dataset.card,n.getBoundingClientRect()])):null;
   const anchors=nodes.filter(n=>n.getBoundingClientRect().bottom>0).map(n=>({id:n.dataset.card,top:n.getBoundingClientRect().top}));
   const oldY=scrollY,focus=document.activeElement;
   const focusCard=focus?.closest('[data-card]')?.dataset.card,focusAction=focus?.dataset.action,focusExtra=focus?.dataset.extra,focusId=focus?.dataset.id;
   change();
   this.renderCurrent(false);
   if(oldY>0){
     const anchor=anchors.find(a=>this.grid.querySelector(`[data-card="${CSS.escape(a.id)}"]`));
     if(anchor){
       const node=this.grid.querySelector(`[data-card="${CSS.escape(anchor.id)}"]`);
       const targetY=scrollY+node.getBoundingClientRect().top-anchor.top;
       const scroller=document.scrollingElement;
       // Masonry can move this card further than the whole feed grows. Near the bottom,
       // reserve the missing scroll range before restoring it so the reading point stays.
       const missing=Math.ceil(targetY+scroller.clientHeight-scroller.scrollHeight);
       if(missing>0)this.grid.style.minHeight=Math.ceil(this.grid.getBoundingClientRect().height+missing)+'px';
       window.scrollTo({top:targetY,behavior:'instant'});
     }
   }
   if(focusCard&&!this.dialog.open){
     const card=this.grid.querySelector(`[data-card="${CSS.escape(focusCard)}"]`);
     const target=card&&[...card.querySelectorAll('[data-action]')].find(n=>n.dataset.action===focusAction&&n.dataset.extra===focusExtra&&n.dataset.id===focusId);
     card?.focus({preventScroll:true});
     (target||card?.querySelector('.card-title-button')||card||document.getElementById('orb')).focus({preventScroll:true});
   }
   if(positions)this.grid.querySelectorAll('[data-card]').forEach(node=>{
     const rect=positions.get(node.dataset.card);
     if(rect)MotionEngine.flip(node,rect);else MotionEngine.drop(node);
   });
 }
 showNew(quiet=false){
   if(this.dialog.open||this.drag.active)return;
   this.checkReminders();
   if(!this.pendingCards.length&&!this.pendingReminders.length)return;
   const reminderCount=this.pendingReminders.length;let count=0;
   window.scrollTo({top:0,behavior:'instant'});
   this.withFeedAnchor(()=>{
     count=Store.insert(this.pendingCards);this.pendingCards=[];
     for(const id of this.pendingReminders){const c=Store.card(id);Store.patch(id,{snoozedUntil:0,lastReminderKey:FeedPolicy.key(c),lastNotifiedAt:Date.now()});}
     this.pendingReminders=[];this.feedNow=Date.now();
     this.mode='feed';this.baseMode='feed';history.replaceState({glass:true,prev:null},'','#feed');
   },true);
   this.paintPending();
   if(!quiet)this.announce(`加入 ${count} 张新卡片，${reminderCount} 项提醒回到桌面`);
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
   if(this.dialog.open){history.replaceState({glass:true,prev:null},'','#'+this.baseMode);this.closeNative(false);}
   this.withFeedAnchor(()=>{},true);this.checkReminders();
   const card=this.grid.querySelector(`[data-card="${CSS.escape(id)}"]`);
   (card?.querySelector('.card-title-button')||this.grid.querySelector('.card-title-button')||document.getElementById('orb')).focus({preventScroll:true});
   const text=action==='snooze'?'10 分钟后再提醒':action==='dismiss-reminder'?'已忽略':action==='complete-reminder'?'完成了':'提醒已恢复';
   this.toast(text,()=>{
     Store.patch(id,before);this.withFeedAnchor(()=>{},true);this.checkReminders();
     const back=this.grid.querySelector(`[data-card="${CSS.escape(id)}"]`);
     (back?.querySelector('.card-title-button')||back||document.getElementById('orb')).focus({preventScroll:true});
   });
 }
 drop(ids,target){
   if(target==='tag'){this.bulkEditIds=ids;this.openPanel('editor',ids[0]);return;}
   const key=target==='bookmark'?'bookmarked':'later',old=ids.map(id=>[id,Store.item(id)[key]]);
   ids.forEach(id=>{Store.patch(id,{[key]:true});this.refreshCard(id);});
   this.toast(target==='bookmark'?`已收藏 ${ids.length} 张`:`${ids.length} 张放进稍后读`,()=>old.forEach(([id,v])=>{Store.patch(id,{[key]:v});this.refreshCard(id);}));
 }
 /* ——— Media ——— */
 paintMedia(){
   const c=Store.card(this.currentId),el=document.getElementById('media-slide');if(!el||!c)return;
   const labels=['浏览','提起','靠近','松手'],total=c.body.length||1;
   el.innerHTML=`<b>${labels[this.mediaIndex]||'片段 '+(this.mediaIndex+1)}</b><span>${esc(c.body[this.mediaIndex]||'')}</span>`;
   document.getElementById('media-step').textContent=`${this.mediaIndex+1} / ${total}`;
   MotionEngine.enter(el);
 }
 pauseMedia(){
   clearInterval(this.mediaTimer);this.mediaTimer=null;clearInterval(this.podcastTimer);this.podcastTimer=null;
   const b=this.dialog?.querySelector('[data-action="media-play"]');if(b){b.innerHTML=icon('play');b.setAttribute('aria-label','播放演示片段');}
   const p=this.dialog?.querySelector('[data-action="podcast-play"]');if(p){p.innerHTML=icon('play',22);p.setAttribute('aria-label','播放');}
 }
 playMedia(){
   if(this.mediaTimer){this.pauseMedia();return;}
   const c=Store.card(this.currentId),last=(c.body.length||1)-1;
   if(this.mediaIndex===last)this.mediaIndex=0;
   this.paintMedia();const b=this.dialog.querySelector('[data-action="media-play"]');b.innerHTML=icon('pause');b.setAttribute('aria-label','暂停演示片段');
   this.mediaTimer=setInterval(()=>{
     if(document.hidden)return;
     if(this.mediaIndex<last){this.mediaIndex++;this.paintMedia();Store.patch(this.currentId,{progress:(this.mediaIndex+1)/(last+1),read:this.mediaIndex===last});this.refreshCard(this.currentId);}
     else this.pauseMedia();
   },2500);
 }
 podcast(id,seek=0){
   const c=Store.card(id);if(!c)return;
   const total=c.duration||1,paint=()=>{const p=Store.item(id).progress,bar=document.getElementById('podcast-bar'),t=document.getElementById('podcast-played');if(bar)bar.style.width=Math.round(p*100)+'%';if(t)t.textContent=duration(p*total);};
   if(seek){Store.patch(id,{progress:Math.max(0,Math.min(1,Store.item(id).progress+seek/total))});paint();this.refreshCard(id);return;}
   if(this.podcastTimer){this.pauseMedia();return;}
   const b=this.dialog.querySelector('[data-action="podcast-play"]');b.innerHTML=icon('pause',22);b.setAttribute('aria-label','暂停');
   this.podcastTimer=setInterval(()=>{
     const p=Math.min(1,Store.item(id).progress+1/total);Store.patch(id,{progress:p,read:p>=.985||Store.item(id).read});paint();
     if(p>=1)this.pauseMedia();
   },1000);
 }
 /* ——— Inline note editing ——— */
 startInlineEdit(id){
   this.finishInlineEdit();
   const node=this.grid.querySelector(`[data-card="${CSS.escape(id)}"]`),c=Store.card(id);if(!node||!c)return;
   this.editingId=id;Store.patch(id,{seen:true,read:true});
   node.classList.add('is-editing');
   node.querySelector('.card-body').outerHTML=`<div class="inline-editor"><span class="card-head">${icon('note',16)}<span class="card-src">速记 · ${esc(c.meta||'刚刚')}</span></span><input id="inline-title" aria-label="标题" value="${esc(c.title)}" maxlength="200"><textarea id="inline-body" aria-label="内容" maxlength="4000">${esc((c.body?.length?c.body.join('\n'):c.summary)||'')}</textarea><small id="inline-state">自动保存</small></div>`;
   this.layout.schedule(false);
   const area=node.querySelector('#inline-body');area.focus();area.setSelectionRange(area.value.length,area.value.length);
 }
 saveInlineEdit(){
   const id=this.editingId,c=Store.card(id);if(!c)return;
   const title=document.getElementById('inline-title')?.value.trim()||c.title,text=document.getElementById('inline-body')?.value||'';
   const body=text.split('\n').map(s=>s.trim()).filter(Boolean);
   Object.assign(c,{title:title.slice(0,200),body:body.length?body:[title],summary:body.join('').slice(0,300),meta:'刚刚'});Store.save();
   const state=document.getElementById('inline-state');if(state)state.textContent=window.__QG_LOCAL__?'已保存在本机；同步状态见桌面':'已保存';
 }
 finishInlineEdit(){
   if(!this.editingId)return;
   const id=this.editingId;this.saveInlineEdit();this.editingId='';
   const node=this.grid.querySelector(`[data-card="${CSS.escape(id)}"]`);node?.classList.remove('is-editing');
   this.refreshCard(id);this.layout.schedule(false);
 }
 /* ——— Capture and import ——— */
 capture(text,toast=true){
   const card=Importers.capture(text);if(!card)return null;
   const {fresh}=Importers.dedupe([card]);
   if(!fresh.length){this.toast('桌面上已经有这条了');return null;}
   this.withFeedAnchor(()=>{Store.insert(fresh);});
   if(toast)this.toast('已存到 Sill',()=>{Store.remove([card.id]);this.withFeedAnchor(()=>{});});
   return card;
 }
 bindFileDrop(){
   let depth=0;const hint=document.getElementById('drop-hint');
   const isFiles=e=>[...(e.dataTransfer?.types||[])].some(t=>t==='Files'||t==='text/uri-list'||t==='text/plain');
   document.addEventListener('dragenter',e=>{if(!isFiles(e)||this.drag.active)return;depth++;document.body.classList.add('is-dropping');hint.hidden=false;});
   document.addEventListener('dragleave',()=>{depth=Math.max(0,depth-1);if(!depth){document.body.classList.remove('is-dropping');hint.hidden=true;}});
   document.addEventListener('dragover',e=>{if(isFiles(e))e.preventDefault();});
   document.addEventListener('drop',e=>{
     if(!isFiles(e))return;e.preventDefault();depth=0;document.body.classList.remove('is-dropping');hint.hidden=true;
     const files=[...(e.dataTransfer.files||[])];
     if(files.length)this.importFiles(files);
     else{const text=e.dataTransfer.getData('text/uri-list')||e.dataTransfer.getData('text/plain');if(text)this.capture(text);}
   });
 }
 async importFiles(files){
   const parsed=[];
   for(const file of files.slice(0,20)){
     if(file.size>20*1048576){this.toast(`${file.name} 太大了`);continue;}
     const text=await file.text(),result=Importers.parse(file.name,text);
     if(!result.kind){this.toast(`还不能导入 ${file.name}`);continue;}
     if(result.entries.length)parsed.push(result);
   }
   if(!parsed.length){if(files.length)this.toast('没有找到可以导入的内容');return;}
   // Several files of one kind preview together.
   const first=parsed[0],same=parsed.filter(p=>p.kind===first.kind);
   const skipped=parsed.filter(p=>p.kind!==first.kind);
   this.importing={kind:first.kind,name:same.length>1?`${same.length} 个文件`:first.name,entries:same.flatMap(p=>p.entries),notice:skipped.length?`本次仅导入${first.name}同类文件。未纳入：${skipped.map(p=>p.name).join('、')}；请分次导入这些文件。`:''};
   this.importPicked=new Set(this.importing.entries.map((_,i)=>i));this.importRange='30d';
   this.swapPanel(Panels.importPreview(this),'import','panel');
 }
 runImport(){
   const p=this.importing;if(!p)return;
   const picked=p.entries.filter((e,i)=>this.importPicked.has(i));
   if(p.kind==='opml'){
     const existing=Store.source('src-rss'),count=(existing?.count||0)+picked.length;
     Store.upsertSource({id:'src-rss',kind:'rss',name:'RSS',detail:`${count} 个订阅`,enabled:true,status:'ok',count,syncedAt:Date.now(),stack:existing?.stack??true,open:existing?.open||'inside',range:existing?.range||'30d'});
     this.closeNative();this.importing=null;
     this.toast(`已订阅 ${picked.length} 个 RSS`);this.startImportRings(['rss']);return;
   }
   const within=e=>this.importRange==='all'||!e.time||Date.now()-e.time<30*86400000||p.kind==='ics'&&e.time>Date.now();
   const cards=picked.filter(within).map(e=>e.card).filter(Boolean);
   const {fresh,merged}=Importers.dedupe(cards);
   const kind={csv:cards[0]?.kind||'web',html:'web',markdown:'markdown',ics:'calendar'}[p.kind];
   if(kind&&!['markdown','web'].includes(kind)&&!Store.source('src-'+kind))Store.upsertSource({id:'src-'+kind,kind,name:SourceKinds[kind].label,detail:'文件导入',enabled:true,status:'ok',count:fresh.length,syncedAt:Date.now(),stack:true,open:'inside',range:'all'});
   this.closeNative();this.importing=null;
   this.startImportRings([kind||'local'],()=>{
     this.withFeedAnchor(()=>{Store.insert(fresh);},true);
     if(merged.length)this.toast(`导入 ${fresh.length} 张，跳过 ${merged.length} 张重复（保留已有内容）`);
     else this.toast(`导入 ${fresh.length} 张`,()=>{Store.remove(fresh.map(c=>c.id));this.withFeedAnchor(()=>{});});
   });
 }
 /** Import is never blocking: one ring per source fills at the bottom, cards fall in as they arrive. */
 startImportRings(kinds,done){
   const host=document.getElementById('import-rings');
   host.innerHTML=kinds.map(k=>`<span class="import-ring" data-kind="${esc(k)}">${ring(0,36)}${icon(SourceKinds[k]?.icon||'file',15)}</span>`).join('');
   host.hidden=false;let p=0;
   const step=()=>{
     p=Math.min(1,p+(MotionEngine.reduced?1:.25));
     host.querySelectorAll('.progress-ring circle:last-child').forEach(n=>n.setAttribute('stroke-dashoffset',String(50.265*(1-p))));
     if(p<1){setTimeout(step,160);return;}
     host.querySelectorAll('.import-ring').forEach(n=>n.classList.add('done'));
     done?.();setTimeout(()=>{host.hidden=true;},900);
   };
   setTimeout(step,120);
 }
 /* ——— First run ——— */
 loadDemo(){
   const before=Store.state.cards.length;
   Store.state.preferences.onboarded=true;
   const demo=SeedCards.map(c=>({...c,tasks:c.tasks?.map(t=>({...t})),time:c.time,...(c.start?{start:Date.now()+(c.start-demoBase),end:Date.now()+(c.end-demoBase)}:{}),...(c.due?{due:Date.now()+(c.due-demoBase)}:{})}));
   this.closeNative();
   this.startImportRings(['rss','readwise','mail','calendar'],()=>{this.withFeedAnchor(()=>{Store.insert(demo);for(const [id,x] of Object.entries(SeedItems))Store.patch(id,x);},true);
     if(!before)this.toast('示例卡片已经放好',()=>{Store.remove(demo.map(c=>c.id));this.withFeedAnchor(()=>{});},'拿走');});
   if(!Store.state.sources.length)DemoSources.forEach(s=>Store.upsertSource({...s,syncedAt:Date.now()}));
 }
 welcomeContinue(){
   const kinds=[...this.welcomePicked],system=kinds.filter(k=>Panels.systemKinds[k]),accounts=kinds.filter(k=>!Panels.systemKinds[k]);
   for(const k of accounts)if(!Store.source('src-'+k))Store.upsertSource({id:'src-'+k,kind:k,name:SourceKinds[k].label,detail:k==='rss'?'等待导入订阅':'等待授权',enabled:true,status:'attention',count:0,stack:true,open:['linear','github'].includes(k)?'web':'inside',range:'30d'});
   Store.state.preferences.onboarded=true;Store.save();
   this.permissionQueue=system;this.nextPermission();
 }
 nextPermission(){
   const kind=this.permissionQueue?.shift();
   if(kind){this.swapPanel(Panels.permission(kind),'permission','panel narrow');return;}
   this.closeNative();this.welcomePicked.clear();
   const waiting=Store.state.sources.filter(s=>s.status==='attention').length;
   this.renderCurrent(false);
   if(waiting)this.toast(`${waiting} 个来源等待授权`,()=>this.openPanel('sources'),'查看');
 }
 /* ——— Settings and sources ——— */
 setPref(key,value){
   const before=Store.pref(key);Store.setPref(key,value);this.applyPreferences();
   if(['stack','fadeRead','archiveAfter','floatTimely','density'].includes(key))this.withFeedAnchor(()=>{});
   if(this.modalKind==='settings')this.repaintSettings();
   return before;
 }
 replacePanelContent(html){
   const active=document.activeElement;
   const key=n=>[n.id,n.dataset.action,n.dataset.id,n.dataset.extra].join('|');
   const focused=this.dialog.contains(active)?key(active):null;
   const selectors=['.sheet-scroll','.settings-main','.settings-nav','.sheet','.import-list'];
   const positions=selectors.map(selector=>{const node=this.dialog.querySelector(selector);return {selector,x:node?.scrollLeft||0,y:node?.scrollTop||0};});
   const full=this.dialog.querySelector('.preview-sheet')?.classList.contains('is-full');
   const toast=document.getElementById('toast');if(toast&&this.dialog.contains(toast))document.body.appendChild(toast);
   this.dialog.innerHTML=html;
   if(full)this.dialog.querySelector('.preview-sheet')?.classList.add('is-full');
   if(focused){const target=[...this.dialog.querySelectorAll('button,input,textarea,a,[tabindex]')].find(n=>key(n)===focused);const focus=target||this.dialog.querySelector('#modal-title');if(focus){if(!focus.matches('button,input,textarea,a,[tabindex]'))focus.tabIndex=-1;focus.focus({preventScroll:true});}}
   for(const {selector,x,y} of positions){const node=this.dialog.querySelector(selector);if(node){node.scrollLeft=x;node.scrollTop=y;}}
 }
 repaintSettings(){
   const main=this.dialog.querySelector('.settings-main'),y=main?.scrollTop||0,active=document.activeElement,key=[active?.dataset.action,active?.dataset.id,active?.dataset.extra].join('|');
   this.replacePanelContent(Panels.settings(this,this.settingsGroup));
   const next=this.dialog.querySelector('.settings-main');if(next)next.scrollTop=y;
   [...this.dialog.querySelectorAll('[data-action]')].find(n=>[n.dataset.action,n.dataset.id,n.dataset.extra].join('|')===key)?.focus({preventScroll:true});
 }
 repaintSources(){
   if(this.modalKind==='settings'){this.repaintSettings();return;}
   if(this.modalKind==='sources')this.replacePanelContent(Panels.sources());
   if(this.modalKind==='source')this.replacePanelContent(Panels.sourceDetail(this.sourceId));
 }
 sourceReturn(){return this.modalKind==='settings'?()=>{this.swapPanel(Panels.settings(this,'sources'),'settings','panel wide');}:()=>{this.swapPanel(Panels.sources(),'sources');};}
 exportAll(){
   const data={app:'Sill',exportedAt:new Date().toISOString(),...Store.serialized()};
   this.download(`sill-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(data,null,2),'application/json');
 }
 download(name,text,type='text/plain'){
   const blob=new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
   a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 /* ——— Clock ——— */
 tick(){
   if(!document.hidden){
     this.checkReminders();
     const minute=Math.floor(Date.now()/60000);
     if(this.clockMinute!==minute){this.clockMinute=minute;
       this.grid.querySelectorAll('[data-card]').forEach(node=>{
         const c=Store.card(node.dataset.card);if(!c)return;
         if(c.type==='event'){
           const label=node.querySelector('.event-relative');if(label)label.textContent=eventRelative(c);
           // The join button appears only once the meeting is near.
           if(!!node.querySelector('[data-action="join"]')!==(eventTimely(c)&&!!c.meeting))this.refreshCard(c.id);
         }else if(c.type==='reminder'){const label=node.querySelector('.reminder-label');if(label)label.textContent=FeedPolicy.label(c,Store.item(c.id),Date.now());}
       });
     }
   }
   if(this.modalKind==='reader'&&this.dialog.open&&!document.hidden&&Date.now()-this.lastActivity<60000){
     Store.state.seconds++;
     document.querySelectorAll('[data-live-time]').forEach(n=>n.textContent=minutes(Store.state.seconds));
     if(Store.state.seconds%5===0)Store.save();
   }
 }
 /* ——— Input ——— */
 /* Stacks are decks: the top card moves with the hand (finger, mouse or a sideways trackpad swipe) and leaves whole;
    the next card rises from beneath. Swiping right brings the previous card back over the top. */
 bindStacks(){
   this.stackIndex=new Map();
   let g=null;
   this.grid.addEventListener('pointerdown',e=>{
     const deck=e.target.closest?.('.deck');
     g=deck&&e.button===0&&!deck.dataset.busy?{deck,id:e.pointerId,x:e.clientX,y:e.clientY,at:Date.now(),live:false,dx:0}:null;
   });
   document.addEventListener('pointermove',e=>{
     if(!g||e.pointerId!==g.id)return;
     const dx=e.clientX-g.x,dy=e.clientY-g.y;
     if(!g.live){
       if(Math.abs(dx)<6&&Math.abs(dy)<6)return;
       if(Math.abs(dy)>=Math.abs(dx)){g=null;return;}
       g.live=true;g.deck.classList.add('is-dragging');try{g.deck.setPointerCapture(e.pointerId);}catch{}
     }
     g.dx=dx;this.deckFollow(g.deck,dx);
   });
   const release=(e,cancelled)=>{
     if(!g||e.pointerId!==g.id)return;const d=g;g=null;if(!d.live)return;
     d.deck.classList.remove('is-dragging');this.stackDragUntil=Date.now()+350;
     const w=d.deck.offsetWidth,v=d.dx/Math.max(1,Date.now()-d.at);
     const go=!cancelled&&(Math.abs(d.dx)>w*.3||Math.abs(v)>.45&&Math.abs(d.dx)>30);
     this.deckSettle(d.deck,go?(d.dx<0?1:-1):0);
   };
   document.addEventListener('pointerup',e=>release(e,false));
   document.addEventListener('pointercancel',e=>release(e,true));
   // Trackpad: a sideways swipe drags the top card too. Its coasting momentum is ignored until the hand stops.
   this.grid.addEventListener('wheel',e=>{
     const deck=e.target.closest?.('.deck');
     if(!deck||Math.abs(e.deltaX)<=Math.abs(e.deltaY))return;
     e.preventDefault();
     const now=Date.now();
     if(deck._hold){if(now-deck._hold<160){deck._hold=now;return;}deck._hold=0;}
     if(deck.dataset.busy)return;
     const s=deck._wheel||(deck._wheel={dx:0}),w=deck.offsetWidth;clearTimeout(s.t);
     s.dx=Math.max(-w,Math.min(w,s.dx-e.deltaX));this.deckFollow(deck,s.dx);
     if(Math.abs(s.dx)>w*.35){deck._wheel=null;deck._hold=now;this.deckSettle(deck,s.dx<0?1:-1);return;}
     s.t=setTimeout(()=>{deck._wheel=null;this.deckSettle(deck,0);},140);
   },{passive:false});
 }
 deckParts(deck){const cards=[...deck.children],i=Number(deck.dataset.cur||0);return {cards,i,top:cards[i],next:cards[i+1],prev:cards[i-1],w:deck.offsetWidth||1};}
 deckFollow(deck,dx){
   const {top,next,prev,w}=this.deckParts(deck);
   if(dx<=0||!prev){
     // Toward the next card; with nothing beyond, the top card only gives a little.
     const x=dx<0&&next?dx:dx*.25,f=next?Math.min(1,-Math.min(0,dx)/w):0;
     top.style.transform=`translateX(${x}px) rotate(${x/w*6}deg)`;
     if(next)next.style.transform=`translateY(${6*(1-f)}px) scale(${.97+.03*f})`;
     if(prev){prev.classList.remove('is-prev');prev.style.transform='';}
   }else{
     // Back: the previous card slides in from the left, over the top one.
     top.style.transform='';
     prev.classList.add('is-prev');prev.style.visibility='visible';
     const x=-w-24+dx;prev.style.transform=`translateX(${x}px) rotate(${x/w*6}deg)`;
   }
 }
 deckSettle(deck,dir){
   const {cards,i,top,next,prev,w}=this.deckParts(deck);
   if(dir===1&&!next||dir===-1&&!prev)dir=0;
   const t={duration:MotionEngine.reduced?1:260,easing:'cubic-bezier(.2,.75,.25,1)'},anims=[];
   const run=(el,to)=>{if(!el)return;const from=el.style.transform||'none';anims.push(el.animate([{transform:from},{transform:to}],t));el.style.transform=to;};
   if(dir===1){
     run(top,`translateX(${-w*1.15}px) rotate(-8deg)`);run(next,'none');
   }else if(dir===-1){
     if(!prev.classList.contains('is-prev'))this.deckFollow(deck,1);
     run(prev,'none');
   }else{
     run(top,'none');if(next)run(next,'translateY(6px) scale(.97)');
     if(prev?.classList.contains('is-prev'))run(prev,`translateX(${-w-24}px) rotate(-6deg)`);
   }
   deck.dataset.busy='1';
   const done=()=>{delete deck.dataset.busy;this.deckShow(deck,i+dir);};
   Promise.all(anims.map(a=>a.finished)).then(done,done);
 }
 deckShow(deck,i){
   const cards=[...deck.children];i=Math.max(0,Math.min(cards.length-1,i));
   const key=deck.closest('[data-stack]').dataset.stack;
   cards.forEach((c,k)=>{
     c.classList.toggle('is-top',k===i);c.classList.toggle('is-next',k===i+1);c.classList.remove('is-prev');
     c.style.transform='';c.style.visibility='';c.setAttribute('aria-hidden',String(k!==i));
   });
   // The one button that spreads the pile out always sits on the card you can see.
   const button=deck.querySelector('.card-title-button'),h=cards[i].querySelector('.card-title');
   if(button&&h&&!h.contains(button)){const old=button.parentElement;old.textContent=button.textContent;button.textContent=h.textContent;h.textContent='';h.appendChild(button);}
   deck.dataset.cur=i;this.stackIndex.set(key,i);
 }
 restoreStacks(){
   this.grid.querySelectorAll('[data-stack] .deck').forEach(deck=>{
     const i=this.stackIndex.get(deck.closest('[data-stack]').dataset.stack)||0;if(i)this.deckShow(deck,i);
   });
 }
 click(e){
   // The end of a sideways drag through a stack is not a tap.
   if(this.stackDragUntil>Date.now()&&e.target.closest?.('[data-stack]')){e.preventDefault();e.stopPropagation();return;}
   if(Date.now()<this.drag.suppressUntil)return;
   const el=e.target.closest?.('[data-action]');
   if(el?.closest('.card-more-menu'))this.closeMore(true);
   else if(!el?.matches('[data-action="card-more"]')&&!e.target.closest?.('.card-more-menu'))this.closeMore();
   if(this.editingId&&!e.target.closest?.('.is-editing'))this.finishInlineEdit();
   if(el){if(el.disabled)return;e.preventDefault();e.stopPropagation();this.action(el.dataset.action,el.dataset.id,el.dataset.extra,el,e);return;}
   if(e.target.closest?.('.is-editing'))return;
   const stack=e.target.closest?.('[data-stack]');
   if(stack&&!e.target.closest('button,a,input,textarea')){this.action('stack-open','',stack.dataset.stack);return;}
   const card=e.target.closest?.('[data-card]');
   if(card&&!e.target.closest('button,a,input,textarea')){this.navigate('#card/'+card.dataset.card);return;}
 }
 action(name,id='',extra='',el=null,event=null){
   switch(name){
     case 'orb':this.openDock();break;
     case 'filter':case 'search':this.openPanel('search');break;
     case 'settings':this.settingsGroup='desk';this.openPanel('settings');break;
     case 'settings-group':this.settingsGroup=extra;this.repaintSettings();this.dialog.querySelector(`[data-action="settings-group"][data-extra="${extra}"]`)?.scrollIntoView({block:'nearest',inline:'nearest'});break;
     case 'capture':this.openPanel('capture');break;
     case 'capture-save':{const text=document.getElementById('capture-text')?.value;if(!text?.trim())return;this.closeNative();this.capture(text);break;}
     case 'refresh':this.refresh();break;
     case 'retry':document.getElementById('offline').classList.add('is-retrying');this.refresh().then(()=>this.setOffline(false));break;
     case 'show-new':this.showNew();break;
     case 'top':window.scrollTo({top:0,behavior:MotionEngine.reduced?'instant':'smooth'});break;
     case 'card-open':case 'preview':this.navigate('#card/'+id);break;
     case 'reader':this.navigate('#read/'+id);break;
     case 'close':this.closeModal();break;
     case 'close-all':this.closeToDesk();break;
     case 'bookmark':this.setFlag(id,'bookmarked',!Store.item(id).bookmarked);break;
     case 'later':this.setFlag(id,'later',!Store.item(id).later);break;
     case 'task':this.toggleTask(id,extra);break;
     case 'edit':this.bulkEditIds=null;this.openPanel('editor',id);break;
     case 'why':this.openPanel('why',id);break;
     case 'less-like':this.closeNative();this.toast('以后这类会少一些');break;
     case 'never-show':{const before={...Store.item(id)};this.closeNative();Store.patch(id,{dismissed:true});this.withFeedAnchor(()=>{},true);this.toast('不再提示这张',()=>{Store.patch(id,before);this.withFeedAnchor(()=>{},true);});break;}
     case 'card-more':this.more(id);break;
     case 'toggle-read':{
       const before={...Store.item(id)},read=!before.read;Store.patch(id,{read,seen:read,progress:read?1:0,readAt:read?Date.now():0});this.refreshCard(id);
       this.toast(read?'已标为已读':'已标为未读',()=>{Store.patch(id,before);this.refreshCard(id);});break;
     }
     case 'select':this.selected.has(id)?this.selected.delete(id):this.selected.add(id);this.updateSelection();break;
     case 'clear-selection':this.selected.clear();this.updateSelection();break;
     case 'selected-bookmark':this.drop([...this.selected],'bookmark');this.selected.clear();this.updateSelection();break;
     case 'selected-later':this.drop([...this.selected],'later');this.selected.clear();this.updateSelection();break;
     case 'selected-tag':{const ids=[...this.selected];this.selected.clear();this.updateSelection();this.drop(ids,'tag');break;}
     case 'stack-open':this.openStacks.add(extra);this.withFeedAnchor(()=>{},true);this.grid.querySelector(`[data-stack-open="${CSS.escape(extra)}"] .card-title-button`)?.focus({preventScroll:true});break;
     case 'stack-close':this.openStacks.delete(extra);this.withFeedAnchor(()=>{},true);this.grid.querySelector(`[data-stack="${CSS.escape(extra)}"]`)?.focus({preventScroll:true});break;
     case 'archive':this.openPanel('archive',extra);break;
     case 'restore-card':{const before={...Store.item(id)};Store.patch(id,{restoredAt:Date.now(),read:false,seen:false,progress:0});this.dialog.innerHTML=Panels.archive(this,this.editId);this.withFeedAnchor(()=>{});this.toast('放回桌面了',()=>{Store.patch(id,before);this.withFeedAnchor(()=>{});if(this.modalKind==='archive')this.dialog.innerHTML=Panels.archive(this,this.editId);});break;}
     case 'archive-all':{const ids=this.shelved('stale').map(c=>c.id),before=ids.map(i=>[i,{...Store.item(i)}]);ids.forEach(i=>Store.patch(i,{read:true,seen:true,readAt:Date.now()-8*86400000}));this.closeNative();this.withFeedAnchor(()=>{});this.toast(`归档了 ${ids.length} 张`,()=>{before.forEach(([i,v])=>Store.patch(i,v));this.withFeedAnchor(()=>{});});break;}
     case 'filter-type':this.filter.type=extra;this.repaintSearch();break;
     case 'filter-status':this.filter.status=this.filter.status===extra?'all':extra;this.repaintSearch();break;
     case 'filter-tag':this.filter.tag=this.filter.tag===extra?'':extra;this.repaintSearch();break;
     case 'clear-query':this.filter.query='';this.repaintSearch();document.getElementById('filter-search')?.focus();break;
     case 'clear-filter':this.filter={type:'all',status:'all',tag:'',query:''};if(this.modalKind==='search')this.repaintSearch();else this.renderCurrent(true);break;
     case 'apply-filter':this.closeNative();window.scrollTo(0,0);break;
     case 'sort-feed':if(FeedPolicy.sorts.includes(extra)){Store.setPref('sort',extra);this.applyPreferences();this.feedNow=Date.now();this.renderCurrent(false);}break;
     case 'editor-tag':{
       this.editTags.has(extra)?this.editTags.delete(extra):this.editTags.add(extra);
       const note=document.getElementById('note-editor')?.value;this.dialog.innerHTML=Panels.editor(this,this.editId);
       if(note!==undefined)document.getElementById('note-editor').value=note;document.getElementById('tag-new')?.focus();break;
     }
     case 'add-tag':{
       const field=document.getElementById('tag-new'),value=field.value.trim().replace(/^#/,'').slice(0,30);if(!value)return;
       if(this.editTags.size>=20){this.toast('最多保留 20 个标签');return;}
       this.editTags.add(value);const note=document.getElementById('note-editor')?.value;
       this.dialog.innerHTML=Panels.editor(this,this.editId);document.getElementById('note-editor').value=note||'';document.getElementById('tag-new').focus();break;
     }
     case 'save-note':{
       const pending=document.getElementById('tag-new')?.value.trim();if(pending)this.editTags.add(pending.replace(/^#/,'').slice(0,30));
       const note=document.getElementById('note-editor').value.slice(0,4000);
       const ids=this.bulkEditIds||[id];
       ids.forEach((cardId,i)=>{Store.patch(cardId,{tags:[...this.editTags],tagsEdited:true,...(i===0?{note}:{})});this.refreshCard(cardId);});
       this.bulkEditIds=null;this.closeModal();this.toast(Store.state.storageAvailable?(window.__QG_LOCAL__?'已保存在本机；同步状态见桌面':'已保存'):'本次已保存；当前环境不能持久存储');break;
     }
     case 'pref':{const before=this.setPref(id,extra);if(before!==extra&&['archiveAfter','theme','density'].includes(id))this.announce('已更新');break;}
     case 'pref-toggle':this.setPref(id,!Store.pref(id));break;
     case 'toggle-transparency':this.setPref('reduceTransparency',!Store.pref('reduceTransparency'));break;
     case 'export-all':this.exportAll();break;
     case 'clear-all':{
       const back=this.modalKind==='settings'?()=>this.swapPanel(Panels.settings(this,'data'),'settings','panel wide'):null;this.panelReturn=back;
       this.swapPanel(Panels.confirm('清除全部数据？','卡片、备注、来源都会从这台设备删除，不能撤销。建议先导出。',`<button type="button" class="soft-button" data-action="close">取消</button><button type="button" class="solid-button" style="background:var(--alert)" data-action="clear-confirm">清除</button>`),'confirm','panel narrow');break;
     }
     case 'clear-confirm':Store.state.cards=[];Store.state.items={};Store.state.sources=[];Store.state.freshIds=[];Store.state.preferences.onboarded=false;Store.save();this.panelReturn=null;this.closeNative();this.pendingCards=[];this.renderCurrent(true);break;
     case 'sources':this.openPanel('sources');break;
     case 'sources-add':this.panelReturn=this.sourceReturn();this.swapPanel(Panels.sourcesAdd(),'sources-add');break;
     case 'source-connect':{const back=this.modalKind==='sources-add'?()=>this.swapPanel(Panels.sourcesAdd(),'sources-add'):this.dialog.open?this.sourceReturn():null;this.panelReturn=back;this.swapPanel(Panels.connect(extra),Panels.systemKinds[extra]?'permission':'connect',Panels.systemKinds[extra]?'panel narrow':'panel');break;}
     case 'source-authorize':{
       const k=extra,existing=Store.source('src-'+k);
       Store.upsertSource({id:'src-'+k,kind:k,name:SourceKinds[k].label,detail:'等待授权',enabled:true,status:'attention',count:existing?.count||0,stack:existing?.stack??true,open:existing?.open||(['linear','github'].includes(k)?'web':'inside'),range:this.connectRange||'30d'});
       const site={readwise:'https://readwise.io/access_token',youtube:'https://www.youtube.com/',twitter:'https://x.com/i/bookmarks',mail:'https://mail.google.com/',linear:'https://linear.app/settings/api',github:'https://github.com/settings/tokens',podcast:'https://podcasts.apple.com/'}[k];
       if(site)window.open(site,'_blank','noopener,noreferrer');
       this.panelReturn=null;this.swapPanel(Panels.sources(),'sources');this.toast(`${SourceKinds[k].label} 等待授权`);break;
     }
     case 'connect-range':this.connectRange=extra;el.parentElement.querySelectorAll('button').forEach(b=>{b.classList.toggle('on',b===el);b.setAttribute('aria-checked',String(b===el));b.tabIndex=b===el?0:-1;});break;
     case 'permission-allow':case 'permission-later':{
       const k=extra;
       if(name==='permission-allow')Store.upsertSource({id:'src-'+k,kind:k,name:SourceKinds[k].label,detail:'只在本机读取',enabled:true,status:'ok',count:0,syncedAt:Date.now(),stack:k!=='calendar',open:'inside',range:'30d'});
       if(this.permissionQueue){this.nextPermission();break;}
       this.panelReturn=null;this.swapPanel(Panels.sources(),'sources');break;
     }
     case 'source-open':this.sourceId=id;this.panelReturn=this.sourceReturn();this.swapPanel(Panels.sourceDetail(id),'source');break;
     case 'source-toggle':{const s=Store.source(id);if(!s)break;const on=!(s.enabled&&s.status!=='paused');Store.upsertSource({...s,enabled:on,status:on?'ok':'paused'});this.repaintSources();break;}
     case 'source-flag':{const [sid,key]=id.split(':'),s=Store.source(sid);if(!s)break;Store.upsertSource({...s,[key]:!s[key]});this.replacePanelContent(Panels.sourceDetail(sid));this.withFeedAnchor(()=>{});break;}
     case 'source-set':{const [sid,key]=id.split(':'),s=Store.source(sid);if(!s)break;Store.upsertSource({...s,[key]:extra});this.replacePanelContent(Panels.sourceDetail(sid));break;}
     case 'source-pause':{const s=Store.source(id);Store.upsertSource({...s,status:s.status==='paused'?'ok':'paused',enabled:s.status==='paused'});this.replacePanelContent(Panels.sourceDetail(id));break;}
     case 'source-remove':{
       const s=Store.source(id),count=Store.state.cards.filter(c=>`src-${c.kind}`===id).length;
       this.panelReturn=()=>this.swapPanel(Panels.sourceDetail(id),'source');
       this.swapPanel(Panels.confirm(`断开 ${s.name}？`,count?`它带来的 ${count} 张卡片要一起移除吗？`:'之后可以随时重新连接。',`${count?`<button type="button" class="soft-button" data-action="source-drop" data-id="${esc(id)}" data-extra="keep">保留卡片</button><button type="button" class="solid-button" style="background:var(--alert)" data-action="source-drop" data-id="${esc(id)}" data-extra="remove">一并移除</button>`:`<button type="button" class="soft-button" data-action="close">取消</button><button type="button" class="solid-button" style="background:var(--alert)" data-action="source-drop" data-id="${esc(id)}" data-extra="keep">断开</button>`}`),'confirm','panel narrow');break;
     }
     case 'source-drop':{
       Store.removeSource(id);if(extra==='remove')Store.remove(Store.state.cards.filter(c=>`src-${c.kind}`===id).map(c=>c.id));
       this.panelReturn=null;this.swapPanel(Panels.sources(),'sources');this.withFeedAnchor(()=>{});break;
     }
     case 'feed-add':{
       const url=Importers.url(document.getElementById('feed-url')?.value||'');if(!url){this.toast('请粘贴一个 http 或 https 的订阅地址');return;}
       const s=Store.source('src-rss'),count=(s?.count||0)+1;
       Store.upsertSource({id:'src-rss',kind:'rss',name:'RSS',detail:`${count} 个订阅`,enabled:true,status:'ok',count,syncedAt:Date.now(),stack:s?.stack??true,open:s?.open||'inside',range:s?.range||'30d'});
       this.panelReturn=null;this.swapPanel(Panels.sources(),'sources');this.toast(`已订阅 ${new URL(url).hostname}`);break;
     }
     case 'import-pick':document.getElementById('file-input').click();break;
     case 'import-toggle':{const i=Number(extra);this.importPicked.has(i)?this.importPicked.delete(i):this.importPicked.add(i);this.replacePanelContent(Panels.importPreview(this));this.dialog.querySelector(`[data-action="import-toggle"][data-extra="${i}"]`)?.focus();break;}
     case 'import-toggle-all':this.importPicked=this.importPicked.size===this.importing.entries.length?new Set():new Set(this.importing.entries.map((_,i)=>i));this.replacePanelContent(Panels.importPreview(this));break;
     case 'import-range':this.importRange=extra;this.replacePanelContent(Panels.importPreview(this));break;
     case 'import-run':this.runImport();break;
     case 'welcome-start':this.welcomePicked=new Set(['rss','readwise','web','mail','calendar']);this.openPanel('welcome');break;
     case 'welcome-pick':this.welcomePicked.has(extra)?this.welcomePicked.delete(extra):this.welcomePicked.add(extra);this.dialog.innerHTML=Panels.welcomePick(this);this.dialog.querySelector(`[data-action="welcome-pick"][data-extra="${extra}"]`)?.focus();break;
     case 'welcome-continue':this.welcomeContinue();break;
     case 'welcome-demo':this.loadDemo();break;
     case 'join':{const c=Store.card(id);if(c?.meeting?.url)window.open(c.meeting.url,'_blank','noopener,noreferrer');break;}
     case 'photo-step':case 'photo-go':{
       const c=Store.card(id),n=(c.photos||[c.image]).length;
       this.photoIndex=name==='photo-go'?Number(extra):(this.photoIndex+Number(extra)+n)%n;
       this.dialog.innerHTML=Panels.lightbox(c,this.photoIndex);break;
     }
     case 'sync-retry':this.refresh();break;
     case 'sync-export':this.exportAll();break;
     case 'sync-discard':this.openModal(Panels.confirm('使用服务端版本？','本机未同步修改将被放弃，请先导出草稿。','<button type="button" class="soft-button" data-action="close">取消</button><button type="button" class="solid-button" data-action="sync-discard-confirm">放弃本机修改</button>'),'confirm',null,'panel narrow');break;
     case 'sync-discard-confirm':LocalSync.discard().then(()=>this.closeNative()).catch(error=>this.toast(error.message));break;
     case 'undo':if(this.undoAction){const fn=this.undoAction;this.undoAction=null;document.getElementById('toast').hidden=true;fn();}break;
     case 'external':this.openExternal(Store.card(id));if(Store.card(id)&&!Store.item(id).read&&['mail'].includes(Store.card(id).type)){Store.patch(id,{read:true});this.refreshCard(id);}break;
     case 'download-calendar':{
       const c=Store.card(id),date=x=>new Date(x).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
       this.download('sill.ics',`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Sill//Local//ZH\r\nBEGIN:VEVENT\r\nUID:${c.id}@sill.local\r\nDTSTAMP:${date(Date.now())}\r\nDTSTART:${date(c.start)}\r\nDTEND:${date(c.end)}\r\nSUMMARY:${c.title}\r\n${c.location?`LOCATION:${c.location}\r\n`:''}END:VEVENT\r\nEND:VCALENDAR\r\n`,'text/calendar');break;
     }
     case 'snooze':case 'dismiss-reminder':case 'complete-reminder':case 'restore-reminder':this.changeReminder(id,name);break;
     case 'media-play':this.playMedia();break;
     case 'media-next':{const c=Store.card(this.currentId);this.pauseMedia();this.mediaIndex=Math.min((c.body.length||1)-1,this.mediaIndex+1);this.paintMedia();break;}
     case 'media-prev':this.pauseMedia();this.mediaIndex=Math.max(0,this.mediaIndex-1);this.paintMedia();break;
     case 'podcast-play':this.podcast(id);break;
     case 'podcast-seek':this.podcast(id,Number(extra));break;
   }
 }
 repaintSearch(){
   if(this.modalKind!=='search'){this.renderCurrent(false);this.updateFilterIndicator();return;}
   const active=document.activeElement,searchFocused=active?.id==='filter-search',pos=active?.selectionStart;
   const action=active?.dataset.action,extra=active?.dataset.extra;
   const liveToast=document.getElementById('toast');if(liveToast&&this.dialog.contains(liveToast))document.body.appendChild(liveToast);
   this.dialog.innerHTML=Panels.search(this);
   if(searchFocused){const n=document.getElementById('filter-search');n.focus();try{n.setSelectionRange(pos,pos);}catch{}}
   else if(action)[...this.dialog.querySelectorAll('[data-action]')].find(n=>n.dataset.action===action&&n.dataset.extra===extra)?.focus({preventScroll:true});
   this.renderCurrent(false);this.updateFilterIndicator();
 }
 input(e){
   if(e.target.dataset.input==='search'){
     this.filter.query=e.target.value;
     document.getElementById('filter-result').textContent=`${this.filtered().length} 张`;
     clearTimeout(this.searchTimer);this.searchTimer=setTimeout(()=>{
       const results=document.getElementById('search-results');if(results)results.innerHTML=Panels.searchResults(this);
       if(this.mode==='feed')this.renderCurrent(false);this.updateFilterIndicator();
     },140);
   }
   if(this.editingId&&e.target.closest?.('.inline-editor')){
     const state=document.getElementById('inline-state');if(state)state.textContent='正在保存…';
     clearTimeout(this.inlineTimer);this.inlineTimer=setTimeout(()=>this.saveInlineEdit(),500);
   }
 }
 paste(e){
   // Paste a link or a line anywhere on the desk to keep it.
   if(this.dialog.open||e.target.closest?.('input,textarea,[contenteditable]'))return;
   const text=e.clipboardData?.getData('text/plain');if(!text?.trim())return;
   e.preventDefault();this.capture(text);
 }
 key(e){
   if(e.key==='Escape'&&this.modalKind==='search'){e.preventDefault();this.closeModal();return;}
   const radio=e.target.closest?.('[role="radio"]'),group=radio?.closest('[role="radiogroup"]');
   if(group&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)){
     const radios=[...group.querySelectorAll('[role="radio"]')],i=radios.indexOf(radio);
     const index=e.key==='Home'?0:e.key==='End'?radios.length-1:(i+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1)+radios.length)%radios.length;
     e.preventDefault();radios[index].focus();radios[index].click();return;
   }
   const menu=e.target.closest?.('.card-more-menu');
   if(menu&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
     const items=[...menu.querySelectorAll('button')],index=items.indexOf(document.activeElement);
     const next=e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;
     e.preventDefault();items[next]?.focus();return;
   }
   if(e.key==='Escape'&&this.grid.querySelector('.card-more-menu')){e.preventDefault();this.closeMore(true);return;}
   if(e.key==='Escape'&&this.editingId){e.preventDefault();const id=this.editingId;this.finishInlineEdit();this.grid.querySelector(`[data-card="${CSS.escape(id)}"] .card-title-button`)?.focus();return;}
   if(this.modalKind==='lightbox'&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();this.action('photo-step',this.currentId,e.key==='ArrowLeft'?'-1':'1');return;}
   if(e.key==='Tab'&&this.dialog.open){
     const focusable=[...this.dialog.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter(n=>n.getClientRects().length&&getComputedStyle(n).visibility!=='hidden');
     const first=focusable[0],last=focusable[focusable.length-1],active=document.activeElement;
     if(first&&last){
       if(e.shiftKey&&(active===first||!focusable.includes(active))){e.preventDefault();last.focus();return;}
       if(!e.shiftKey&&active===last){e.preventDefault();first.focus();return;}
     }
   }
   if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(this.modalKind!=='search')this.openPanel('search');return;}
   if(e.isComposing)return;
   if(e.target.id==='tag-new'&&e.key==='Enter'){e.preventDefault();this.action('add-tag',this.editId);return;}
   if(e.target.id==='filter-search'&&e.key==='Enter'){e.preventDefault();const first=this.dialog.querySelector('#search-results [data-action="card-open"]');if(first&&this.filter.query.trim())first.click();else this.action('apply-filter');return;}
   if(e.target.id==='capture-text'&&e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();this.action('capture-save');return;}
   if(e.target.id==='feed-url'&&e.key==='Enter'){e.preventDefault();this.action('feed-add');return;}
   if(e.key==='Escape'&&!this.dialog.open){this.hideDock();return;}
   const typing=e.target.closest?.('input,textarea,[contenteditable]');
   if(Store.pref('singleKeyShortcuts')&&!this.dialog.open&&!typing&&!e.metaKey&&!e.ctrlKey&&!e.altKey){
     if(e.key==='n'||e.key==='N'){e.preventDefault();this.openPanel('capture');return;}
     if(e.key==='r'||e.key==='R'){if(!e.target.matches('[data-card]')||true){e.preventDefault();this.refresh();return;}}
     if(e.key==='t'||e.key==='T'){e.preventDefault();this.action('top');return;}
   }
   if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-card]')){e.preventDefault();this.navigate('#card/'+e.target.dataset.card);}
   if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-stack]')){e.preventDefault();this.action('stack-open','',e.target.dataset.stack);}
   if((e.key==='ArrowLeft'||e.key==='ArrowRight')&&e.target.matches('[data-stack]')){
     const deck=e.target.querySelector('.deck');
     if(deck&&!deck.dataset.busy){e.preventDefault();this.deckSettle(deck,e.key==='ArrowRight'?1:-1);}
   }
 }
}
