/** One renderer for the live feed; design-system/ documents the same blocks. Rendering never mutates Store.
 * A card is a stack of blocks: head · media · text · data · list · act. Content is read here; actions go back to the source.
 */
const CardPresentation={
 state(c,options={}){
   const defaults={seen:false,read:false,bookmarked:false,later:false,selected:false,progress:0,snoozedUntil:0,dismissed:false,reminderDone:false};
   return {...defaults,...(options.state!==undefined?options.state:Store.state.items[c.id]||{})};
 },
 tasks(c,state){return (c.tasks||[]).map(t=>({...t,done:Array.isArray(state.taskDone)?state.taskDone.includes(t.id):t.done}));},
 action(ctx,glyph,label,action,id='',extra='',className=''){
   return ctx.passive?`<span class="icon-button ${className}" role="img" aria-label="${esc(label)}">${icon(glyph)}</span>`:button(glyph,label,action,id,extra,className);
 },
 sourceIcon(c,size=16){
   if(c.sources?.length>1)return `<span class="source-icons" aria-hidden="true">${c.sources.slice(0,3).map(s=>`<span>${icon(SourceKinds[s.kind]?.icon||'book',12)}</span>`).join('')}</span>`;
   // Content shows where it came from; things to do show what they are.
   const byType=['task','event','reminder','digest','insight','photo','file'].includes(c.type);
   return icon(byType?CardTypes[c.type].icon:SourceKinds[c.kind]?.icon||CardTypes[c.type].icon,size);
 },
 weekStats(){
   const since=Date.now()-7*86400000,s=Store.stats(since);
   const late=s.overdue.length?`${s.overdue.length} 个待办拖过了截止时间，建议先处理「${s.overdue[0].title}」。`:'这周没有拖过截止的待办。';
   return {...s,line:late};
 }
};
const CardTemplates={
 head(c,ctx,text,right=''){
   return `<div class="card-head">${CardPresentation.sourceIcon(c)}<span class="card-src">${esc(text)}</span>${right?`<span class="card-head-right">${right}</span>`:''}</div>`;
 },
 sourceLine(c){return [c.sources?.length>1?c.sources.map(s=>s.name).join(' · '):c.source||CardTypes[c.type].label,c.meta].filter(Boolean).join(' · ');},
 // Unfinished reading shows its percentage; a finished read changes the card color instead.
 progress(c,ctx){
   const s=ctx.state;if(!CardTypes[c.type].readable||s.read||!(s.progress>0))return '';
   return `<span class="card-progress num">${ring(s.progress,14)}${Math.round(s.progress*100)}%</span>`;
 },
 title(c,ctx,className=''){
   const tag=ctx.passive?'span':'button',attributes=ctx.passive?'':` type="button" data-action="card-open" data-id="${esc(c.id)}"`;
   return `<h2 class="card-title ${className}"><${tag}${attributes} class="card-title-button" data-shared="title">${esc(c.title)}</${tag}></h2>`;
 },
 summary(c,short=false){
   if(c.points?.length)return `${c.summary?`<p class="card-summary clamp-2">${esc(c.summary)}</p>`:''}<ol class="key-points">${c.points.slice(0,3).map((p,i)=>`<li><i class="num">${i+1}</i><span>${esc(p)}</span></li>`).join('')}</ol>`;
   return c.summary?`<p class="card-summary ${short?'clamp-2':''}">${esc(c.summary)}</p>`:'';
 },
 cover(c,ctx,inner=''){
   const tone=AssetTones[c.image]||'var(--surface)';
   return `<div class="card-cover" style="background:${tone}"><img class="card-image" data-shared="image" src="${Assets[c.image]}" alt="" draggable="false" loading="lazy" decoding="async">${inner}</div>`;
 },
 article(c,ctx){
   return `${c.image?this.cover(c,ctx):''}<div class="card-body">${this.head(c,ctx,this.sourceLine(c),this.progress(c,ctx))}${this.title(c,ctx)}${this.summary(c,!!c.image)}</div>`;
 },
 mail(c,ctx){
   const sender=c.sender||c.source||'邮件';
   return `<div class="card-body"><div class="sender">${avatar(sender)}<span><b>${esc(sender)}</b><small>邮件${c.meta?' · '+esc(c.meta):''}</small></span></div>${this.title(c,ctx)}${this.summary(c)}${c.attachment?`<span class="ref attachment">${icon('file',15)}<span>${esc(c.attachment)}</span></span>`:''}</div>`;
 },
 note(c,ctx){
   if(c.kind!=='capture'&&c.form!=='quote')return `<div class="card-body">${this.head(c,ctx,this.sourceLine(c),this.progress(c,ctx))}${this.title(c,ctx)}${this.summary(c)}</div>`;
   if(c.form==='quote')return `<div class="card-body quote-body">${this.head(c,ctx,this.sourceLine(c))}${this.title(c,ctx,'quote-text')}</div>`;
   // A quick note is its own text; the title only names it in search and archives.
   const tag=ctx.passive?'span':'button',attributes=ctx.passive?'':` type="button" data-action="card-open" data-id="${esc(c.id)}" aria-label="${esc(c.title)}"`;
   return `<div class="card-body">${this.head(c,ctx,this.sourceLine(c))}<h2 class="card-title note-text"><${tag}${attributes} class="card-title-button" data-shared="title">${esc(c.summary||c.title)}</${tag}></h2></div>`;
 },
 task(c,ctx){
   const tasks=ctx.tasks,done=tasks.filter(t=>t.done).length;
   if(done===tasks.length)return `<div class="card-body done-row"><span class="done-mark">${icon('check',14)}</span><span class="done-copy"><small>已完成 · ${tasks.length} 项</small>${this.title(c,ctx)}</span></div>`;
   const item=t=>ctx.passive?`<div class="check-item ${t.done?'is-done':''}" role="img" aria-label="${esc(t.text)}：${t.done?'已完成':'未完成'}">${checkMark(t.done)}<span>${esc(t.text)}</span></div>`:checkItem(c,t);
   return `<div class="card-body">${this.head(c,ctx,c.meta||'待办',`<span class="num task-count">${done}/${tasks.length}</span>`)}${this.title(c,ctx)}<div class="checklist">${tasks.slice(0,3).map(item).join('')}</div>${tasks.length>3?`<span class="more-items">另有 ${tasks.length-3} 项</span>`:''}</div>`;
 },
 event(c,ctx){
   const span=Math.round((c.end-c.start)/60000),timely=eventTimely(c,ctx.now)&&c.meeting;
   return `<div class="card-body">${this.head(c,ctx,dateLabel(c.start),`<span class="event-relative">${esc(eventRelative(c,ctx.now))}</span>`)}
   <div class="event-time"><span class="num event-start">${timeString(c.start)}</span><span class="event-end"><span class="num">至 ${timeString(c.end)}</span><small>共 ${span} 分钟</small></span></div>
   ${this.title(c,ctx)}${c.people?.length?`<div class="people">${avatars(c.people)}<span>${esc(c.people.join('、'))}</span></div>`:''}
   ${timely&&!ctx.passive?`<div class="card-actions-row">${pill('加入','join',c.id,'primary','',`加入${c.meeting.name}`)}</div>`:''}</div>`;
 },
 reminder(c,ctx){
   const s=ctx.state,settled=s.reminderDone||s.dismissed||s.snoozedUntil>0,label=FeedPolicy.label(c,s,ctx.now);
   const due=!settled&&/现在|到期/.test(label);
   const acts=ctx.passive?'':settled?pill('恢复提醒','restore-reminder',c.id,'soft'):`${pill('稍后 10 分钟','snooze',c.id,'soft grow','','延后十分钟')}${pill('完成','complete-reminder',c.id,'primary','','完成提醒')}`;
   return `<div class="card-body">${this.head(c,ctx,'提醒',`<span class="reminder-label ${due?'is-due':''}">${esc(label)}</span>`)}
   <div class="reminder-row"><span class="check-dot" aria-hidden="true"></span>${this.title(c,ctx)}</div>${c.summary?`<p class="card-summary indent">${esc(c.summary)}</p>`:''}
   <div class="reminder-actions" role="group" aria-label="提醒操作">${acts}</div></div>`;
 },
 media(c,ctx){
   const s=ctx.state;
   if(c.media==='podcast'){
     const total=c.duration||0,played=total*(s.progress||0);
     return `<div class="card-body">${this.head(c,ctx,this.sourceLine(c),this.progress(c,ctx))}${this.title(c,ctx)}${this.summary(c,true)}
     <div class="mini-player"><span class="mini-play" aria-hidden="true">${icon('play',14)}</span><span class="bar"><i style="width:${Math.round((s.progress||0)*100)}%"></i></span><span class="num">${played?'-'+duration(total-played):duration(total)}</span></div></div>`;
   }
   const inner=`<span class="play-mark" aria-hidden="true">${icon('play',18)}</span>${c.duration?`<span class="media-length num">${duration(c.duration)}</span>`:''}`;
   return `${c.image?this.cover(c,ctx,inner):''}<div class="card-body">${this.head(c,ctx,this.sourceLine(c),this.progress(c,ctx))}${this.title(c,ctx)}</div>`;
 },
 digest(c,ctx){
   const s=CardPresentation.weekStats();
   return `<div class="card-body">${this.head(c,ctx,this.sourceLine(c))}${this.title(c,ctx)}<div class="stats-trio"><div><b class="num">${s.read}</b><span>已读</span></div><div><b class="num">${s.saved}</b><span>收藏</span></div><div><b class="num">${s.done}</b><span>完成</span></div></div><p class="card-summary">${esc(s.line)}</p></div>`;
 },
 insight(c,ctx){return `<div class="card-body">${this.head(c,ctx,this.sourceLine(c))}${this.title(c,ctx)}<div class="stats-trio"><div><b class="num"${ctx.passive?'':' data-live-time'}>${minutes(Store.state.seconds)}</b><span>本次阅读</span></div></div></div>`;},
 suggestion(c,ctx){
   const related=(c.related||[]).map(id=>Store.card(id)).filter(Boolean).slice(0,2),tag=ctx.passive?'span':'button';
   return `<div class="card-body">${this.head(c,ctx,this.sourceLine(c))}${this.title(c,ctx)}${this.summary(c)}<div class="refs" aria-label="关联内容">${related.map(r=>`<${tag}${ctx.passive?'':` type="button" data-action="card-open" data-id="${esc(r.id)}"`} class="ref">${icon(CardTypes[r.type].icon,15)}<span>${esc(r.title)}</span>${icon('chevron',14)}</${tag}>`).join('')}</div></div>`;
 },
 photo(c,ctx){
   const photos=c.photos?.length?c.photos:[c.image];
   return `<div class="card-cover photo-grid n${Math.min(3,photos.length)}">${photos.slice(0,3).map(p=>`<img class="card-image" src="${Assets[p]}" alt="" draggable="false" loading="lazy" decoding="async" style="background:${AssetTones[p]}">`).join('')}</div><div class="card-body">${this.head(c,ctx,['照片',c.location||c.meta].filter(Boolean).join(' · '),photos.length>3?`<span class="num">${photos.length}</span>`:'')}${this.title(c,ctx)}</div>`;
 },
 file(c,ctx){
   const files=c.files||[];
   return `<div class="card-body">${this.head(c,ctx,['文件',c.source].filter(Boolean).join(' · '),c.meta?esc(c.meta):'')}${this.title(c,ctx)}<div class="file-rows">${files.slice(0,3).map(f=>`<span class="file-row">${icon(/\.(png|jpe?g|gif|webp)$/i.test(f.name)?'image':'file',15)}<span>${esc(f.name)}</span></span>`).join('')}</div>${files.length>3?`<span class="more-items">另有 ${files.length-3} 个</span>`:''}</div>`;
 }
};
function cardHTML(c,options={}){
 options=options&&typeof options==='object'?options:{};
 const s=CardPresentation.state(c,options),tasks=CardPresentation.tasks(c,s),isDone=c.type==='task'&&tasks.length&&tasks.every(t=>t.done);
 const ctx={state:s,tasks,passive:!!options.passive,now:options.now??Date.now()};
 const read=CardTypes[c.type].readable&&s.read&&Store.pref('fadeRead');
 const attributes=ctx.passive?' data-passive="true"':` tabindex="0" data-card="${esc(c.id)}"`;
 const covered=(c.image&&['article','media'].includes(c.type))||c.type==='photo';
 return `<article class="feed-card ${options.compact?'':'feed-item'} type-${c.type} ${covered?'has-cover':''} ${options.compact?'is-compact':''} ${read?'is-read':''} ${s.bookmarked?'is-bookmarked':''} ${s.selected?'is-selected':''} ${s.snoozedUntil>0?'is-snoozed':''} ${isDone?'is-complete':''}"${attributes} aria-label="${esc(CardTypes[c.type].label+'：'+c.title)}">
 ${CardTemplates[c.type]?.(c,ctx)||CardTemplates.article(c,ctx)}
 <div class="card-actions" role="group" aria-label="卡片操作">${CardPresentation.action(ctx,'more','更多卡片操作','card-more',c.id,'','card-more-trigger')}</div><span class="selected-tick" aria-hidden="true">${icon('check',13)}</span>
 </article>`;
}
/** A burst from one source, folded. Opening it expands in place; nothing navigates. */
function stackHTML(key,cards){
 // A deck: one whole card per piece, in the same place. Swipe moves the top card away; tap spreads the pile out in place.
 const top=cards[0],n=cards.length;
 const face=(c,i)=>`<div class="deck-card${i===0?' is-top':i===1?' is-next':''}" data-index="${i}"${i?' aria-hidden="true"':''}><div class="card-body">${CardTemplates.head(c,{state:{}},c.source,`<span class="num stack-count"><span class="stack-pos">${i+1}</span>/${n}</span>`)}<h2 class="card-title">${i===0?`<button type="button" class="card-title-button" data-action="stack-open" data-extra="${esc(key)}">${esc(c.title)}</button>`:esc(c.title)}</h2>${c.summary?`<p class="card-summary clamp-2">${esc(c.summary)}</p>`:''}</div></div>`;
 return `<article class="feed-card feed-item stack-card" tabindex="0" data-stack="${esc(key)}" aria-label="${esc(`${top.source}：${n} 张叠在一起，左右翻看，按下展开`)}">
 <span class="deck-edge deep" aria-hidden="true"></span><span class="deck-edge" aria-hidden="true"></span><div class="deck">${cards.map(face).join('')}</div></article>`;
}
function stackOpenHTML(key,cards){
 return `<section class="feed-item stack-open" data-stack-open="${esc(key)}"><div class="stack-open-head">${icon(SourceKinds[cards[0].kind]?.icon||'rss',15)}<span>${esc(cards[0].source)} · <span class="num">${cards.length}</span></span><button type="button" class="text-link" data-action="stack-close" data-extra="${esc(key)}">收起</button></div>${cards.map(c=>cardHTML(c,{compact:true})).join('')}</section>`;
}
/** The two quiet rows at the end of the desk: what was read, and what waited too long. */
function shelfHTML(read,stale){
 if(!read&&!stale)return '';
 return `<nav class="feed-item shelf-entry" aria-label="收起的卡片">${read?`<button type="button" class="shelf-row" data-action="archive" data-extra="read">${icon('ring',16)}<b>读过的</b><span>· 上周</span><span class="num">${read}</span></button>`:''}${stale?`<button type="button" class="shelf-row" data-action="archive" data-extra="stale">${icon('clock',16)}<b>放了很久</b><span>· 两周未读</span><span class="num">${stale}</span></button>`:''}</nav>`;
}
