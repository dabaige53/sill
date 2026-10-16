# 文档目录

状态：现行导航。更新：2026-10-16。新增或更名文档时同步本页。项目启动见 [项目说明](../README.md)，文件存放规则见 [文件管理规范](FILE-MANAGEMENT.md)。

## 先按问题找文件

| 要做的事 | 入口 |
| --- | --- |
| 了解项目、启动本地服务 | [项目说明](../README.md) |
| 确认 V1 范围与待实现能力 | [Agent 与 MCP](AGENT-MCP.md)、[V1 交接包](V1-HANDOFF.md) |
| 读写本地卡片 | [本地操作](LOCAL-OPERATIONS.md) |
| 使用或排查云端插件 | [插件操作手册](SILL-PLUGIN-RUNBOOK.md)、[原 App 添加 Skill 记录](SILL-APP-SKILL-20261016.md) |
| 查源码与构建产物位置 | [文件管理规范](FILE-MANAGEMENT.md)、[脚本目录](../scripts/README.md) |
| 找测试命令与历史报告 | [测试目录](../tests/README.md) |
| 构建或检查 Mac 原生应用 | [原生说明](../native/macos/README.md) |

## 工程技能配置

- [事项管理](agents/issue-tracker.md)：GitHub Issues，目标仓库 `dabaige53/sill`
- [事项分类标签](agents/triage-labels.md)：五个默认分类角色及其仓库标签
- [领域文档](agents/domain.md)：术语表和架构决策的读取规则
- [PR 模板](../.github/pull_request_template.md)：后续 PR 的固定正文结构
- [本次 PR 正文](../pr.md)：文件体系与工程技能配置的变更说明

后续 `to-tickets`、`to-spec`、`triage`、`grill-with-docs` 和 `improve-codebase-architecture` 按这些配置工作。可直接修改 `docs/agents/*.md`；切换事项管理工具或重新配置时再运行 setup 技能。

## 产品与设计

这些文档说明产品目标、交互和取舍；不能作为已上线功能清单。

- [产品需求](PRODUCT-REQUIREMENTS.md)
- [交互规范](INTERACTION-SPEC.md)
- [设计决策](DESIGN-DECISIONS.md)
- [设计系统映射](DESIGN-SYSTEM.md)；具体组件和画板见 [设计系统](../design-system/README.md)
- [卡片体验优化 V0.3](CARD-REFINEMENT.md)
- [V0.5 设计修订](DESIGN-REVIEW-V05.md)
- [产品对话与需求演进](CONVERSATION-HISTORY.md)

## 开发、操作与交接

- [文件管理规范](FILE-MANAGEMENT.md)：目录职责、命名、保留和检查
- [开发说明](DEVELOPMENT.md)：早期本地开发说明；构建细节同时查当前脚本
- [本地操作](LOCAL-OPERATIONS.md)：当前本地卡片协议及限制
- [Agent 与 MCP](AGENT-MCP.md)：V1 方向、候选设计与授权边界
- [V1 交接包](V1-HANDOFF.md)：设计约定与准备检查，不表示全部接口已实现
- [插件操作手册](SILL-PLUGIN-RUNBOOK.md)：使用与排查；版本变更同时查日期记录
- [应用连接与构建记录](SILL-APP-CONNECTION-BUILD.md)：特定阶段的操作和参数
- [原 App 添加 Skill 记录](SILL-APP-SKILL-20261016.md)：2026-10-16 版本与验收记录

## 数据、授权与发布准备

以下记录说明各阶段的准备和审批范围。标题或正文中的“未应用”“待验收”保留其记录时点，不代替新的环境检查。

- [数据与登录准备](SUPABASE-PREPARATION.md)
- [数据边界上线清单](SUPABASE-ROLLOUT-CHECKLIST.md)
- [生产动作审查](PRODUCTION-ACTIONS-REVIEW.md)
- [MCP 授权后续步骤](MCP-CONSENT-NEXT-STEPS.md)

## 发布、状态与验收记录

- [2026-10-15 现状盘点](SILL-STATUS-20261015.md)
- [2026-10-15 云端发布](RELEASE-20261015.md)
- [2026-10-14 云端发布](RELEASE-20261014.md)
- [2026-10-15 本地与 Mac 交付](LOCAL-RELEASE-20261015.md)
- [本地版本验收](LOCAL-ACCEPTANCE.md)
- [交互与无障碍验收](SILL-ACCESSIBILITY-VALIDATION.md)

[validation/](validation/) 保存选定的人工验收截图、录像和清单。自动生成的测试结果保存在被忽略的 `tests/artifacts/`。发布快照在 [deploy/releases/](../deploy/releases/)，保留旧快照不代表该版本当前在线。

## 历史专项说明

以下文档保留旧 Host、服务与功能阶段的说明。是否进入当前产品，需检查实际入口和构建；不要按文件存在推断已启用。

| 主题 | 文件 |
| --- | --- |
| 普通设置 | [SETTINGS](SETTINGS.md) |
| 本地内容 | [LOCAL-CONTENT](LOCAL-CONTENT.md) |
| 宿主卡片上下文 | [HOST-APP](HOST-APP.md) |
| 对话历史 | [CONVERSATIONS](CONVERSATIONS.md) |
| 可选独立 AI | [AI-PROVIDER](AI-PROVIDER.md) |
| 来源与归因 | [HOST-PROVENANCE](HOST-PROVENANCE.md) |
| 推荐偏好 | [RECOMMENDATION-PREFERENCES](RECOMMENDATION-PREFERENCES.md) |
| 注册任务 | [REGISTERED-JOBS](REGISTERED-JOBS.md) |
| 注册 WASM | [REGISTERED-WASM](REGISTERED-WASM.md) |
| 内容备份 | [CONTENT-BACKUPS](CONTENT-BACKUPS.md) |
| 外部 Agent 权限 | [AGENT-ACCESS](AGENT-ACCESS.md) |

## 示例与引用

[examples/](examples/) 保存规划示例；[examples/v1/](examples/v1/) 保存 OpenAPI、MCP schemas、合成数据和 Swift 调用示例。其适用边界由交接包说明。

链接优先用仓库相对路径。迁移文件时同时更新入链、脚本和构建引用；保留旧材料的历史状态，不用文件整理改写业务完成度。
