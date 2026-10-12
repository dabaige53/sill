const Panels={
 filter(app){
   const f=app.filter, allTags=[...new Set(Store.state.cards.flatMap(c=>Store.tags(c)))];
   const kinds=[['all',{label:'全部',icon:'layers'}],...Object.entries(CardTypes)];
   return `<div class="dialog-close">${button('x','关闭筛选','close')}</div><div class="panel-content"><h1 id="modal-title">找回你想看的</h1>
    <div class="search-field">${icon('search')}<input type="search" id="filter-search" aria-label="搜索标题、摘要和备注" placeholder="搜索内容、备注…" value="${esc(f.query)}" data-input="search" autocomplete="off"></div>
    <span class="field-label">内容</span><div class="filter-grid">${kinds.map(([k,v])=>`<button type="button" class="filter-kind ${f.type===k?'active':''}" data-action="filter-type" data-extra="${k}" aria-pressed="${f.type===k}"><span class="kind-disc">${icon(v.icon)}</span><span>${v.label}</span></button>`).join('')}</div>
    <span class="field-label">状态</span><div class="chips">${[['all','全部'],['unread','未读'],['saved','收藏'],['later','稍后读'],['read','已读'],['snoozed','已延后'],['dismissed','已忽略'],['done','提醒已完成']].map(([k,v])=>tagChip(v,f.status===k,'filter-status').replace(`data-extra="${v}"`,`data-extra="${k}"`)).join('')}</div>
    <span class="field-label">排序</span><div class="chips">${[['priority','重要优先'],['unread','未读优先'],['time','时间排序']].map(([k,v])=>tagChip(v,app.sort===k,'sort-feed').replace(`data-extra="${v}"`,`data-extra="${k}"`)).join('')}</div><p class="settings-note" style="margin:8px 0">${app.sort==='priority'?'到期提醒、会前 15 分钟的日程和临近截止的待办优先；其余保留原顺序。':app.sort==='unread'?'未读卡片优先，同一状态保留原顺序。':'按内容时间从新到旧排列。'}延后或忽略的提醒可从状态筛选找回。</p>
    <span class="field-label">标签</span><div class="chips">${allTags.map(t=>tagChip(t,f.tag===t)).join('')}</div>
    <div class="panel-footer"><p id="filter-result">${app.filtered().length} 张卡片</p><div><button class="text-button" data-action="clear-filter">清空</button><button class="solid-button" data-action="apply-filter">查看内容</button></div></div></div>`;
 },
 editor(app,id){
   const c=Store.card(id),s=Store.item(id),tags=[...new Set([...c.tags,...s.tags,'工作','阅读','想法','设计','AI','生活'])];
   app.editTags=new Set(Store.tags(c));
   return `<div class="dialog-close">${button('x','关闭标签与备注','close')}</div><div class="panel-content"><h1 id="modal-title">留下一点线索</h1><p class="settings-note" style="margin-top:0">${esc(c.title)}</p><span class="field-label">标签</span><div class="chips" id="editor-tags">${tags.map(t=>tagChip(t,app.editTags.has(t),'editor-tag')).join('')}</div><div class="tag-add"><input id="tag-new" aria-label="新的标签" placeholder="添加一个标签" maxlength="30">${button('plus','添加标签','add-tag',id)}</div><label class="field-label" for="note-editor">备注</label><textarea class="editor-note" id="note-editor" maxlength="4000" placeholder="记下此刻的想法…">${esc(s.note)}</textarea><div class="panel-footer"><p>保存在本地</p><button class="solid-button" data-action="save-note" data-id="${esc(id)}">保存</button></div></div>`;
 },
 settings(app){
   return `<div class="dialog-close">${button('x','关闭使用说明','close')}</div><div class="panel-content"><h1 id="modal-title">这个安静的空间</h1><div class="setting-row"><div><span>减少透明度</span><small>更清晰的实体操作表面</small></div><button class="toggle" type="button" role="switch" aria-label="减少透明度" aria-checked="${Store.state.preferences.reduceTransparency}" data-action="toggle-transparency"></button></div><div class="setting-row"><div><span>减少动态效果</span><small>跟随设备偏好 · 当前${MotionEngine.reduced?'已开启':'未开启'}</small></div>${icon(MotionEngine.reduced?'check':'moon',19)}</div>
   <p class="settings-note">Enter 打开卡片。Esc 关闭浮层。Cmd/Ctrl + K 搜索。预览与完整阅读支持浏览器返回。</p>
   <p class="settings-note">卡片和操作记录保存在本机。AI 更新后，页面自动同步。网页关闭后不运行后台提醒。</p><div class="panel-footer"></div></div>`;
 },
 reminderTools(c){
   if(!FeedPolicy.supports(c))return '';
   const s=Store.item(c.id);
   if(s.dismissed||s.reminderDone||s.snoozedUntil)return button('undo','恢复提醒','restore-reminder',c.id);
   return button('clock','延后提醒十分钟','snooze',c.id)+button('x','忽略此提醒','dismiss-reminder',c.id)+(c.type==='reminder'?button('check','完成提醒','complete-reminder',c.id):'');
 },
 preview(app,c,reading=false){
   const s=Store.item(c.id);
   const top=`<div class="dialog-top"><div class="card-meta">${icon(CardTypes[c.type].icon,16)}<span>${esc(c.source||CardTypes[c.type].label)}</span></div>${button(reading?'back':'x',reading?'返回预览':'关闭预览','close')}</div>`;
   if(reading){
     return `<div class="dialog-content" id="reader-scroll">${top}<div class="reader-body"><h1 id="modal-title" data-shared="title">${esc(c.title)}</h1><div class="reading-caption">本地阅读记录</div>${c.image?`<img class="preview-image" data-shared="image" src="${Assets[c.image]}" alt="" draggable="false">`:''}${c.body.map(p=>`<p>${esc(p)}</p>`).join('')}<div class="reader-rule"></div><p class="reading-caption">正文已结束。</p><div class="reader-end">${ring(s.progress,28)}</div></div></div><div class="dialog-tools"><div class="tools-cluster">${button('bookmark',s.bookmarked?'取消收藏':'收藏','bookmark',c.id,'',s.bookmarked?'active':'')}${button('tag','编辑标签与备注','edit',c.id)}</div><div class="tools-cluster"><span class="eyebrow" id="reader-percent">${Math.round(s.progress*100)}%</span>${ring(s.progress)}</div></div>`;
   }
   const detail=c.type==='task'?`<div class="detail-task-list">${Store.tasks(c).map(t=>checkItem(c,t)).join('')}</div>`:
     c.type==='event'?`<p class="preview-sample">${esc(new Date(c.start).toLocaleDateString('zh-CN',{year:'numeric',month:'long',day:'numeric',weekday:'long'}))}</p><div class="event-time">${timeString(c.start)}<span>—</span>${timeString(c.end)}</div><div class="event-footer">${avatars(c.people)}<span class="tiny-muted">${esc((c.people||[]).join('、'))}</span></div><p class="preview-sample">${c.body.map(esc).join('<br>')}</p>`:
     c.type==='media'?`<div class="media-player"><img src="${Assets[c.image]}" alt=""><div class="media-slide" id="media-slide"></div></div><div class="media-controls">${button('back','上一个片段','media-prev',c.id)}${button('play','播放演示片段','media-play',c.id)}<span class="media-step" id="media-step">1 / 4</span>${button('arrow','下一个片段','media-next',c.id)}</div>`:
     `<p class="preview-sample">${esc(c.body?.[0]||'')}</p>`;
   const actions=`<div class="tools-cluster">${button('bookmark',s.bookmarked?'取消收藏':'收藏卡片','bookmark',c.id,'',s.bookmarked?'active':'')}${button('tag','编辑标签与备注','edit',c.id)}${button('clock',s.later?'取消稍后读':'稍后阅读','later',c.id,'',s.later?'active':'')}${button(s.read?'undo':'check','标记为'+(s.read?'未读':'已读'),'toggle-read',c.id)}</div><div class="tools-cluster">${c.type==='event'?button('download','下载日程','download-calendar',c.id):''}${this.reminderTools(c)}${c.url?button('external','在新标签页打开来源文档','external',c.id):''}${['article','note','suggestion','digest','insight'].includes(c.type)?button('expand','进入完整阅读','reader',c.id):''}</div>`;
   return `<div class="dialog-content">${top}${c.image&&c.type!=='media'?`<img class="preview-image" data-shared="image" src="${Assets[c.image]}" alt="" draggable="false">`:''}<div class="preview-body"><h1 id="modal-title" data-shared="title">${esc(c.title)}</h1><p class="preview-lead">${esc(c.summary||'')}</p>${detail}${s.note?`<div class="preview-note">${esc(s.note)}</div>`:''}<div class="preview-meta"><span>${esc(FeedPolicy.supports(c)&&c.type==='reminder'?FeedPolicy.label(c,s,Date.now()):c.meta||c.source||'')}</span>${ring(s.progress)}</div></div></div><div class="dialog-tools">${actions}</div>`;
 }
};
