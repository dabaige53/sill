const CardTemplates={
 header(c){return `<div class="card-meta top-meta">${icon(CardTypes[c.type].icon,16)}<span>${esc(c.source||CardTypes[c.type].label)}</span></div>`;},
 footer(c){const s=Store.item(c.id);return `<div class="card-footer"><span>${esc(c.meta||c.source||'')}</span>${['article','note','media'].includes(c.type)?ring(s.progress):''}</div>`;},
 article(c){return `${c.image?`<div class="card-image-wrap"><img class="card-image" src="${Assets[c.image]}" alt="" draggable="false"></div>`:''}<div class="card-body">${c.image?'':this.header(c)}<h2>${esc(c.title)}</h2><p>${esc(c.summary)}</p>${c.image?`<div class="card-footer"><span>${esc(c.source)} · ${esc(c.meta||'')}</span>${ring(Store.item(c.id).progress)}</div>`:this.footer(c)}</div>`;},
 mail(c){return `<div class="card-body">${this.header(c)}<h2>${esc(c.title)}</h2><p>${esc(c.summary)}</p>${c.attachment?`<div class="attachment">${icon('file',18)}<span>${esc(c.attachment)}</span>${icon('download',14)}</div>`:''}${this.footer(c)}</div>`;},
 note(c){return `<div class="card-body">${this.header(c)}${c.form==='quote'?`<div class="quote-mark">${icon('quote',25)}</div>`:''}<h2>${esc(c.title)}</h2><p>${esc(c.summary)}</p>${this.footer(c)}</div>`;},
 task(c){
   const tasks=Store.tasks(c),done=tasks.every(t=>t.done);
   if(done)return `<div class="card-body completed-body"><span class="completed-symbol">${icon('check',18)}</span><div><span class="eyebrow">已完成</span><h2>${esc(c.title)}</h2></div></div>`;
   return `<div class="card-body">${this.header(c)}<h2>${esc(c.title)}</h2><p class="task-subtitle">${esc(c.summary)}</p><div class="checklist">${tasks.map(t=>checkItem(c,t)).join('')}</div><div class="card-footer"><span>${esc(c.meta||'正在进行')}</span><span class="task-count">${tasks.filter(t=>t.done).length}/${tasks.length}</span></div></div>`;
 },
 event(c){return `<div class="card-body"><div class="card-meta top-meta event-meta">${icon('calendar',16)}<span>${eventRelative(c)}</span></div><h2>${esc(c.title)}</h2><div class="event-time">${timeString(c.start)}<span>—</span>${timeString(c.end)}</div><p>${esc(c.summary)}</p><div class="event-footer">${avatars(c.people)}<span class="tiny-muted">${esc(c.source)}</span></div></div>`;},
 reminder(c){return `<div class="card-body"><div class="reminder-row"><span class="reminder-icon">${icon('bell',20)}</span><div><div class="eyebrow">${esc(FeedPolicy.label(c,Store.item(c.id),Date.now()))}</div><h2>${esc(c.title)}</h2><p>${esc(c.summary)}</p></div></div></div>`;},
 media(c){return `<div class="card-image-wrap media-cover"><img class="card-image" src="${Assets[c.image]}" alt="" draggable="false"><span class="play-mark">${icon('play',22)}</span><span class="media-length">4 个片段</span></div><div class="card-body"><h2>${esc(c.title)}</h2><p>${esc(c.summary)}</p><div class="card-footer"><span>${esc(c.source)}</span>${ring(Store.item(c.id).progress)}</div></div>`;},
 insight(c){return `<div class="card-body">${this.header(c)}<h2>${esc(c.title)}</h2><div class="reading-figure"><strong data-live-time>${minutes(Store.state.seconds)}</strong>${ring(Math.min(1,Store.state.seconds/1200),56)}</div><p>阅读页前台停留 · 分钟 / 秒</p><div class="quiet-bars" aria-hidden="true">${[18,30,23,45,37,54,28,42,30,50,34,24,46,30,18,38,24,30,42,26,18,28,22,16].map((h,i)=>`<i style="height:${h}px;opacity:${.17+i*.017}"></i>`).join('')}</div></div>`;},
 digest(c){const s=Store.stats();return `<div class="card-body">${this.header(c)}<h2>${esc(c.title)}</h2><p>${esc(c.summary)}</p><div class="stats-trio"><div><b>${s.read}</b><span>已读</span></div><div><b>${s.saved}</b><span>收藏</span></div><div><b>${s.done}</b><span>完成</span></div></div></div>`;},
 suggestion(c){return `<div class="card-body"><div class="card-meta top-meta">${icon('sparkles',17)}<span>${esc(c.source)}</span></div><h2>${esc(c.title)}</h2><p>${esc(c.summary)}</p><div class="linked-cards" aria-hidden="true"><span>${icon('note',15)}</span><i></i><span>${icon('book',15)}</span></div>${this.footer(c)}</div>`;}
};
function cardHTML(c){
 const s=Store.item(c.id),isDone=c.type==='task'&&Store.tasks(c).every(t=>t.done);
 return `<article class="feed-card type-${c.type} form-${c.form||'standard'} ${s.seen?'is-seen':''} ${s.read?'is-read':''} ${isDone?'is-complete':''}" tabindex="0" data-card="${esc(c.id)}" aria-label="${esc(CardTypes[c.type].label+'：'+c.title)}">
 ${CardTemplates[c.type](c)}
 <div class="card-actions glass" aria-label="卡片操作">
 ${button('sparkles','将卡片加入 AI 对话','card-ai',c.id)}
 ${button('bookmark',s.bookmarked?'取消收藏':'收藏卡片','bookmark',c.id,'',s.bookmarked?'active':'')}
 ${button('more','更多卡片操作','card-more',c.id)}
 </div><span class="selected-tick" aria-hidden="true">${icon('check',13)}</span>
 </article>`;
}
