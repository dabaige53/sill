import os,sys
D=sys.argv[1]+'/components'
C=[]
def comp(name,group,h,readme,js,bg='canvas',pad=16):
    C.append((name,group,h,readme,js,bg,pad))

comp('IconButton','Atoms',100,"""图标按钮：44×44 圆形触控区，只放一个 Mono24 图标，覆盖默认、已选择、聚焦、禁用四态。

- 用 `Sill.button(glyph, label, action, id?, extra?, className?)` 生成；`label` 必填，写入 `aria-label`。
- 默认透明，hover 填 `surface`；已选择加 `.active`：`accent-soft` 底 + `accent` 图标。
- 焦点环统一为 2px `accent` outline、4px offset。
- 不要给图标按钮加文字或描边；一组工具之间间距 4–8px。""",
"""root.innerHTML=`<div style="display:flex;gap:8px;align-items:center">${Q.button('bookmark','收藏','x')}${Q.button('bookmark','已收藏','x','','','active')}${Q.button('tag','标签','x')}${Q.button('more','更多','x')}<button class="icon-button" disabled aria-label="禁用">${I('download')}</button></div>`;""")

comp('ActionButton','Atoms',100,"""主操作与次操作：一个区域只强调一个决定，主操作用 `.solid-button`，其余用 `.text-button`。

- `.solid-button`：`accent` 底、白字（5.57:1）、13px/500、`image-radius` 圆角、min-height 44px；hover `brightness(1.08)`，按下 `scale(.98)`。
- `.text-button`：透明底、`ink` 字，hover 填 `surface`。
- 同一行最多一个 solid-button。""",
"""root.innerHTML=`<div style="display:flex;gap:10px;align-items:center"><button class="solid-button">保存</button><button class="text-button">取消</button><button class="text-button">清除筛选</button></div>`;""")

comp('ProgressRing','Atoms',90,"""阅读进度圆环：读过多少由圆环表达；打开内容与读完是两种状态。

- `Sill.ring(progress 0–1, size=22)`，`role="progressbar"`，aria-valuenow 自动写入。
- 颜色继承 `currentColor`，默认 `accent`；底圈 12% 不透明度。
- 卡片底部与文字「继续阅读 / 已读」成对出现（`.reading-state`）。""",
"""root.innerHTML=`<div style="display:flex;gap:24px;align-items:center">${[0,.25,.6,1].map(p=>Q.ring(p)).join('')}${Q.ring(.6,36)}<span class="reading-state">${Q.ring(.4)}<span>继续阅读</span></span></div>`;""",'card')

comp('CheckItem','Atoms',150,"""待办选择项：点击整行切换状态，完成同时用勾选、颜色和删除线表达。

- `Sill.checkItem(card, {id,text,done})` 生成 `role="checkbox"` 的整行按钮，min-height 44px。
- 未完成：20px 圆点，1.2px `check-border` 描边；hover 描边变 `accent`。
- 已完成：圆点填 `accent` + 白勾，文字 `secondary` + `done-strike` 删除线。""",
"""const c={id:'t'};root.innerHTML=`<div style="width:300px">${Q.checkItem(c,{id:1,text:'整理评审意见',done:true})}${Q.checkItem(c,{id:2,text:'更新卡片间距规范',done:false})}${Q.checkItem(c,{id:3,text:'回复设计团队邮件',done:false})}</div>`;""",'card')

comp('Avatars','Atoms',80,"""参与者头像组：28px 圆形，-5px 重叠，2px `card` 描边，用于日程卡。

- `Sill.avatars(['王','李','陈'])`，组上带「N 位参与者」可访问名称。
- 底色 `surface`、字 `muted` 10px；不放照片。""",
"""root.innerHTML=Q.avatars(['王','李','陈','周']);""",'card')

comp('Attachment','Atoms',80,"""附件入口：文件图标、文件名、下载动作在同一行，用于邮件卡。

- 结构 `.attachment` > `icon('file',16)` + 文件名 span + 末尾 `download` 图标（`accent`）。
- 文件名单行省略，12px `muted`。""",
"""root.innerHTML=`<div style="width:300px"><div class="attachment">${I('file',16)}<span>V0.5 设计修订说明.pdf</span>${I('download',16)}</div></div>`;""",'card')

