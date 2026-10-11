# 本地笔记与卡片备注

连接模式提供服务端持久化的本地笔记、个人备注与标签。它们只写入 Quiet Glass 的 SQLite，不修改 Notion、日历或其他上游内容。离线演示仍使用原本的浏览器状态。

## 接口

原有 19 个 MCP 工具保留，新增 4 个，共 23 个。HTTP 接口继续使用已有认证、同源与请求大小检查；MCP 和 HTTP 调用同一业务服务。

| MCP | HTTP | 输入与返回 |
| --- | --- | --- |
| `qg_create_note` | `POST /api/notes` | `{title, content?, tags?, idempotencyKey}` → 完整卡片 |
| `qg_update_note` | `PATCH /api/notes/:id` | `{cardId, set, expectedRevision}` → 完整卡片；HTTP 不传 cardId |
| `qg_read_annotation` | `GET /api/cards/:id/annotation` | `{cardId}` → `{cardId, values:{note,tags}, revision}` |
| `qg_update_annotation` | `PATCH /api/cards/:id/annotation` | `{cardId, set, expectedRevision}` → 备注快照；HTTP 不传 cardId |

本地笔记也可通过 `qg_get_card`、`GET /api/cards/:id`、信息流、搜索和推荐读取。笔记带 `local:true`、`sourceId:"local-notes"` 和独立 revision；外部采集不能使用该保留来源或本地笔记 ID。更新笔记只接受本地笔记，来源卡片正文保持不可变。

标题去除首尾空白后须为 1–500 字符；正文最多 50,000 字符；备注最多 4,000 字符；标签最多 20 个，每个去除首尾空白后为 1–30 字符，不允许重复。更新 set 必须是严格、非空的字段子集：笔记允许 title/content/tags，备注允许 note/tags。未知字段、null、类型强制转换与无效版本均拒绝。

## 版本与重试

- 新笔记从 revision 1 开始；尚未设置的备注逻辑默认 revision 0，note 为空、tags 为空。
- 更新必须提交读取到的 expectedRevision。读取、比较、写入和审计在同一 `BEGIN IMMEDIATE` 事务内完成。相同值的合法更新不增加版本或变更审计。
- 版本过期返回 `NOTE_CONFLICT` 或 `ANNOTATION_CONFLICT`，附 current；HTTP 为 409，MCP 返回工具错误。调用方必须先展示/核对新版本，不能盲目覆盖。
- 创建使用载荷绑定的 idempotencyKey。相同键、相同原始内容重试返回同一笔记的当前版本；不同内容返回 `IDEMPOTENCY_CONFLICT`。响应丢失后先用原始内容及原键确认结果，再按版本编辑，不能换键重复创建。
- 审计记录操作、对象、变更字段与版本，不复制正文或备注内容。不提供删除接口。

## 网页行为

设置面板的“新建本地笔记”用于创建；本地笔记预览可编辑正文。所有卡片的标签/备注编辑器编辑个人备注与个人标签，来源标签只读，展示时与个人标签合并。

服务端状态优先。旧浏览器备注与标签仅在本机备份，编辑器可明确选择载入旧内容到草稿；只有主动保存才提交，绝不自动覆盖服务器。草稿存于当前浏览器，可能包含个人内容，不是跨设备草稿服务。

聚焦、重新显示页面和打开页面期间的轮询会同步服务端更新；更新已显示卡片时保留滚动位置。批量备注编辑逐张提交，可能部分成功，会提示已保存数量并保留失败草稿，不声称跨卡片原子提交。

冲突保留草稿，可选择载入最新版本或明确确认以当前草稿重试。保存期间继续输入、关闭后重开，以及响应延迟都不会清除较新的草稿。创建响应丢失时，浏览器保留原始尝试内容与幂等键，刷新后也可确认已创建的笔记，再保存后续编辑；确定的输入校验失败允许修正后重试。

## 验证

`npm test` 包含服务、真实 MCP 与 HTTP 协议测试。`npm run test:content-browser` 通过真实 Chromium 检查上述编辑、冲突、旧数据显式载入、延迟响应、断线重试与刷新恢复。参见 [本地内容验证记录](../tests/LOCAL-CONTENT-REPORT.md)。
