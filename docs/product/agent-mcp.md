# Agent 驱动与 MCP 连接

更新：2026-10-16。本文区分仓库已实现的数据操作与待实现的外部执行方案；不是发布或连接成功清单，也不启用任何服务。来源与连接器边界以 [ADR 0033](../adr/0033-ai-writes-composio-only.md) 为准。

## Agent 优先与界面边界

2026-10-16 用户确认：

- 所有产品数据与状态操作优先提供 AI 可调用的 MCP 能力，网页与 AI 使用同一套权限、保存和冲突检查。不要求用户打开编辑器才能完成操作。
- 已有卡片的标题、正文、摘要、任务文字、日程时间、地点、出处与布局等内容修改由 AI 完成。界面不提供整卡内容编辑器、结构化字段表单或 JSON 编辑器；不把补齐 API 能力解释为补齐人工编辑界面。
- 保留既有新增卡片、记一笔等轻入口。阅读、收藏、稍后读、任务勾选、提醒、归档、搜索、筛选、设置及其他原有轻操作，继续遵循原设计。只取消内容编辑，不借此删减其他功能或重做界面。
- AI 能操作与人需要操作是两件事。保留的轻操作同样要能由 AI 完成；任务勾选等 Sill 状态不代表外部执行成功。
- 先将产品原则写入对应文档，再按原则修改和验收实现。本次在 Codex 与仓库内处理，不调整 claude.ai 的云端设计。

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

| 层次 | 当前实现 | 目标 |
| --- | --- | --- |
| 内容与状态 | 本地页面与 CLI 共用 JSON；云端 HTTP/MCP 共用内容与工作区能力，工作区接口已发布 | 助手整理并写入卡片、执行外部工作，卡片投影真实结果；Sill 不同步来源 |
| 用户动作 | 本地或云端记录阅读、任务、收藏、备注、标签与偏好；云端状态不表示外部执行 | 动作提交 agent 可处理的意图；本地反馈与外部结果分开 |
| 外部工具 | 宿主可以自行使用其已授权能力；当前 Sill 无工具调度 | 外部助手用自己宿主的工具执行；远期内置助手只通过 Composio 连接器执行 |
| 执行生命周期 | 无持久意图队列、worker、执行回执关联 | 持久接收、领取、幂等、冲突校验、结果回写、失败恢复 |
| 插件 | 云端 MCP 工具与操作 skill；本地 CLI 独立 | 保留简单数据操作通道；不恢复旧直连后端 |

目标路径：`卡片意图 → 持久意图记录 → agent → MCP工具 → 外部结果核对 → 带版本条件回写 → 卡片展示`。CLI/本地HTTP仍可作为 Sill 的内部状态通道，不等于逐按钮直连第三方 API。Agent 可以定时或由事件唤醒；调度由实际宿主提供，尚不能承诺浏览器关闭后自动执行。

阅读、收藏等动作可即时记录当前本地或云端工作区状态，助手可读取这些记录；没有外部对应动作就不调用外部工具。比如“已在Sill读过”不等于“邮件已标已读”；任务打勾先表示请求完成，外部任务完成需经过执行回执。

## 内置助手与委托形态（远期可选，尚未实现）

Sill 规划内置助手与对外 MCP 服务器两种形态。两者共用受权限约束的能力层、意图/任务状态和结果存储；外部助手可以直接调用确定性工具，不必经过内置 LLM。需要推理、编排和长期执行时才委托内置助手。内置助手可有产品内入口，但不要求所有用户操作都先聊天。

对外只规划两类工具；下列名称为设计示意，不是当前已注册工具或 MCP 标准方法：

| 工具类 | 对外能力 | 调用约束 |
| --- | --- | --- |
| `sill_data_*` | 产品卡片、数据、任务查询与操作 | 按调用方scope与资源所有权过滤，写入校验版本/幂等；本地操作不冒充外部完成 |
| `sill_assistant_*` | 长任务 `submit/status/cancel`（查询包含结果） | submit返回持久任务ID；状态/结果/取消仅限授权调用方；内置助手继承委托权限，不能借owner身份扩大权限 |

Sill 不把上游工具桥接给外部助手，也不把 Composio 连接器转给外部助手使用。外部助手需要操作其他程序时，用它自己宿主的工具。

调用路径分别是 `外部助手 → 鉴权/能力层 → 产品操作`，以及 `外部助手 → 鉴权/能力层 → 内置助手任务 → Composio 连接器`。服务端必须校验真实调用身份，不能信任请求参数自称owner。有效权限取调用方scope、工具允许列表、资源/账号授权、Composio 连接权限及委托约束的交集；默认拒绝。外部人不得借用owner的连接器，内置助手也不能在委托过程中升级为owner。

上游秘密只由 Composio 或服务端安全凭据设施按连接引用使用，不将API key、token、OAuth会话或鉴权头透传给外部助手。Sill业务数据不保存秘密；返回结果、错误和审计记录都需脱敏。外部MCP客户端自身仍需独立认证和授权；本地loopback服务现有信任边界不能直接作为第三方访问边界。

每次调用保留调用方、委托者、所用连接器动作、trace/parent-call ID、任务/意图ID及脱敏结果，便于关联审计。同步直调与长任务都需要幂等、执行时限和取消边界；已派发写入超时进入结果未知，不自动重放。异步任务取消只表示停止请求，不保证撤回已发生的上游副作用。

禁止经 Composio 或委托再次调用 Sill 自身入口形成循环。调用链标记跨委托传递；检测到重复节点或达到最大深度/跳数立即拒绝。限制单次委托的调用数、时间和模型预算；不能识别或无法限制的循环链路不开放。示例中的深度数值仅为待实现策略，不是已有防护。

