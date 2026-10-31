# main CI 失败诊断

## 问题与状态

已修复待验证。最近检查 2026-10-31。

main 的 Verify Sill、Verify Sill macOS、Sill integration 与 Sill authenticated data 从 `da50af1d` 起陆续失败，`b2adee7f` 时全部为红。之后每个 PR 都继承同一批失败。

## 环境与触发

GitHub Actions 对 main 和基于 main 的 PR 运行。本地用 `npm run test:core` 与 `swift test --filter FeedTests` 复现了 Web 与 Swift 失败；浏览器场景只读 CI 日志，未在本地运行。

## 定位依据

四个功能提交改变了既定行为，测试没有同步更新。逐项对照提交说明、源码注释和失败断言，确认均为测试过期，未发现产品回归。

| 提交 | 有意改变的行为 | 失败的测试 |
| --- | --- | --- |
| `da50af1d` | 手指移动超过 4px 才开始下拉刷新 | `gesture-refresh.test.ts`：在下拉开始前取样读布局次数，把开始时的那次读取算成后续读取 |
| `36c86c72` | 各排序模式在主条件相同时按 `time` 新到旧；新到的卡排在已固定顺序的最上面 | `core.test.ts`、`search-desktop.test.ts` 仍按存储顺序断言；`FeedTests.swift` 仍要求新卡不进入前两位 |
| `82cb03fb` | 云端 MCP 新建卡片必须带 `summary`（`missing_summary`） | `cloud-browser.ts`、`cloud-app-browser.ts` 的 `sill_createContent` 没有摘要 |
| `b2adee7f` | 可读类型打开即写入 `seen` 与 `read`（`apps/web/data/cards.ts` 的 `readable`） | `app-display.test.ts` 要求打开媒体卡不写入任何状态；`browser-card-actions.ts` 要求打开后仍未读；`pwa-touch-browser.ts` 的快照包含延迟 500ms 保存的阅读进度 |

`search-state-fixture.ts` 的卡片各自取 `Date.now()`。按新的排序规则，同一毫秒与跨毫秒会得到不同顺序，测试结果随机变化。

## 处理情况

- 按上表把断言改为现行行为。媒体卡测试仍禁止写入 `playbackPosition` 与 `progress`，只允许打开时的 `{ seen: true, read: true }`。
- PWA 长按场景比较卡片状态时排除 `progress`：内容全部可见时，阅读进度在打开后由自己的计时器保存，不是长按引起的操作。
- 搜索测试数据改用同一个时间，平局时按存储顺序；桌面搜索追加的卡片明确晚 1 秒。
- 排序测试给待办和提醒设置明确时间，让刷新后的顺序直接由规则得出。

## 验证与后续

- 本地：`npm run test:core` 484 项通过；`swift test --filter FeedTests` 7 项通过；`npm run typecheck`、`npm run lint` 通过。
- 未在本地运行：浏览器回归（`test:browser`、`test:pwa-touch`、`test:cloud-browser`、`test:cloud-app-browser`），由 PR dabaige53/sill#86 的 GitHub Actions 验证。
- 这次连续变红的原因是功能提交在 CI 变绿前就进入了 main。

## 分页场景中途重置超时（2026-10-31）

状态：测试修正已通过 CI；不能据此认定产品分页故障。

- 环境：PR #87、提交 `92dd6eb`，Web 检查 `41161850850`。`pagination-keeps-card-focus` 在 `page.waitForFunction` 等待“回到顶部且卡片数量为 40”时超时。
- 最小复现：插入 33 张卡；聚焦原卡标题、滚动加载至 42 张后，同一页面立即回顶、把 `pageLimit` 从 80 强制改回 40、重绘，再等待顶部。
- 预期：标题焦点和任务焦点都能在真实滚动加载时保留。
- 实际：首次标题分页断言通过；失败截图停在后续阅读卡片中部，而非顶部。任务场景尚未执行。日志未记录失败时的卡片数量和滚动事件，不能确定具体竞态。
- 定位依据：产品按滚动位置触发加载；新到卡片排在原卡之前，聚焦原卡可能先自动滚动。测试把加载后的页面强行缩回，不是用户分页流程，也未隔离之前的滚动事件。
- 处理：两种焦点分成独立页面；准备数据时按完整初始列表排序，使原卡位于前部；聚焦后先确认仍为 40 张，再用真实滚轮触发加载。保留 42 张、分页上限、焦点、任务预览顺序、继续操作和不跳回原卡位置等断言。没有修改产品分页实现或放宽通过条件。
- 验证：提交 `feea5162` 的 Web 检查 `41163031233` 通过，正式 tag 的 Web 检查 `41168272751` 也通过；未在本地运行浏览器测试。
