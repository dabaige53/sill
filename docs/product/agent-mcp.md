# Agent 驱动与 MCP 连接

更新：2026-10-17。本文区分仓库已实现的数据操作与待实现的外部执行方案；不是发布或连接成功清单，也不启用任何服务。来源与连接器边界以 [ADR 0033](../adr/0033-ai-writes-composio-only.md) 为准。

## Agent 优先与界面边界

2026-10-16 用户确认：

- 所有产品数据与状态操作优先提供 AI 可调用的 MCP 能力，网页与 AI 使用同一套权限、保存和冲突检查。不要求用户打开编辑器才能完成操作。
- 已有卡片的标题、正文、摘要、任务文字、日程时间、地点、出处与布局等内容修改由 AI 完成。界面不提供整卡内容编辑器、结构化字段表单或 JSON 编辑器；不把补齐 API 能力解释为补齐人工编辑界面。
- 保留既有新增卡片、记一笔等轻入口。阅读、收藏、稍后读、任务勾选、提醒、归档、搜索、筛选、设置及其他原有轻操作，继续遵循原设计。只取消内容编辑，不借此删减其他功能或重做界面。
- AI 能操作与人需要操作是两件事。保留的轻操作同样要能由 AI 完成；任务勾选等 Sill 状态不代表外部执行成功。
- 先将产品原则写入对应文档，再按原则修改和验收实现。本次在 Codex 与仓库内处理，不调整 claude.ai 的云端设计。

## 当前卡片交给助手

卡片详情、阅读页与照片页末尾提供同一处交接动作。MCP App 宿主声明支持文本消息时显示「与助手讨论」，通过已安装的官方 SDK `sendMessage` 发送；宿主支持时同时更新当前卡片上下文。独立网页或不支持消息的宿主不显示交接入口；「复制给助手」功能已移除。这项 Web 实现不改变 [ADR 0035](../adr/0035-bottom-navigation-capsule.md) 的导航结构，AI 页提供本地上下文预览与不可发送的临时输入，不连接模型、不发送卡片，也不保存输入。

- 只有显式点击才开始交接。云端先带当前账号条件重新读取单卡；引用只包含卡片 ID、版本、类型与限长标题/摘要，不发送整工作区、完整正文、未来扩展字段或凭据。切换账号后中止旧交接。
- 同一次详情会话中防止重复发送；明确收到后显示「已交给助手」，不显示内容已修改或任务已执行。关闭后重新打开可开始新的显式讨论。若回执未知，保留未知提示并禁用交接；重新打开不会自动重发。
- 不提供剪贴板复制或手动引用降级。发送结果未知时不自动重发，用户先在当前宿主对话核对。
- 助手仍须经 MCP 读取最新卡片，按用户具体要求与原有权限、版本和幂等规则写回。交接入口没有内置模型、Webhook、持久任务队列或自动执行器。
- 宿主内的外部链接使用 SDK `openLink`；未获确认时不因链接动作写入已读。独立网页继续使用普通浏览器导航。

本轮宿主协议以隔离的 sandbox 模拟验证；真实宿主是否提供这些能力由当次协商决定，代码验证不等于已部署或所有客户端均支持。

## 决策状态与 V1 范围

本页集中维护产品方案；[V1 交接包](../guides/handoff.md) 只承载接口契约、原生示例及可运行的准备检查，不另立技术选型。当前已实现云端内容与工作区数据操作；工作区接口已于 2026-10-16 发布。Webhook、内置助手和可靠执行器仍不在本次实现范围，真实外部连接须另行确认。

| 状态 | 决策 |
| --- | --- |
| 用户已确认 | Agent 驱动；API 少而稳定；模块化单体；复用成熟框架，不自建协议、OAuth 或工作流平台 |
| 用户已确认（2026-10-16） | 不接入外部来源，不由程序同步内容；内容修改由助手完成，保留既有新增卡片、速记和轻操作，不提供复杂人工编辑器；连接器只用 Composio，只供远期内置助手；其他外部工作交给外部助手 |
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

## 当前数据 API 与 MCP

HTTP 与 MCP 使用同一云端能力层，执行身份、资源权限、版本和幂等检查。直接数据操作不强制经过 LLM。云端与本地 CLI、Mac 工作区保持各自的数据边界。

| 能力 | HTTP（`/api/v1` 下） | MCP |
| --- | --- | --- |
| 单卡与分页 | `/contents`、`/contents/{id}` 的查询、新建、更新、删除 | `sill_listContents`、`sill_getContent`、`sill_createContent`、`sill_updateContent`、`sill_deleteContent` |
| 完整工作区 | `GET /workspace` | `sill_getWorkspace` |
| 原子批量 | `POST /workspace/operations` | `sill_applyOperations` |
| 事件记录与受限结果回写 | `/events`、`/events/{id}`；单卡更新 metadata | `sill_submitEvent`、`sill_getEvent`、`sill_updateContent` |

工作区接口已实现并发布，通过本地数据库、HTTP 与 MCP 验证，以及线上数据库的事务回滚验证。工作区快照包含归档卡片、完整状态、偏好和累计阅读秒数，不含已删除卡片；助手可据此筛选、统计和导出。批量支持 `card.upsert / card.delete / item.patch / preferences.patch / reading.add`，整批成功或整批回滚。写入保留原始编辑基准或工作区版本，并使用幂等键；清空采用受保护的批量删除，不提供无条件 delete all。

状态覆盖阅读、收藏、稍后看、标签、备注、子任务、提醒、归档与减少同类内容偏好。任务 `done / taskDone`、提醒 `done / reminderDone` 保持一致。完整字段、条件和示例见 [操作协议](../../skills/sill/references/operations.md)；HTTP/MCP 映射见 [交接说明](../guides/handoff.md)。

整个工作区读取要求 `content:read` 的全工作区资源范围。批量返回完整快照，因此也要求该读取范围，每项另外检查 `content:write` 或 `content:delete`。新增工具不扩大已有授权；仅在当前连接发现并获准时调用。事件记录存在不表示 Webhook 已投递或外部动作已完成。助手任务提交、取消、委托与可靠执行仍待实现。

## 模块边界与历史技术候选

当前云端已采用现有 HTTP 适配、官方 MCP SDK 与 Supabase 数据/Auth。下表保留早期候选及远期参考，不表示当前数据操作仍待选型。

采用模块化单体，保持一个简单可启动服务。依赖方向为 `Web/CLI/HTTP/MCP 适配 → 共用能力与权限 → 领域规则/存储接口`；本地 JSON、云端数据库与未来 Webhook 分属存储或外部适配，领域层不依赖 DOM、网络框架或云厂商。Web 组件处理渲染、焦点与动画，应用状态/用例处理编辑基准和速记；只为实际职责拆文件，不建立空抽象目录。

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

## 当前与目标（含远期能力）

见[远期执行与能力边界](agent-execution.md#当前与目标含远期能力)。

## 内置助手与委托形态（远期可选，尚未实现）

见[远期执行与能力边界](agent-execution.md#内置助手与委托形态远期可选尚未实现)。

## 意图与状态边界（完整协议远期待实现）

见[远期执行与能力边界](agent-execution.md#意图与状态边界完整协议远期待实现)。

## 连接器与秘密边界

见[远期执行与能力边界](agent-execution.md#连接器与秘密边界)。

## 落地顺序与验收

见[远期执行与能力边界](agent-execution.md#落地顺序与验收)。
