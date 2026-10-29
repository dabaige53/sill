# 外部执行方案与技术候选的原始依据

记录整理：2026-10-29。下文保留原段落的日期、状态和证据，不表示本轮重新执行或验收。

## 决策状态与 V1 范围

本页集中维护产品方案；[V1 交接包](../../plans/external-agent-webhook.md) 只承载接口契约、原生示例及可运行的准备检查，不另立技术选型。当前已实现云端内容与工作区数据操作；工作区接口已于 2026-10-16 发布。Webhook、内置助手和可靠执行器仍不在本次实现范围，真实外部连接须另行确认。

| 状态 | 决策 |
| --- | --- |
| 用户已确认 | Agent 驱动；API 少而稳定；模块化单体；复用成熟框架，不自建协议、OAuth 或工作流平台 |
| 用户已确认（2026-10-16，后续取消 Web/PWA 速记） | 不接入外部来源，不由程序同步内容；卡片新增和内容修改由助手完成，保留原有轻操作，不提供复杂人工编辑器；Web/PWA 已取消「记一笔」，Mac 入口差异单列；连接器只用 Composio，只供远期内置助手；其他外部工作交给外部助手 |
| V1 已确认方向、尚未实现 | 不做内置 AI 助手；Sill 通过配置好的 Webhook 通知外部 OpenClaw 或 Hermes 助手，由其调用 Sill MCP 读写结果 |
| 远期可选 | 内置助手（只通过 Composio 连接器操作其他程序）、复杂任务委托；不作为 V1 前置条件。不桥接上游 tools |
| 当前实现与后续选择 | 云端已有 HTTP、官方 MCP SDK 与 Supabase 数据/Auth；原生云端接入及 Webhook 实例、版本和真实连接仍需确认 |
| 当前已实现并发布的增量 | 工作区 HTTP/MCP 读取与原子批量操作；完整卡片状态、偏好、阅读秒数、筛选及导出数据；不含 Webhook 或助手执行 |
| 后续另行确认 | Webhook 投递、助手任务与可靠执行器；本地并发保护与来源状态修复已实施 |
| 当前实际能力 | 本机 Web + CLI + JSON；另有鉴权云端网页、卡片 API 与内容 MCP；没有上述 Webhook、内置助手或可靠执行队列 |

V1 目标路径：`Sill UI 动作/事件 → 已配置外部 agent Webhook → OpenClaw/Hermes 处理 → 调用 Sill MCP 读取/写入 → 卡片展示结果`。Webhook 是 Sill 发出的通知，MCP 是外部助手调用 Sill 的能力入口，两条方向分别鉴权。已核验的两家官方接口不同；用户实例、版本、回调或查询能力仍需确认，不声称已连通。

V1 不内置 LLM、聊天引擎或 agent runtime，不因这一流程引入 Cloudflare Agents、Durable Objects（DO）或 Workflows。外部助手自身的模型、运行成本、凭据和执行能力由其宿主管理。

官方文档核验（2026-10-13，仅文档，不是实例验收）：

