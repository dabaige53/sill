# Agent 驱动与 MCP 连接

更新：2026-10-13。本文是产品方向与待实现协议；不是连接成功清单，也不启用任何服务。

## 决策状态与 V1 范围

本页集中维护产品方案；[V1 交接包](../guides/handoff.md) 只承载接口契约、原生示例及可运行的准备检查，不另立技术选型。**先排查、确认后实施**；此次仅更新文档，接口命名、框架、部署及真实连接均未批准实施。

| 状态 | 决策 |
| --- | --- |
| 用户已确认 | Agent 驱动；API 少而稳定；模块化单体；复用成熟框架与 MCP，不自建协议、OAuth 或工作流平台 |
| V1 已确认方向、尚未实现 | 不做内置 AI 助手；Sill 通过配置好的 Webhook 通知外部 OpenClaw 或 Hermes 助手，由其调用 Sill MCP 读写结果 |
| 远期可选 | 内置助手、复杂任务委托、选择性上游 tools 桥接；不作为 V1 前置条件 |
| 技术待选择 | HTTP/MCP 框架、部署平台、数据/Auth 服务、原生客户端；Webhook 官方接口已核验，用户实例/版本及真实连接待确认 |
| 实施待审批 | 模块拆分、两个 P1 修复、Webhook 投递与对外 MCP、权限与持久任务实现；本次均不执行 |
| 当前实际能力 | 本机 Web + CLI + JSON；没有上述 Webhook、当前产品对外 MCP、内置助手或可靠执行队列 |

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
- 外部助手先经 MCP 读取卡片，再通过内容 update 的 metadata 携 `event_id` 和 `expectedRevision` 写回结果/证据；关联和版本校验通过、成功落库才显示完成。Agent 回写不得再触发同一事件，防止通知循环；冲突保留待合并。这些字段为拟议扩展，当前 Batch 不接受 metadata，实际 API 待确认。
- V1 不新增通用 callback 协议或完整 agent 任务调度。优先 MCP 异步回写；迟迟没有结果时只使用供应商已核验的查询能力，否则显示待核对，不虚构查询端点或完成状态。复用成熟投递设施。


## 小而稳定的 API（建议，名称未确认）

