# SearchField

搜索栏与候选列表（Combobox）。规则见手册[搜索与键盘](../../handbook/interaction.md#搜索与键盘)和[桌面顶栏与 AI 框](../../handbook/web-interaction.md#桌面顶栏与-ai-框)。

- 桌面：在顶栏头像左侧，Web 固定宽 315（searchFocusedWidth），随窗口可用空间收缩，聚焦与输入都不伸缩，不画聚焦边框。低填色玻璃（macOS 26+ 为原生 clear 玻璃）。⌘K / Ctrl K 聚焦。左侧始终是放大镜。
- 候选：聚焦或输入时，搜索栏下方浮出列表，只给卡片建议，与搜索栏同宽，每行一张卡、一行字：左侧标题（`text-control` 14），右侧是宽 48 的类型列：类型图标与类型名（资讯、消息、笔记、待办、日程、媒体，其他用卡片类型名；`text-caption` 12，`muted`），每行图标落在同一条竖线上；标题 `muted`，命中的字用 `ink`，不加粗。行高 40，列表内边距 4，列表最高 232，超出在列表内滚动，最多 8 行。输入 # 时（开头、空格后或紧跟文字都可以）改为「状态」「标签」两组条件建议，当前条件末尾打 ✓。行首不放图标。无匹配时一行显示「没有找到「输入」」。
- 选择：方向键、Home/End 移动高亮，回车或点选卡片建议即打开那张卡；选 # 条件后成为 `accent` 底标签排在分栏标签后面。结果在卡片区原地显示，有文字时顶栏下方出现一行类型胶囊。Esc 先收起列表，再清文字，再清掉全部标签；删除键从后往前删。
- 手机：独立的搜索页，`surface` 底胶囊。键盘弹出时，结果区上方显示同样的卡片建议行；按键盘「搜索」或点到结果区，键盘收起，建议收起并显示完整结果，底部导航回到原位可点。分类标签用 `ink` 底，输入 # 选的状态和标签用 `accent` 底。
- 动效与参考 Combobox 一致：列表 150ms 展开、100ms 收起，自顶部 0.97 缩放，曲线 (0.23,1,0.32,1)；高亮条 180ms 滑动；清空按钮用 searchIconSpring。不做逐行进场。输入法组词时不筛选；不显示加载转圈或结果数量。

实现：`apps/web/views/shell.tsx` 的 `HomeTop`、`apps/web/views/home-search.tsx`、`apps/web/interactions/panel-search.tsx`；Mac 为 `apps/apple/macOS/Shell/SearchField.swift`（尚未同步卡片建议）。示例由 `design-system/scripts/previews.ts` 从产品代码生成，不手改。
