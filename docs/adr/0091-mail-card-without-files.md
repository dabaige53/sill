# 邮件卡面不显示附件，PR 检查只显示计数

2026-10-29，用户已确认，已实施。部分替代 [ADR 0086](0086-card-fields-and-block-recipes.md) 配方表中邮件卡面的「文件（1 个）」及「邮件卡面附件在手机和桌面都只显示 1 个」；其余决定不变。

## 原因

用户看邮件卡片时认为上下太高，附件行占了主要高度，且卡面只看发件人、主题和摘要已能判断要不要打开。PR 卡面的「检查 1/1」文字多余，勾号和通过数已足够表达。

## 决定

- 邮件卡面为发件人 → 标题 → 卡面摘要，不显示附件；详情仍为发件人 → 标题 → 正文 → 全部附件。
- 发件人与来源、日期按文字基线排成一行，卡面和详情一致。
- PR 卡面的检查只显示状态图标和通过数（如 1/1），「检查」二字只作为提示文字；详情中的检查行不变。
- 文件列表只在相邻行之间使用细分隔线和 8px 上下间距，列表上下不加线、不留额外间距。

## 影响

- 配方：`design-system/recipes.json` 由 Web 与 Mac 共用，Mac 构建时生成同一配方。
- Web：`apps/web/cards/pull-request.tsx`，`apps/web/styles/{card-types,cards,overlays,phone}.css`。
- Mac：`apps/apple/macOS/Feed/RecipeBody.swift`、`apps/apple/macOS/Reader/{ReaderContent,PullRequestContent}.swift`。
- 插件技能 `skills/sill-cards/references/types.md` 同步邮件显示说明；MCP 字段与写入不变。