comp('TagChip','Atoms',90,"""标签与筛选项：只在编辑与筛选时出现的胶囊按钮。

- `Sill.tagChip(tag, active)`，`aria-pressed` 表达选中。
- 默认 `surface` 底 `ink` 字，hover `faint`；选中 `accent-soft` 底 `accent` 字。
- 22px 圆角胶囊，min-height 44px，13px；容器 `.chips` gap 8px 换行。""",
"""root.innerHTML=`<div class="chips">${Q.tagChip('设计',true)}${Q.tagChip('阅读')}${Q.tagChip('工作')}${Q.tagChip('稍后')}</div>`;""",'card')

comp('CardMeta','Atoms',90,"""来源与状态线索：来源 · 时间 · 状态各有位置，不用醒目装饰争夺注意力。

- `.card-meta`：12px/1.5 `muted`，gap 7px，各段单行省略；图标用 `secondary`。
- 卡片顶部用 `.card-meta.top-meta`（下距 10px，右侧留 32px 给更多按钮）。
- 分隔符用 `·`，`aria-hidden`。""",
"""root.innerHTML=`<div style="display:grid;gap:12px"><div class="card-meta"><span>少数派</span><span aria-hidden="true">·</span><span>8 分钟阅读</span></div><div class="card-meta">${I('clock',14)}<span>今天 14:30</span><span aria-hidden="true">·</span><span>已延后</span></div></div>`;""",'card')

comp('SearchField','Forms',100,"""搜索输入：左侧搜索图标，`surface` 底输入框，用于筛选面板顶部。

- `.search-field` > `icon('search')` + `input`；输入框左内边距 41px 给图标。
- 输入框通用样式：1px `line` 边框、14px 圆角、12×14 内边距；placeholder 用 `secondary`。""",
"""root.innerHTML=`<div class="search-field" style="width:340px;margin:0">${I('search')}<input placeholder="搜索标题、来源或标签" aria-label="搜索"></div>`;""",'card')

comp('Toggle','Forms',110,"""偏好开关：设置面板中的二元偏好，点击立即生效。

- `button.toggle[role=switch][aria-checked]`，48×44 触控区，轨道 `toggle-off`，开启为 `accent`，22px 白色滑块。
- 放在 `.setting-row` 右侧，左侧标题 14px + 说明 12px `muted`。""",
"""root.innerHTML=`<div style="width:360px"><div class="setting-row"><div><span>减少透明度</span><small>操作层改为实体白色表面</small></div><button class="toggle" role="switch" aria-checked="true" aria-label="减少透明度"></button></div><div class="setting-row"><div><span>减少动态效果</span><small>保留操作结果，去掉位移</small></div><button class="toggle" role="switch" aria-checked="false" aria-label="减少动态效果"></button></div></div>`;root.querySelectorAll('.toggle').forEach(b=>b.onclick=()=>b.setAttribute('aria-checked',b.getAttribute('aria-checked')!=='true'));""",'card')

comp('GlassDock','Overlays',260,"""玻璃工具组：右下角 56px 玻璃圆球（#orb），展开后上方竖排筛选、刷新等工具。玻璃只属于操作层。

- 材质：`glass` + `backdrop-filter: blur(24px) saturate(1.2)` + 1px 白色 72% 描边。
- 打开：`#dock.is-open` 或 focus-within，工具 230ms `ease` 上浮淡入。
- 有筛选时 `#dock.filter-active` 右上角 7px `accent` 圆点。
- 减少透明度时改用 `card` 实体底。""",
"""root.innerHTML=`<div style="position:relative;height:228px;width:120px"><div id="dock" class="is-open filter-active" style="position:absolute;right:0;bottom:0"><div class="dock-tools">${Q.button('filter','筛选','x')}${Q.button('refresh','刷新','x')}${Q.button('info','说明','x')}</div><button id="orb" aria-label="AI">${I('sparkles',23)}</button></div></div>`;""")

comp('CardMenu','Overlays',230,"""卡片情境菜单：围绕当前卡片的少量动作，从右上角「更多」按钮展开。

- `.card-more-menu`：`card` 底、`line` 边框、16px 圆角、5px 内边距、222px 宽，阴影 0 8px 30px 14%。
- 菜单项 `.card-menu-item`：44px 高、13px、图标 `muted`，hover `surface`。
- 只放可逆、与当前内容相关的动作。""",
"""const it=(g,t)=>`<button class="card-menu-item">${I(g)}<span>${t}</span></button>`;root.innerHTML=`<div class="card-more-menu" style="position:relative;top:0;right:0">${it('bookmark','收藏')}${it('tag','编辑标签')}${it('moon','稍后阅读')}${it('sparkles','加入 AI 对话')}</div>`;""")

