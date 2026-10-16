# 文档目录

- [旧入口清理记录](records/2026-10-16-legacy-removal/README.md)

- [卡片来源字段使用第二版数据约定](adr/0028-card-contract-source-migration.md)

更新：2026-10-16。本页是唯一文档导航。现行规则按用途分目录，记录只对当时日期与环境成立，归档不作为当前依据。启动方式见 [项目说明](../README.md)。

## 产品规则

- [Agent 驱动与 MCP 连接](product/agent-mcp.md)
- [功能矩阵](product/feature-matrix.md)
- [Sill 交互规范](product/interaction-spec.md)
- [Sill · 窗台 — 产品需求文档](product/requirements.md)

## 设计规则

- [设计决策记录（ADR）](design/decisions.md)
- [Sill 设计系统](design/system.md)

## 操作与规范

- [代码规范](guides/code-standards.md)
- [开发](guides/development.md)
- [文件管理规范](guides/file-management.md)
- [V1 三端接口与交接包](guides/handoff.md)
- [本地操作](guides/local-operations.md)
- [Sill 插件调试记录与使用规范](guides/plugin-runbook.md)

## 工程技能

- [领域文档](agents/domain.md)
- [事项管理：GitHub](agents/issue-tracker.md)
- [事项分类标签](agents/triage-labels.md)

## 架构决策

- [文档位置表示是否有效](adr/0022-docs-location-shows-validity.md)
- [三端代码的顶层结构](adr/0023-three-clients-repo-layout.md)
- [contracts 中的 zod 定义是契约唯一来源](adr/0024-contracts-zod-as-source.md)
- [全仓库只有一个产品版本号](adr/0025-single-product-version.md)
- [仓库只用 TypeScript、Swift、SQL](adr/0026-three-languages.md)
- [Mac 与 iOS 完全原生实现](adr/0027-native-apple-data-layer.md)

## 记录

下列目录保留正文与证据。历史“待验收”“已发布”只指记录时点，不表示本次重新验收。

- [2026-10-16-document-migration：文档分类迁移](records/2026-10-16-document-migration/README.md)
- [2026-10-11-product-conversation：Sill — 产品对话与需求演进记录](records/2026-10-11-product-conversation/README.md)
- [2026-10-12-local-acceptance：Sill 本地版本](records/2026-10-12-local-acceptance/README.md)
- [2026-10-13-accessibility-validation：Sill 交互与无障碍修复验收](records/2026-10-13-accessibility-validation/README.md)
- [2026-10-14-cloud-release：Sill release — 2026-10-14](records/2026-10-14-cloud-release/README.md)
- [2026-10-14-cloud-ui：Sill cloud UI acceptance — 2026-10-14](records/2026-10-14-cloud-ui/README.md)
- [2026-10-14-cloud-ui-no-header：Sill workspace without the top toolbar — 2026-10-14](records/2026-10-14-cloud-ui-no-header/README.md)
- [2026-10-14-mcp-consent：Remote Sill MCP: disabled consent implementation and enablement gates](records/2026-10-14-mcp-consent/README.md)
- [2026-10-14-production-actions-review：生产动作审查：网页登录/读写先行，MCP 单独设门槛](records/2026-10-14-production-actions-review/README.md)
- [2026-10-14-supabase-preparation：Supabase V1 准备与审查结果](records/2026-10-14-supabase-preparation/README.md)
- [2026-10-14-supabase-rollout：Sill 登录与数据边界：本地可验证，生产未应用](records/2026-10-14-supabase-rollout/README.md)
- [2026-10-15-app-connection-build：Sill 应用连接调整步骤与构建参数](records/2026-10-15-app-connection-build/README.md)
- [2026-10-15-brand-session：Sill 图标、插件与网页登录续期验收](records/2026-10-15-brand-session/README.md)
- [2026-10-15-cloud-release：Sill 云端插件接入 · 2026-10-15](records/2026-10-15-cloud-release/README.md)
- [2026-10-15-local-release：Sill Web 改进与 macOS 原生版](records/2026-10-15-local-release/README.md)
- [2026-10-15-local-ux：本地交互布局证据](records/2026-10-15-local-ux/README.md)
- [2026-10-15-oauth：Sill 授权测试结果](records/2026-10-15-oauth/README.md)
- [2026-10-15-plugin：插件构建来源记录](records/2026-10-15-plugin/README.md)
- [2026-10-15-status：Sill 现状与发布障碍](records/2026-10-15-status/README.md)
- [2026-10-16-app-skill：原 Sill App 插件添加 Skill：发布与验证记录](records/2026-10-16-app-skill/README.md)
- [2026-10-16-plugin：App 插件构建证据](records/2026-10-16-plugin/README.md)

