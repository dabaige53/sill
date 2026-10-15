# F05：可选独立 AI 回答

独立网页可对已保存的问题显式调用一个 OpenAI Responses API 模型，接收流式内容并保存最终回答。默认关闭；没有后台自动开始、模型工具执行、自动重试或自动外部写入。此功能独立于宿主对话和 ChatGPT 订阅，需要运营者自己的 API 配置及费用安排。

## 配置与数据

`sill.config.json` 的 `ai` 严格字段如下；普通设置接口不能修改这些配置。

```json
{"enabled":false,"model":"","apiKeyEnv":"OPENAI_API_KEY","maxOutputTokens":1024,"timeoutMs":60000,"maxConcurrency":1,"maxContextChars":16000,"maxRequestsPerDay":20}
```

运营者在服务器进程环境中配置密钥，选择账户实际可用的模型，再决定是否启用。不要在聊天、网页、本地笔记或配置 JSON 中填写密钥。本实现没有创建或配置任何真实凭据，也没有进行真实付费调用。关闭状态不读取密钥。网页、MCP 状态和打包资源只包含可用性，不含密钥。

端点固定为 `https://api.openai.com/v1/responses`；不接受自定义 URL，禁止重定向。使用 Node 24 原生 fetch，不新增 SDK 或升级既有 MCP SDK。显式请求 `store:false`、`background:false`、`stream:true`、`tools:[]`、`tool_choice:'none'`。`store:false` 不是对提供方所有保留政策的保证。

一次调用发送提交问题时冻结的问题、有限历史及来源摘录。不会采集最新外部内容，也不发送个人备注、连接器配置或任意数据库字段。默认总输入上限16,000字符，超出时标记截断，优先保留当前问题。引用和历史始终作为不可信参考数据。模型只给出回答或建议草稿，不获得现有业务工具的执行权限；需要管理卡片或外部写入时，仍通过既有授权业务操作和准备/确认流程。

## 接口

新增4个工具，保留既有29个工具名称和合同，共33个。

| MCP | HTTP | 参数与返回 |
| --- | --- | --- |
| `qg_ai_status` | `GET /api/ai` | `{}` → enabled/configured/ready、model、blockers、limits、budget、activeRuns |
| `qg_start_ai` | `POST /api/requests/:id/ai/start` | MCP `{requestId}`；HTTP `{}` → run snapshot |
| `qg_get_ai` | `GET /api/requests/:id/ai` | MCP `{requestId}` → run snapshot |
| `qg_cancel_ai` | `POST /api/requests/:id/ai/cancel` | MCP `{requestId}`；HTTP `{}` → run snapshot |
| 无需独立工具 | `GET /api/requests/:id/ai/events` | 同源认证 SSE，`event: snapshot` 的 data 是完整 run snapshot |

读取和订阅绝不启动付费请求。所有接口沿用已有单用户认证与同源检查，不支持共用令牌的多租户隔离。未知字段、查询参数、空或伪造 ID 均拒绝。

Run snapshot 含 requestId/conversationId/status/output/usage/error、时间、context、canStart/canCancel/billingMayContinue。状态为 idle、running、completed、failed、cancelled、interrupted、superseded、refused 或 incomplete。usage 仅采用提供方有效整数统计；不存在时为 null，不编造 token 或金额。服务端错误仅返回公开代码和固定说明，原始错误/凭据不入前端与审计。

## 幂等、费用与恢复

- 一个 request ID 最多持久认领一次提供方调用。重复开始返回同一结果，包括失败、取消或结果未知；不会换键重试。
- SQLite 事务同时认领请求、并发槽及 UTC 当日次数预算；多进程共用同一数据库时也不会重复认领。预算按尝试保守计数，崩溃或未确认发出也消耗一次，不自动返还。
- `maxRequestsPerDay` 是调用次数上限，不是美元预算；输入字符与输出 token 限制也不是精确费用估算。模型价格、推理 token 与计费由提供方决定。运营者仍需自己的账户预算管理。
- 部分输出持久保存。刷新重新读取已有状态和只读事件流，不重启调用。终态关闭 SSE。并发导航和迟到快照不能覆盖新视图或回退已知状态。
- 取消中止本地流并保留部分内容。前台 Abort 不保证服务方停止处理或计费；不会调用仅支持后台响应的 cancel API。超时、网络中断、进程退出或恢复后未知结果均保守标记，不自动补发。
- 已完成响应和一条有序 assistant 消息在同一事务提交。人工/外部工作者先回答时，AI 标记 superseded，不覆盖、不重复插入。
- 提供方关闭、密钥移除或短暂状态读取失败后，已保存部分内容仍可读。界面显示配置/连接状态；仍可通过既有队列回答。
- 事件流上限2MiB、单事件256Ki字符、10,000事件、输出20,000字符。收到工具输出、不完整或格式无效的流时安全停止，不执行其内容。

## 验证与限制

`npm test` 包含真实 MCP SDK/HTTP/SSE 及注入假提供方测试。`npm run test:ai-browser` 使用真实 Chromium、HTTP 和 SQLite，覆盖显式开始、重复开始、碎片化 UTF-8 流、刷新、取消、失败、导航竞争、迟到状态和中断恢复。测试拦截所有外部浏览器流量，使用合成凭据；没有实际 OpenAI API 调用、账户授权或费用验收。

本版本只支持文本回答，不支持文件、图片、多提供方、模型选择器、后台自动推理、循环工具代理或自动执行建议。

## 官方协议依据

2026-10-11核对：[流式 Responses 指南](https://developers.openai.com/api/docs/guides/streaming-responses)、[类型化事件](https://developers.openai.com/api/reference/resources/responses/streaming-events)、[取消响应的后台限制](https://developers.openai.com/api/reference/resources/responses/methods/cancel)。实现识别 output_text.delta 与 completed/failed/incomplete/refusal 事件；仅完整成功响应写入正式答案。
