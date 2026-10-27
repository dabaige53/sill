# Sill 的产品约束

- 先读 README、docs/product/agent-mcp.md 和 docs/guides/local-operations.md，区分目标与已实现能力。
- Agent 优先：产品的数据与状态操作须能由 AI 通过 MCP 完成，不要求用户打开界面补做。已有卡片的正文和结构化内容修改交给 AI；用户保留既有新增卡片、记一笔等轻入口。不新增复杂人工编辑器，不把 API 字段逐项做成表单。具体边界见 docs/product/agent-mcp.md。
- 保留原有产品设计与轻操作。取消内容编辑不等于删除阅读、收藏、稍后读、任务勾选、提醒、归档、搜索、筛选、设置等既有功能，也不授权重做界面。卡片展示状态并表达意图，不为每个按钮新增第三方直连接口。
- 不接入外部来源，不由程序同步内容，不做 RSS/OPML 订阅或文件导入；卡片的来源字段只记录内容来自哪里。见 docs/adr/0033-ai-writes-composio-only.md。
- 连接器只用 Composio，只供内置助手操作其他程序；其他外部工作交给外部助手，用它自己宿主的工具完成。不自建或自选上游 MCP，不另建 OAuth，不恢复 legacy 直连，不桥接上游 tools。
- Composio 和 MCP 仍需上游鉴权。秘密留在 Composio/宿主/MCP 安全配置，不进入卡片、模型上下文、浏览器持久化、日志或仓库。
- 目标有内置助手（远期）和对外 MCP 两种形态，共用能力层；直接工具调用不强制经过内置LLM。对外能力为产品操作和助手任务。
- 安装不等于公开；发现/调用/任务结果均按调用方scope、工具允许列表及资源所有权限制，委托不得提权，上游秘密不得透传；保留审计与循环/深度限制。
- 当前已有云端内容 MCP；没有内置助手、Composio 连接器或持久意图队列/执行器。不得把本地打勾、刷新或占位来源状态说成外部完成；未知写入结果先核对，不盲目重试。
- 本地页面整卡、备注和标签保存须保留编辑基准并检查冲突；来源授权占位、RSS 订阅和文件导入界面已按 ADR 0033 删除；旧来源配置仅作兼容保留，不表示连接状态。回归须覆盖并发更新、批量编辑和未知写入结果。

- V1 最新范围以 docs/product/agent-mcp.md 和 docs/guides/handoff.md 为准：外部助手 Webhook → Sill MCP 回写；不做内置助手。内置助手（只用 Composio 连接器）为远期可选。交接包是设计与准备脚本，不代表 API 已实现；未经确认不继续业务实施或部署。

## 设计

- 改界面、样式、文案、图标或交互之前，先读 [设计约束](DESIGN.md)；规则正文以 [设计手册](design-system/README.md) 为准。
- 设计材料以仓库 `design-system/` 为源；claude.ai 上的 Design System 和设计画布是发布副本，只有 Claude Code 能更新。工具为 `scripts/design-init.sh`，流程见 [设计约束](DESIGN.md)「两种工作环境」。
- 在 Claude Code 里：改完仓库，在同一次任务里 `stage`、发布设计、`record`。线上页面被人直接改过时，先「同步设计」拉回仓库再改。
- 在 Codex 等其他 AI 产品里：只改仓库，运行 `scripts/design-init.sh build` 和 `check`，不操作 claude.ai；在 PR 的 Merge Danger 写明「设计未发布到线上」。之后在 Claude Code 里发布设计补齐，`status` 列出未发布的改动。
- 改 Web 或 macOS 任一端的界面，都要检查另一端同一功能是否用同样的词、状态表达和设计变量角色，并在同一提交更新 [界面对账表](docs/product/ui-alignment.md)：另一端没跟上就写「缺失」并登记待处理；没在真实窗口看过就保持「未验证」。

## 验证与测试授权

- 选择检查、运行测试或判断验证是否完成前，阅读 [测试与验证](docs/guides/testing.md)。
- 不要每次修改都执行完整测试。默认只运行与本次改动及直接影响范围相关的检查；相关检查通过后，不重复运行。只有用户明确要求，或发现具体的跨模块风险、失败需要扩大排查时，才说明原因并扩大测试范围。

### 已有自动约束

| 规则 | 执行约束 |
| --- | --- |
| MCP 页面升级后，宿主已保存的版本地址仍须可读；旧地址同样检查当前权限。 | `mcp.ts` 将版本地址解析为当前页面；`cloud-app.test.ts` 用实际失败的 1.2.2 地址覆盖读取、响应地址与撤权，由本地及 CI 的 `npm test` 执行。 |
| 当前只提供账号密码登录；关闭邮件入口时必须同时关闭服务端发信。 | `emailLoginEnabled` 默认关闭，Web 与 Mac 隐藏邮件入口；`login-completion.test.ts` 检查默认页面和发信拒绝。 |
| 邮件页面只建立会话，发起登录的标签页继续授权；跨标签页通知不能代替身份验证。 | `/auth/complete`、`/auth/session` 与登录页单次继续逻辑；`tests/server/login-completion.test.ts`、`login-continuation-page.test.ts` 由本地及 CI 的 `npm test` 执行。 |
| 旧链接失败时先核对现有会话；不能把已登录状态误报为登录失败，也不能重新使用已消费的授权码。 | 服务端 recovery 会话检查；上述回归覆盖有效会话、退出后、重复回跳及不再交换旧码。旧实现失败证据见 `docs/records/2026-10-23-login-completion/`。 |

## 沟通与文件管理

- 项目日常说明与文档采用“80% ASD-STE100”的风格：使用常用词、短句和具体动词；同一概念保持同一称呼；说清条件、动作与结果。以清晰、自然的简体中文为准，宽松借鉴其原则，不按受控英语规则机械翻译。文章、PRD、报告按读者、用途和既定文风酌情采用。
- 新增、修改、移动或归档文件前，查阅 [文件管理规范](docs/guides/file-management.md)。文档入口为 [文档目录](docs/README.md)，脚本和测试分别见相邻 README。
- 保留已有内容与路径；迁移时更新引用并检查，不自动删除用户数据、历史证据或发布快照。交付前运行 `npm run files:check`。
- 用户要求编写或更新 PR 正文时，遵循 [PR 编写指南](pr.md)并使用 [PR 模板](.github/pull_request_template.md)。`pr.md` 只保存编写规则，不写入具体 PR 正文。按 Summary、Evidence、Merge Danger 说明变更、证据和合并风险；不把待完成检查写为通过。

## Agent skills

### Issue tracker

事项与规格使用 GitHub Issues，仓库为 `dabaige53/sill`。
操作规则见 [事项管理](docs/agents/issue-tracker.md)。

### Triage labels

使用五个默认分类标签。
映射见 [事项分类标签](docs/agents/triage-labels.md)。

### Domain docs

采用 single-context：根目录术语表与统一架构决策目录。
读取规则见 [领域文档](docs/agents/domain.md)。
