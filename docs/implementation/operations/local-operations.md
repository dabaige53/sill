# 本地操作

更新：2026-10-28。

## 页面入口与更新

本地产品查看与验收统一使用 `http://127.0.0.1:4318/#feed`，只保留这一个常驻预览服务。隔离测试使用独立端口和合成数据，方法见[本地测试](local-testing.md)。

Web 使用 React + TypeScript + Vite；macOS 保留 SwiftUI。5173 仅供开发时临时使用，结束开发后关闭，不作为另一套产品版本或验收入口：

| 入口 | 用途 | 如何更新 |
| --- | --- | --- |
| `http://127.0.0.1:4318/#feed` | `npm start` 提供构建后的本地产品页面 | 修改源码后运行 `npm run build`，再刷新浏览器 |
| `http://localhost:5173/#feed` | 另开终端运行 `npm run dev`，用于界面开发 | Vite 热更新；本地 API 仍需 4318 服务 |

4318 不监听源码变化。服务正在运行、源码已合入，都不表示浏览器已加载最新构建。服务每次请求读取 `dist/web/index.html`，仅更新前端产物时无需重启服务；更新 `server/local/` 后需要重启。

```sh
npm run build
node scripts/build.ts --check
npm start
```

已有本地服务运行时跳过最后一条，刷新页面即可。`--check` 会重新构建并比较现有产物；出现 `stale_build` 时重新执行 `npm run build`。若报告 `Stale design data`，先运行 `npm run contracts:generate` 更新设计数据导出，再构建。

## 数据与 AI 操作

本地页面和 CLI 共用 `server/local/index.ts` 与 `.sill/local/cards.json`。云端已有独立的内容与工作区 MCP，按账号操作云端数据，不共用此本地文件。外部应用由宿主 AI 使用；Webhook、内置助手与可靠执行器仍待实现，范围见 [Agent 与 MCP](../agent-mcp.md)。

下表是当前本地状态操作，不是外部 MCP 执行回执；`taskDone` / `read` 的本地更新不证明外部任务或邮件状态已经改变。目标意图协议尚未实现，见 [Agent 与 MCP](../agent-mcp.md)。

| 产品能力 | AI 操作 |
| --- | --- |
| 展示、搜索、查看正文与来源 | `list [关键词]`、`get <id>`、`open <id>`；返回链接后由宿主打开 |
| 创建、修改卡片，关联卡片，待办与日程内容 | `card.upsert`；支持 `capabilities.types` 列出的卡片类型 |
| 删除卡片 | `card.delete` |
| 已读、收藏、稍后读 | `item.patch` 的 `read / seen / bookmarked / later / progress` |
| 标签与备注 | 标签使用 `card.upsert`，备注使用 `item.patch.note` |
| 完成或恢复任务 | `item.patch` 的 `taskDone`，填写已完成任务的 ID 数组 |
| 提醒延后、忽略、完成、恢复 | `item.patch` 的 `snoozedUntil / dismissed / reminderDone`；时间使用毫秒 |
| 阅读计时 | `reading.add`，累加秒数 |
| 排序与排版 | `preferences.patch` 的 `sort / density`；排版字段见[跨端数据约定](../../../contracts/README.md#内容排版偏好) |
| 导出、备份、批量同步 | `state` 返回完整 JSON；`apply` 原子提交多个操作；数据文件可在服务停止后备份 |

`card.upsert` 是完整替换。读取现有卡片后修改需要的字段，连同完整卡片写回；保留未要求修改的内容。任务 ID 必须唯一；任务完成状态只能使用卡片内的任务 ID。来源链接只接受 HTTP / HTTPS。

HTTP 同源入口：`GET /api/local/state`、`GET /api/local/capabilities`、`GET /api/local/open?id=...`、`POST /api/local/operations`。写入格式：`{operations:[...],expectedRevision?:number}`。CLI 默认使用 4318；隔离测试可用 `QG_LOCAL_PORT` 指定本机端口。

同批操作先校验全部内容，成功后原子写入文件。提供 `expectedRevision` 或受支持字段的 `before` 才有相应冲突保护，冲突返回409。页面整卡保存和删除现在携带原卡片 `before`，新建携带 `before:null`；服务端比较当前卡片，不匹配则拒绝整批操作。行内编辑期间不吸收轮询的新卡片作为编辑基准；备注和批量标签编辑也保留原始字段，包括原本没有值的字段。其他保存请求返回时不能更新这些编辑基准，无关的阅读状态可以独立合并。CLI 旧调用保持兼容，未提供条件的调用仍没有并发保护。失败的页面修改会提示，并把草稿留在浏览器 `sill-unsynced` 中；重新读取最新版本后由 AI 协助合并。

卡片由 AI 通过本协议创建与修改。卡片内的 `sources` 记录内容出处；兼容数据中的顶层 `sources` 不参与产品操作。

页面的筛选条件、选中状态和滚动位置属于当前视图；播放位置作为卡片状态单独保存。AI 可以从完整卡片状态完成相同的查询、选择与阅读，使用返回链接在自己的宿主打开。

网页关闭后不执行后台提醒或采集。需要定时操作时，由用户正在使用的 AI 环境安排本地命令。

## 卡片字段

字段字典见[跨端数据约定](../../../contracts/README.md)，当前版本与可写字段以 `capabilities` 返回为准。正文为 Markdown；阅读时长估算与 `reading.add` 的实际计时分别处理。个人备注使用 `item.patch.note`，标签属于卡片字段，修改时使用带 `before` 的 `card.upsert`。不兼容数据的处理另行确认，不因校验失败自动清空用户数据。

PR 使用独立的 `pullRequest` 快照；播客音频地址、带时间点的章节和文字稿、邮件附件（`files`）见字段字典。播放位置写入 `item.patch.values.playbackPosition`，以秒为单位，不改变阅读进度或已读状态。

## Mac 本地性能追踪

菜单栏「性能追踪」→「开始性能追踪」后正常使用；遇到问题点「标记此刻」。点「停止并导出…」后在后台写盘并显示日志目录。正常退出也会结束记录。

日志保存在 `~/Library/Logs/Sill/Performance/<会话编号>/`。包含事件、环境信息、汇总与可打开的 HTML 报告。独立队列每秒采样 CPU／驻留内存，每 100ms 探测主线程应答，超过 50ms 记录延迟；这不是 FPS。搜索、分栏、队列等待、后端读写和快照应用分别记录阶段。

使用官方 XCTest、XCUITest 与 Instruments 的自动化／人工流程、采集上限、指标口径和基线比较见 [Mac 性能追踪与自动化测试](macos-performance.md)。默认关闭，不上传，不记录正文、搜索词或凭据。
