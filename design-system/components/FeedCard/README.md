# FeedCard

内容卡片：信息流里唯一的载体。各类卡片使用专用布局，共用卡片积木，积木与限额见手册[卡片积木](../../handbook/foundation.md#卡片积木)，行数与字数见[文字长度](../../handbook/foundation.md#文字长度)。

- 桌面标题、摘要、金句、速记和要点自然换行，不限制行数。密度仅改变列宽，卡片高度随内容增长。
- 字号用 `card-title`、`summary`、`card-meta`；列宽用 `col-min`、`col-ideal`、`col-max`，按可用宽度自动增减列数，宽屏可显示五列、六列或更多。表面用 `card`、`line`、`card-radius`、`shadow`，悬停换 `shadow-hover`。
- 手机用 `card-radius-sm`、`card-padding-sm`、`gap-sm`、`margin-sm`；资讯、邮件纯文字摘要最多 4 行，其他摘要最多 2 行。见手册[手机主页](../../handbook/interaction.md#手机主页)。
- 已读与完成只改颜色：`card-read`、`line-read`，去掉阴影，标题换 `muted`。不加蓝点，不写「已读」。
- 来源圆标：只在来源使用单色品牌标志；发布方、作者与未知来源的显示规则见手册[图标](../../handbook/foundation.md#图标)。
- 头部：来源 · 时间 · 状态，分隔符 `·`；右侧只放一个时效值（进度、计数或到期）。资讯与预览同一头部：来源 · 日期 · 阅读时长，日期取发布、保存、卡片时间中第一个有值的；照片写「照片 · 地点 · 拍摄日」。日期写「今天」「昨天」「10/18」，跨年加年份。
- 待办：卡上最多 3 项 CheckItem，未完成在前；计数按全部事项算。提醒是带到期时间的单项待办，勾选圈与待办相同，只改 Sill 的状态，不改来源。
- 汇总：卡面显示短摘要；详情中的列表属于正文，按正文的字号与颜色显示，不使用带圆底的独立编号。见画板 CardTypeDetails、CardTypeMobile 与 CardTypeReading。
- 摘录：引用只改字号层级，不改表面颜色，不加左侧色条。
- 卡面没有省略号入口。长按或 ⌘/Ctrl 点选进入多选；Web/PWA 不提供卡片右键菜单与 Shift+F10 产品菜单。
- 点卡片：能在站内看完的在站内打开；要在原处操作的直接跳到原应用。

实现：`apps/web/cards/components.tsx`、`apps/web/cards/templates.ts`、`apps/web/styles/cards.css`；macOS `Feed/CardBodies.swift`、`Feed/CardParts.swift`。示例由 `design-system/scripts/previews.ts` 从产品代码生成，不手改。