| 外部助手 | 已核验能力及边界 |
| --- | --- |
| [OpenClaw hooks](https://docs.openclaw.ai/gateway/config-hooks)、[MCP client](https://docs.openclaw.ai/tools/mcp) | `POST /hooks/agent` 使用 `message`、可指定 `agentId`；Bearer 或 `x-openclaw-token` 鉴权。200/runId 仅表示接收；`Idempotency-Key` 的短期缓存不能替代 Sill 持久幂等。可配置 MCP client 调用 Sill |
| [NousResearch Hermes Agent webhooks](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/webhooks)、[MCP](https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp) | `POST /webhooks/<route-name>`；GenericV2 对 timestamp + `.` + 原始 body 签名，`X-Request-ID` 去重。普通 agent 路由的 202 accepted/delivery_id 不代表完成。支持远程 HTTP/stdio MCP；Webhook route 工具默认受限，需明确开放 Sill 工具 |

用户所说 Hermes 是否为 NousResearch/hermes-agent 尚未确认。两种 payload 与鉴权各按供应商适配，不制定一个假通用格式；上述端点属于外部助手，不是新增 Sill API。

Webhook 最小约束（待实现）：

- 只投递明确配置的小范围事件及必要对象引用；为每个外部助手分配最小工具/资源权限。Webhook 发送凭据与 MCP 调用身份分开，采用供应商实际支持的签名或鉴权，秘密留在服务端、不夹在通知正文；不得把内容字段当授权。URL 配置需 SSRF 防护：限制允许目标，校验解析地址与重定向，禁止未授权内网/元数据访问。
- 持久化 `event_id`、`card_id`、`card_version`、幂等键和投递状态；重复投递/重复回写去重。接收方 ack 仅表示收到，不能把卡片标成外部完成。
- 网络失败采用有上限的退避重试；认证失败暂停；投递超时可能已经接收，先查状态或按同一幂等键核对，不能重新生成外部写操作。供应商不支持去重/查询时标为待核对，不承诺可靠自动重试。
- 外部助手先经 MCP 读取卡片，再通过内容 update 的 metadata 携 `event_id` 和 `expectedRevision` 写回结果/证据；关联和版本校验通过、成功落库才显示完成。Agent 回写不得再触发同一事件，防止通知循环；冲突保留待合并。单卡内容 API 已支持受事件权限限制的 metadata 回写；工作区 Batch 不接受 metadata。Webhook 投递和执行流程仍未实现。
- V1 不新增通用 callback 协议或完整 agent 任务调度。优先 MCP 异步回写；迟迟没有结果时只使用供应商已核验的查询能力，否则显示待核对，不虚构查询端点或完成状态。复用成熟投递设施。


界面与 AI 的分工以上述「Agent 优先与界面边界」为准；原有轻操作不因取消内容编辑而被删除。

## 模块边界与历史技术候选

当前云端已采用现有 HTTP 适配、官方 MCP SDK 与 Supabase 数据/Auth。下表保留早期候选及远期参考，不表示当前数据操作仍待选型。

采用模块化单体，保持一个简单可启动服务。依赖方向为 `Web/CLI/HTTP/MCP 适配 → 共用能力与权限 → 领域规则/存储接口`；本地 JSON、云端数据库与未来 Webhook 分属存储或外部适配，领域层不依赖 DOM、网络框架或云厂商。Web 组件处理渲染、焦点与动画，应用状态/用例处理保留的轻操作、编辑基准和写入冲突；不恢复已取消的 Web/PWA 速记。只为实际职责拆文件，不建立空抽象目录。

| 候选 | 适用条件与限制 |
| --- | --- |
| 现有 JS + [Hono、Zod/OpenAPI](https://hono.dev/examples/zod-openapi) | 优先评估现有业务复用；校验和接口文档交给成熟组件，不自行发明路由框架。未安装、未选定 |
| [Cloudflare createMcpHandler](https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/) | 选择 Workers 后再评估的官方 MCP 适配。文档已将 McpAgent 标为弃用且冻结；新 handler 与现有 SDK 的版本组合需核对，不直接粘贴旧 quick-deploy 模板 |
| [Cloudflare Agents starter](https://github.com/cloudflare/agents-starter) | 远期内置助手的候选参考，不是 V1 必需依赖，不运行其安装/部署流程 |
| [FastAPI + FastMCP](https://gofastmcp.com/integrations/fastapi) | Python 优先时的备选；可复用 FastAPI/OpenAPI 和 MCP 挂载，但不能自动公开全部路由。当前没有引入第二语言或双后台的必要 |

前端候选为 SwiftUI iOS/macOS 与独立 Web，共用接口；原生 SwiftUI 不要求 Swift 后端或 CloudKit。V1 优先最少组件。Cloudflare Agents/DO/Workflows + Supabase 数据/Auth 可作为远期内置助手与对外 MCP 的部署组合候选，尚未采纳或部署，也不是现有项目可以直接搬上云的承诺。

[Supabase OAuth 2.1 Server](https://supabase.com/docs/guides/auth/oauth-server) 与 [MCP 鉴权文档](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication) 可作为复用授权的候选，避免再造授权服务器；产品工具权限、资源所有权、上下游身份隔离仍由应用落实。其发布阶段及项目可用性须在选型时复核，不能把 OAuth 支持当成业务授权已完成。

远程 HTTP MCP 更适合上述托管路径；原样运行 stdio/Linux 程序需要额外宿主或容器运行环境，不能当普通 Worker 直接执行。Cloudflare Containers 属付费路径。额度以官方 [Workers](https://developers.cloudflare.com/workers/platform/pricing/)、[DO](https://developers.cloudflare.com/durable-objects/platform/pricing/)、[Workflows](https://developers.cloudflare.com/workflows/reference/pricing/)、[Containers](https://developers.cloudflare.com/containers/platform/pricing/) 和 [Supabase](https://supabase.com/pricing) 为准，不维护易过期价格大表；免费额度不保证任意 MCP、模型调用或稳定生产运行。

以下两种形态与内置助手协议保留为远期设计背景，不能覆盖上面的 V1 缩减范围。

