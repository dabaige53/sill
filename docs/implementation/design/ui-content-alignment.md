# 内容适配差异

更新：2026-10-29。本文记录长内容与窄空间的源码差异。排版标准见[文字长度](../../../design-system/handbook/foundation.md#文字长度)，窗口或真机结果在当次任务记录中维护。

| 场景 | Web / 手机 | Mac |
| --- | --- | --- |
| 文件与关联行 | 按可用宽度约束，长标题省略 | FileRow、DetailRow 使用行内截断 |
| 会议名称与会议码 | 分行，允许长单词换行 | 会议码仍位于 DetailRow.trailing，限制单行 |
| 长标签 | 标签在自身宽度内换行 | ReaderTags 的 FlowRow 按未限定宽度测量，单标签宽度缺少约束 |
| PR 增删数量 | 窄空间可分行 | PullRequestContent.stats 仍为单行 HStack |
| 手机操作胶囊 | 使用手机间距容纳触控区域 | 不适用 |
| 抽屉与触摸 | 手机使用抽屉与方向判定；横向内容和媒体控件保留触摸操作 | 使用原生触控板路径，不能用 Web 触摸结果推断 |

会议码、长标签与 PR 统计的 Mac 布局差异的实际视觉影响仍需窗口验证。源码入口为 `apps/apple/macOS/Reader/ReaderContent.swift`、`DetailRows.swift`、`PullRequestContent.swift`；FlowRow 的布局实现也需同时核对。手机流畅度以获准的真机结果判断。