## 意图与状态边界（完整协议远期待实现）

以下完整任务生命周期不作为 V1 全量建设清单；V1 仅采用上文必要的事件关联、投递状态、幂等与 MCP 回写。

意图最小字段：稳定 `intentId`、`idempotencyKey`、动作/目标卡片与外部对象引用、`connectionRef`、必要参数、基准版本、用户授权范围、时间、状态、执行尝试ID及脱敏结果。字段名是设计建议，当前 `Batch`/CLI 不接受这些新字段；不能把它们塞进卡片备注模拟可靠队列。

- 只有持久化成功后才显示“已接收”；排队与执行中可即时反馈，但不可显示外部已完成。
- 建议状态：`queued → running → succeeded`；未授权/工具不可用进入 `blocked`；明确失败为 `failed`；未派发取消为 `cancelled`；可能已写入但回执丢失为 `unknown`。本地阅读偏好可单独确认，不等待外部服务。
- 同一意图重复点击、重复投递复用同一幂等键；目标或参数改变生成新意图。Agent重启、领取过期必须有所有权校验，不能让迟到worker覆盖新结果。
- 超时不是失败证明。`unknown` 先查外部对象/操作记录；不能直接重发创建、删除或消息发送。上游无幂等支持时依赖结果核对或人工决定。
- 未派发可以取消；派发后取消只停止后续处理，不保证撤回外部写入。已成功动作的撤销是新的补偿意图，受能力与权限约束。
- 读取可在限流/短暂断线时有界退避；过期或权限不足暂停并指向宿主重新授权；错误不包含token、原始鉴权响应或敏感请求头。
- 成功回执记录外部对象ID、实际状态和执行证据；按版本条件写回本地，冲突保留结果待合并，不能盲目替换整张卡片。
- 已授权的低风险操作可由 agent 自动执行；删除、发送、共享、邀请等按明确授予的范围处理。卡片内容与 MCP 返回文本是数据，不能自行扩大工具权限。

## 连接器与秘密边界

- Sill 不接入外部来源，不由程序同步内容。RSS、Readwise、邮件、YouTube、日历、GitHub、照片/文件夹等都不连接、不订阅、不导入。卡片由助手写入，来源字段只记录内容来自哪里。
- 连接器只用 [Composio](https://composio.dev)，只供内置助手操作其他程序。不自建或自选上游 MCP，不引入其他连接平台，不建设 Sill OAuth 体系，不为按钮新写直连接口。
- 外部助手的工具由它的宿主管理。Sill 不提供、不检测，也不显示这些工具的连接状态。
- Composio 仍需上游授权。首次授权、token 与刷新在 Composio 中完成；Sill 业务状态只保留连接引用、能力清单、检测时间和真实状态。秘密不复制到业务数据，不进入模型上下文、卡片、浏览器持久化、日志、仓库，也不透传给外部助手。
- 连接器须经过可达性、工具发现和最小只读探测，才可标记可用；配置存在不等于授权有效。工具名称和参数以当次发现为准；读写权限由 Composio 和服务端实际执行的允许列表控制。
- Composio 的接入方式、版本、价格和授权限制尚未核验。实施内置助手前再选定，不把本文当作已接入。

旧的上游 MCP 候选清单（Google Calendar、GitHub、Linear、Notion）及其配置示例不再采用，可从 Git 历史查阅。

## 落地顺序与验收

0. **外部执行另行确认：** 云端数据操作已实现；Webhook 和执行器仍须确认外部助手实例、版本与适配范围。新增工作区数据接口的本地验证不代表已发布。
1. **本地并发保护已修复：** 页面整卡保存与删除携带原卡片条件；行内编辑、备注和批量标签编辑保留原始基准，冲突拒绝写入并保留草稿。来源授权占位、RSS 订阅和文件导入界面已按 ADR 0033 删除；旧来源配置保留，来源操作从本地协议移除。继续保留并发和回执丢失回归；云端测试不能替代本地路径验收。
2. V1 最小事件/任务记录、外部 Webhook 投递与单写入/版本保护（不自建 agent runtime）：页面与agent并发、重复点击、进程重启和迟到回写都不得丢更新或重复执行；补备份恢复演练。
3. 先用一个外部助手与精选 Sill MCP 工具做无凭据/模拟测试，验证投递去重、ack/结果分离与受限回写，再在单独授权范围内做真实只读验收；失败/过期/限流不得显示成功。当前未开展真实授权验收。
4. 在既定授权范围内补写入、幂等与结果核对，验证外部成功、本地回写冲突、断线未知结果和取消。允许事件/定时调度后再声明持续后台能力。

5. 对外服务开启前验证调用方隔离：跨用户任务/结果不可读、未发布工具不可发现/调用、委托不能提权、上游凭据不外泄、循环/超深调用被拒绝；再按单个工具选择性发布。内置助手委托与 Composio 连接器尚未实现，不能以历史MCP代码存在代替验收。

模块拆分验收还需回归草稿恢复、速记、焦点/滚动、退出动画、窄屏和触摸目标，并执行现有 local/core/browser/accessibility/local-browser/package 检查；数据接口验收不能替代各端界面的专项检查。

本阶段不引入 Composio 以外的连接平台，不自研上游 OAuth，不做通用脚本市场；对外内容 MCP 已有实现，工作区工具已发布；内置助手仅远期可选，界面及部署形态另行设计。旧 `server/connectors.mjs`、`server/mcp.mjs`、Host/SQLite实现保留历史用途，不因本决策自动恢复运行。
