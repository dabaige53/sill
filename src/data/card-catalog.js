/** Canonical card inventory. Add a card type or visual form here when the product gains one. */
const CardCatalog={
 variants:[
   {key:'article-image',id:'article-01',type:'article',form:'image',title:'封面资讯',anatomy:'来源 · 封面 · 标题 · 摘要 · 阅读进度',behavior:'点击预览，继续阅读；可收藏或加入 AI 上下文。'},
   {key:'article-standard',id:'article-04',type:'article',form:'standard',title:'文字资讯',anatomy:'来源 · 标题 · 摘要 · 阅读进度',behavior:'适合没有封面的内容；打开与读完分别记录。'},
   {key:'mail-standard',id:'mail-01',type:'mail',form:'standard',title:'邮件',anatomy:'发件人 · 主题 · 摘要 · 附件 · 时间',behavior:'点击预览正文，在详情中下载演示附件。'},
   {key:'note-quote',id:'note-01',type:'note',form:'quote',title:'摘录笔记',anatomy:'来源 · 引文符号 · 摘录 · 补充说明',behavior:'保留句子的节奏；通过更多操作编辑标签与备注。'},
   {key:'note-standard',id:'note-02',type:'note',form:'standard',title:'普通笔记',anatomy:'来源 · 标题 · 内容片段 · 时间',behavior:'支持预览、阅读，以及作为 AI 上下文引用。'},
   {key:'task-active',id:'task-01',type:'task',form:'standard',title:'待办清单',anatomy:'来源 · 标题 · 可勾选项目 · 完成数量',behavior:'直接勾选任务；全部完成后自动收拢。'},
   {key:'task-completed',id:'task-02',type:'task',form:'standard',title:'完成待办',anatomy:'完成标识 · 状态 · 标题',behavior:'完成时收拢；打开详情可恢复项目。展示当前浏览器真实状态。'},
   {key:'event-standard',id:'event-01',type:'event',form:'standard',title:'日程',anatomy:'相对时间 · 日期 · 标题 · 时间段 · 参与者',behavior:'快速判断时间；点击查看完整议程。'},
   {key:'reminder-compact',id:'reminder-01',type:'reminder',form:'compact',title:'提醒',anatomy:'到期状态 · 内容 · 来源 · 两个直接动作',behavior:'卡内延后或完成，操作后可撤销；没有打断式弹窗。'},
   {key:'media-image',id:'media-01',type:'media',form:'image',title:'媒体内容',anatomy:'封面 · 播放标识 · 来源 · 标题 · 片段数量',behavior:'打开交互演示详情；此原型不连接外部视频播放器。'},
   {key:'insight-data',id:'insight-01',type:'insight',form:'data',title:'阅读反馈',anatomy:'来源 · 标题 · 实时分钟数 · 进度环',behavior:'根据本地阅读页前台停留时间更新。'},
   {key:'digest-data',id:'digest-01',type:'digest',form:'data',title:'行为回顾',anatomy:'来源 · 标题 · 描述 · 三组汇总',behavior:'根据当前浏览器的已读、收藏、完成状态更新。'},
   {key:'suggestion-standard',id:'suggestion-01',type:'suggestion',form:'standard',title:'关联建议',anatomy:'关联来源 · 说明 · 可点引用 · AI 操作',behavior:'打开关联内容或加入 AI 引用；加入引用不会自动发送。'}
 ],
 card(variant){return Store.card(variant.id)||Store.state.cards.find(c=>c.type===variant.type&&(c.form||'standard')===variant.form)||SeedCards.find(c=>c.id===variant.id);},
 states(now=Date.now()){
   return [
     {key:'default',id:'article-04',title:'默认',caption:'标题与摘要优先，工具在意图出现时浮现。',state:{}},
     {key:'read',id:'article-04',title:'已读',caption:'降低视觉权重，阅读环完成；不等同于打开预览。',state:{seen:true,read:true,progress:1}},
     {key:'bookmarked',id:'article-04',title:'已收藏',caption:'收藏动作保持选中，不改变内容的业务类型。',state:{bookmarked:true}},
     {key:'selected',id:'article-04',title:'已选中',caption:'边框与角标表达选择，用于批量操作或拖拽。',state:{selected:true}},
     {key:'snoozed',id:'reminder-01',title:'已延后',caption:'记录下一次提醒时间，并提供恢复操作。',state:{snoozedUntil:now+600000}},
     {key:'completed',id:'task-01',title:'已完成',caption:'完成后收拢为轻量记录，保留重新打开的能力。',state:{taskDone:(Store.card('task-01')||SeedCards.find(c=>c.id==='task-01')).tasks.map(t=>t.id)}}
   ];
 }
};
