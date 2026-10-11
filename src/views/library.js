/** Component specimens share application primitives and open singleton panels. */
function componentAction(label,action,id=''){
 return `<button type="button" class="text-button" data-action="${esc(action)}"${id?` data-id="${esc(id)}"`:''}>${esc(label)}${icon('arrow',15)}</button>`;
}
function componentSpecimen(item){
 return `<article class="component-specimen ${item.wide?'is-wide':''}" data-component="${esc(item.key)}"><header><span class="specimen-caption">${esc(item.key)}</span><h3 class="component-title">${esc(item.title)}</h3><p class="component-description">${esc(item.description)}</p></header><div class="component-preview"><div class="specimen-stack">${item.preview}</div></div><footer class="component-footer"><code class="catalog-code">${esc(item.source)}</code>${item.actions?`<div class="specimen-actions">${item.actions}</div>`:''}</footer></article>`;
}
const ComponentCatalog={
 sections(){
  const article=Store.card('article-01'),note=Store.card('note-01'),task=Store.card('task-01'),mail=Store.card('mail-01'),media=Store.card('media-01');
  const localChecks=[{id:'sample-incomplete',text:'保留清楚的阅读层次',done:false},{id:'sample-complete',text:'让操作出现在需要的时候',done:true}];
  const state=(label,content)=>`<div class="specimen-state">${content}<span class="specimen-caption">${label}</span></div>`;
  const source=(file,name)=>`src/${file} · ${name}`;
  return [
   {id:'atoms',number:'01',title:'基础组件',description:'从一个操作入口，到内容状态的细小线索。',items:[
    {key:'icon-button',title:'图标按钮',description:'同一个触控范围，覆盖默认、已选择、键盘聚焦和禁用状态。',
     preview:`<div class="specimen-states">${state('默认',button('bookmark','切换收藏按钮示例','lab-tag').replace('aria-label=','aria-pressed="false" aria-label='))}${state('已选择',button('bookmark','切换已选择按钮示例','lab-tag','','','active').replace('aria-label=','aria-pressed="true" aria-label='))}${state('键盘聚焦',button('sparkles','体验键盘聚焦按钮','ai','','','specimen-focus'))}${state('不可用',button('download','暂无可下载内容','lab-icon').replace('<button ','<button disabled '))}</div>`,source:source('atoms/primitives.js','button()')},
    {key:'action-button',title:'主操作与次操作',description:'一个区域只强调一个决定。其余动作保持轻量，状态清楚可辨。',
     preview:`<div class="specimen-row"><button type="button" class="solid-button" data-action="preview" data-id="${article.id}">打开预览</button><button type="button" class="text-button" data-action="edit" data-id="${note.id}">编辑备注</button><button type="button" class="solid-button" disabled>暂不可用</button></div>`,source:source('styles/controls.css','.solid-button / .text-button')},
    {key:'progress-ring',title:'阅读进度圆环',description:'读过多少由圆环表达。打开内容与完成阅读是不同状态。拖动滑块查看变化。',
     preview:`<div class="specimen-row" id="lab-rings">${ring(0,24)}${ring(.25,36)}${ring(.55,52)}${ring(1,22)}</div><input class="ring-range" type="range" min="0" max="100" value="55" aria-label="调整圆环演示进度" data-input="lab-ring">`,source:source('atoms/primitives.js','ring()')},
    {key:'checkbox',title:'待办选择项',description:'点击整行切换状态；完成反馈同时使用勾选、颜色和文字划线。此处为独立样例。',
     preview:`<div class="checklist">${localChecks.map(t=>checkItem(task,t).replace('data-action="task"','data-action="catalog-check"')).join('')}</div>`,source:source('atoms/primitives.js','checkItem()')},
    {key:'avatars',title:'参与者头像组',description:'用紧凑的组合说明谁参与其中，保留人数的可访问名称。',
     preview:`<div class="specimen-states">${state('1 位参与者',avatars(['林']))}${state('3 位参与者',avatars(['舟','林','陈']))}${state('5 位参与者',avatars(['舟','林','陈','许','乔']))}</div>`,source:source('atoms/primitives.js','avatars()')},
    {key:'attachment',title:'附件入口',description:'文件名、类型和下载动作放在同一行。此示例下载一份本地生成的演示附件。',
     preview:`<div class="attachment">${icon('file',18)}<span>${esc(mail.attachment)}</span>${button('download','下载演示附件','download-attachment',mail.id)}</div>`,source:source('cards/templates.js','CardTemplates.mail()')},
    {key:'tag-chip',title:'标签与筛选项',description:'标签在编辑和筛选时出现。点击可以比较选中与未选中的样式。',
     preview:`<div class="chips">${['工作','阅读','想法','设计'].map((tag,i)=>tagChip(tag,i===1,'lab-tag')).join('')}</div>`,source:source('atoms/primitives.js','tagChip()')},
    {key:'metadata',title:'来源与状态线索',description:'来源、时间、阅读状态各有位置；状态不用醒目的装饰争夺注意力。',
     preview:`<div class="card-meta">${icon('book',15)}<span>阅读手记</span><span>·</span><span>4 分钟阅读</span></div><div class="specimen-row"><span class="reminder-status"><span class="status-dot" aria-hidden="true"></span><span>10 分钟后提醒</span></span><span class="reading-state">已读 ${ring(1)}</span></div>`,source:source('cards/templates.js','header() / footer()')}
   ]},
   {id:'forms',number:'02',title:'输入与设置',description:'清楚的输入边界、焦点和选择状态。',items:[
    {key:'search-field',title:'搜索输入',description:'输入框可直接试写。完整搜索包含内容、状态、排序和标签。',
     preview:`<div class="search-field">${icon('search')}<input type="search" aria-label="搜索输入组件示例" placeholder="搜索内容、备注…" autocomplete="off"></div>`,actions:componentAction('打开完整搜索','filter'),source:source('interactions/panels.js','Panels.filter()')},
    {key:'textarea',title:'长文本输入',description:'留出适当行距和书写空间。样例文字不保存，实际备注在编辑面板中保存。',
     preview:`<label class="field-label">一条想法<textarea class="editor-note" maxlength="4000" rows="3" placeholder="记下此刻的想法…" aria-label="长文本输入组件示例"></textarea></label>`,actions:componentAction('打开备注编辑','edit',note.id),source:source('interactions/panels.js','Panels.editor()')},
    {key:'toggle',title:'偏好开关',description:'点击立即切换减少透明度设置，并同步影响当前页面的操作层。',
     preview:`<div class="setting-row"><div><span>减少透明度</span><small>更清晰的实体操作表面</small></div><button class="toggle" type="button" role="switch" aria-label="减少透明度" aria-checked="${Store.state.preferences.reduceTransparency}" data-action="toggle-transparency"></button></div>`,source:source('interactions/panels.js','Panels.settings()')}
   ]},
   {id:'overlays',number:'03',title:'操作层与面板',description:'轻量控制浮在内容之上。打开示例，体验完整交互与返回。',items:[
    {key:'glass-dock',title:'玻璃工具组',description:'筛选、刷新与 AI 是按需出现的工具。材质属于操作层，阅读表面保持清楚。',
     preview:`<div class="specimen-toolbar glass" role="group" aria-label="玻璃工具组示例">${button('filter','打开筛选','filter')}${button('refresh','刷新演示内容','refresh')}${button('layers','查看组件库','view-library')}${button('sparkles','打开 AI 对话','ai')}</div>`,source:source('views/app.js','AppController.init() · dock')},
    {key:'card-menu',title:'卡片情境菜单',description:'围绕当前内容提供少量动作。此处操作示例阅读卡，反馈沿用正式流程。',
     preview:`<div class="specimen-menu glass" role="group" aria-label="阅读卡片情境操作">${[['tag','编辑标签与备注','edit'],['clock','稍后阅读','later'],['sparkles','加入 AI 上下文','card-ai']].map(([glyph,label,action])=>`<button type="button" class="card-menu-item" data-action="${action}" data-id="${article.id}">${icon(glyph,17)}<span>${label}</span></button>`).join('')}</div>`,source:source('views/app.js','AppController.more()')},
    {key:'dialog-preview',title:'快速预览',description:'先看摘要和关键内容，再决定阅读、标记或继续操作。关闭后回到原处。',
     preview:`<div class="specimen-window"><div class="card-meta">${icon('book',15)}<span>${esc(article.source)}</span></div><h4>${esc(article.title)}</h4><p>${esc(article.summary)}</p><div class="specimen-row">${ring(.35)}<span class="specimen-caption">预览层 · 内容与操作分开</span></div></div>`,actions:componentAction('打开预览','preview',article.id),source:source('interactions/panels.js','Panels.preview()')},
    {key:'reader',title:'完整阅读',description:'把正文置于连续阅读的版面。关闭后恢复内容位置，进度独立记录。',
     preview:`<div class="specimen-window specimen-reading"><span class="eyebrow">阅读表面</span><h4>先把内容摆好，<br>再决定要做什么。</h4><p>浏览时只留下标题、摘要和必要状态；当你靠近、选择或提起一张卡片时，工具才跟随意图出现。</p><div class="specimen-row">${ring(.55,26)}<span class="specimen-caption">阅读进度 55%</span></div></div>`,actions:componentAction('进入完整阅读','reader',article.id),source:source('interactions/panels.js','Panels.preview(app, card, true)')},
    {key:'filter-panel',title:'筛选面板',description:'内容、状态、排序和标签逐层筛选，结果数量随输入变化。',
     preview:`<div class="specimen-window"><div class="card-meta">${icon('filter',17)}<span>找回你想看的</span></div><span class="field-label">状态示例</span><div class="chips">${[['全部',true],['未读',false],['收藏',false]].map(([tag,active])=>tagChip(tag,active,'lab-tag')).join('')}</div><span class="field-label">排序示例</span><span class="specimen-caption">重要优先 / 未读优先 / 时间排序</span></div>`,actions:componentAction('打开筛选面板','filter'),source:source('interactions/panels.js','Panels.filter()')},
    {key:'editor-panel',title:'标签与备注编辑',description:'围绕一张卡片整理线索。标签可增减，备注在保存后保留于当前浏览器。',
     preview:`<div class="specimen-window"><span class="field-label">标签示例</span><div class="chips">${tagChip('想法',true,'lab-tag')}${tagChip('产品',true,'lab-tag')}${tagChip('设计',false,'lab-tag')}</div><div class="specimen-note">让重要的事，在对的时候出现。</div></div>`,actions:componentAction('打开编辑面板','edit',note.id),source:source('interactions/panels.js','Panels.editor()')},
    {key:'media-player',title:'媒体预览与片段播放',description:'封面承担内容预览；打开后可播放、暂停和切换演示片段。',
     preview:`<div class="specimen-media">${CardTemplates.cover(media,{passive:false},'media-cover')}</div>`,actions:componentAction('打开演示播放器','preview',media.id),source:source('interactions/panels.js','Panels.preview() · media')},
    {key:'settings-panel',title:'可访问性与使用说明',description:'查看减少动态效果、透明度偏好与键盘操作，也能确认演示功能的边界。',
     preview:`<div class="specimen-row">${icon('moon',20)}<span>减少动态效果</span><span class="specimen-caption">${MotionEngine.reduced?'已开启':'跟随设备偏好'}</span></div><div class="specimen-row"><kbd>Esc</kbd><span class="specimen-caption">关闭浮层</span><kbd>⌘ / Ctrl K</kbd><span class="specimen-caption">搜索</span></div>`,actions:componentAction('打开设置与说明','settings'),source:source('interactions/panels.js','Panels.settings()')}
   ]},
   {id:'feedback',number:'04',title:'反馈与操作状态',description:'让每次选择、拖放和完成都有明确回声，也能轻松返回。',items:[
    {key:'toast',title:'结果反馈与撤销',description:'反馈短暂出现，不遮挡阅读。可逆操作附带撤销入口。',
     preview:`<div class="specimen-toast"><span>${icon('check',16)}</span><span>收藏已保存</span><span class="specimen-caption">可撤销</span></div>`,actions:componentAction('触发反馈示例','catalog-toast'),source:source('views/app.js','AppController.toast()')},
    {key:'selection',title:'多选与批量操作',description:'选中内容后，批量工具才出现。可以交给 AI、收藏或取消选择。',
     preview:`<div class="specimen-selection glass"><span>${icon('check-circle',20)}</span><span>已选择内容</span><span class="specimen-selection-icons" aria-hidden="true">${icon('sparkles')}${icon('bookmark')}${icon('x')}</span></div>`,actions:componentAction('选择示例阅读卡','select',article.id)+componentAction('取消选择','clear-selection'),source:source('views/app.js','AppController.updateSelection()')},
    {key:'drop-targets',title:'拖拽接收区',description:'靠近目标时放大确认落点。相同动作也可点击完成，放入 AI 不自动发送。',
     preview:`<div class="specimen-drop" role="group" aria-label="拖放操作的点击入口">${button('bookmark','收藏示例阅读卡','bookmark',article.id,'','drop-target glass')}${button('clock','稍后阅读示例卡片','later',article.id,'','drop-target glass')}${button('sparkles','将示例卡片加入 AI','card-ai',article.id,'','drop-target glass')}</div>`,actions:componentAction('去信息流体验拖拽','view-feed'),source:source('interactions/drag.js','DragManager')},
    {key:'empty-state',title:'无结果状态',description:'说明当前为空的原因，并提供明确的下一步。清除筛选后保留当前目录。',
     preview:emptyState('这里暂时很安静','没有符合条件的卡片。换一个标签，或清除当前筛选。'),source:source('atoms/primitives.js','emptyState()')},
    {key:'new-content',title:'新内容提示',description:'刷新后的内容先进入等待队列。入口旁出现数字，由你决定何时查看。',
     preview:`<div class="specimen-row"><span class="specimen-token glass" aria-label="新增数量外观示例">3</span><span class="specimen-caption">新增数量示例 · 点击刷新体验实际队列</span></div>`,actions:componentAction('刷新演示内容','refresh'),source:source('views/app.js','paintPending() / showNew()')},
    {key:'motion',title:'进入、提起与回弹',description:'动效用于说明状态和位置变化。减少动态效果时，保留操作结果。',
     preview:`<div class="specimen-row motion-sample"><div class="motion-cube" id="motion-cube"></div><span class="specimen-caption">点击下方播放单次动效</span></div><div class="specimen-row">${button('play','播放进入动效','lab-motion','','enter')}${button('up','播放提起动效','lab-motion','','lift')}${button('refresh','播放回弹动效','lab-motion','','spring')}</div>`,source:source('interactions/motion.js','MotionEngine')}
   ]},
   {id:'ai',number:'05',title:'AI 对话与上下文',description:'引用、输入和发送分开，让每次提交都由用户决定。',items:[
    {key:'ai-context',title:'可调整的上下文引用',description:'沿用真实引用组件。点击标题打开预览；移除仅影响这里的样例。',wide:true,
     preview:`<div class="specimen-ai">${AIView.contexts([article.id,note.id]).replaceAll('data-action="ai-remove"','data-action="catalog-context-remove"').replaceAll('data-action="context-preview"','data-action="preview"')}</div>`,actions:componentAction('将阅读卡加入真实对话','card-ai',article.id),source:source('services/ai.js','AIView.contexts()')},
    {key:'ai-compose',title:'提问输入与发送',description:'先在此试写。点击箭头打开真实对话并带入草稿；仍需在对话中确认发送。',
     preview:`<div class="ai-compose"><textarea rows="3" aria-label="AI 提问草稿示例" placeholder="围绕这些内容，想问什么？"></textarea>${button('up','将草稿带入 AI 对话','catalog-compose')}</div>`,actions:componentAction('直接打开 AI 对话','ai'),source:source('services/ai.js','AIView.shell() · compose')},
    {key:'ai-messages',title:'问题与回复',description:'用户提问与回复有明确区分。示例回复标注本地演示，不代表模型分析。',
     preview:`<div class="specimen-ai"><div class="message user">这两张卡片，有哪些共同点？</div><div class="message demo"><span class="message-label">本地演示回复 · 样式示例</span>已带入引用内容。可以继续围绕这些内容提问。</div></div>`,actions:componentAction('打开对话体验','ai'),source:source('views/app.js','AppController.paintAI()')},
    {key:'ai-empty',title:'对话空状态',description:'开始前说明如何提供上下文，保留拖动与点击两种入口。',
     preview:`<div class="ai-empty">${icon('sparkles',27)}<p>把想继续的内容，<br>轻轻放进来。</p><small>拖动卡片，或点击卡片上的 AI 图标</small></div>`,actions:componentAction('加入第一张卡片','card-ai',article.id),source:source('services/ai.js','AIView.shell() · empty')}
   ]}
  ];
 }
};
const LibraryView={
 render(){
  const sections=ComponentCatalog.sections(),count=sections.reduce((total,section)=>total+section.items.length,0);
  return Catalog.header({eyebrow:'03 / COMPONENT LIBRARY',title:'组件库',description:'把一个动作、一层面板和一段反馈，整理成可复用的语言。与实际界面共享组件，逐项查看、操作和优化。',active:'library',count})+
   sections.map(section=>`<section class="catalog-section" data-component-section="${section.id}"><div class="catalog-section-heading"><div><span class="specimen-caption">${section.number} / ${section.items.length} 个组件</span><h2>${section.title}</h2></div><p>${section.description}</p></div><div class="catalog-grid">${section.items.map(componentSpecimen).join('')}</div></section>`).join('');
 }
};
const SourcesView={
 render(){
  return Catalog.header({eyebrow:'04 / DESIGN REFERENCES',title:'设计参考',description:'把官方规则、可体验示例和实现文档单独保留。这里记录参考什么、如何使用，以及哪些能力仍在研究。',active:'sources',count:Sources.length})+
   `<section class="catalog-section"><div class="catalog-section-heading"><div><span class="specimen-caption">REFERENCE INDEX</span><h2>资料与组件来源</h2></div><p>独立维护参考目录，让后续优化有迹可循。</p></div><div class="source-grid">${Sources.map((item,index)=>`<article class="source-card" data-source="${esc(item.id)}"><div class="source-topline"><span class="specimen-caption">${String(index+1).padStart(2,'0')}</span><span class="source-kind">${esc(item.kind)}</span></div><h3><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${esc(item.title)}</a></h3><p>${esc(item.note)}</p><a class="source-link" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer"><span>${esc(new URL(item.url).hostname)}</span>${icon('external',16)}</a></article>`).join('')}</div></section>`;
 }
};
