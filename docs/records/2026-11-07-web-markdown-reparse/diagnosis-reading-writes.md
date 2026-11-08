# Web 阅读时频繁保存整个工作区

## 问题与状态

状态：已修复待验证（源码定位已证实；未测量真实网络流量和设备体验）。最近检查：2026-11-08。

## 环境与触发

- Web/PWA 云端版，在详情或放大阅读页阅读。
- 触发：打开阅读页持续阅读（一分钟内有操作），或滚动长文。
- 预期：阅读本身不持续产生网络写入。实际：阅读时长每 5 秒保存一次；滚动中进度最多每 500ms 保存一次。

## 定位依据

**源码（已证实）**：

- [app-capture.ts](../../../apps/web/views/app-capture.ts) `tick()` 在阅读页打开且有操作时每秒累加 `Store.state.seconds`，每 5 秒调用 `Store.save()`。
- [app-panels.ts](../../../apps/web/views/app-panels.ts) 滚动中用 500ms 计时器写入进度（[ADR 0067](../../adr/0067-detail-resize-media-and-progress-writes.md)）。
- 云端每次保存发送 `POST /api/v1/workspace/operations`。服务端 `sill_private.apply_operations` 返回 `get_workspace()`，即全部卡片与正文，并把同一份结果写入 `sill_private.receipts.response`，保留 7 天供原幂等键重试（[迁移](../../../supabase/migrations/20261016092653_sill_workspace_operations.sql)；[回执压缩](../../../supabase/migrations/20261027132655_workspace_save_consistency.sql)只清理过期副本）。
- 页面收到回执后在 [cloud-workspace.ts](../../../apps/web/cloud-workspace.ts) `adoptWorkspace()` 比较全部卡片、重新投影全部卡片并整份复制基线。合成数据 200 篇长文，每次保存的页面处理约 50–70ms（不含下载与 JSON 解析）。
- Mac [ActivityRecorder.swift](../../../apps/apple/macOS/Model/ActivityRecorder.swift) 把进度和阅读时长留在本机，只在关闭阅读页、窗口失焦或退出时写入。
- 同时发现：轮询采纳别处的改动时，`adoptWorkspace()` 和本地模式的采纳都会用服务端值覆盖 `Store.state.seconds`，未保存的阅读秒数会丢失。原来每 5 秒保存一次，丢失最多 4 秒；只在离开时写入会放大这一问题，因此待写秒数改为独立计数。

## 处理情况

- 阅读时长：待写秒数记在 `AppController.readingSeconds`，不进入工作区状态。`takeReadingTime()` 在关闭详情、切到后台、离开页面时把秒数加入工作区，单次最多一天（服务端单次上限），余下的留到下次。退出或会话失效时 `clearCloud()` 清零。删除已无对应元素的 `[data-live-time]` 更新。
- 阅读进度（用户 2026-11-08 确认对齐 Mac，[ADR 0093](../../adr/0093-web-reading-writes-on-leave.md)）：阅读中只记录最远位置；打开另一张卡片或面板、在预览与放大之间切换（`openCard` 与 `openPanel` 入口）、关闭详情、切到后台、离开页面时保存；读完仍立即保存。`clearCloud()` 丢弃未写入的进度。同步更新[网页阅读手册](../../../design-system/handbook/web-reading.md)。
- 未改：服务端写入回执仍是整个工作区，回执副本仍保留 7 天。

## 验证与后续

- 回归 [detail-motion-performance.test.ts](../../../tests/web/detail-motion-performance.test.ts)：「reading time stays in memory while reading and is added once when it is written」在旧实现下 12 秒内保存 2 次而失败；「scrolling a long read writes no progress until its view is left, keeping the furthest point」在旧实现下会安排定时写入而失败；「lifecycle and close paths flush pending reading progress and reading time」检查关闭、后台、离开页面与 `openCard` 的补存顺序。
- 回归 [cloud-session-view.test.ts](../../../tests/web/cloud-session-view.test.ts)：退出与会话失效的 8 种情况都清零阅读秒数并丢弃未写入进度；旧实现下失败。
- 未验证：真实浏览器的关闭与切后台补存、网络流量、手机体验。浏览器被强制结束时，本次未写入的进度与阅读时长会丢失（与 Mac 退出前一致）。
- 后续（未执行）：写入回执改为只返回版本号与变化的卡片，回执只保存精简结果。涉及数据库迁移、Web 与 Mac 的采纳逻辑和 MCP 结果兼容，需单独评估与部署顺序。
