# 文档目录

更新：2026-10-30。按任务读取对应正文。分层、命名和维护方式见[文件管理规范](agent/file-management.md)。

## 项目准则

- [Sill · 窗台](agent/PRODUCT.md)
- [项目准则](agent/README.md)
- [代码规范](agent/code-standards.md)
- [部署规范](agent/deployment.md)
- [术语与决策管理](agent/domain.md)
- [错误记录规范](agent/error.md)
- [文件管理规范](agent/file-management.md)
- [事项管理：GitHub](agent/issue-tracker.md)
- [动效开发与排查](agent/motion-development.md)
- [PR 编写指南](agent/pr.md)
- [测试规范](agent/test.md)
- [事项分类标签](agent/triage-labels.md)

## 产品与设计规范

- [设计规范](agent/DESIGN.md)
- [小栖角色与动画设计规范](specs/design/mascot.md)
- [跨端对齐检查清单](specs/cross-platform-checklist.md)
- [AI 栏交互](specs/design/ai-dock.md)
- [Sill 卡片内容设计规范](specs/design/card-content.md)
- [产品行为规范](specs/product-behavior.md)

## 实现说明

- [品牌素材与展示截图](implementation/brand-assets.md)

- [MCP 接口说明](implementation/agent-mcp.md)
- [设计系统维护](implementation/design-system.md)
- [AI 栏实现状态](implementation/design/ai-dock-status.md)
- [跨端实现对照](implementation/design/ui-alignment.md)
- [备份、提醒与外链实现对照](implementation/design/ui-backup-reminders-alignment.md)
- [卡片实现对照](implementation/design/ui-card-alignment.md)
- [内容适配差异](implementation/design/ui-content-alignment.md)
- [设置实现对照](implementation/design/ui-settings-alignment.md)
- [桌面交互架构与验证](implementation/engineering/desktop-interaction.md)
- [功能矩阵](implementation/feature-matrix.md)
- [外部备份与设备提醒](implementation/operations/backup-and-reminders.md)
- [本地操作](implementation/operations/local-operations.md)
- [Web 与 Mac 本地测试](implementation/operations/local-testing.md)
- [Mac 性能追踪与自动化测试](implementation/operations/macos-performance.md)
- [插件操作与排查](implementation/operations/plugin-runbook.md)
- [快速发布](implementation/operations/release-runbook.md)
- [测试操作说明](implementation/testing.md)

## 计划

- [外部助手 Webhook 方案](plans/external-agent-webhook.md)
- [产品路线图](plans/roadmap.md)

## 决策与事件

- [架构决策索引](adr/README.md)：决定的原因、取舍与替代关系。
- [错误索引](records/errors.md)：按报错、症状和模块查找定位与解决记录。
- [事件记录索引](records/README.md)：验收、发布、研究与交接材料，只说明当时的事实。
- [产品变更日志](records/CHANGELOG.md)：按版本汇总产品与维护变化。
- [1.2.18 手机交互修复与发布](records/2026-10-30-phone-page-lifecycle/README.md)：AI 输入框、搜索与抽屉、主页双击刷新，以及部署与回退标识。
- [1.2.16 按钮审查与发布](records/2026-10-29-interface-hardening/README.md)：按钮调用链、回归结果、部署与回退标识。
- [设计变更日志](records/design-changelog.md)：按次追加的设计变更。

## 配套资料

- [LICENSE](LICENSE)：版权与授权声明。
- [业务术语](../GLOSSARY.md)
- [数据契约](../contracts/README.md)
- [设计系统](../design-system/README.md)
- [脚本](../scripts/README.md)与[测试](../tests/README.md)

- [Codex 卡片引用发布](records/2026-10-29-codex-card-context/README.md)

- [视频预览旧布局诊断](records/2026-10-29-video-preview/README.md)