CARD=lambda inner,cls,w=344:f"<article class=\\\"feed-card {cls}\\\" style=\\\"width:{w}px\\\">{inner}<div class=\\\"card-actions\\\">${{Q.button('more','更多卡片操作','x','','','card-more-trigger')}}</div></article>"

comp('FeedCard','Cards',220,"""内容卡片：信息流的唯一载体，邮件、资讯、笔记、日程、媒体都在白色实体表面上呈现。

- 344px 宽（布局引擎决定列宽），`card` 底、1px `line` 边框、`card-radius`、`shadow`；hover/focus-within 换 `shadow-hover`、边框加深、上移 2px。
- 结构：可选 16:9 封面（`image-radius`，8px 内缩）→ `.card-body`（`card-padding`）→ `top-meta` → `card-title`（2 行）→ 摘要 14px `muted`（2 行）→ 可选 `.card-footer`。
- 右上角「更多」按钮 hover/focus 才出现；触屏常显。
- 已读：标题变 `muted`；选中：2px `accent` 内框 + 左上角勾。""",
"""root.innerHTML=`<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start"><article class="feed-card type-article" style="width:300px"><div class="card-body"><div class="card-meta top-meta"><span>设计周刊</span><span aria-hidden="true">·</span><span>8 分钟</span></div><h2><span class="card-title-button">安静的界面：让工具在需要时出现</span></h2><p>平时只有内容，操作时才有工具。卡片既可阅读，也可交给 AI 处理。</p><div class="card-footer"><span class="reading-state">${Q.ring(.45)}<span>继续阅读</span></span></div></div><div class="card-actions"><span class="icon-button card-more-trigger" style="opacity:1;visibility:visible">${I('more')}</span></div></article><article class="feed-card type-mail is-read is-selected" style="width:300px"><div class="card-body"><div class="card-meta top-meta"><span>邮件</span><span aria-hidden="true">·</span><span>陈一</span></div><h2><span class="card-title-button">评审材料已上传</span></h2><p>附件包含 V0.5 视觉修订和间距预算。</p><div class="attachment">${I('file',16)}<span>V0.5 修订.pdf</span>${I('download',16)}</div></div><span class="selected-tick">${I('check',13)}</span></article></div>`;""")

comp('ReminderCard','Cards',150,"""提醒卡：紧凑的行动卡片，不使用警示色面板。

- 顶部 `.reminder-status`：5px `accent` 圆点 + 12px `muted` 状态文字。
- 右下 `.reminder-actions`：延后（`clock` 图标按钮，`accent`）+ 完成（`accent` 实心圆，白勾，hover `accent-pressed`）。
- 已处理后只剩「恢复」（`undo`）。""",
"""root.innerHTML=`<article class="feed-card type-reminder" style="width:320px"><div class="card-body"><div class="reminder-status"><span class="status-dot"></span><span>10 分钟后到期</span></div><div class="reminder-row"><div class="reminder-copy"><h2><span class="card-title-button">给设计团队回复排期</span></h2></div></div><div class="reminder-footer"><div class="reminder-actions">${Q.button('clock','延后十分钟','x')}${Q.button('check','完成提醒','x','','','reminder-complete')}</div></div></div></article>`;""")

comp('TaskCard','Cards',260,"""待办卡：标题 + 最多 3 项 CheckItem + 进度计数；全部完成后折叠为完成态。

- 计数 `.task-count`：12px/500 `ink` + 「/ 总数」 `muted`，tabular-nums。
- 超过 3 项显示「另有 N 项，打开查看」。
- 完成态：32px `surface` 圆底 + `success` 勾 + 「已完成」 eyebrow + `muted` 标题。""",
"""const c={id:'t'};root.innerHTML=`<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start"><article class="feed-card type-task" style="width:300px"><div class="card-body"><h2><span class="card-title-button">发布前检查</span></h2><div class="checklist">${Q.checkItem(c,{id:1,text:'核对卡片状态样本',done:true})}${Q.checkItem(c,{id:2,text:'320px 窄屏溢出检查',done:false})}${Q.checkItem(c,{id:3,text:'更新测试报告',done:false})}</div><div class="card-footer"><span>今天</span><span class="task-count">1<span> / 4</span></span></div><span class="task-overflow">另有 1 项，打开查看</span></div></article><article class="feed-card type-task is-complete" style="width:300px"><div class="card-body completed-body"><span class="completed-symbol">${I('check',18)}</span><div><span class="eyebrow">已完成</span><h2><span class="card-title-button">整理评审意见</span></h2></div></div></article></div>`;""")

