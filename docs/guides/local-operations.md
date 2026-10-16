# 本地操作

更新：2026-10-16。

当前页面和 AI 共用 `server/local/index.ts` 与 `.sill/local/cards.json`。当前外部应用由宿主 AI 使用，默认运行路径不提供桥接；目标中的内置助手、对外MCP及选择性tools桥接见 [Agent与MCP](../product/agent-mcp.md)，尚未实现。

下表是当前本地状态操作，不是外部 MCP 执行回执；`taskDone` / `read` 的本地更新不证明外部任务或邮件状态已经改变。目标意图协议尚未实现，见 [Agent 与 MCP](../product/agent-mcp.md)。

| 产品能力 | AI 操作 |
| --- | --- |
| 展示、搜索、查看正文与来源 | `list [关键词]`、`get <id>`、`open <id>`；返回链接后由宿主打开 |
| 创建、修改卡片，关联卡片，待办与日程内容 | `card.upsert`；支持 `capabilities.types` 列出的卡片类型 |
| 删除卡片 | `card.delete` |
| 已读、收藏、稍后读 | `item.patch` 的 `read / seen / bookmarked / later / progress` |
| 标签与备注 | `item.patch` 的 `tags / tagsEdited / note` |
| 完成或恢复任务 | `item.patch` 的 `taskDone`，填写已完成任务的 ID 数组 |
| 提醒延后、忽略、完成、恢复 | `item.patch` 的 `snoozedUntil / dismissed / reminderDone`；时间使用毫秒 |
| 阅读计时 | `reading.add`，累加秒数 |
| 排序与减少透明度 | `preferences.patch` 的 `sort / reduceTransparency` |
| 导出、备份、批量同步 | `state` 返回完整 JSON；`apply` 原子提交多个操作；数据文件可在服务停止后备份 |

`card.upsert` 是完整替换。读取现有卡片后修改需要的字段，连同完整卡片写回；保留未要求修改的内容。任务 ID 必须唯一；任务完成状态只能使用卡片内的任务 ID。来源链接只接受 HTTP / HTTPS。

HTTP 同源入口：`GET /api/local/state`、`GET /api/local/capabilities`、`GET /api/local/open?id=...`、`POST /api/local/operations`。写入格式：`{operations:[...],expectedRevision?:number}`。CLI 默认使用 4318；隔离测试可用 `QG_LOCAL_PORT` 指定本机端口。

同批操作先校验全部内容，成功后原子写入文件。提供 `expectedRevision` 或受支持字段的 `before` 才有相应冲突保护，冲突返回409。页面整卡保存和删除现在携带原卡片 `before`，新建携带 `before:null`；服务端比较当前卡片，不匹配则拒绝整批操作。行内编辑期间不吸收轮询的新卡片作为编辑基准；其他卡片的阅读状态可以独立合并。CLI 旧调用保持兼容，未提供条件的调用仍没有并发保护。失败的页面修改会提示，并把草稿留在浏览器 `sill-unsynced` 中；重新读取最新版本后由 AI 协助合并。

来源页面的系统授权入口只记录“尚未连接”，不会伪造同步时间。RSS URL 订阅尚未实现，提交时明确告知地址未保存，不创建成功记录；文件导入仍可使用。

页面的筛选条件、选中状态、播放位置和滚动位置只影响当前视图。AI 可以从完整卡片状态完成相同的查询、选择与阅读，使用返回链接在自己的宿主打开。当前没有为 Hermes 或 Claude 增加宿主专用按钮，也未声明它们已经完成宿主实测。

网页关闭后不执行后台提醒或采集。需要定时操作时，由用户正在使用的 AI 环境安排本地命令。
