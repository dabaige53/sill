# SearchField

搜索栏。规则见手册[搜索与键盘](../../handbook/interaction.md#搜索与键盘)和[桌面顶栏与 AI 框](../../handbook/web-interaction.md#桌面顶栏与-ai-框)。

- 桌面：在顶栏头像左侧，随窗口可用空间收缩。静止时宽 280，聚焦伸长到 480，有文字或标签时 360，不画聚焦边框。低填色玻璃（macOS 26+ 为原生 clear 玻璃）。⌘K / Ctrl K 聚焦。结果在卡片区原地显示，主页分栏选中后成为搜索栏里的 `ink` 底标签；输入 # 选的状态和标签以 `accent` 底标签排在分栏标签后面。有文字时顶栏下方出现一行类型胶囊。Esc 先清文字，再一次清掉全部标签；删除键从后往前删。
- 手机：独立的搜索页，`surface` 底胶囊。分类标签用 `ink` 底，输入 # 选的状态和标签用 `accent` 底；删除键从后往前删。
- 输入法组词时不筛选。不显示加载动画或结果数量；命中词加粗，不加底色。

实现：`apps/web/views/shell.tsx` 的 `HomeTop`、`apps/web/views/home-search.tsx`、`apps/web/interactions/panel-search.tsx`；Mac 为 `apps/apple/macOS/Shell/SearchField.swift`。示例由 `design-system/scripts/previews.ts` 从产品代码生成，不手改。
