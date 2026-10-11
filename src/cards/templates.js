const CardTemplates={
 header(c){return `<div class="card-meta top-meta">${icon(CardTypes[c.type].icon,15)}<span>${esc(c.source||CardTypes[c.type].label)}</span></div>`;},
 title(c){return `<h2><button type="button" class="card-title-button" data-action="card-open" data-id="${esc(c.id)}" data-shared="title">${esc(c.title)}</button></h2>`;},
 cover(c,extra=''){return `<button type="button" class="card-image-wrap ${extra}" data-action="card-open" data-id="${esc(c.id)}" aria-label="预览：${esc(c.title.replace(/\n/g,''))}"><img class="card-image" data-shared="image" src="${Assets[c.image]}" alt="" draggable="false">${extra==='media-cover'?`<span class="play-mark">${icon('play',22)}</span><span class="media-length">4 个片段</span>`:''}</button>`;},
 footer(c){const s=Store.item(c.id);return `<div class="card-footer"><span>${esc(c.meta||c.source||'')}</span>${['article','note','media'].includes(c.type)?`<span class="reading-state">${s.read?'<span>已读</span>':''}${ring(s.progress)}</span>`:''}</div>`;},
 article(c){return `${c.image?this.cover(c):''}<div class="card-body">${this.header(c)}${this.title(c)}<p>${esc(c.summary)}</p>${this.footer(c)}</div>`;},
 mail(c){return `<div class="card-body">${this.header(c)}${this.title(c)}<p>${esc(c.summary)}</p>${c.attachment?`<div class="attachment">${icon('file',18)}<span>${esc(c.attachment)}</span>${icon('download',14)}</div>`:''}${this.footer(c)}</div>`;},
 note(c){return `<div class="card-body">${this.header(c)}${c.form==='quote'?`<div class="quote-mark" aria-hidden="true">${icon('quote',28)}</div>`:''}${this.title(c)}<p>${esc(c.summary)}</p>${this.footer(c)}</div>`;},
 task(c){
   const tasks=Store.tasks(c),done=tasks.every(t=>t.done);
   if(done)return `<div class="card-body completed-body"><span class="completed-symbol">${icon('check',18)}</span><div><span class="eyebrow">已完成</span>${this.title(c)}</div></div>`;
   return `<div class="card-body">${this.header(c)}${this.title(c)}<p class="task-subtitle">${esc(c.summary)}</p><div class="checklist">${tasks.map(t=>checkItem(c,t)).join('')}</div><div class="card-footer"><span>${esc(c.meta||'正在进行')}</span><span class="task-count">${tasks.filter(t=>t.done).length}<span> / ${tasks.length}</span></span></div></div>`;
 },
 event(c){
   const date=new Date(c.start),day=date.toLocaleDateString('zh-CN',{month:'long',day:'numeric'}),weekday=date.toLocaleDateString('zh-CN',{weekday:'short'});
   return `<div class="card-body"><div class="card-meta top-meta event-meta">${icon('calendar',15)}<span>${esc(eventRelative(c))}</span></div><div class="event-date">${esc(day)}<span>${esc(weekday)}</span></div>${this.title(c)}<div class="event-time">${timeString(c.start)}<span>—</span>${timeString(c.end)}</div><p>${esc(c.summary)}</p><div class="event-footer">${avatars(c.people)}<span class="tiny-muted">${esc(c.source)}</span></div></div>`;
 },
 reminder(c){
   const s=Store.item(c.id),settled=s.reminderDone||s.dismissed||s.snoozedUntil>0;
   return `<div class="card-body"><div class="reminder-status"><span class="status-dot" aria-hidden="true"></span><span class="reminder-label">${esc(FeedPolicy.label(c,s,Date.now()))}</span></div><div class="reminder-row"><div class="reminder-copy">${this.title(c)}<p>${esc(c.summary)}</p></div><span class="reminder-icon" aria-hidden="true">${icon(s.reminderDone?'check':'bell',20)}</span></div><div class="reminder-footer"><span>${esc(c.source||'提醒')}</span><div class="reminder-actions" role="group" aria-label="提醒操作">${settled?button('undo','恢复提醒','restore-reminder',c.id):button('clock','延后十分钟','snooze',c.id)+button('check','完成提醒','complete-reminder',c.id,'','reminder-complete')}</div></div></div>`;
 },
 media(c){return `${this.cover(c,'media-cover')}<div class="card-body">${this.header(c)}${this.title(c)}<p>${esc(c.summary)}</p>${this.footer(c)}</div>`;},
 insight(c){return `<div class="card-body">${this.header(c)}${this.title(c)}<div class="reading-figure"><strong data-live-time>${minutes(Store.state.seconds)}</strong>${ring(Math.min(1,Store.state.seconds/1200),52)}</div><p>阅读页前台停留 · 分钟 / 秒</p><div class="quiet-bars" aria-hidden="true">${[18,30,23,45,37,54,28,42,30,50,34,24,46,30,18,38,24,30,42,26,18,28,22,16].map((h,i)=>`<i style="height:${h}px;opacity:${.17+i*.017}"></i>`).join('')}</div></div>`;},
 digest(c){const s=Store.stats();return `<div class="card-body">${this.header(c)}${this.title(c)}<p>${esc(c.summary)}</p><div class="stats-trio"><div><b>${s.read}</b><span>已读</span></div><div><b>${s.saved}</b><span>收藏</span></div><div><b>${s.done}</b><span>完成</span></div></div></div>`;},
 suggestion(c){
   const related=(c.related||[]).map(id=>Store.card(id)).filter(Boolean);
   return `<div class="card-body">${this.header(c)}${this.title(c)}<p>${esc(c.summary)}</p><div class="linked-cards" aria-label="关联内容">${related.map(r=>`<button type="button" class="linked-card" data-action="card-open" data-id="${esc(r.id)}"><span class="linked-card-icon">${icon(CardTypes[r.type].icon,15)}</span><span>${esc(r.title.replace(/\n/g,''))}</span>${icon('arrow',14)}</button>`).join('')}</div><div class="suggestion-footer"><span>${esc(c.meta||'继续这个想法')}</span>${button('sparkles','将关联建议加入 AI 对话','card-ai',c.id,'','suggestion-action')}</div></div>`;
 }
};
function cardHTML(c){
 const s=Store.item(c.id),isDone=c.type==='task'&&Store.tasks(c).every(t=>t.done);
 return `<article class="feed-card type-${c.type} form-${c.form||'standard'} ${s.seen?'is-seen':''} ${s.read?'is-read':''} ${isDone?'is-complete':''}" tabindex="0" data-card="${esc(c.id)}" aria-label="${esc(CardTypes[c.type].label+'：'+c.title)}">
 ${CardTemplates[c.type](c)}
 <div class="card-actions" role="group" aria-label="卡片操作">
 <div class="card-quick-actions glass">${button('sparkles','将卡片加入 AI 对话','card-ai',c.id)}${button('bookmark',s.bookmarked?'取消收藏':'收藏卡片','bookmark',c.id,'',s.bookmarked?'active':'')}</div>
 ${button('more','更多卡片操作','card-more',c.id,'','card-more-trigger')}
 </div><span class="selected-tick" aria-hidden="true">${icon('check',13)}</span>
 </article>`;
}
