# 文档查阅与问题入口

更新：2026-10-23。按任务选择现有规则与排查指南；完整目录见[文档目录](../README.md)。

## 从这里开始

| 要做什么 | 先查哪里 |
| --- | --- |
| 了解产品与已实现范围 | [产品需求](../product/requirements.md)、[Agent 与 MCP](../product/agent-mcp.md)、[功能矩阵](../product/feature-matrix.md) |
| 开始开发与选择检查 | [开发](../guides/development.md)、[测试与验证](../guides/testing.md) |
| 快速发布与回退 | [快速发布](../guides/release.md)：准备候选、部署、刷新工具、验收与留档 |
| 改界面或核对两端差异 | [设计约束](../../DESIGN.md)、[交互规范入口](../product/interaction-spec.md)、[界面对账表](../product/ui-alignment.md) |
| 写入卡片或对接接口 | [跨端数据约定](../../contracts/README.md)、[本地操作](../guides/local-operations.md)、[接口与交接包](../guides/handoff.md) |
| 提交事项或 PR | [事项管理](../agents/issue-tracker.md)、[PR 编写指南](../../pr.md) |

## 排查与恢复

沿用各专题指南。排查方法变化时更新原指南；新增问题入口或调整章节位置时更新本表。

| 遇到的问题 | 查阅位置与下一步 |
| --- | --- |
| 修改源码后页面还是旧版 | [本地页面入口与更新](../guides/local-operations.md#页面入口与更新)：区分构建预览与开发热更新，检查产物是否更新 |
| 保存冲突、草稿未保存或写入结果不明 | [本地数据与 AI 操作](../guides/local-operations.md#数据与-ai-操作)、[插件日常使用](../guides/plugin-runbook.md#日常使用规范)：读取当前内容，按原版本和幂等规则核对 |
| 插件无工具、授权失败或侧栏打不开 | [插件排查顺序](../guides/plugin-runbook.md#排查和验收顺序)：固定实际连接对象，再检查授权、发现与页面加载 |
| Mac 卡顿或性能记录异常 | [Mac 性能追踪](../guides/macos-performance.md)：按场景采集记录，区分后台指标与窗口行为 |
| 需要备份或恢复本地数据 | [数据与清理规则](../guides/file-management.md#7-数据秘密与清理)、[本地操作](../guides/local-operations.md#数据与-ai-操作)：确认数据位置、停止写入、保留副本，再验证恢复文件 |


## 操作与规范

| 文档 | 用途与查阅时机 | 更新时机 |
| --- | --- | --- |
| [开发](../guides/development.md) | 定位开发入口、模块职责和构建方式 | 开发入口或代码结构变化 |
| [代码规范](../guides/code-standards.md) | 修改或审查代码前确认工程约定 | 语言、依赖、代码或交付规则变化 |
| [测试与验证](../guides/testing.md) | 选择检查前确认授权与验证边界 | 测试授权、CI 或证据规则变化 |
| [跨端对齐检查清单](../guides/cross-platform-checklist.md) | 改界面时选择对齐项并记录结果 | 跨端检查项目或结果格式变化 |
| [文件管理规范](../guides/file-management.md) | 新增、移动或清理文件前确定位置和保留方式 | 目录职责、命名或保留规则变化 |
| [本地操作](../guides/local-operations.md) | 启动预览、操作本地卡片及处理保存问题 | 本地入口、操作协议或恢复方法变化 |
| [插件使用与排查](../guides/plugin-runbook.md) | 检查插件连接、工具发现和写入结果 | 操作与排查方法变化；历史结果保留日期 |
| [Mac 性能追踪与自动化测试](../guides/macos-performance.md) | 采集和分析 Mac 性能，选择适用验证 | 采集入口、指标或验证流程变化 |
| [桌面交互架构与验证](../guides/desktop-interaction.md) | 定位桌面输入、动画和验证职责 | 模块职责或交互扩展规则变化 |

### 接口准备与阶段交接

以下材料保留原路径。接口准备不表示新增 API 已实现；阶段工作包中的任务状态只对其记录日期成立。开始新任务时，按当前产品范围、设计约束和测试授权核对。

| 文档 | 用途与查阅时机 | 更新时机 |
| --- | --- | --- |
| [V1 三端接口与交接包](../guides/handoff.md) | 对接前区分已实现接口、准备示例和待实现流程 | 已确认的接口约定或准备材料变化 |
| [Web 与 PWA 界面优化交接](../guides/web-pwa-ui-handoff.md) | 查 2026-10-18 至 19 的阶段范围与接手背景 | 按原任务维护；不作为日常规则入口 |
| [Web 与 PWA 界面工作包](../guides/web-pwa-ui-packages.md) | 追溯 U1–U6 工作包及当时的选择 | 按原任务维护 |
| [Web 代码工作包](../guides/web-pwa-code-packages.md) | 追溯 C1–C6 工作包及当时的证据 | 按原任务维护 |
| [Web 与 PWA 接手提示词](../guides/web-pwa-agent-prompts.md) | 查原阶段的接手安排 | 按原任务维护；新任务沿用现行规则 |


## 产品规则

| 文档 | 用途与查阅时机 | 更新时机 |
| --- | --- | --- |
| [产品需求](../product/requirements.md) | 判断需求是否符合产品目标与范围 | 已确认的目标或业务规则变化 |
| [Agent 驱动与 MCP 连接](../product/agent-mcp.md) | 确认 AI 与界面分工、当前接口及 V1 边界 | 产品分工、接口能力或 V1 范围变化 |
| [远期执行与能力边界](../product/agent-execution.md) | 讨论内置助手、委托与可靠执行方案 | 远期方案获得确认或能力边界变化 |
| [功能矩阵](../product/feature-matrix.md) | 比较 Web、Mac、iOS 与云端支持范围 | 实现、发布或验证状态变化 |
| [界面对账表](../product/ui-alignment.md) | 核对两端同一功能、刻意差异与实测状态 | 任一端界面变化或取得新验证结果 |
| [Sill 交互规范](../product/interaction-spec.md) | 按交互场景找到设计手册对应规则 | 规则入口或章节位置变化 |

