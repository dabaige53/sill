# 文档目录

更新：2026-10-19。本页是唯一文档导航。现行规则按用途分目录，记录只对当时日期与环境成立，归档不作为当前依据。启动方式见 [项目说明](../README.md)。

## 产品规则

- [Agent 驱动与 MCP 连接](product/agent-mcp.md)
- [远期执行与能力边界](product/agent-execution.md)
- [功能矩阵](product/feature-matrix.md)
- [Sill 交互规范](product/interaction-spec.md)
- [Sill · 窗台 — 产品需求文档](product/requirements.md)

## 设计规则

- [卡片内容设计规范](design/card-content.md)：标题、摘要、来源与阅读时长、结构化内容和发布检查。

- [设计决策记录（ADR）](design/decisions.md)
- [Sill 设计系统](design/system.md)
- [设计版本记录](design/versions.md)：每个设计版本对应的 ADR、线上 Design System 与设计画布版本、提交。

## 操作与规范

- [代码规范](guides/code-standards.md)
- [开发](guides/development.md)
- [文件管理规范](guides/file-management.md)
- [V1 三端接口与交接包](guides/handoff.md)
- [Web 与 PWA 界面优化交接](guides/web-pwa-ui-handoff.md)
- [Web 与 PWA 界面工作包](guides/web-pwa-ui-packages.md)
- [Web 代码工作包](guides/web-pwa-code-packages.md)
- [Web 与 PWA 接手提示词](guides/web-pwa-agent-prompts.md)
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
- [卡片来源字段使用第二版数据约定](adr/0028-card-contract-source-migration.md)
- [TypeScript 构建与检查配置](adr/0029-typescript-build-artifacts.md)
- [已读只靠卡片颜色](adr/0030-read-state-color-only.md)
- [根目录 DESIGN.md 作为设计入口](adr/0031-design-md-entry.md)
- [设计改动先改线上，再同步线下](adr/0032-design-online-first.md)
- [不接入外部来源，内容由助手写入，连接器只用 Composio](adr/0033-ai-writes-composio-only.md)
- [玻璃底栏取代入口球，工具条滚动时收起](adr/0034-glass-rail-and-tucking-bars.md)
- [底部导航胶囊取代右下玻璃按钮组](adr/0035-bottom-navigation-capsule.md)
- [手机主页参考 X 的密度，仍用卡片](adr/0036-phone-home-density.md)
- [卡片详情：操作收进底部胶囊，只用图标](adr/0037-card-detail-toolbar.md)
- [保留当前图标，不继续全套方圆化](adr/0038-keep-original-icons.md)
- [导航当前项保留现状镜片](adr/0039-keep-navigation-lens.md)
- [显示加入时优先保留忽略提醒](adr/0040-event-reminder-priority.md)
- [照片大图页补通用操作胶囊](adr/0041-photo-shared-toolbar.md)
- [卡片操作设置显示适用类型示例](adr/0042-card-action-type-examples.md)
- [桌面主页显示左上紧凑分栏](adr/0043-desktop-home-filters.md)
- [搜索按类型、状态、标签分行](adr/0044-search-filter-rows.md)
- [结束剩余页面调整并保留现状](adr/0045-close-web-pwa-ui-scope.md)
- [点遮罩每次只关一张叠卡](adr/0046-backdrop-closes-one-stacked-card.md)
- [Web 使用 React、TypeScript 与 Vite](adr/0047-react-web.md)
- [手机顶行统一，搜索改用分类与 # 标签](adr/0048-phone-top-row-and-search-tokens.md)
- [Web 顶栏搜索与底部 AI 框](adr/0049-web-top-search-and-ai-dock.md)
- [卡片 A 字号、资讯阅读与 Mac 设置弹窗](adr/0051-card-type-a-and-article-reading.md)

## 记录

- [macOS 视觉与动效对齐 Web](records/2026-10-20-macos-web-alignment/README.md)
- [设计材料精简与 design-init 工具](records/2026-10-21-design-streamlining/README.md)

- [React 迁移与动效本地整合（2026-10-19）](records/2026-10-19-react-motion-integration/README.md)

- [无效代码清理（2026-10-19）](records/2026-10-19-dead-code-cleanup/README.md)

- [导航当前项比较与保留镜片的决定（U3，2026-10-19）](records/2026-10-19-navigation-choice/README.md)
- [日程专属操作优先级（U4.1，2026-10-19）](records/2026-10-19-event-action-priority/README.md)
- [搜索、AI、设置与深色现状（U6，2026-10-19）](records/2026-10-19-page-audit/README.md)
- [搜索筛选排布候选（U6，2026-10-19）](records/2026-10-19-search-filter-proposals/README.md)
- [搜索筛选按条件分行（U6，2026-10-19）](records/2026-10-19-search-filter-rows/README.md)
- [Web/PWA 交付与发布检查（2026-10-19）](records/2026-10-19-web-pwa-delivery/README.md)
- [照片大图页补通用操作（U4，2026-10-19）](records/2026-10-19-photo-shared-toolbar/README.md)
- [卡片操作设置的类型示例（U4.5，2026-10-19）](records/2026-10-19-card-action-examples/README.md)
- [桌面主页左上紧凑分栏（U5，2026-10-19）](records/2026-10-19-desktop-home-filters/README.md)
- [桌面分栏后的云端位置检查（U5，2026-10-19）](records/2026-10-19-desktop-filter-cloud-checks/README.md)

- [全套图标比较与保留原版的决定（U2，2026-10-19）](records/2026-10-19-icon-choice/README.md)

- [云端首次加载的保存状态（C1 补充，2026-10-19）](records/2026-10-19-cloud-sync-initial-state/README.md)

下列目录保留正文与证据。历史“待验收”“已发布”只指记录时点，不表示本次重新验收。

- [卡片详情核对（U4，2026-10-19）](records/2026-10-19-card-detail-audit/README.md)
- [桌面与手机一致性核对（U5，2026-10-19）](records/2026-10-19-cross-screen-audit/README.md)

- [2026-10-18-preview-copy：预览模板拆分与语义文案键（C3）](records/2026-10-18-preview-copy/README.md)
- [样式整理与逐张对照（2026-10-18）](records/2026-10-18-style-cleanup/README.md)
- [Web 类型整理与运行代码对照（2026-10-18）](records/2026-10-18-web-types/README.md)
- [2026-10-18-app-controller：控制器职责拆分与不变性检查（C2）](records/2026-10-18-app-controller/README.md)
- [2026-10-18-browser-regressions：浏览器回归测试修复（C1）](records/2026-10-18-browser-regressions/README.md)
- [2026-10-18-hidden-actions-postgres：云端偏好迁移验证（C6）](records/2026-10-18-hidden-actions-postgres/README.md)
- [2026-10-18-pwa-touch：PWA 触控、键盘名称与状态栏检查（U1）](records/2026-10-18-pwa-touch/README.md)
- [PWA 名称提示补入本地画板（2026-10-18）](records/2026-10-18-pwa-board/README.md)

- [2026-10-17-product-review：内容密度、动效材质与 Agent 交接审查](records/2026-10-17-product-review/README.md)
- [2026-10-17-issue-polish：Web/PWA 需求修正与验证](records/2026-10-17-issue-polish/README.md)
- [2026-10-17-ci-recovery：产品审查后的 CI 回归修正](records/2026-10-17-ci-recovery/README.md)

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
- [2026-10-16-code-cleanup：代码清理与跨端迁移验收](records/2026-10-16-code-cleanup/README.md)
- [2026-10-16-document-migration：文档分类迁移](records/2026-10-16-document-migration/README.md)
- [2026-10-16-legacy-removal：旧入口清理](records/2026-10-16-legacy-removal/README.md)
- [2026-10-16-plugin：App 插件构建证据](records/2026-10-16-plugin/README.md)
- [2026-10-16-rich-cards：结构化云端卡片与技能发布](records/2026-10-16-rich-cards/README.md)

- [2026-10-16-remove-sources-import：删除来源连接与文件导入](records/2026-10-16-remove-sources-import/README.md)
- [2026-10-16-cloud-operations：云端工作区操作与 Agent 优先](records/2026-10-16-cloud-operations/README.md)
- [2026-10-18-phone-home-x-density：手机主页参考 X 的密度](records/2026-10-18-phone-home-x-density/README.md)
- [2026-10-18-card-detail-capsule：卡片详情的操作胶囊](records/2026-10-18-card-detail-capsule/README.md)

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
- [0050：卡片使用明确字段](adr/0050-explicit-card-fields.md)
- [设计系统](../design-system/README.md)
- [脚本目录](../scripts/README.md)
- [测试目录](../tests/README.md)
- [Mac 原生说明](../apps/apple/README.md)
- [PR 编写指南](../pr.md)与[PR 模板](../.github/pull_request_template.md)
- [接口准备示例](../contracts/design/)：保留准备材料，不表示新增 API 已实现。

- [登录授权页面与设置画板](adr/0052-auth-pages-and-settings-boards.md)
- [桌面导航对齐与稳定搜索宽度](adr/0053-desktop-navigation-alignment.md)
- [桌面阅读与刷新动效衔接](adr/0054-desktop-motion-continuity.md)
- [Mac 导航与 AI 输入栏原生玻璃](adr/0055-macos-navigation-liquid-glass.md)
- [登录授权与设置画板交接](records/2026-10-21-auth-settings-ui/README.md)

- [Mac 性能追踪与自动化测试](guides/macos-performance.md)

- [Mac 性能工作流验证记录](records/2026-10-21-macos-performance/README.md)

- [桌面交互架构与验证](guides/desktop-interaction.md)
- [桌面输入归属与动效职责](adr/0056-desktop-input-ownership.md)
- [桌面卡片空间过渡与浮层可读性](adr/0057-desktop-card-spatial-transition.md)

- [2026-10-21 测试整理](records/2026-10-21-test-cleanup/README.md)：旧测试删除依据、恢复标签和运行入口分工。