参考 [Readwise Reader 官方 API](https://readwise.io/reader_api) 的内容保存、查询、更新和删除方式；借鉴接口收敛，不复制其鉴权、字段或端点，也不表示要直连 Readwise。

| 候选能力组 | 最小范围 |
| --- | --- |
| 内容 | 保存、查询、更新、删除；read/done/archive 表达状态变化，不为每个按钮造 endpoint；涉及外部动作时先形成用户意图，不能直接冒充外部完成 |
| 任务 | 提交、查询、取消；查询返回状态和可用结果，不单设结果 endpoint；远期或确有需求再独立提供；V1 优先内容 metadata + 事件投递记录，不建完整任务 API/调度器；不支持取消的供应商需如实说明 |
| 对外 MCP | 一个协议入口，精选产品工具；助手委托和上游 tools 桥接留作后续可选，默认不发布 |

HTTP、CLI、MCP 共用领域能力、版本规则与权限检查。Agent 驱动用户意图与数据层确定性更新是两回事：已经授权的保存、查询和状态回写不强制再次调用 LLM。当前仍使用 LOCAL-OPERATIONS 中的本地协议；此表不新增任何可调用端点。

## 模块边界与技术候选（未采纳）

采用模块化单体，保持一个简单可启动服务。依赖方向为 `Web/CLI/HTTP/MCP 适配 → 共用能力与权限 → 领域规则/存储接口`；JSON、未来数据库或外部 Webhook 是适配器，领域层不依赖 DOM、网络框架或云厂商。Web 组件处理渲染、焦点与动画，应用状态/用例处理编辑基准、来源配置和导入；只为实际职责拆文件，不建立空抽象目录。

| 候选 | 适用条件与限制 |
| --- | --- |
| 现有 JS + [Hono、Zod/OpenAPI](https://hono.dev/examples/zod-openapi) | 优先评估现有业务复用；校验和接口文档交给成熟组件，不自行发明路由框架。未安装、未选定 |
| [Cloudflare createMcpHandler](https://developers.cloudflare.com/agents/model-context-protocol/apis/handler-api/) | 选择 Workers 后再评估的官方 MCP 适配。文档已将 McpAgent 标为弃用且冻结；新 handler 与现有 SDK 的版本组合需核对，不直接粘贴旧 quick-deploy 模板 |
| [Cloudflare Agents starter](https://github.com/cloudflare/agents-starter) | 远期内置助手的候选参考，不是 V1 必需依赖，不运行其安装/部署流程 |
| [FastAPI + FastMCP](https://gofastmcp.com/integrations/fastapi) | Python 优先时的备选；可复用 FastAPI/OpenAPI 和 MCP 挂载，但不能自动公开全部路由。当前没有引入第二语言或双后台的必要 |

前端候选为 SwiftUI iOS/macOS 与独立 Web，共用接口；原生 SwiftUI 不要求 Swift 后端或 CloudKit。V1 优先最少组件。Cloudflare Agents/DO/Workflows + Supabase 数据/Auth 可作为远期内置助手、对外 MCP 与受控桥接的部署组合候选，尚未采纳或部署，也不是现有项目可以直接搬上云的承诺。

[Supabase OAuth 2.1 Server](https://supabase.com/docs/guides/auth/oauth-server) 与 [MCP 鉴权文档](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication) 可作为复用授权的候选，避免再造授权服务器；产品工具权限、资源所有权、上下游身份隔离仍由应用落实。其发布阶段及项目可用性须在选型时复核，不能把 OAuth 支持当成业务授权已完成。

远程 HTTP MCP 更适合上述托管路径；原样运行 stdio/Linux 程序需要额外宿主或容器运行环境，不能当普通 Worker 直接执行。Cloudflare Containers 属付费路径。额度以官方 [Workers](https://developers.cloudflare.com/workers/platform/pricing/)、[DO](https://developers.cloudflare.com/durable-objects/platform/pricing/)、[Workflows](https://developers.cloudflare.com/workflows/reference/pricing/)、[Containers](https://developers.cloudflare.com/containers/platform/pricing/) 和 [Supabase](https://supabase.com/pricing) 为准，不维护易过期价格大表；免费额度不保证任意 MCP、模型调用或稳定生产运行。

以下两种形态与内置助手协议保留为远期设计背景，不能覆盖上面的 V1 缩减范围。

## 当前与目标（含远期能力）

| 层次 | 当前实现 | 目标 |
| --- | --- | --- |
| 内容与状态 | 页面与 agent CLI 共用 `server/local/index.ts`、本地 JSON | agent 持续采集、整理、执行，卡片投影真实结果 |
| 用户动作 | 完成、阅读、刷新直接改变/读取本地状态 | 动作提交 agent 可处理的意图；本地反馈与外部结果分开 |
| 外部工具 | 宿主可以自行使用其已授权能力；当前 Sill 无工具调度 | 复用实际宿主 MCP 或经核验的开源 MCP，由 agent 选择能力执行 |
| 执行生命周期 | 无持久意图队列、worker、执行回执关联 | 持久接收、领取、幂等、冲突校验、结果回写、失败恢复 |
| 插件 | local skill/CLI，构建清理 App/MCP 注册 | 保留简单本地操作通道；不为目标架构恢复旧直连后端 |

目标路径：`卡片意图 → 持久意图记录 → agent → MCP工具 → 外部结果核对 → 带版本条件回写 → 卡片展示`。CLI/本地HTTP仍可作为 Sill 的内部状态通道，不等于逐按钮直连第三方 API。Agent 可以定时或由事件唤醒；调度由实际宿主提供，尚不能承诺浏览器关闭后自动执行。

阅读、收藏等仅影响本机偏好的动作可即时记录本地状态，并向 agent 提供事件；没有外部对应动作就不调用外部工具。比如“已在Sill读过”不等于“邮件已标已读”；任务打勾先表示请求完成，外部任务完成需经过执行回执。

## 两种产品形态与共用能力层（远期可选，尚未实现）

Sill 同时规划内置 AI 助手与对外 MCP 服务器。内置 agent 和外部 agent 共用受权限约束的能力层、意图/任务状态和结果存储；外部 agent 可以直接调用确定性工具，不必经过内置 LLM。需要推理、编排和长期执行时才委托内置助手。内置助手可有产品内入口，但不是要求所有用户操作都先聊天。

对外仅规划三类工具；下列名称为设计示意，不是当前已注册工具或 MCP 标准方法：

| 工具类 | 对外能力 | 调用约束 |
| --- | --- | --- |
| `sill_data_*` | 产品卡片、数据、任务查询与操作 | 按调用方scope与资源所有权过滤，写入校验版本/幂等；本地操作不冒充外部完成 |
| `sill_assistant_*` | 长任务 `submit/status/cancel`（查询包含结果） | submit返回持久任务ID；状态/结果/取消仅限授权调用方；内置agent继承委托权限，不能借owner身份扩大权限 |
| `bridge_<connectionAlias>__<toolAlias>` | 已安装上游MCP的选择性tools桥接 | 只发布明确允许的工具，保留来源映射；不因安装、发现工具或owner可用就自动开放 |

调用路径分别是 `外部agent → 鉴权/能力层 → 产品操作或上游MCP`，以及 `外部agent → 鉴权/能力层 → 内置助手任务 → 同一能力层`。服务端必须校验真实调用身份，不能信任请求参数自称owner。有效权限取调用方scope、工具允许列表、资源/账号授权、上游权限及委托约束的交集；默认拒绝。外部人不得借用owner的全部连接，内置助手也不能在委托过程中升级为owner。

上游秘密仅由服务端MCP/安全凭据设施按连接引用使用，不将API key、token、OAuth会话或鉴权头透传给外部agent。Sill业务数据不保存秘密；返回结果、错误和审计记录都需脱敏。外部MCP客户端自身仍需独立认证和授权；本地loopback服务现有信任边界不能直接作为第三方访问边界。

桥接第一阶段仅覆盖明确选择的 **tools发现与调用**；resources、prompts、订阅/通知、sampling、elicitation及反向调用均不默认转发，后续需逐项协议与权限验收，不宣称透明通用代理。对外工具schema、错误和输出边界需校验；上游工具改名或schema变化时暂停该映射复核，不能自动发布新增写工具。

每次调用保留命名空间、上游来源、调用方、委托者、trace/parent-call ID、任务/意图ID及脱敏结果，便于关联审计。同步直调与长任务都需要幂等、执行时限和取消边界；已派发写入超时进入结果未知，不自动重放。异步任务取消只表示停止请求，不保证撤回已发生的上游副作用。

禁止将Sill自身端点经桥接再次注册为上游。调用链标记跨委托/桥接传递；检测到重复节点或达到最大深度/跳数立即拒绝。限制单次委托的调用数、时间和模型预算；不能识别或无法限制的循环链路不开放。示例中的深度数值仅为待实现策略，不是已有防护。

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

## 连接选择与秘密边界

先查实际 agent 宿主已有的 MCP；缺少时评估成熟开源实现的许可证、维护、权限和工具。官方托管 MCP 可以通过宿主复用，但不得把它称作开源自托管。若用户只接受自托管、候选又不满足，就保持未支持。没有合适服务时不回退到为按钮新写直连接口。

不引入 Nango、Composio、Activepieces 等连接中间平台；不建设 Sill OAuth 体系。MCP 本身不免鉴权：首次OAuth、token与刷新仍按上游要求，在宿主/MCP安全设置中完成。Sill业务状态只保留连接引用、能力清单、检测时间和真实状态；秘密仅由宿主或服务端MCP安全凭据设施使用，不复制宿主token到业务数据，不进入模型上下文、卡片、浏览器持久化、日志、仓库，也不透传给外部agent。

连接必须经过宿主可达性、工具发现及最小只读探测，才可标记可用；配置存在不等于授权有效。工具名称/参数以当次发现为准，不把服务名当作全部能力。读写权限由宿主/服务端实际执行的允许列表和上游权限控制，文档示例中的列表不构成权限隔离。

## 候选清单（上游文档核验，未安装或实账号验证）

| 候选 | 开源/维护状态 | 动作与必要设置 |
| --- | --- | --- |
| [Google Calendar社区MCP](https://github.com/nspady/google-calendar-mcp) | MIT；仓库提供工具过滤/多账号文档，package版本核验为2.7.0；社区维护，未做稳定性认证 | 查日历、事件、空闲；创建/更新/删除事件。需要Google Cloud启用Calendar API、Desktop OAuth client及用户首次授权；凭据文件路径由MCP进程环境引用。测试模式需留意上游说明的授权有效期。 |
| [GitHub官方MCP源码](https://github.com/github/github-mcp-server) | [MIT](https://github.com/github/github-mcp-server/blob/main/LICENSE)；有当前工具集/只读模式文档，可自托管；未做安装验收 | 仓库、issue、PR等按工具集选择，读写分开；本地服务使用最小范围PAT，由宿主安全注入。先用 `--read-only`，启用写入前核对实际权限。 |
| [Linear官方远程MCP](https://linear.app/docs/mcp) | 官方托管服务；这里没有已核验的可自托管开源服务许可证，不当开源推荐 | issue/项目查询与更新；Streamable HTTP `https://mcp.linear.app/mcp`，只读端点 `/mcp/readonly`。宿主执行OAuth，或按上游支持使用API key/bearer；不由Sill另做授权。 |
| [Notion官方远程MCP](https://developers.notion.com/guides/mcp/get-started-with-mcp) | 官方托管、积极维护；不等同下列MIT源码 | 工作区搜索、页面读取/创建/编辑；`https://mcp.notion.com/mcp`；当前需要用户交互OAuth，不能承诺完全无人工首次授权的后台接入。 |
| [Notion旧本地MCP](https://github.com/makenotion/notion-mcp-server) | [MIT](https://github.com/makenotion/notion-mcp-server/blob/main/LICENSE)；上游明确不再积极维护/支持 | token及页面共享权限；有API衍生页面/数据源操作。仅列为历史候选，不默认选用，不能因MIT就认定成熟可用。 |

Google Calendar的已文档化读取工具包括 `list-calendars`、`list-events`、`get-event`、`search-events`、`get-freebusy`；写入包括 `create-event`、`update-event`、`delete-event`。`manage-accounts` 不受其工具过滤完全排除，仍需宿主限制账号管理行为。GitHub可按工具集发现如 `get_file_contents`、`issue_read`；写工具按实际服务版本发现。Linear/Notion不在Sill硬编码固定工具名，启动时发现并核验所需读写动作。

其余RSS、Readwise、邮件、YouTube、照片/文件夹等仍待逐项选择与验证；卡片类型、来源图标及“已订阅”提示均不能证明存在成熟MCP链路。上述维护判断是核验日的上游声明/文档观察，不是长期维护承诺。

## 默认禁用配置示例

[examples/agent-mcp.plan.example.json](../examples/agent-mcp.plan.example.json) 是**设计与人工配置清单**，不是任何宿主原生配置，不会被 `npm start`、插件构建或当前 CLI 读取。所有连接 `enabled:false`、写入关闭；没有凭据值，不能仅切换此字段就声称已接入。不要复制到旧 `sill.config.json`，其 schema 不同。

实施时先在宿主安全设置中选定/安装并固定核验版本，再把单个 `hostConfigCandidate` 按该宿主原生语法转换，配置所需路径和秘密引用，由用户完成上游鉴权。示例中的 `/ABS/PATH/…` 是必须替换的路径占位，不是已安装位置。`secretEnvironmentNames` 只列环境变量名，不读取或返回变量值。连接引用只能指向实际已配置的宿主条目。

示例保留远期能力草案，不是 V1 安装清单；不包含可执行 Webhook 配置。`assistantDelegation` 的 `status` 查询包含结果，不再单列 result 操作。示例的 `externalMcp` 部分描述尚未实现的发布策略：服务、三类工具发布及全部桥接均关闭，外部调用方和公开工具列表为空，默认拒绝；它不是现有权限执行器。

Calendar示例只开放读取工具，但上游的账号管理例外仍需宿主约束；Notion托管服务没有在本示例里获得服务端只读保证，宿主若不能强制限制写工具，则不可标为只读安全可用。示例不安装、运行、授权任何MCP。

## 落地顺序与验收

0. **先确认再实施：** 确认 V1 外部助手方案、用户外部助手实例/版本、最少部署组件和具体适配范围；当前只维护方案。
1. **获批后先拆实际边界并修复两个未解决P1：** 正常在线页面整卡更新缺少版本条件，可能覆盖agent并发结果（`apps/web/services/local-sync.ts`、`server/local/repository.ts`）；来源“允许”和RSS可虚报成功，RSS地址未持久化（`apps/web/views/app.ts`）。本次文档不修复这两项。最小拆分先从 `server/local/repository.ts` 的规则/文件读写和 `server/local/index.ts` 的 HTTP 组装开始，再抽 `app.js` 的来源/导入用例。静态排查还发现行内编辑未被轮询编辑保护覆盖：需保留编辑起点 baseline，验证轮询吸收远端版本后旧 DOM 保存的风险，不能仅补发送时的 revision。RSS/OPML 应保存地址并显示真实待配置状态，不用开关代替检测。
2. V1 最小事件/任务记录、外部 Webhook 投递与单写入/版本保护（不自建 agent runtime）：页面与agent并发、重复点击、进程重启和迟到回写都不得丢更新或重复执行；补备份恢复演练。
3. 先用一个外部助手与精选 Sill MCP 工具做无凭据/模拟测试，验证投递去重、ack/结果分离与受限回写，再在单独授权范围内做真实只读验收；失败/过期/限流不得显示成功。当前未开展真实授权验收。
4. 在既定授权范围内补写入、幂等与结果核对，验证外部成功、本地回写冲突、断线未知结果和取消。允许事件/定时调度后再声明持续后台能力。

5. 对外服务开启前验证调用方隔离：跨用户任务/结果不可读、未发布工具不可发现/调用、委托不能提权、上游凭据不外泄、循环/超深调用被拒绝；再按单个工具选择性发布。内置助手委托及桥接尚未实现，不能以历史MCP代码存在代替验收。

模块拆分验收还需回归草稿恢复、导入语义、焦点/滚动、退出动画、窄屏和触摸目标，并执行现有 local/core/browser/accessibility/local-browser/package 检查；本轮未运行这些实施检查。

本阶段不要求企业连接平台、统一自研上游OAuth或通用脚本市场；对外 MCP 属于 V1 待实现能力，内置助手仅远期可选，界面及部署形态另行设计。旧 `server/connectors.mjs`、`server/mcp.mjs`、Host/SQLite实现保留历史用途，不因本决策自动恢复运行。
