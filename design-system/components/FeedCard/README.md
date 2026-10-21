# FeedCard

内容卡片：信息流里唯一的载体。11 类卡片由积木按配方拼成，积木与限额见手册[卡片积木](../../handbook/foundation.md#卡片积木)，行数与字数见[文字长度](../../handbook/foundation.md#文字长度)。

- 字号用 `card-title`、`summary`、`card-meta`；列宽用 `col-min`、`col-ideal`、`col-max`，最多 `col-limit` 列。表面用 `card`、`line`、`card-radius`、`shadow`，悬停换 `shadow-hover`。
- 手机用 `card-radius-sm`、`card-padding-sm`、`gap-sm`、`margin-sm`；摘要一律 2 行。见手册[手机主页](../../handbook/interaction.md#手机主页)。
- 已读与完成只改颜色：`card-read`、`line-read`，去掉阴影，标题换 `muted`。不加蓝点，不写「已读」。
- 头部：来源 · 时间 · 状态，分隔符 `·`；右侧只放一个时效值（进度、计数或到期）。
- 待办：卡上最多 3 项 CheckItem，未完成在前；计数按全部事项算。提醒是带到期时间的单项待办，勾选圈与待办相同，只改 Sill 的状态，不改来源。
- 要点：总结太长时改成一句结论加最多 3 条要点，每条 1 行；详情显示全部。
- 摘录：引用只改字号层级，不改表面颜色，不加左侧色条。
- 卡面没有省略号入口。长按或 ⌘/Ctrl 点选进入多选；桌面右键与 Shift+F10 打开 CardMenu。
- 点卡片：能在站内看完的在站内打开；要在原处操作的直接跳到原应用。

实现：`apps/web/cards/components.tsx`、`apps/web/cards/templates.ts`、`apps/web/styles/cards.css`；macOS `Feed/CardBodies.swift`、`Feed/CardParts.swift`。示例由 `design-system/scripts/previews.ts` 从产品代码生成，不手改。
