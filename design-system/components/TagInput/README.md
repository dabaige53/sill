# TagInput

标签输入框：卡片「标签与备注」浮层里添加和移除标签；浮层叠在当前内容上，不替换下层。交互与参考 tag-input 一致（motion.tagInput）。

- 外形：圆角 14 的 `surface` 底容器，内边距 6，标签间距 6，随标签换行向下长高。标签高 32，圆角 8 的 `card` 底板加 `shadow`；× 视觉 24、点按区 32。输入框最小宽 120。下方一行 `muted` 说明：「回车或逗号添加，连按两次退格删除最后一个」。
- 添加：回车或逗号（含全角）添加；手机键盘输入的逗号同样拆分；粘贴含逗号或换行时拆成多个，普通粘贴留在输入框。去掉开头的 #，单个最长 30 字，最多 20 个。已有的标签（不分大小写）不重复添加，原标签抖动。
- 移除：点 ×，输入框保持焦点。输入框为空时，第一次退格选中最后一个标签（`ink` 底、`card` 字），第二次删除；继续输入、Esc 或失焦取消选中。
- 动效：新标签弹入（spring 0.25、bounce 0.15，自 0.9 缩放）；手动输入的标签文字不动，只有底板弹入，× 延迟 60ms 出现。移除 150ms 淡出并缩至 0.9；其余标签以 spring 0.25、bounce 0 滑到新位置。重复时抖动 300ms。键盘操作不播放动效。
- 读屏器播报「已添加」「已移除」「已经添加过」。下方保留推荐标签胶囊（TagChip），点按即添加。

实现：`apps/web/interactions/panel-search.tsx` 的 `editor`、`apps/web/interactions/tag-input-motion.ts`、`apps/web/views/actions/cards.ts`。示例由 `design-system/scripts/previews.ts` 从产品代码生成，不手改。