comp('QuoteCard','Cards',200,"""摘录卡：引用只改变字体层级，不改变表面配色。

- `quote` 图标（`secondary`）+ 22px/1.55/500 标题，最多 3 行，字距 0。
- 仍是白色 `card` 表面，不加彩色背景或左侧色条。""",
"""root.innerHTML=`<article class="feed-card type-note form-quote" style="width:320px"><div class="card-body"><div class="card-meta top-meta"><span>笔记</span><span aria-hidden="true">·</span><span>摘录</span></div><div class="quote-mark">${I('quote',22)}</div><h2><span class="card-title-button">好的工具在你需要时出现，在你阅读时退后。</span></h2></div></article>`;""")

comp('InsightCard','Cards',220,"""数据卡：阅读时长与回顾统计，用留白而不是嵌套卡片。

- `figure-xl` 大数字 + 36px 进度环；统计三栏用 `figure-lg` + 12px `muted` 标签。
- 数字一律 tabular-nums。""",
"""root.innerHTML=`<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start"><article class="feed-card type-insight" style="width:280px"><div class="card-body"><h2><span class="card-title-button">今日阅读</span></h2><div class="reading-figure"><strong>12:48</strong>${Q.ring(.64,36)}</div><p>本次阅读 · 分钟 / 秒</p></div></article><article class="feed-card type-digest" style="width:280px"><div class="card-body"><h2><span class="card-title-button">本周回顾</span></h2><div class="stats-trio"><div><b>18</b><span>已读</span></div><div><b>6</b><span>收藏</span></div><div><b>4</b><span>完成</span></div></div></div></article></div>`;""")

comp('Dialog','Overlays',330,"""对话框与面板：快速预览、完整阅读、筛选、编辑、设置都用同一个 `dialog` 外壳。

- `card` 底、1px `line`、`panel-radius`、深阴影；backdrop 20% 黑 + blur(4px)。
- 宽度：预览 620px、阅读 790px、面板 440px；手机变为底部抽屉（顶角 25px，94dvh）。
- 面板标题 `panel-title`；字段标签 12px/500 `muted`；底部 `.panel-footer` 发丝线分隔。
- 关闭按钮在右上角，`glass-thick` 圆形。关闭后恢复原阅读位置。""",
"""root.innerHTML=`<div class="dialog-like" style="position:relative;width:440px;border:1px solid var(--line);border-radius:var(--panel-radius);background:var(--card);box-shadow:0 2px 8px rgba(0,0,0,.04),0 28px 100px rgba(0,0,0,.2);overflow:hidden"><div class="dialog-close">${Q.button('x','关闭','x')}</div><div class="panel-content"><h1>筛选</h1><div class="search-field" style="margin-bottom:0">${I('search')}<input placeholder="搜索内容" aria-label="搜索"></div><span class="field-label">标签</span><div class="chips">${Q.tagChip('设计',true)}${Q.tagChip('阅读')}${Q.tagChip('工作')}</div><div class="panel-footer"><p>共 12 张卡片</p><button class="solid-button">完成</button></div></div></div>`;""",'canvas',24)

comp('Toast','Feedback',100,"""结果反馈与撤销：短暂出现在底部居中，不遮挡阅读；可逆操作附带撤销。

- `glass-thick` 胶囊（28px 圆角）、13px 文字、右侧 44px `undo` 图标按钮。
- 手机上贴左 16px，11px 字。""",
"""root.innerHTML=`<div id="toast" style="display:inline-flex"><span id="toast-text">已收藏 · 可在筛选中查看</span>${Q.button('undo','撤销','x')}</div>`;""")

comp('SelectionBar','Feedback',100,"""多选与批量操作：选中卡片后才出现的玻璃工具条。

- `.glass` 胶囊，30px 圆角，左侧「已选 N 项」13px，右侧交给 AI、收藏、取消。
- 拖动时隐藏。""",
"""root.innerHTML=`<div id="selection-bar" class="glass"><span class="selection-count">已选 3 项</span>${Q.button('sparkles','交给 AI','x')}${Q.button('bookmark','收藏','x')}${Q.button('x','取消选择','x')}</div>`;""")

comp('EmptyState','Feedback',300,"""无结果状态：说明为什么为空，并给一个明确的下一步。

- `Sill.emptyState(title, description)`：居中、450px 宽、24px 圆角、`shadow`，搜索图标 `muted`。
- 标题 19px，说明 13px/1.85 `muted`，动作用 `.text-button`「清除筛选」。""",
"""root.innerHTML=Q.emptyState('没有符合条件的卡片','试试减少标签，或清除筛选回到全部内容。');root.firstChild.style.marginTop='0';""")

