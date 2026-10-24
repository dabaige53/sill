# 纵向间距分六级

日期：2026-10-24。状态：已采纳。

## 原因

详情页上下间距没有统一标准，各处按局部需要叠加外边距，部分位置留白过大。实测桌面预览：资讯、笔记、整理的标签与正文相距 52px，PR 的标签与「检查」行相距 73px，正文末段与「附件」相距 44px；同为「标签到正文」，邮件和提醒只有 28px。原因包括：

- `ruled-header` 删除分隔线后保留了 24px 下留白；
- 头部下边距、容器间距与小节上边距相互叠加；
- 正文最后一段的段后距不与容器间距合并；
- PR 头部用 CSS `order` 调整显示顺序，最后一项的下边距没有清零；
- 「为什么」列表沿用浏览器默认上下边距。

Mac 的结构相同，同样叠加；Mac 的小节标题与内容使用容器间距 20，Web 为 12。

## 决定

- 设计变量增加六级纵向间距，基数为 4：`rhythm-tight` 4、`rhythm-close` 8、`rhythm-label` 12、`rhythm-item` 16、`rhythm-group` 24、`rhythm-section` 32；Mac 对应 AppleMetrics 的 `rhythmTight` 至 `rhythmSection`，替代 `previewBodyGap`。按两块内容的关系选级，规则见手册「内容布局」的「纵向间距」小节。
- 自带上下留白的行（来源行、信息行、待办行、相关卡片行）与相邻内容的间距降一级，使可见文字之间的距离与普通文字一致。
- 详情头部之后的第一个内容用 `rhythm-group`；删除 `ruled-header` 与 PR 头部的 24px 下留白，不另加分隔线。
- 正文最后一段不带段后距；「为什么」列表的边距按本表设置。PR 详情头部按显示顺序输出，不再用 CSS `order` 调整标签位置。
- `rhythm-item`、`rhythm-group`、`rhythm-section` 在阅读内容中随「阅读行段间距」缩放，头部内部间距不缩放。Web 与 Mac 一致。
- PR 详情的状态不再以胶囊放在标题与标签之间（缺少分支说明时看起来像标签）：头部只有来源、标题与标签，状态作为信息行第一行，后接「谁想把哪个分支合并到哪里」。检查、审阅人、改动、评论无数据时不显示，不用「0/0」「—」占位；检查有明细时才有展开箭头。信息行图标统一放在 18 的图标框内，各行文字左缘对齐。
- 不改变卡面内部的 `block-gap`、播放器内部布局、触控尺寸与内容。

## 影响

- 变量：`tokens/spacing.json`、`tokens/apple.json`、`apps/web/styles/tokens.css`。
- 手册：`content-layout.md` 新增「纵向间距」与信息行对齐规则，资讯阅读的间距说明随之修改；`web-reading.md` 写明 PR 详情的状态行与按数据显示的信息行。
- 现行画板：`CardTypeDetails`、`CardTypeReading`、`CardTypeMobile` 的详情样式。
- 实现：Web `detail-content.css`、`card-types.css`、`appearance.css`、`reader-layout.css`、PR 详情与相关卡片行；Mac `ReaderContent`、`PullRequestContent`、`CardDetailFields`。
- 界面对账表登记本次对齐；真实窗口未查看的部分保持「未验证」。
