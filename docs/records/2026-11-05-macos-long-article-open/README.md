# Mac 打开长文卡片卡顿

## 问题与状态

状态：已修复待验证（原因为源码推断，未经调用栈证实）。最近检查：2026-11-05。

## 环境与触发

- macOS 27.2，Sill 1.2.34（build 1793756293），真实账号。
- 触发：打开约 19 分钟阅读量的长文卡片（《用 Jev 给 LLM 划边界，系统更快更可控》）。
- 预期：详情页立即出现并可滚动。实际：打开后明显卡顿。

## 定位依据

**性能追踪（观察）**：应用内追踪 `8AB8CA5B-1657-4787-BF62-1399952F6BD1`（日志在 `~/Library/Logs/Sill/Performance/`，未入库）。

- `openCard` 本身 0.13ms；详情页 `viewAppeared` 后约 0.4 秒内出现一次 458ms 和一次 52ms 的主线程延迟，CPU 采样峰值 80%。
- 同时段有一次刷新读取 1231ms，但差异计算在后台任务中运行（[Workspace.swift](../../../apps/apple/macOS/Model/Workspace.swift) `Task.detached`），`changed_cards` 为 0，不在主线程。

**源码（推测）**：

- 正文只在载入卡片时解析一次（[CardModel.swift](../../../apps/apple/macOS/Model/CardModel.swift) `MarkdownBody`），打开时不重新解析。
- [MarkdownText.swift](../../../apps/apple/macOS/Reader/MarkdownText.swift) 用普通 `VStack` 一次性创建全部段落，每段都是带文字选择、需要纵向固定尺寸测量的 `Text`。长文几百段会在打开时全部排版，与追踪中的主线程延迟吻合。

未做 Time Profiler 采样（用户选择直接按源码修改），因此没有调用栈证明上述是唯一原因。

## 处理情况

- 正文改为 `LazyVStack`，只排版视口附近的段落。
- 目录高亮原先取“位置已过顶部的最后一个标题”；懒排版后远离视口的标题不再上报位置，会选错。改为所有已排版段落上报位置，取“已过顶部的最低段落之前的最后一个标题”（[ReaderPage.swift](../../../apps/apple/macOS/Reader/ReaderPage.swift)）。
- Web 端由浏览器排版，本次不改。

**同类排查后追加的两处修改（已定位，源码确认）**：

- 每帧整页重算：[PreviewSheet.swift](../../../apps/apple/macOS/Reader/PreviewSheet.swift) 在自身 `body` 中读取 `scroll.motion.scrollOffset` 并传给 `ReaderContent.mediaOffset`，而该参数从未使用。滚动位置每帧更新，使整个详情页（含 `ReaderPage`、目录与正文结构）每帧重新计算。已删除该参数与读取；其余滚动值仍只由小视图读取。
- 目录重复遍历全文：`ReaderPage.headings` 每次访问都遍历全部段落，目录每行计算缩进时又整体重算一次，代价为“标题数 × 段落数”。改为解析正文时记录标题位置（[MarkdownBody.swift](../../../apps/apple/SillKit/MarkdownBody.swift) `headings`），目录渲染时只取一次并预先算出最高层级。
- 暂不处理：搜索未命中时每次按键重新拼接正文文本；每秒提醒检查遍历全部卡片。两者未见卡顿证据。

## 验证与后续

- 本地只做了文件检查与 Swift 语法检查，未构建、未运行。新增 `MarkdownBodyTests.headingIndicesPointAtHeadingBlocks`。测试与构建由 GitHub Actions 执行。
- 待验证：装新包后打开同一张长文卡片，用应用内性能追踪看主线程延迟是否消失；全屏阅读时检查目录高亮随滚动正确切换、点目录能跳到远处标题、滚动条和读完进度不跳。
- 若仍卡顿，下一步用 Time Profiler 在打开时采样，重点看 `Text` 排版与文字选择开销。
