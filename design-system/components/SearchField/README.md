# SearchField

搜索栏。规则见手册[搜索与键盘](../../handbook/interaction.md#搜索与键盘)和[桌面顶栏与 AI 框](../../handbook/web-interaction.md#桌面顶栏与-ai-框)。

- 桌面：在顶栏头像左侧，聚焦时变宽；⌘K / Ctrl K 聚焦。结果在卡片区原地显示，主页分栏选中后成为搜索栏里的 `ink` 底标签。Esc 先清文字，再清标签。
- 手机：独立的搜索页，`surface` 底胶囊。分类标签用 `ink` 底，输入 # 选的状态和标签用 `accent` 底；删除键从后往前删。
- 输入法组词时不筛选。不显示加载动画或结果数量；命中词加粗，不加底色。

实现：`apps/web/views/shell.tsx` 的 `HomeTop`、`apps/web/interactions/panel-search.tsx`。示例由 `design-system/scripts/previews.ts` 从产品代码生成，不手改。
