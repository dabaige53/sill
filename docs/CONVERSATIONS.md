# F04：独立网页对话历史与恢复

这些是 Quiet Glass 自己拥有的 conversation ID，不是 ChatGPT/Codex 的线程 ID。SQLite 保存有序消息、卡片引用快照和问题状态。网页仍只提交待处理请求，不自动运行模型，不调用付费 AI API。

## 使用

独立网页的讨论面板新增“历史”“新对话”和“加载更早消息”。刷新后恢复当前应用对话；待处理问题仍在队列，工作者之后回答会出现在历史中。新对话保留旧历史，不删除数据。浏览器保存未提交问题与所选卡片；不同对话的草稿互相独立。仅选卡片、打开历史和恢复页面不会提交请求。

较早消息按页加载，并保留阅读位置。来源标题作为普通文字显示。新问题最多 4,000 字符、20 张卡片；超限草稿完整保留，明确提示后再修改。请求结果未知时保留不可变的创建载荷和幂等键，重试先确认原结果；期间输入的新问题不会被旧响应清除。

“历史”也列出本浏览器尚未提交的草稿，包括只选卡片的草稿。极少数情况下，新建响应延迟但用户已从历史打开服务器对话并编辑，界面保留两个独立草稿，不合并或覆盖文字。

原生宿主 MCP App 仍使用宿主当前线程，本模块不为其伪造聊天记录。离线设计演示不连接这套持久化服务。

## 共享服务接口

原有 24 个 MCP 工具保留，新增 5 个，共 29 个。

| MCP | HTTP | 合同 |
| --- | --- | --- |
| `qg_create_conversation` | `POST /api/conversations` | `{title?,idempotencyKey}` → conversation |
| `qg_list_conversations` | `GET /api/conversations` | `{limit?,offset?}` → `{conversations,total,nextOffset}` |
| `qg_read_conversation` | `GET /api/conversations/:id` | `{conversationId,limit?,offset?}` → `{conversation,messages,total,nextOffset}` |
| `qg_create_request` | `POST /api/requests` | `{conversationId,idempotencyKey,question,cardIds}` → request |
| `qg_get_request` | `GET /api/requests/:id` | `{requestId}` → request |
| 既有 `qg_list_requests` | `GET /api/requests` | 可选 conversationId/status/limit/offset；默认 pending |
| 既有 `qg_answer_request` | `POST /api/requests/:id/answer` | `{requestId,answer,evidenceIds}`；HTTP 不传 requestId |

为兼容旧网页，HTTP 创建问题仍可省略对话 ID 或幂等键，由服务分配；未提供稳定键的旧客户端不具备可靠的重复请求去重保证。新网页与新 MCP 创建工具始终显式提交这两项。HTTP 路径 ID 不在请求体重复提交。接口使用已有单用户认证和同源写入保护，MCP/HTTP 均调用相同业务函数。不是多租户系统，不把配置中的不同连接器当作不同对话所有者。

conversation 包含 id/title/createdAt/updatedAt/messageCount/requestCount/pendingCount。messages 按不可变 sequence 升序，含 id/conversationId/requestId/role/text/createdAt，用户消息另有 status/cardRefs，助手消息另有 evidenceIds。默认列表每页20、消息每页50，最大100；末页 nextOffset 为 null。先读最新50条的网页可逐页加载更早内容。

队列是可变集合：工作者应先收齐需要的分页再回答，或反复读取 offset=0 并处理；不要一边删除 pending 项一边递增 offset，否则可能跳过项。工具状态是应用队列状态，不代表模型正在自动执行。

## 幂等性、快照与审计

创建对话及问题使用载荷绑定的稳定幂等键。同键同载荷返回原对象；不同载荷返回 `IDEMPOTENCY_CONFLICT`，不会偷偷追加消息。回答相同文本和同序证据的重试返回原结果；不同回答返回 `ANSWER_CONFLICT`，原答案不可被覆盖。缺失对象返回404，冲突409。

消息追加、序号/计数、状态、幂等记录与审计在同一 SQLite 写事务内完成。审计仅含标识、序号和数量，不复制消息正文。没有删除、外部写入或自动计费操作。

问题保留原 cardIds 与创建时的 cardRefs：来源标识、标题、有限摘要/正文、截断标记、原内容标识和快照哈希。之后来源更新不改变已提交的引用。工作者收到提交时冻结的最近12条上下文，每条正文最多2,000字符，附截断/更早历史标记；完整历史通过分页工具按需读取。来源内容始终是不可信数据。

旧版独立 request 自动迁移为确定性应用对话，保留原请求 ID、问题、答案、状态和时间。迁移时才能补取的卡片快照明确标记 legacy-migration 和实际 capturedAt，不伪装成历史时点的原始快照。

## 验证边界

覆盖服务持久化、独立进程竞争、事务回滚、严格校验/鉴权、真实 MCP 与 HTTP，以及真实 Chromium 的刷新恢复、延迟响应、断线重试、多对话和分页。仍没有实际模型 API 调用或部署。验证记录见 [对话验收](../tests/CONVERSATIONS-REPORT.md)。
