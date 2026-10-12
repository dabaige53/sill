> 平时只有内容，操作时才有工具。卡片既可阅读，也可交给 AI 处理。

Quiet Glass 是一个 card-first 的个人信息流：邮件、资讯、笔记、待办、日程、提醒、媒体都以卡片呈现。内容放在不透明的白色表面上，半透明玻璃只属于按需出现的浮动工具。中性白灰 + 石墨文字 + 单一蓝色动作色。

## 产品立场

- 不放常驻导航栏、侧边栏、顶栏筛选、Banner 或统计面板。信息流就是入口。
- 收藏、标签、备注、稍后读、筛选是**按需唤出**的动作，不是常驻控件。
- 点击卡片 ≠ 完整阅读：打开（预览）、阅读进度、已读是三个独立状态。
- 拖卡片到 AI 接收区只是**带引用打开对话**，不会自动发送给模型。
- 重要提醒自然穿插在信息流中，刷新不打断当前阅读；新内容先排队，由用户点数字决定何时查看。
- 桌面支持 hover 与拖拽；触屏用长按和显式按钮替代，更多按钮常显。

## 文案

- 简体中文，短句，陈述事实，不感叹，不用 emoji。
- 按钮用动词：「收藏」「延后十分钟」「完成提醒」「清除筛选」「撤销」。
- 状态写清楚但不喊叫：「继续阅读」「已读」「10 分钟后到期」「另有 2 项，打开查看」。
- 演示内容要标明：AI 回复标注「本地演示回复」，不冒充模型分析。
- 每个图标按钮都有中文 `aria-label`。

## 颜色

- 页面底用 `canvas`；卡片、对话框、面板、AI 面板用 `card`。不要给内容卡片换底色或加彩色左边条。
- 文字：标题与正文 `ink`；摘要、元信息 `muted`；`secondary` 只用于图标、分隔符、placeholder（对比度 3.62:1，不能承载正文）。
- `accent` 是唯一动作色：主按钮、选中、焦点环、进度环、链接 hover。一个区域只出现一个 `accent` 实心按钮。
- 选中态 = `accent-soft` 底 + `accent` 文字/图标，不用描边。
- `surface` 是次级填充（hover、输入框、标签、引用卡），`faint` 再深一级（hover 中的 hover）。
- 边框统一 1px `line`。层次主要靠 `line`，`shadow` 几乎不可见。
- `success` 只用于完成勾选图标；`alert` 用于警示文字；提醒卡本身不用警示色面板。

## 玻璃材质

- `glass` + `backdrop-filter: blur(24px) saturate(1.2)` + 1px rgba(255,255,255,.72) 描边：只用于 #orb、dock 工具、选择条。
- `glass-thick` 用于 toast、对话框关闭按钮、拖拽幽灵卡。
- 用户开启「减少透明度」、系统 `prefers-reduced-transparency`，或浏览器不支持 backdrop-filter 时，全部回退到 `card` 实体底。

## 字体

- 只用系统字体栈 `sans`（-apple-system / PingFang SC / Microsoft YaHei）。不加载 web font。
- 卡片标题 `card-title`（18/1.4/600，-0.025em，最多 2 行）；摘要 `body` 14/1.55 `muted`（最多 2 行）；元信息 `meta` 12/1.5。
- 按钮、标签、菜单项用 `control` 13px；主按钮 500。
- 大数字（`figure-xl`、`figure-lg`、`event-time`）用 500 字重、负字距、`font-variant-numeric: tabular-nums`。
- 摘录卡只换字体层级（`quote` 22/1.55/500），不换表面。
- 阅读器正文 `reader-body` 16/1.95，标题 `reader-title` 30px。

## 间距、尺寸与圆角

- 卡片间距 `gap` 24px；卡片内边距 `card-padding` 20px（桌面信息流 16px）。
- 所有可点元素最小 `hit-target` 44px，包括图标按钮、标签、菜单项、待办行。
- 圆角：卡片 `card-radius` 20px，封面与按钮 `image-radius` 12px，对话框 `panel-radius` 24px，标签胶囊 22px，图标按钮与 orb 为正圆。
- 卡片固定 344px 宽，高度跟随内容，由瀑布流布局引擎定位；不做自动跨列大卡。
- 断点：≤1000px 收窄页边距；≤650px 对话框变底部抽屉（顶角 25px）、更多按钮常显。

## 状态与交互

- 焦点：2px `accent` outline，4px offset（卡片封面为 -4px 内缩）。
- Hover：卡片换 `shadow-hover`、边框加深到 14% 黑、上移 2px，封面放大 1.018。
- 按下：按钮 `scale(.95–.98)`。禁用：40% 不透明度。
- 已读：标题变 `muted`，封面降饱和。选中：2px `accent` 内框 + 左上角 22px 勾。
- 动效：`--ease` cubic-bezier(.2,.75,.25,1)，`--fast` 140ms（hover）、`--base` 220ms（状态）、`--layout` 320ms（重排）。`prefers-reduced-motion` 下保留结果、去掉过渡。

## 图标

- Mono24：38 个本地绘制的 24×24 线性图标，stroke 1.65、round cap/join、`currentColor`。单一来源是 `QuietGlass.Glyphs` / `QuietGlass.icon(name, size)`。
- 默认 18px；卡片元信息 14–16px；orb 23px。
- 图标跟随文字颜色；`secondary` 用于装饰性图标，`accent` 用于可执行的强调动作。
- 不用 emoji、不用 icon font。替换点是 Lucide（同为 24 网格线性图标）。
- Icons 组里是同一批路径导出的 SVG 文件，墨色固定为 `ink`。

## 使用组件

- 组件是原生 HTML 字符串函数（`window.QuietGlass`），不依赖 React；卡片、面板等复合组件按 `components/<Comp>/preview.html` 中的类名结构书写。
- 先加载 tokens.css，再加载 `components/bundle.css`（含 base/controls/cards/overlays 四层样式）。

---

**未覆盖的内容**：拖拽、阅读器、媒体播放器等完整交互（`src/interactions/*.js`、`src/views/app.js`）只以静态样式呈现；卡片封面图片（`src/data/assets.js`）未导入。组件预览为根据 `src/cards/templates.js` 与样式类名手写的静态示例，其中 IconButton、ProgressRing、CheckItem、Avatars、TagChip、EmptyState 直接调用源码函数渲染。
