/** One renderer for the live feed; design-system/ documents the same structure. Rendering never mutates Store. */
const CardPresentation={
 state(c,options={}){
   const defaults={seen:false,read:false,bookmarked:false,later:false,selected:false,progress:0,snoozedUntil:0,dismissed:false,reminderDone:false};
   return {...defaults,...(options.state!==undefined?options.state:Store.state.items[c.id]||{})};
 },
 tasks(c,state){return (c.tasks||[]).map(t=>({...t,done:Array.isArray(state.taskDone)?state.taskDone.includes(t.id):t.done}));},
 action(ctx,glyph,label,action,id='',extra='',className=''){
   return ctx.passive?`<span class="icon-button ${className}" role="img" aria-label="${esc(label)}">${icon(glyph)}</span>`:button(glyph,label,action,id,extra,className);
 },
 stats(){
   const cards=Store.state.cards,items=Store.state.items;
   return {read:cards.filter(c=>items[c.id]?.read).length,saved:cards.filter(c=>items[c.id]?.bookmarked).length,done:cards.filter(c=>c.type==='task'&&this.tasks(c,items[c.id]||{}).every(t=>t.done)).length};
 }
};
const CardTemplates={
 header(c){return `<div class="card-meta top-meta"><span>${esc(c.source||CardTypes[c.type].label)}</span>${c.meta?`<span aria-hidden="true">·</span><span>${esc(c.meta)}</span>`:''}</div>`;},
 title(c,ctx){const tag=ctx.passive?'span':'button',attributes=ctx.passive?'':` type="button" data-action="card-open" data-id="${esc(c.id)}"`;return `<h2><${tag}${attributes} class="card-title-button" data-shared="title">${esc(c.title)}</${tag}></h2>`;},
 cover(c,ctx,extra=''){const tag=ctx.passive?'div':'button',attributes=ctx.passive?'':` type="button" data-action="card-open" data-id="${esc(c.id)}" aria-label="预览：${esc(c.title.replace(/\n/g,''))}"`;return `<${tag}${attributes} class="card-image-wrap ${extra}"><img class="card-image" data-shared="image" src="${Assets[c.image]}" alt="" draggable="false">${extra==='media-cover'?`<span class="play-mark">${icon('play',22)}</span><span class="media-length">4 个片段</span>`:''}</${tag}>`;},
 footer(c,ctx){const s=ctx.state;if(!s.read&&!s.progress)return '';return `<div class="card-footer"><span class="reading-state">${ring(s.progress)}<span>${s.read?'已读':'继续阅读'}</span></span></div>`;},
 article(c,ctx){return `${c.image?this.cover(c,ctx):''}<div class="card-body">${this.header(c)}${this.title(c,ctx)}${!c.image&&c.summary?`<p>${esc(c.summary)}</p>`:''}${this.footer(c,ctx)}</div>`;},
 mail(c,ctx){return `<div class="card-body">${this.header(c)}${this.title(c,ctx)}${c.summary?`<p>${esc(c.summary)}</p>`:''}${c.attachment?`<div class="attachment">${icon('file',16)}<span>${esc(c.attachment)}</span></div>`:''}</div>`;},
 note(c,ctx){return `<div class="card-body">${this.header(c)}${this.title(c,ctx)}${c.form!=='quote'&&c.summary?`<p>${esc(c.summary)}</p>`:''}${this.footer(c,ctx)}</div>`;},
 task(c,ctx){
   const tasks=ctx.tasks,done=tasks.every(t=>t.done);
   if(done)return `<div class="card-body completed-body"><span class="completed-symbol">${icon('check',18)}</span><div><span class="eyebrow">已完成</span>${this.title(c,ctx)}</div></div>`;
   const item=t=>ctx.passive?`<div class="check-item ${t.done?'is-done':''}" role="img" aria-label="${esc(t.text)}：${t.done?'已完成':'未完成'}"><span class="check-dot">${t.done?icon('check',13):''}</span><span>${esc(t.text)}</span></div>`:checkItem(c,t);
   return `<div class="card-body">${this.title(c,ctx)}<div class="checklist">${tasks.slice(0,3).map(item).join('')}</div><div class="card-footer"><span>${esc(c.meta||'待办')}</span><span class="task-count">${tasks.filter(t=>t.done).length}<span> / ${tasks.length}</span></span></div>${tasks.length>3?`<span class="task-overflow">另有 ${tasks.length-3} 项，打开查看</span>`:''}</div>`;
 },
 event(c,ctx){
   const date=new Date(c.start),day=date.toLocaleDateString('zh-CN',{month:'long',day:'numeric'}),weekday=date.toLocaleDateString('zh-CN',{weekday:'short'});
   return `<div class="card-body">${c.provenance?this.header(c):''}<div class="card-meta top-meta event-meta"><span>${esc(day)} ${esc(weekday)}</span><span aria-hidden="true">·</span><span>${esc(eventRelative(c))}</span></div>${this.title(c,ctx)}<div class="event-time">${timeString(c.start)}<span>—</span>${timeString(c.end)}</div></div>`;
 },
 reminder(c,ctx){
   const s=ctx.state,settled=s.reminderDone||s.dismissed||s.snoozedUntil>0;
   return `<div class="card-body"><div class="reminder-status"><span class="status-dot" aria-hidden="true"></span><span class="reminder-label">${esc(FeedPolicy.label(c,s,ctx.now))}</span></div><div class="reminder-row"><div class="reminder-copy">${this.title(c,ctx)}</div></div><div class="reminder-footer"><div class="reminder-actions" role="group" aria-label="提醒操作">${settled?CardPresentation.action(ctx,'undo','恢复提醒','restore-reminder',c.id):CardPresentation.action(ctx,'clock','延后十分钟','snooze',c.id)+CardPresentation.action(ctx,'check','完成提醒','complete-reminder',c.id,'','reminder-complete')}</div></div></div>`;
 },
 media(c,ctx){return `${this.cover(c,ctx,'media-cover')}<div class="card-body">${this.header(c)}${this.title(c,ctx)}${this.footer(c,ctx)}</div>`;},
 insight(c,ctx){return `<div class="card-body">${this.title(c,ctx)}<div class="reading-figure"><strong${ctx.passive?'':' data-live-time'}>${minutes(Store.state.seconds)}</strong>${ring(Math.min(1,Store.state.seconds/1200),36)}</div><p>本次阅读 · 分钟 / 秒</p></div>`;},
 digest(c,ctx){const s=CardPresentation.stats();return `<div class="card-body">${this.title(c,ctx)}<div class="stats-trio"><div><b>${s.read}</b><span>已读</span></div><div><b>${s.saved}</b><span>收藏</span></div><div><b>${s.done}</b><span>完成</span></div></div>`;},
 suggestion(c,ctx){
   const related=(c.related||[]).map(id=>Store.card(id)).filter(Boolean).slice(0,2),tag=ctx.passive?'span':'button';
   return `<div class="card-body">${this.title(c,ctx)}<div class="linked-cards" aria-label="关联内容">${related.map(r=>`<${tag}${ctx.passive?'':` type="button" data-action="card-open" data-id="${esc(r.id)}"`} class="linked-card"><span class="linked-card-icon">${icon(CardTypes[r.type].icon,15)}</span><span>${esc(r.title.replace(/\n/g,''))}</span>${icon('arrow',14)}</${tag}>`).join('')}</div><div class="suggestion-footer">${CardPresentation.action(ctx,'sparkles','将关联建议加入 AI 对话','card-ai',c.id,'','suggestion-action')}</div></div>`;
 }
};
function cardHTML(c,options={}){
 options=options&&typeof options==='object'?options:{};
 const s=CardPresentation.state(c,options),tasks=CardPresentation.tasks(c,s),isDone=c.type==='task'&&tasks.every(t=>t.done),ctx={state:s,tasks,passive:!!options.passive,now:options.now??Date.now()};
 const attributes=ctx.passive?' data-passive="true"':` tabindex="0" data-card="${esc(c.id)}"`;
 return `<article class="feed-card type-${c.type} form-${c.form||'standard'} ${s.seen?'is-seen':''} ${s.read?'is-read':''} ${s.bookmarked?'is-bookmarked':''} ${s.selected?'is-selected':''} ${s.snoozedUntil>0?'is-snoozed':''} ${isDone?'is-complete':''}"${attributes} aria-label="${esc(CardTypes[c.type].label+'：'+c.title)}">
 ${CardTemplates[c.type](c,ctx)}
 <div class="card-actions" role="group" aria-label="卡片操作">
 ${CardPresentation.action(ctx,'more','更多卡片操作','card-more',c.id,'','card-more-trigger')}
 </div><span class="selected-tick" aria-hidden="true">${icon('check',13)}</span>
 </article>`;
}