## 归档

旧阶段说明、被替代规范和旧测试报告仅供历史查阅。

- [Restricted external-agent access](archive/AGENT-ACCESS.md)
- [F05：可选独立 AI 回答](archive/AI-PROVIDER.md)
- [卡片体验优化 · V0.3](archive/CARD-REFINEMENT.md)
- [Content and settings backups v1](archive/CONTENT-BACKUPS.md)
- [F04：独立网页对话历史与恢复](archive/CONVERSATIONS.md)
- [V0.5 · Apple 方向的主题与卡片修订](archive/DESIGN-REVIEW-V05.md)
- [文件管理规范](archive/FILE-MANAGEMENT.md)
- [F03：宿主卡片上下文](archive/HOST-APP.md)
- [F06：宿主协助跨应用来源与归因](archive/HOST-PROVENANCE.md)
- [本地笔记与卡片备注](archive/LOCAL-CONTENT.md)
- [Explicit recommendation preferences](archive/RECOMMENDATION-PREFERENCES.md)
- [Registered local jobs](archive/REGISTERED-JOBS.md)
- [Registered WebAssembly scripts v1](archive/REGISTERED-WASM.md)
- [普通设置：同一份状态，多个入口](archive/SETTINGS.md)
- [旧测试报告：AGENT-ACCESS-REPORT.md](archive/test-reports/AGENT-ACCESS-REPORT.md)
- [旧测试报告：AI-PROVIDER-REPORT.md](archive/test-reports/AI-PROVIDER-REPORT.md)
- [旧测试报告：CONTENT-BACKUPS-REPORT.md](archive/test-reports/CONTENT-BACKUPS-REPORT.md)
- [旧测试报告：CONVERSATIONS-REPORT.md](archive/test-reports/CONVERSATIONS-REPORT.md)
- [旧测试报告：HOST-APP-REPORT.md](archive/test-reports/HOST-APP-REPORT.md)
- [旧测试报告：HOST-PROVENANCE-REPORT.md](archive/test-reports/HOST-PROVENANCE-REPORT.md)
- [旧测试报告：INTEGRATION-REPORT.md](archive/test-reports/INTEGRATION-REPORT.md)
- [旧测试报告：LOCAL-CONTENT-REPORT.md](archive/test-reports/LOCAL-CONTENT-REPORT.md)
- [旧测试报告：RECOMMENDATION-PREFERENCES-REPORT.md](archive/test-reports/RECOMMENDATION-PREFERENCES-REPORT.md)
- [旧测试报告：REGISTERED-JOBS-REPORT.md](archive/test-reports/REGISTERED-JOBS-REPORT.md)
- [旧测试报告：REGISTERED-WASM-REPORT.md](archive/test-reports/REGISTERED-WASM-REPORT.md)
- [旧测试报告：REPORT-v0.1.md](archive/test-reports/REPORT-v0.1.md)
- [旧测试报告：REPORT.md](archive/test-reports/REPORT.md)
- [旧测试报告：SETTINGS-REPORT.md](archive/test-reports/SETTINGS-REPORT.md)

## 仓库入口与准备材料

- [术语表](../GLOSSARY.md)
- [设计系统](../design-system/README.md)
- [脚本目录](../scripts/README.md)
- [测试目录](../tests/README.md)
- [Mac 原生说明](../native/macos/README.md)
- [PR 模板](../.github/pull_request_template.md)与[本次正文](../pr.md)
- [接口准备示例](../contracts/design/)：迁移批次 2 前暂留原路径，不表示新增 API 已实现。
