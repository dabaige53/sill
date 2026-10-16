# Sill 的产品约束

- 先读 README、docs/AGENT-MCP.md 和 docs/LOCAL-OPERATIONS.md，区分目标与已实现能力。
- Agent 驱动内容和外部执行；卡片展示状态并表达意图，不为每个按钮新增第三方直连接口。
- 外部工具优先复用宿主现有 MCP 或经核验的开源 MCP；不另建 OAuth、不恢复 legacy 直连、不引入连接中间平台。
- MCP 仍需上游鉴权。秘密留在宿主/MCP安全配置，不进入卡片、模型上下文、浏览器持久化、日志或仓库。
- 目标有内置助手和对外MCP两种形态，共用能力层；直接工具调用不强制经过内置LLM，复杂任务可委托助手。三类对外能力为产品操作、助手任务、选择性上游tools桥接。
- 安装不等于公开；发现/调用/任务结果均按调用方scope、工具允许列表及资源所有权限制，委托不得提权，上游秘密不得透传。桥接不默认涵盖resources/prompts/订阅；保留来源、审计与循环/深度限制。
- 当前没有内置助手、当前产品的对外MCP/桥接或持久意图队列/执行器。不得把本地打勾、刷新或占位来源状态说成外部完成；未知写入结果先核对，不盲目重试。
- 正常在线整卡并发覆盖、虚假连接成功两个P1尚未修复；文档变更或其他测试通过不等于它们已解决。

- V1 最新范围以 docs/AGENT-MCP.md 和 docs/V1-HANDOFF.md 为准：外部助手 Webhook → Sill MCP 回写；不做内置助手。旧双形态目标中的内置委托/上游桥接为远期可选。交接包是设计与准备脚本，不代表 API 已实现；未经确认不继续业务实施或部署。

## 沟通与文件管理

- 项目日常说明与文档采用“80% ASD-STE100”的风格：使用常用词、短句和具体动词；同一概念保持同一称呼；说清条件、动作与结果。以清晰、自然的简体中文为准，宽松借鉴其原则，不按受控英语规则机械翻译。文章、PRD、报告按读者、用途和既定文风酌情采用。
- 新增、修改、移动或归档文件前，查阅 [文件管理规范](docs/FILE-MANAGEMENT.md)。文档入口为 [文档目录](docs/README.md)，脚本和测试分别见相邻 README。
- 保留已有内容与路径；迁移时更新引用并检查，不自动删除用户数据、历史证据或发布快照。交付前运行 `npm run files:check`。
- 编写 PR 正文时使用 [PR 模板](.github/pull_request_template.md)，当前正文保存为 [pr.md](pr.md)。按 Summary、Evidence、Merge Danger 说明变更、证据和合并风险；不把待完成检查写为通过。

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
