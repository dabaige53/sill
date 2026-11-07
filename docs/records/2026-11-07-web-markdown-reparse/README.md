# Web 搜索与信息流反复解析正文

## 问题与状态

状态：已修复待验证（源码定位与合成数据测量确认；未做真实设备体验验收）。最近检查：2026-11-07。

## 环境与触发

- Web/PWA 云端版，长文较多的工作区。
- 触发：在搜索框输入任意文字；或在信息流中切换收藏、已读、任务勾选等任何会重绘卡片的操作。
- 预期：输入与点按即时响应。实际：每次按键或重绘都把卡片完整正文重新交给 markdown-it 解析。

## 定位依据

**源码（已证实）**：

- 搜索匹配 [app-feed.ts](../../../apps/web/views/app-feed.ts) `matches()` 对每张卡调用 `markdownText(c.body)`。一次搜索面板绘制会多次调用 `searchAll()`（结果计数、建议列表、结果列表，见 [panel-search.tsx](../../../apps/web/interactions/panel-search.tsx)），每次都遍历全部卡片并重新解析正文。
- 卡片元信息 [card-blocks.tsx](../../../apps/web/cards/card-blocks.tsx) `sourceLine()` 调用 `cardReadingTime()`，经 [card-source.ts](../../../apps/web/data/card-source.ts) `readingMinutes()` 再次解析正文；当前页的每张文章卡在每次重绘时都会解析。
- 缺少概要的卡片在 [cloud-card.ts](../../../apps/web/data/cloud-card.ts) `cloudCard()` 中用正文首段补概要；每次保存和读取回执都会对全部卡片执行。

**测量（合成数据，Linux Node，非用户设备）**：200 篇平均 2.25 万字符的正文，`markdownText` 全量一次约 395ms。修复后重复调用约 0.1ms。手机 CPU 预计更慢，但未测量。

## 处理情况

- [markdown.ts](../../../apps/web/atoms/markdown.ts) 按正文字符串缓存纯文本段落与拼接结果，保留最近 500 份正文，按最近使用淘汰。`markdownBlocks()` 返回副本，调用方修改不影响缓存。输出内容不变。
- Mac 端在载入卡片时只解析一次正文（`CardModel`），无同类问题，本次不改。
- 暂不处理：每次保存仍对整个工作区做 JSON 复制和比较（合成数据约 70ms/次，阅读页每 5 秒累计阅读时长也会触发一次）。这涉及写入基线不可变的约定，需单独评估。

## 验证与后续

- 新增回归 [markdown.test.ts](../../../tests/web/markdown.test.ts)「feed faces, reading time and search parse each body once」：统计 markdown-it 解析次数，撤掉修复时为 11 次并失败，修复后为 1 次。
- 本地针对性测试：markdown、card-metadata、card-content、cloud-card、markdown-local、reader-outline 共 38 项通过；`tsc --noEmit` 通过；`npm run files:check` 通过。
- 未验证：浏览器实际输入延迟、手机端体验、完整测试与构建（由 GitHub Actions 执行）。
