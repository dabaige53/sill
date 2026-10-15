/** Every overlay is built here. Panels return HTML; AppController owns state and focus. */
const Panels={
 close(label){return `<div class="sheet-close">${button('x',label,'close')}</div>`;},
 meta(c){return `<div class="preview-meta">${CardPresentation.sourceIcon(c,15)}<span>${esc(CardTemplates.sourceLine(c))}</span></div>`;},
 bookmark(c,s){return button('bookmark',s.bookmarked?'取消收藏':'收藏','bookmark',c.id,'',s.bookmarked?'active':'');},
 later(c,s){return button('glasses',s.later?'取消稍后读':'稍后读','later',c.id,'',s.later?'active':'');},
 bar(...parts){return `<div class="float-bar glass" role="toolbar" aria-label="卡片工具">${parts.filter(Boolean).join('')}</div>`;},
 sep:'<span class="toolbar-sep" aria-hidden="true"></span>',
 reminderTools(c){
   if(!FeedPolicy.supports(c))return '';
   const s=Store.item(c.id);
   if(s.dismissed||s.reminderDone||s.snoozedUntil)return button('undo','恢复提醒','restore-reminder',c.id);
   return button('clock','延后提醒十分钟','snooze',c.id)+button('bell-off','忽略此提醒','dismiss-reminder',c.id)+(c.type==='reminder'?button('check','完成提醒','complete-reminder',c.id):'');
 },
 external(c,label){
   if(!c.url)return '';
   const kind=SourceKinds[c.kind]?.label;
   return `<button type="button" class="solid-button" data-action="external" data-id="${esc(c.id)}">${esc(label||`去${kind&&!['RSS','本地','速记'].includes(kind)?kind:'原文'}`)}</button>`;
 },
 readButton(c,s){
   const p=Math.round((s.progress||0)*100);
   return `<button type="button" class="solid-button" data-action="reader" data-id="${esc(c.id)}">${s.read?'再读一遍':p>0?'继续阅读':'阅读'}${p>0&&!s.read?` <small>${p}%</small>`:''}</button>`;
 },
 /* Preview: content is read here; actions go back to where they belong. */
 preview(app,c){
   const s=Store.item(c.id),note=s.note?`<div class="preview-note">${esc(s.note)}</div>`:'';
   const tags=Store.tags(c).length?`<div class="preview-tags">${Store.tags(c).map(t=>`<span class="chip soft">#${esc(t)}</span>`).join('')}</div>`:'';
   const sheet=(inner,cover='')=>`<div class="sheet preview-sheet"><div class="grabber" aria-hidden="true"></div><div class="sheet-scroll" tabindex="0" role="region" aria-label="卡片内容">${cover}<div class="preview-body">${inner}${note}${tags}</div></div></div>`;
   const close=this.sep+button('x','关闭预览','close');
   const h1=`<h1 id="modal-title" data-shared="title">${esc(c.title)}</h1>`;
   if(c.type==='mail'){
     const sender=c.sender||c.source;
     return sheet(`<div class="preview-sender">${avatar(sender,36)}<span><b>${esc(sender)}</b><small>发给你 · ${esc(c.meta||'')}</small></span></div>${h1}<div class="preview-full">${(c.body||[c.summary]).map(p=>`<p>${esc(p)}</p>`).join('')}</div>${c.attachment?`<span class="ref attachment">${icon('file',15)}<span>${esc(c.attachment)}</span></span>`:''}`)
       +this.bar(this.bookmark(c,s),this.later(c,s),button('tag','编辑标签与备注','edit',c.id),this.external(c,'回复'),close);
   }
   if(c.type==='event'){
     const span=Math.round((c.end-c.start)/60000),timely=eventTimely(c);
     const rows=[c.meeting?`<div class="detail-row"><span class="row-icon">${icon('video',16)}</span><span>${esc(c.meeting.name)}</span><small class="num">${esc(c.meeting.code||'')}</small></div>`:'',
       c.location?`<div class="detail-row"><span class="row-icon">${icon('pin',16)}</span><span>${esc(c.location)}</span></div>`:'',
       c.people?.length?`<div class="detail-row"><span class="row-icon">${icon('at',16)}</span><span>${esc(c.people.join('、'))}</span><small>${c.people.length} 人</small></div>`:''].join('');
     return sheet(`<div class="preview-meta">${esc(dateLabel(c.start))} · <span style="color:var(--accent);font-weight:500">${esc(eventRelative(c))}</span></div><div class="event-hero"><span class="num">${timeString(c.start)}</span><small class="num">至 ${timeString(c.end)} · ${span} 分钟</small></div>${h1}${rows?`<div class="detail-rows">${rows}</div>`:''}${c.body?.length?`<div class="preview-full">${c.body.map(p=>`<p>${esc(p)}</p>`).join('')}</div>`:''}`)
       +this.bar(button('download','下载日程','download-calendar',c.id),this.reminderTools(c),timely&&c.meeting?`<button type="button" class="solid-button" data-action="join" data-id="${esc(c.id)}">加入</button>`:'',close);
   }
   if(c.type==='media'&&c.media==='podcast'){
     const total=c.duration||0,played=Math.round(total*(s.progress||0));
     return `<div class="sheet preview-sheet"><div class="grabber" aria-hidden="true"></div><div class="player"><div class="player-art"></div>${h1}${this.meta(c)}<div class="player-bar"><span class="bar"><i id="podcast-bar" style="width:${Math.round((s.progress||0)*100)}%"></i></span><span class="player-times num"><span id="podcast-played">${duration(played)}</span><span>-${duration(total-played)}</span></span></div><div class="player-controls">${button('rewind','后退 15 秒','podcast-seek',c.id,'-15')}<button type="button" class="player-main" data-action="podcast-play" data-id="${esc(c.id)}" aria-label="播放">${icon('play',22)}</button>${button('ffwd','前进 30 秒','podcast-seek',c.id,'30')}</div></div></div>`
       +this.bar(this.bookmark(c,s),this.later(c,s),button('tag','编辑标签与备注','edit',c.id),c.url?button('external','在播客应用打开','external',c.id):'',close);
   }
   if(c.type==='media'){
     return sheet(`${this.meta(c)}${h1}<div class="media-player"><img src="${Assets[c.image]}" alt=""><div class="media-slide" id="media-slide"></div></div><div class="media-controls">${button('back','上一个片段','media-prev',c.id)}${button('play','播放演示片段','media-play',c.id)}<span class="media-step" id="media-step">1 / ${c.body.length||1}</span>${button('arrow','下一个片段','media-next',c.id)}</div>`)
       +this.bar(this.bookmark(c,s),this.later(c,s),button('tag','编辑标签与备注','edit',c.id),this.external(c),close);
   }
   if(c.type==='file'){
     return sheet(`<div class="preview-meta">${icon('folder',15)}<span>文件 · ${esc(c.source||'')}</span></div>${h1}<div class="detail-rows">${(c.files||[]).map(f=>`<div class="detail-row"><span class="row-icon">${icon(/\.(png|jpe?g|gif|webp)$/i.test(f.name)?'image':'file',16)}</span><span><b>${esc(f.name)}</b><em>${esc(f.meta||'')}</em></span><small>${f.time?esc(relativeTime(f.time)):''}</small></div>`).join('')}</div>`)
       +this.bar(this.bookmark(c,s),button('tag','编辑标签与备注','edit',c.id),close);
   }
   if(c.type==='task'||c.type==='reminder'){
     const list=c.type==='task'?`<div class="detail-task-list">${Store.tasks(c).map(t=>checkItem(c,t)).join('')}</div>`:'';
     const label=c.type==='reminder'?FeedPolicy.label(c,s,Date.now()):c.meta||'';
     return sheet(`<div class="preview-meta">${icon(CardTypes[c.type].icon,15)}<span>${esc(label)}</span></div>${h1}${c.summary?`<p class="preview-lead">${esc(c.summary)}</p>`:''}${list}`)
       +this.bar(this.bookmark(c,s),button('tag','编辑标签与备注','edit',c.id),this.reminderTools(c),close);
   }
   if(c.type==='digest'||c.type==='insight'){
     const st=CardPresentation.weekStats();
     return sheet(`${this.meta(c)}${h1}<div class="stats-trio"><div><b class="num">${st.read}</b><span>已读</span></div><div><b class="num">${st.saved}</b><span>收藏</span></div><div><b class="num">${st.done}</b><span>完成</span></div></div><p class="preview-lead">${esc(st.line)}</p>${(c.body||[]).map(p=>`<p class="muted">${esc(p)}</p>`).join('')}`)
       +this.bar(this.bookmark(c,s),c.why?button('info','为什么看到','why',c.id):'',close);
   }
   // Articles, notes, suggestions: the lifted card shows everything.
   const lead=c.summary&&c.form!=='quote'?`<p class="preview-lead">${esc(c.summary)}</p>`:'';
   const points=c.points?.length?`<ol class="key-points">${c.points.map((p,i)=>`<li><i class="num">${i+1}</i><span>${esc(p)}</span></li>`).join('')}</ol>`:'';
   const related=c.type==='suggestion'?`<div class="refs">${(c.related||[]).map(id=>Store.card(id)).filter(Boolean).map(r=>`<button type="button" class="ref" data-action="card-open" data-id="${esc(r.id)}">${icon(CardTypes[r.type].icon,15)}<span>${esc(r.title)}</span>${icon('chevron',14)}</button>`).join('')}</div>`:'';
   // The whole piece opens right here; full screen is only a wider page for the same text.
   const full=c.body?.length?`<div class="preview-full">${c.body.map(p=>`<p>${esc(p)}</p>`).join('')}</div><div class="reader-end" id="reader-end" aria-hidden="true"></div>`:'';
   const cover=c.image?`<div class="preview-cover"><img data-shared="image" src="${Assets[c.image]}" alt="" draggable="false"></div>`:'';
   return sheet(`${this.meta(c)}${h1}${lead}${points}${related}${full}`,cover)
     +this.bar(this.bookmark(c,s),this.later(c,s),button('tag','编辑标签与备注','edit',c.id),c.url?button('external','在新标签页打开原文','external',c.id):'',c.why?button('info','为什么看到','why',c.id):'',c.body?.length?button('expand','全屏','reader',c.id):'',close);
 },
 /* Reader: a page with a thin progress line. Reaching the end closes the ring. */
 reader(app,c,loading=false){
   const s=Store.item(c.id);
   const body=loading?`<div class="skeleton-lines" aria-hidden="true"><i></i><i></i><i></i><i></i></div>`:c.body.map(p=>`<p>${esc(p)}</p>`).join('');
   return `<div class="reader-progress" id="reader-progress" style="width:${Math.round(s.progress*100)}%"></div><div class="reader-scroll" id="reader-scroll"><article class="reader-body">${this.meta(c)}<h1 id="modal-title" data-shared="title">${esc(c.title)}</h1>${c.image?`<img class="reader-cover" src="${Assets[c.image]}" alt="" draggable="false">`:''}<div class="reading-caption sr-only">${esc([c.source,c.meta].filter(Boolean).join(' · '))}</div>${body}<div class="reader-end" id="reader-end" aria-hidden="true"></div></article></div>`
     +this.bar(button('collapse','退出全屏','close'),this.bookmark(c,s),button('tag','编辑标签与备注','edit',c.id),this.sep,button('x','关闭阅读','close-all'));
 },
 lightbox(c,index=0){
   const photos=c.photos?.length?c.photos:[c.image];const i=Math.max(0,Math.min(photos.length-1,index));
   return `<div class="lightbox-top"><span>${esc([c.location,dateLabel(c.time)].filter(Boolean).join(' · '))}</span><span id="modal-title" class="sr-only">${esc(c.title)}</span>${button('x','关闭照片','close')}</div>
   <div class="lightbox-stage">${photos.length>1?button('back','上一张','photo-step',c.id,'-1'):''}<img src="${Assets[photos[i]]}" alt="${esc(c.title)}，第 ${i+1} 张">${photos.length>1?button('arrow','下一张','photo-step',c.id,'1'):''}</div>
   <div class="lightbox-thumbs">${photos.map((p,n)=>`<button type="button" class="${n===i?'on':''}" data-action="photo-go" data-id="${esc(c.id)}" data-extra="${n}" aria-label="第 ${n+1} 张"><img src="${Assets[p]}" alt=""></button>`).join('')}</div>`;
 },
 /* Tags and notes: chips you can remove, a field to add, a note below. */
 editor(app,id){
   const c=Store.card(id),s=Store.item(id),current=[...app.editTags];
   const suggest=[...new Set([...(c.tags||[]),'工作','阅读','想法','设计','AI','生活'])].filter(t=>!app.editTags.has(t)).slice(0,6);
   return `<div class="sheet"><div class="grabber" aria-hidden="true"></div>${this.close('关闭标签与备注')}<div class="panel-content"><div class="panel-sub" id="modal-title">${esc(c.title)}</div>
   <div class="tag-editor" id="editor-tags">${current.map(t=>`<span class="tag-pill">${esc(t)}<button type="button" data-action="editor-tag" data-extra="${esc(t)}" aria-label="移除标签 ${esc(t)}">${icon('x',12)}</button></span>`).join('')}<input id="tag-new" aria-label="新的标签" placeholder="添加标签" maxlength="30"></div>
   ${suggest.length?`<div class="chip-suggest">${suggest.map(t=>`<button type="button" class="chip soft" data-action="editor-tag" data-extra="${esc(t)}">${esc(t)}</button>`).join('')}</div>`:''}
   <label class="sr-only" for="note-editor">备注</label><textarea class="editor-note" id="note-editor" maxlength="4000" placeholder="写一句备注…">${esc(s.note)}</textarea>
   <div class="panel-footer"><span class="muted">${icon('lock',13)} 存在这台设备</span><button class="solid-button" data-action="save-note" data-id="${esc(id)}">保存</button></div></div></div>`;
 },
 /* Why am I seeing this: reason, evidence, and two ways to adjust. */
 why(app,c){
   const w=c.why||{reason:`来自你接入的「${c.source||'本地'}」`,basis:[c.time?`${relativeDay(c.time)}更新`:'']};
   const related=(c.related||[]).map(id=>Store.card(id)).filter(Boolean);
   return `<div class="sheet"><div class="grabber" aria-hidden="true"></div>${this.close('关闭说明')}<div class="panel-content"><h1 id="modal-title">为什么看到</h1>
   <div class="row-list" style="margin-top:12px"><div class="why-line" style="min-height:36px">${icon('sparkles',16)}<span>${esc(w.reason)}</span></div>${(w.basis||[]).filter(Boolean).map(b=>`<div class="why-line" style="min-height:36px">${icon('clock',16)}<span>${esc(b)}</span></div>`).join('')}</div>
   ${related.length?`<div class="chips" style="margin-top:12px">${related.map(r=>`<button type="button" class="chip soft" data-action="card-open" data-id="${esc(r.id)}">${esc(r.title.slice(0,10))}${r.title.length>10?'…':''}</button>`).join('')}</div>`:''}
   <div class="why-actions" style="margin-top:16px"><button type="button" class="text-link" data-action="less-like" data-id="${esc(c.id)}">少看这类</button><button type="button" class="text-link" data-action="never-show" data-id="${esc(c.id)}">不再提示</button></div></div></div>`;
 },
 /* Search: field, chips, and grouped results. Archived matches come last. */
 search(app){
   const f=app.filter,tags=[...new Set(Store.state.cards.flatMap(c=>Store.tags(c)))].slice(0,8);
   const types=[['all','全部',''],['article','资讯','book'],['mail','消息','mail'],['note','笔记','note'],['task','待办','check-circle'],['event','日程','calendar'],['media','媒体','video']];
   const status=[['unread','未读'],['saved','收藏'],['later','稍后读']];
   return `<h1 id="modal-title" class="sr-only">搜索与筛选</h1><div class="search-pill">${icon('search',18)}<input type="search" id="filter-search" aria-label="搜索标题、摘要和备注" placeholder="搜索卡片、备注、来源" value="${esc(f.query)}" data-input="search" autocomplete="off"><span class="search-count num" id="filter-result" role="status" aria-live="polite" aria-atomic="true">${app.filtered().length} 张</span>${f.query?button('x','清空搜索','clear-query'):''}</div>
   <div class="search-chips" role="group" aria-label="筛选">${types.map(([k,v,ic])=>`<button type="button" class="chip ${f.type===k?'active':''}" data-action="filter-type" data-extra="${k}" aria-pressed="${f.type===k}">${v}</button>`).join('')}${status.map(([k,v])=>`<button type="button" class="chip ${f.status===k?'active':''}" data-action="filter-status" data-extra="${k}" aria-pressed="${f.status===k}">${v}</button>`).join('')}${tags.map(t=>`<button type="button" class="chip ${f.tag===t?'active':''}" data-action="filter-tag" data-extra="${esc(t)}" aria-pressed="${f.tag===t}">#${esc(t)}</button>`).join('')}</div>
   <div class="search-results" id="search-results">${this.searchResults(app)}</div>`;
 },
 searchResults(app){
   const q=app.filter.query.trim();if(!q)return '';
   const now=Date.now(),hits=app.searchAll(q);
   if(!hits.desk.length&&!hits.shelved.length)return `<p class="search-empty">没有找到「${esc(q)}」</p>`;
   const row=c=>{const s=Store.item(c.id),text=[c.summary,s.note,...(c.body||[])].find(t=>t&&t.toLocaleLowerCase().includes(q.toLocaleLowerCase()))||c.summary||'';
     const i=text.toLocaleLowerCase().indexOf(q.toLocaleLowerCase()),snippet=i>18?'…'+text.slice(i-14):text;
     return `<button type="button" class="list-row" data-action="card-open" data-id="${esc(c.id)}"><span class="row-icon">${icon(CardTypes[c.type].icon,16)}</span><span class="row-main"><b>${highlight(c.title,q)}</b><small>${highlight(snippet.slice(0,60),q)}</small></span><span class="row-side">${esc(relativeDay(c.time||now,now))}</span></button>`;};
   return `${hits.desk.length?`<div class="group-label">桌面 · <span class="num">${hits.desk.length}</span></div><div class="row-list">${hits.desk.slice(0,8).map(row).join('')}</div>`:''}${hits.shelved.length?`<div class="group-label">已收起 · <span class="num">${hits.shelved.length}</span></div><div class="row-list">${hits.shelved.slice(0,8).map(row).join('')}</div>`:''}`;
 },
 /* Archives: grouped by week, one row per card; “放回桌面” appears on hover. */
 archive(app,which){
   const now=Date.now(),list=app.shelved(which).sort((a,b)=>(b.time||0)-(a.time||0));
   const groups=new Map();for(const c of list){const at=which==='read'?(Store.item(c.id).readAt||c.time):c.time,age=now-at,label=age<7*86400000?'本周':age<14*86400000?'上周':'更早';(groups.get(label)||groups.set(label,[]).get(label)).push(c);}
   const date=ts=>{const d=new Date(ts);return `${d.getMonth()+1}月${d.getDate()}日`;};
   return `<div class="sheet"><div class="grabber" aria-hidden="true"></div>${this.close('关闭')}<div class="panel-content"><div class="panel-head"><h1 id="modal-title">${which==='read'?'读过的':'放了很久'}</h1>${which==='stale'&&list.length?`<button type="button" class="text-link" data-action="archive-all">全部归档</button>`:`<span class="muted num">${list.length}</span>`}</div>
   <div class="sheet-scroll" style="max-height:60vh;margin:0 -28px;padding:0 28px">${list.length?[...groups].map(([label,cards])=>`<div class="group-label">${label}</div><div class="row-list">${cards.map(c=>`<div class="list-row hoverable"><span class="row-icon">${icon(CardTypes[c.type].icon,16)}</span><button type="button" class="row-main" data-action="card-open" data-id="${esc(c.id)}" style="text-align:left"><b>${esc(c.title)}</b><small>${esc(c.source||'')}</small></button><span class="row-side"><span class="row-date num">${date(which==='read'?(Store.item(c.id).readAt||c.time):c.time)}</span><button type="button" class="text-link row-put" data-action="restore-card" data-id="${esc(c.id)}">放回桌面</button></span></div>`).join('')}</div>`).join(''):`<p class="search-empty">这里是空的</p>`}</div></div></div>`;
 },
 /* Settings: five groups, one screen each. */
 settingsGroups:[['sources','来源','rss'],['desk','桌面','monitor'],['look','外观','eye'],['keys','快捷键','keyboard'],['data','数据与隐私','lock']],
 settings(app,group='desk'){
   const p=k=>Store.pref(k),row=(label,side)=>`<div class="setting-row"><span>${label}</span><span class="setting-side">${side}</span></div>`;
   const pages={
     sources:()=>`<div class="panel-head" style="margin:0 0 14px"><h1 id="modal-title" style="margin:0">来源</h1><button type="button" class="text-link" data-action="sources-add">添加</button></div>${this.sourceRows()}`,
     desk:()=>`<h1 id="modal-title">桌面</h1><div class="settings-card">${row('同一来源刷屏时叠起来',`<span>超过 5 张</span>${toggle('stack',p('stack'),'同一来源刷屏时叠起来')}`)}${row('读过的卡片慢慢变淡',toggle('fadeRead',p('fadeRead'),'读过的卡片慢慢变淡'))}${row('收进「读过的」',segmented('archiveAfter',[['3d','3 天'],['7d','一周'],['never','不收']],p('archiveAfter'),'收进读过的'))}${row('会议和提醒到点浮上来',toggle('floatTimely',p('floatTimely'),'会议和提醒到点浮上来'))}</div>
       <div class="settings-card">${row('读完上推收起',toggle('collapseOnFinish',p('collapseOnFinish'),'读完上推收起'))}${row('新内容提示',segmented('newHint',[['away','离开顶部时'],['off','不提示']],p('newHint'),'新内容提示'))}</div>`,
     look:()=>`<h1 id="modal-title">外观</h1><div class="settings-card">${row('主题',segmented('theme',[['system','跟随系统'],['light','浅色'],['dark','深色']],p('theme'),'主题'))}${row('卡片宽度',segmented('density',[['compact','紧凑'],['standard','标准'],['roomy','宽松']],p('density'),'卡片宽度'))}${row('减少动态效果',toggle('reduceMotion',p('reduceMotion'),'减少动态效果'))}${row('减少透明度',toggle('reduceTransparency',p('reduceTransparency'),'减少透明度'))}</div>`,
     keys:()=>`<h1 id="modal-title">快捷键</h1><div class="settings-card">${row('单键快捷键 N / R / T',toggle('singleKeyShortcuts',p('singleKeyShortcuts'),'单键快捷键 N / R / T'))}${[['搜索','⌘ K'],['记一笔','N'],['打开卡片','Enter'],['关闭浮层','Esc'],['刷新','R'],['回到顶部','T']].map(([a,k])=>row(a,k.split(' ').map(x=>`<kbd>${x}</kbd>`).join(''))).join('')}</div>`,
     data:()=>`<h1 id="modal-title">数据与隐私</h1><div class="settings-card">${row('存放位置',`<span>${window.__QG_LOCAL__?'本机数据目录':'这个浏览器'}</span>`)}${row('占用',`<span class="num">${formatBytes(Store.bytes())}</span>`)}${row('AI 只在本机处理',toggle('aiLocal',p('aiLocal'),'AI 只在本机处理'))}</div>
       <div class="settings-card">${row('<button type="button" class="text-link" data-action="export-all">导出全部卡片…</button>','')}${row('<button type="button" class="text-link warn" data-action="clear-all">清除全部数据…</button>','')}</div>`
   };
   return `<div class="sheet"><div class="grabber" aria-hidden="true"></div>${this.close('关闭设置')}<div class="settings-layout"><nav class="settings-nav" aria-label="设置分组">${this.settingsGroups.map(([k,v,ic])=>`<button type="button" class="${k===group?'on':''}" data-action="settings-group" data-extra="${k}" aria-current="${k===group}">${v}</button>`).join('')}</nav><div class="settings-main">${pages[group]()}</div></div></div>`;
 },
 /* Sources: one dot says the state; only a broken source shows a button. */
 sourceRows(){
   const rows=Store.state.sources.map(s=>{
     const k=SourceKinds[s.kind]||SourceKinds.local,detail=[s.status==='paused'?'已暂停':s.detail,s.status==='ok'&&s.syncedAt?relativeTime(s.syncedAt):''].filter(Boolean).join(' · ');
     const side=s.status==='attention'?`<span class="status-dot attention" aria-hidden="true"></span><button type="button" class="pill soft" data-action="source-connect" data-extra="${esc(s.kind)}">重新登录</button>`:`<span class="status-dot ${s.status}" aria-hidden="true"></span>${toggle(s.id,s.enabled&&s.status!=='paused','启用 '+s.name,'source-toggle')}`;
     return `<div class="list-row hoverable"><span class="row-icon">${icon(k.icon,16)}</span><button type="button" class="row-main" data-action="source-open" data-id="${esc(s.id)}" style="text-align:left"><b>${esc(s.name)}</b><small>${esc(detail)}</small></button><span class="row-side">${side}</span></div>`;
   }).join('');
   return `<div class="row-list">${rows||'<p class="muted" style="padding:12px 0">还没有来源。</p>'}</div><div class="panel-foot-row">${icon('lock',14)}<span>全部存在这台设备 · <span class="num">${formatBytes(Store.bytes())}</span></span><button type="button" class="text-link" data-action="export-all">导出</button></div>`;
 },
 sources(){
   return `<div class="sheet"><div class="grabber" aria-hidden="true"></div>${this.close('关闭来源')}<div class="panel-content"><div class="panel-head"><h1 id="modal-title">来源</h1><button type="button" class="text-link" data-action="sources-add">添加</button></div>${this.sourceRows()}</div></div>`;
 },
 addKinds:['readwise','rss','youtube','twitter','podcast','mail','calendar','reminders','photos','folder','linear','github','web','file','more'],
 sourcesAdd(){
   const tile=k=>{const v=k==='file'?{label:'导入文件',icon:'file'}:k==='more'?{label:'更多',icon:'plus'}:k==='web'?{label:'浏览器',icon:'globe'}:SourceKinds[k];return `<button type="button" class="source-tile" data-action="${k==='file'?'import-pick':k==='more'?'capture':'source-connect'}" data-extra="${k}"><span class="row-icon">${icon(v.icon,18)}</span>${esc(v.label)}</button>`;};
   return `<div class="sheet"><div class="grabber" aria-hidden="true"></div>${this.close('关闭')}<div class="panel-content"><div class="panel-head"><h1 id="modal-title">添加来源</h1><span class="muted">也可以直接把文件拖进窗口</span></div><div class="source-grid">${this.addKinds.map(tile).join('')}</div></div></div>`;
 },
 connectCopy:{readwise:'读取高亮和 Reader 里的文档',youtube:'读取稍后观看和订阅',twitter:'读取书签',mail:'读取收件箱里需要回复的邮件',linear:'读取指派给你的事项',github:'读取等你 review 的 PR 和 Issue',podcast:'读取订阅的节目'},
 systemKinds:{calendar:'日历',reminders:'提醒事项',photos:'照片',folder:'文件夹'},
 connect(kind){
   const k=SourceKinds[kind];
   if(this.systemKinds[kind])return this.permission(kind);
   if(kind==='rss')return `<div class="sheet"><div class="grabber" aria-hidden="true"></div>${this.close('关闭')}<div class="connect"><div class="connect-icons">${sillIcon(56)}<span>···</span><span class="app">${icon('rss',24)}</span></div><h1 id="modal-title">添加 RSS</h1><p class="muted">粘贴订阅地址，或导入阅读器导出的 OPML 文件</p><input id="feed-url" type="url" placeholder="https://example.com/feed.xml" aria-label="订阅地址" style="width:100%;max-width:360px"><div class="welcome-actions" style="margin-top:4px"><button type="button" class="soft-button" data-action="import-pick">导入 OPML</button><button type="button" class="solid-button" data-action="feed-add">订阅</button></div></div></div>`;
   if(kind==='web')return this.capture({},true);
   return `<div class="sheet"><div class="grabber" aria-hidden="true"></div>${this.close('关闭')}<div class="connect"><div class="connect-icons">${sillIcon(56)}<span>···</span><span class="app">${icon(k.icon,24)}</span></div><h1 id="modal-title">连接 ${esc(k.label)}</h1><p class="muted">${esc(this.connectCopy[kind]||'读取这个来源的内容')}，只存在这台设备</p>${segmented('connectRange',[['30d','最近 30 天'],['all','全部']],'30d','读取范围').replace(/data-action="pref"/g,'data-action="connect-range"')}<button type="button" class="solid-button" data-action="source-authorize" data-extra="${esc(kind)}" style="margin-top:6px">在浏览器中授权</button></div></div>`;
 },
 permission(kind){
   const label=this.systemKinds[kind];
   return `<div class="sheet"><div class="permission"><span class="row-icon">${icon(SourceKinds[kind].icon,24)}</span><h1 id="modal-title">读取${esc(label)}</h1><p class="muted">${icon('lock',13)} 只在这台设备上读取</p><div class="permission-actions"><button type="button" class="soft-button" data-action="permission-later" data-extra="${esc(kind)}">以后</button><button type="button" class="solid-button" data-action="permission-allow" data-extra="${esc(kind)}">允许</button></div></div></div>`;
 },
 importPreview(app){
   const p=app.importing,picked=app.importPicked,kind=Importers.labels[p.kind]||'项';
   const total=p.entries.length,recent=p.entries.filter(e=>!e.time||Date.now()-e.time<30*86400000).length;
   return `<div class="sheet"><div class="grabber" aria-hidden="true"></div>${this.close('取消导入')}<div class="panel-content"><div class="panel-sub">${esc(p.name)}</div><div class="panel-head"><h1 id="modal-title"><span class="num">${total}</span> ${p.kind==='opml'?'个 ':''}${esc(kind)}</h1><button type="button" class="text-link" data-action="import-toggle-all">${picked.size===total?'全不选':'全选'}</button></div>
   <div class="row-list import-list">${p.entries.map((e,i)=>`<button type="button" class="list-row" data-action="import-toggle" data-extra="${i}" role="checkbox" aria-checked="${picked.has(i)}"><span class="check-box ${picked.has(i)?'on':''}">${picked.has(i)?icon('check',12):''}</span><span class="row-main"><b>${esc(e.label)}</b></span><span class="row-side">${esc(e.detail||'')}</span></button>`).join('')}</div>
   ${p.notice?`<p role="status">${esc(p.notice)}</p>`:''}
   <div class="panel-footer">${p.kind==='opml'?'<span></span>':segmented('importRange',[['30d','最近 30 天'],['all','全部']],app.importRange,'导入范围').replace(/data-action="pref"/g,'data-action="import-range"')}<button type="button" class="solid-button" data-action="import-run" ${picked.size?'':'disabled'}>导入${p.kind!=='opml'&&app.importRange==='30d'&&recent<total?` <small>${recent}</small>`:''}</button></div></div></div>`;
 },
 sourceDetail(id){
   const s=Store.source(id);if(!s)return this.sources();const k=SourceKinds[s.kind]||SourceKinds.local;
   const set=(name,options,value,label)=>segmented(name,options,value,label).replace(/data-action="pref"/g,`data-action="source-set"`).replace(/data-id="([^"]+)"/g,`data-id="${esc(id)}:$1"`);
   return `<div class="sheet"><div class="grabber" aria-hidden="true"></div>${this.close('关闭')}<div class="panel-content"><div style="display:flex;align-items:center;gap:12px;margin-bottom:18px"><span class="row-icon" style="width:40px;height:40px">${icon(k.icon,20)}</span><div><h1 id="modal-title" style="margin:0">${esc(s.name)}</h1><div class="muted" style="display:flex;align-items:center;gap:6px"><span class="status-dot ${s.status}"></span>${s.status==='paused'?'已暂停':s.status==='attention'?esc(s.detail):s.syncedAt?relativeTime(s.syncedAt)+'同步':'已连接'}</div></div></div>
   <div class="settings-card"><div class="setting-row"><span>刷屏时叠起来</span><span class="setting-side"><span>超过 5 张</span>${toggle(id+':stack',s.stack,'刷屏时叠起来','source-flag')}</span></div><div class="setting-row"><span>点卡片</span>${set('open',[['inside','站内阅读'],['web','跳转网页']],s.open,'点卡片')}</div><div class="setting-row"><span>只取最近</span>${set('range',[['30d','30 天'],['all','全部']],s.range,'只取最近')}</div></div>
   <div class="why-actions" style="margin-top:14px"><button type="button" class="text-link" data-action="source-pause" data-id="${esc(id)}">${s.status==='paused'?'恢复':'暂停'}</button><button type="button" class="text-link warn" data-action="source-remove" data-id="${esc(id)}">断开…</button></div></div></div>`;
 },
 confirm(title,detail,actions){
   return `<div class="sheet"><div class="permission"><h1 id="modal-title">${esc(title)}</h1><p class="muted">${esc(detail)}</p><div class="permission-actions">${actions}</div></div></div>`;
 },
 /* Capture: one field. A link becomes an article, a line becomes a note. */
 capture(app,fromSources=false){
   const next=Store.state.cards.filter(c=>c.type==='event'&&c.end>Date.now()&&c.start-Date.now()<3*3600000).sort((a,b)=>a.start-b.start)[0];
   return `<div class="sheet"><div class="grabber" aria-hidden="true"></div>${this.close('关闭')}<div class="panel-content"><h1 id="modal-title" class="sr-only">记一笔</h1><div class="capture-field">${icon('plus',18)}<textarea id="capture-text" aria-label="记一笔，或粘贴链接" placeholder="记一笔，或粘贴链接" maxlength="4000"></textarea></div>
   ${next&&!fromSources?`<div class="next-event"><span class="num">${timeString(next.start)}</span><span>${esc(next.title)}<small>${esc(eventRelative(next))}</small></span>${eventTimely(next)&&next.meeting?`<button type="button" class="solid-button" data-action="join" data-id="${esc(next.id)}">加入</button>`:''}</div>`:''}
   <div class="panel-footer"><span class="muted">${fromSources?'浏览器扩展和手机分享也会存到这里':'<kbd>N</kbd> 随时记一笔'}</span><button type="button" class="solid-button" data-action="capture-save">存</button></div></div></div>`;
 },
 /* First run. */
 welcomePick(app){
   const groups=['读','回','做 · 跟进','排时间 · 存档'];
   const kinds=Object.entries(SourceKinds).filter(([,v])=>v.group);
   return `<div class="sheet"><div class="grabber" aria-hidden="true"></div>${this.close('关闭')}<div class="panel-content"><h1 id="modal-title">想把什么放上窗台？</h1><p class="panel-sub">之后随时可以在设置里增减</p><div class="source-chips">${groups.map(g=>`<div class="group-label">${g}</div><div class="chips">${kinds.filter(([,v])=>v.group===g).map(([k,v])=>`<button type="button" class="chip pick ${app.welcomePicked.has(k)?'active':''}" data-action="welcome-pick" data-extra="${k}" aria-pressed="${app.welcomePicked.has(k)}">${esc(v.label)}</button>`).join('')}</div>`).join('')}</div>
   <div class="panel-footer"><button type="button" class="text-link" data-action="import-pick">从文件导入</button><button type="button" class="solid-button" data-action="welcome-continue" ${app.welcomePicked.size?'':'disabled'}>继续 <small>${app.welcomePicked.size}</small></button></div></div></div>`;
 }
};
function welcomeHTML({actions=null,detail=""}={}){
 return `<section class="welcome" aria-labelledby="welcome-title">${sillIcon(72)}<h1 id="welcome-title">Sill</h1><p>把要看的、要做的，放在窗台上</p>${detail}<div class="welcome-actions">${actions===null?'<button type="button" class="solid-button" data-action="welcome-start">接入来源</button><button type="button" class="text-link" data-action="welcome-demo">先看示例</button>':actions}</div></section>`;
}
function relativeTime(ts,now=Date.now()){
 const min=Math.round((now-ts)/60000);
 if(min<1)return '刚刚';if(min<60)return `${min} 分钟前`;
 const h=Math.round(min/60);if(h<24)return `${h} 小时前`;
 return relativeDay(ts,now);
}
function formatBytes(n){return n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:n<1073741824?`${(n/1048576).toFixed(1)} MB`:`${(n/1073741824).toFixed(1)} GB`;}
