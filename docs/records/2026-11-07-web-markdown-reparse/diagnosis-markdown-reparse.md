# Web 搜索与信息流反复解析正文

## 问题与状态

状态：已修复待验证（源码定位与合成数据测量确认；未做真实设备体验验收）。最近检查：2026-11-08。

## 环境与触发

- Web/PWA 云端版，长文较多的工作区。
- 触发：在搜索框输入任意文字；或在信息流中切换收藏、已读、任务勾选等任何会重绘卡片的操作。
- 预期：输入与点按即时响应。实际：每次按键或重绘都把卡片完整正文重新交给 markdown-it 解析。

## 定位依据

**源码（已证实）**：

- 搜索匹配 [app-feed.ts](../../../apps/web/views/app-feed.ts) `matches()` 对每张卡调用 `markdownText(c.body)`。搜索面板每次按键同步调用两次 `searchAll()`（建议列表与结果计数），停顿 140ms 后结果列表再调用一次（见 [app-input.ts](../../../apps/web/views/app-input.ts)、[panel-search.tsx](../../../apps/web/interactions/panel-search.tsx)）；顶栏搜索同样同步扫描两次。每次都遍历全部卡片并重新解析正文。
- 卡片元信息 [card-blocks.tsx](../../../apps/web/cards/card-blocks.tsx) `sourceLine()` 调用 `cardReadingTime()`，经 [card-source.ts](../../../apps/web/data/card-source.ts) `readingMinutes()` 再次解析正文；当前页的每张文章卡在每次重绘时都会解析。
- 缺少概要的卡片在 [cloud-card.ts](../../../apps/web/data/cloud-card.ts) `cloudCard()` 中用正文首段补概要；每次保存和读取回执都会对全部卡片执行。

**测量（合成数据，Linux Node，非用户设备）**：200 篇平均 2.25 万字符的正文，`markdownText` 全量一次约 0.4–0.5 秒；1200 篇约 2.1 秒。手机 CPU 预计更慢，但未测量。

## 处理情况

- [markdown.ts](../../../apps/web/atoms/markdown.ts) 按正文字符串缓存纯文本段落与拼接结果。`markdownBlocks()` 返回副本，调用方修改不影响缓存。输出内容不变。
- 首版按 500 条最近使用淘汰。复查发现搜索按固定顺序扫描全部卡片，卡片超过 500 张时每次扫描都全部未命中：600 张卡第二次扫描仍解析 600 次。改为保留十分钟内用过的正文，缓存比上次清理后翻倍时清掉其余的。模拟结果：任意规模的工作区反复扫描都不再解析；300 张卡一天内 2.88 万次正文修改，缓存最多 982 条；持续出现只用一次的新正文时，缓存不超过十分钟用量的约两倍。曾试过按清理代数保留，持续写入新正文时缓存随写入量无限增长，已放弃。
- Mac 端在载入卡片时只解析一次正文（`CardModel`），无同类问题，本次不改。

## 验证与后续

- 回归 [markdown.test.ts](../../../tests/web/markdown.test.ts)：统计 markdown-it 解析次数。「feed faces, reading time and search parse each body once」在没有缓存时为 11 次；「searching a large workspace again parses no body twice」在首版 500 条缓存下为 3600 次（应为 1200）；「bodies unused for ten minutes leave the cache as new bodies arrive」在首版缓存下会误清刚用过的正文。三者在当前实现下通过。
- 命中开销（同一合成数据）：1200 篇长文、字符串经过克隆后，每次全量取纯文本约 18ms。
- 剩余：搜索每次扫描仍对全部卡片拼接并转小写，300 张卡约 4.6ms、1200 张卡约 17ms 一次，每次按键同步扫描两次。再降需要多存一份小写正文，或依赖“卡片对象不原地修改”的约定，本次未做。
- 未验证：浏览器实际输入延迟、手机端体验。
