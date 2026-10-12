# FeedCard

内容卡片：信息流的唯一载体，邮件、资讯、笔记、日程、媒体都在白色实体表面上呈现。

- 344px 宽（布局引擎决定列宽），`card` 底、1px `line` 边框、`card-radius`、`shadow`；hover/focus-within 换 `shadow-hover`、边框加深、上移 2px。
- 结构：可选 16:9 封面（`image-radius`，8px 内缩）→ `.card-body`（`card-padding`）→ `top-meta` → `card-title`（2 行）→ 摘要 14px `muted`（2 行）→ 可选 `.card-footer`。
- 右上角「更多」按钮 hover/focus 才出现；触屏常显。
- 已读：标题变 `muted`；选中：2px `accent` 内框 + 左上角勾。