comp('AIContext','AI',220,"""上下文引用：拖入或点击加入 AI 的卡片以引用形式出现，不会自动发送。

- `.context-card`：`surface` 底、14px 圆角、三列（44px 缩略图 / 文本 / 44px 移除按钮）。
- 缩略图 44×52 `faint` 底；标题 13px/500 两行，hover `accent`；元信息 11px、摘要 12px `muted` 一行。""",
"""const cc=(g,m,t,s)=>`<div class="context-card"><div class="context-thumbnail">${I(g)}</div><div class="context-copy"><div class="context-meta">${m}</div><button class="context-title">${t}</button><div class="context-summary">${s}</div></div><button class="icon-button context-remove" aria-label="移除">${I('x',16)}</button></div>`;root.innerHTML=`<div style="width:372px;display:flex;flex-direction:column;gap:8px">${cc('mail','邮件 · 陈一','评审材料已上传','附件包含 V0.5 视觉修订和间距预算。')}${cc('book','设计周刊 · 8 分钟','安静的界面：让工具在需要时出现','平时只有内容，操作时才有工具。')}</div>`;""",'card')

comp('AICompose','AI',160,"""提问输入与发送：`surface` 底大文本框，右下角 `accent` 方形发送按钮；必须由用户确认发送。

- textarea 最小 108px、16px 圆角、聚焦时边框 `accent`。
- 发送按钮 44×44、12px 圆角、`accent` 底白色 `arrow` / `send` 图标。""",
"""root.innerHTML=`<div class="ai-compose" style="width:380px;padding:0"><textarea placeholder="问点什么，或把卡片拖进来" aria-label="提问"></textarea><button class="icon-button" style="right:8px;bottom:8px" aria-label="发送">${I('arrow')}</button></div>`;""",'card')

comp('AIMessages','AI',230,"""问题与回复：用户提问用 `surface` 气泡（右下角 4px），回复是无底色正文并标注演示来源。

- 消息 14px/1.8，pre-wrap，间距 16px。
- 用户气泡左缩进 28px；回复上方 12px `muted` 标签。""",
"""root.innerHTML=`<div class="ai-messages" style="width:380px;max-height:none;padding:0"><div class="message user">这两张卡片里有哪些待办？</div><div class="message demo"><span class="message-label">本地演示回复</span>邮件里需要确认评审时间；文章没有明确待办，可以稍后阅读。</div></div>`;""",'card')

for name,group,h,readme,js,bg,pad in C:
    d=f'{D}/{name}';os.makedirs(d,exist_ok=True)
    open(f'{d}/README.md','w').write(f'# {name}\n\n{readme}\n')
    html=f'''<!-- @dsCard group="{group}" height={h} -->
<!doctype html>
<html><head><meta charset="utf-8"></head>
<body class="ds-flow" style="margin:0;min-height:0;padding:{pad}px;background:var(--{bg})">
<div id="root"></div>
<script>
const Q=window.Sill,I=Q.icon,root=document.getElementById('root');
{js}
</script>
</body></html>
'''
    assert '</script' not in js
    open(f'{d}/preview.html','w').write(html)
print(len(C))
dts='''/** Sill — 原生 HTML 字符串渲染函数（src/atoms）。所有函数返回 HTML 字符串，由调用方写入 innerHTML。 */
declare namespace Sill {
  /** Mono24 图标路径注册表：名称 → SVG 内部路径。 */
  const Glyphs: Record<string, string>;
  /** 24×24 viewBox、stroke 1.65、currentColor 的 SVG。未知名称回退到 file。 */
  function icon(name: string, size?: number): string;
  /** HTML 转义。 */
  function esc(value?: unknown): string;
  /** 44px 图标按钮（IconButton）。label 写入 aria-label。 */
  function button(glyph: string, label: string, action: string, id?: string, extra?: string, className?: string): string;
  /** 阅读进度圆环（ProgressRing），progress 0–1。 */
  function ring(progress?: number, size?: number): string;
  /** 待办选择项（CheckItem）。 */
  function checkItem(card: { id: string }, task: { id: string | number; text: string; done?: boolean }): string;
  /** 参与者头像组（Avatars）。 */
  function avatars(names?: string[]): string;
  /** 标签胶囊（TagChip）。 */
  function tagChip(tag: string, active?: boolean, action?: string): string;
  /** 无结果状态（EmptyState）。 */
  function emptyState(title: string, description: string): string;
  function timeString(ts: number): string;
  function minutes(seconds: number): string;
}
'''
open(f'{D}/index.d.ts','w').write(dts)
