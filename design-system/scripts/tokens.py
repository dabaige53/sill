import json,sys
D,SHA=sys.argv[1],sys.argv[2]
c=lambda n,v,u:{"name":n,"value":v,"usage":u}
colors=[
c("canvas","#f5f5f7","页面底色（html、body）。信息流卡片浮在其上。"),
c("card","#ffffff","内容卡片、对话框、面板、AI 面板的实体表面。内容永远放在不透明表面上。"),
c("surface","#f0f0f2","次级填充：icon-button hover、tag-chip、输入框、context-card、用户消息气泡。"),
c("faint","#e8e8ed","更深一级的填充：tag-chip / filter-kind 的 hover、context 缩略图底。"),
c("ink","#1d1d1f","正文与标题文字，用于 card、canvas、surface 之上（≥14.8:1）。"),
c("muted","#6e6e73","摘要、元信息、说明文字。card 上 5.07:1、canvas 上 4.66:1；在 surface 上为 4.46:1，略低于 4.5，源码原值保留。"),
c("secondary","#86868b","图标、分隔符和辅助元信息（时间分隔、placeholder）。card 上仅 3.62:1，不满足正文 4.5:1，只用于图标和非关键标记。"),
c("line","rgba(0,0,0,.08)","1px 发丝线：卡片边框、对话框边框、列表分隔、dialog-tools 顶线。"),
c("accent","#0066cc","唯一的动作色：主按钮、选中态、焦点环（2px outline + 4px offset）、进度环、链接 hover。白字其上 5.57:1。"),
c("accent-soft","#edf4ff","选中态底色：icon-button.active、tag-chip.active、filter-kind.active、suggestion-action。其上文字用 accent（5.03:1）。"),
c("accent-soft-hover","#dceaff","suggestion-action 的 hover 底色（cards.css 中的字面值）。"),
c("accent-pressed","#0057ad","reminder-complete 实心按钮 hover（cards.css 中的字面值）。"),
c("selection","#d8e9ff","::selection 文字选区底色（base.css 中的字面值）。"),
c("success","#248a3d","完成标记：completed-symbol 勾选图标。card 上 4.4:1、surface 上 3.86:1，仅作图标（≥3:1）使用。"),
c("alert","#b45309","提醒与警示状态的文字或图标，card 上 5.02:1。提醒卡本身不用警示色面板。"),
c("glass","rgba(255,255,255,.76)","浮动工具的玻璃材质：.glass、#orb、dock-tools 按钮，配合 backdrop-filter blur(24px)。只用于操作层，不用于内容。"),
c("glass-thick","rgba(255,255,255,.94)","更实的玻璃：#toast、dialog-close 按钮、drag-ghost。"),
c("toggle-off","#d1d1d6","偏好开关关闭时的轨道色（controls.css 中的字面值）。"),
c("check-border","#b8b8bd","待办选择项未完成圆点的 1.2px 描边（cards.css 中的字面值）。"),
c("done-strike","#c7c7cc","已完成待办文字的删除线颜色（cards.css 中的字面值）。"),
]
t={"name":"Sill","version":1,
"meta":{"source":"github","repo":"dabaige53/sill","ref":"main@"+SHA,"paths":{"tokens":["src/styles/tokens.css"],"assets":["src/atoms/icons.js","src/data/icon-catalog.js"],"docs":["README.md","docs/DESIGN-SYSTEM.md"]},"components":{"*":"src/atoms/primitives.js, src/cards/templates.js, src/styles/*.css"},"synced":"2026-10-12"},
"color":{"themes":[{"id":"light","name":"Light"}],"tokens":colors},
"type":{"fonts":[],
 "families":{"sans":"-apple-system, BlinkMacSystemFont, \"Segoe UI\", \"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif"},
 "groups":[
  {"name":"Display","family":"sans","styles":[
   {"name":"reader-title","fontSize":"30px","lineHeight":"1.4","fontWeight":600,"letterSpacing":"-0.035em","usage":"完整阅读标题（.reader-body h1）。","sample":"把正文置于连续阅读的版面"},
   {"name":"preview-title","fontSize":"28px","lineHeight":"1.45","fontWeight":600,"letterSpacing":"-0.035em","usage":"快速预览标题（.preview-body h1）。"},
   {"name":"figure-xl","fontSize":"44px","lineHeight":"1.15","fontWeight":500,"letterSpacing":"-0.05em","usage":"阅读时长大数字（.reading-figure strong），tabular-nums。","sample":"12:48"},
   {"name":"figure-lg","fontSize":"32px","lineHeight":"1.2","fontWeight":500,"letterSpacing":"-0.04em","usage":"回顾卡统计数字（.stats-trio b），tabular-nums。","sample":"18"},
   {"name":"event-time","fontSize":"28px","lineHeight":"1.25","fontWeight":500,"letterSpacing":"-0.045em","usage":"日程卡时间（.event-time），tabular-nums。","sample":"14:30"}]},
  {"name":"Card","family":"sans","styles":[
   {"name":"quote","fontSize":"22px","lineHeight":"1.55","fontWeight":500,"usage":"摘录卡标题（.form-quote h2），最多 3 行。"},
   {"name":"panel-title","fontSize":"22px","lineHeight":"1.4","fontWeight":600,"letterSpacing":"-0.03em","usage":"筛选/编辑/设置面板标题（.panel-content h1）。"},
   {"name":"card-title","fontSize":"18px","lineHeight":"1.4","fontWeight":600,"letterSpacing":"-0.025em","usage":"卡片标题（.feed-card h2），最多 2 行；≥651px 信息流里为 16px。","sample":"本周设计评审要点"},
   {"name":"reader-body","fontSize":"16px","lineHeight":"1.95","fontWeight":400,"usage":"完整阅读正文（.reader-body p），手机上 line-height 2。"}]},
  {"name":"Text","family":"sans","styles":[
   {"name":"body","fontSize":"14px","lineHeight":"1.6","fontWeight":400,"usage":"默认正文（body）。卡片摘要为 14/1.55，muted 色，最多 2 行。"},
   {"name":"control","fontSize":"13px","lineHeight":"1.5","fontWeight":400,"usage":"按钮、标签、菜单项、toast（.text-button / .tag-chip / .card-menu-item）。主按钮为 500。"},
   {"name":"meta","fontSize":"12px","lineHeight":"1.5","fontWeight":400,"usage":"来源、时间、阅读状态、字段标签（.card-meta / .card-footer / .field-label）。"}]}]},
"spacing":{"tokens":[
 c("gap","24px","信息流卡片之间的间距（布局引擎读取）。"),
 c("card-padding","20px","卡片正文内边距（.card-body）；≥651px 信息流为 16px。"),
 c("hit-target","44px","所有可点击元素的最小触控尺寸：icon-button、tag-chip、check-item、菜单项、主按钮 min-height。")]},
"radius":{"tokens":[
 c("card-radius","20px","内容卡片（.feed-card）。"),
 c("image-radius","12px","卡片封面图、主/次按钮。"),
 c("panel-radius","24px","对话框与面板（dialog）；手机底部抽屉为 25px 顶角。")]},
"shadow":{"tokens":[
 c("shadow","0 1px 2px rgba(0,0,0,.025), 0 4px 16px rgba(0,0,0,.035)","卡片静止阴影，几乎不可见：层次主要靠 line 边框。"),
 c("shadow-hover","0 2px 5px rgba(0,0,0,.04), 0 10px 24px rgba(0,0,0,.07)","卡片 hover / focus-within，配合上移 2px。")]}
}
json.dump(t,open(D+'/tokens.json','w'),ensure_ascii=False,indent=1)
