# 迁移前第四层材料盘点

盘点：2026-10-29。以下保留迁移前的数量、原路径和当时建议；后续用户已授权完成整理，结果见[本次记录](README.md)。链接已指向迁移后的材料，本表不是当前文件清单。

| 范围 | Markdown 数量 | 当前处理 |
| --- | ---: | --- |
| `docs/product/` | 3 | 待逐份确认归属与去重 |
| `docs/design/` | 2 | 待逐份确认归属与去重 |
| `docs/guides/` | 7 | 待逐份确认归属与去重 |
| `docs/adr/` | 71 | 保留原位，已更新指向现行正文的导航 |
| `docs/records/` | 121 | 保留原位，已更新指向现行正文的导航 |
| `docs/archive/` | 29 | 待逐份确认归属与去重 |
| **合计** | **233** | 不含 703 个事件附件；附件随原事件保留 |

## 优先确认的 12 份材料

| 当前文件 | 类型 | 建议处理 |
| --- | --- | --- |
| [远期执行与能力边界](../../plans/external-agent-webhook.md)<br>`docs/product/agent-execution.md` | 产品路线图与专项技术方案混合 | 产品方向进入 roadmap；实施细节另作专项方案，均待确认。 |
| [动画元素对应与确认清单](../2026-10-28-animation-review/checklist.md)<br>`docs/product/animation-checklist.md` | 动画专项计划、规则与历史反馈混合 | 抽取未闭环任务；有效规则归设计规范；独有检查与反馈归记录。 |
| [真实功能完成清单](../2026-10-23-functional-completion/readiness.md)<br>`docs/product/functional-readiness.md` | 2026-10-23 功能检查快照 | 核对后与已有 functional-completion 事件整合，不新建重复快照。 |
| [设计决策记录（ADR）](../../adr/0001-0021-design-decisions.md)<br>`docs/design/decisions.md` | ADR-01 至 ADR-21 决策集合 | 作为 ADR 历史保留并接入决策索引，不复制成平行规范。 |
| [设计版本记录](../design-changelog.md)<br>`docs/design/versions.md` | 设计发布版本记录 | 保留发布事实；候选归 records，迁移前同步维护脚本。 |
| [V1 三端接口与交接包](../../plans/external-agent-webhook.md)<br>`docs/guides/handoff.md` | V1 准备与交接方案 | 拟归 plans；当前接口去重后以 implementation 为准。 |
| [滚动、完成与回弹优化方案](../2026-10-27-scroll-momentum/optimization-plan.md)<br>`docs/guides/scroll-motion-optimization.md` | 滚动专项方案与实施过程混合 | 未闭环计划归 plans；已定规则回到设计规范；结果归 records。 |
| [动画五阶段任务交接](../2026-10-27-motion-handoff/README.md)<br>`docs/guides/animation-worktree-handoff.md` | 五阶段历史交接 | 保留当时工作树与授权语境；核对未完成项后归对应记录。 |
| [Web 与 PWA 接手提示词](../2026-10-19-web-pwa-handoff/web-pwa-agent-prompts.md)<br>`docs/guides/web-pwa-agent-prompts.md` | 旧任务提示词 | 作为当时交接证据保留，不作为新任务授权。 |
| [Web 代码工作包](../2026-10-19-web-pwa-handoff/web-pwa-code-packages.md)<br>`docs/guides/web-pwa-code-packages.md` | 旧代码工作包 | 核对未闭环项，已结束部分归对应记录。 |
| [Web 与 PWA 界面优化交接](../2026-10-19-web-pwa-handoff/web-pwa-ui-handoff.md)<br>`docs/guides/web-pwa-ui-handoff.md` | 旧 Web/PWA 交接 | 保留当时范围与决定，不视为当前待办。 |
| [Web 与 PWA 界面工作包](../2026-10-19-web-pwa-handoff/web-pwa-ui-packages.md)<br>`docs/guides/web-pwa-ui-packages.md` | 旧界面工作包 | 核对未闭环项，已结束部分归对应记录。 |

## ADR

保留独立决定、理由与替代关系。现行要求由前三层正文维护；后续决定可以新增 ADR。

- [文档位置表示是否有效](../../adr/0022-docs-location-shows-validity.md) — `0022-docs-location-shows-validity.md`
- [三端代码的顶层结构](../../adr/0023-three-clients-repo-layout.md) — `0023-three-clients-repo-layout.md`
- [contracts 中的 zod 定义是契约唯一来源](../../adr/0024-contracts-zod-as-source.md) — `0024-contracts-zod-as-source.md`
- [全仓库只有一个产品版本号](../../adr/0025-single-product-version.md) — `0025-single-product-version.md`
- [仓库只用 TypeScript、Swift、SQL](../../adr/0026-three-languages.md) — `0026-three-languages.md`
- [Mac 与 iOS 完全原生实现](../../adr/0027-native-apple-data-layer.md) — `0027-native-apple-data-layer.md`
- [卡片来源字段使用第二版数据约定](../../adr/0028-card-contract-source-migration.md) — `0028-card-contract-source-migration.md`
- [TypeScript 构建与检查配置](../../adr/0029-typescript-build-artifacts.md) — `0029-typescript-build-artifacts.md`
- [已读只靠卡片颜色](../../adr/0030-read-state-color-only.md) — `0030-read-state-color-only.md`
- [根目录 DESIGN.md 作为设计入口](../../adr/0031-design-md-entry.md) — `0031-design-md-entry.md`
- [设计改动先改线上，再同步线下](../../adr/0032-design-online-first.md) — `0032-design-online-first.md`
- [不接入外部来源，内容由助手写入，连接器只用 Composio](../../adr/0033-ai-writes-composio-only.md) — `0033-ai-writes-composio-only.md`
- [玻璃底栏取代入口球，工具条滚动时收起](../../adr/0034-glass-rail-and-tucking-bars.md) — `0034-glass-rail-and-tucking-bars.md`
- [底部导航胶囊取代右下玻璃按钮组](../../adr/0035-bottom-navigation-capsule.md) — `0035-bottom-navigation-capsule.md`
- [手机主页参考 X 的密度，仍用卡片](../../adr/0036-phone-home-density.md) — `0036-phone-home-density.md`
- [卡片详情：操作收进底部胶囊，只用图标](../../adr/0037-card-detail-toolbar.md) — `0037-card-detail-toolbar.md`
- [保留当前图标，不继续全套方圆化](../../adr/0038-keep-original-icons.md) — `0038-keep-original-icons.md`
- [导航当前项保留现状镜片](../../adr/0039-keep-navigation-lens.md) — `0039-keep-navigation-lens.md`
- [显示加入时优先保留忽略提醒](../../adr/0040-event-reminder-priority.md) — `0040-event-reminder-priority.md`
- [照片大图页补通用操作胶囊](../../adr/0041-photo-shared-toolbar.md) — `0041-photo-shared-toolbar.md`
- [卡片操作设置显示适用类型示例](../../adr/0042-card-action-type-examples.md) — `0042-card-action-type-examples.md`
- [桌面主页显示左上紧凑分栏](../../adr/0043-desktop-home-filters.md) — `0043-desktop-home-filters.md`
- [搜索按类型、状态、标签分行](../../adr/0044-search-filter-rows.md) — `0044-search-filter-rows.md`
- [结束剩余页面调整并保留现状](../../adr/0045-close-web-pwa-ui-scope.md) — `0045-close-web-pwa-ui-scope.md`
- [点遮罩每次只关一张叠卡](../../adr/0046-backdrop-closes-one-stacked-card.md) — `0046-backdrop-closes-one-stacked-card.md`
- [Web 使用 React、TypeScript 与 Vite](../../adr/0047-react-web.md) — `0047-react-web.md`
- [手机顶行统一，搜索改用分类与 # 标签](../../adr/0048-phone-top-row-and-search-tokens.md) — `0048-phone-top-row-and-search-tokens.md`
- [Web 顶栏搜索与底部 AI 框](../../adr/0049-web-top-search-and-ai-dock.md) — `0049-web-top-search-and-ai-dock.md`
- [卡片使用明确字段，不再使用混合补充信息](../../adr/0050-explicit-card-fields.md) — `0050-explicit-card-fields.md`
- [卡片 A 字号、资讯阅读与 Mac 设置弹窗](../../adr/0051-card-type-a-and-article-reading.md) — `0051-card-type-a-and-article-reading.md`
- [登录授权页面与设置画板](../../adr/0052-auth-pages-and-settings-boards.md) — `0052-auth-pages-and-settings-boards.md`
- [ADR 0053：桌面导航对齐与稳定搜索宽度](../../adr/0053-desktop-navigation-alignment.md) — `0053-desktop-navigation-alignment.md`
- [ADR 0054：桌面阅读与刷新动效衔接](../../adr/0054-desktop-motion-continuity.md) — `0054-desktop-motion-continuity.md`
- [0055：Mac 导航与 AI 输入栏原生玻璃](../../adr/0055-macos-navigation-liquid-glass.md) — `0055-macos-navigation-liquid-glass.md`
- [0056：桌面输入归属与动效职责](../../adr/0056-desktop-input-ownership.md) — `0056-desktop-input-ownership.md`
- [桌面卡片空间过渡与浮层可读性](../../adr/0057-desktop-card-spatial-transition.md) — `0057-desktop-card-spatial-transition.md`
- [Mac 卡片展开改为外框露出](../../adr/0058-mac-card-reveal-transition.md) — `0058-mac-card-reveal-transition.md`
- [桌面搜索框伸缩、AI 框拖入反馈与底部轨道玻璃统一](../../adr/0059-mac-search-ai-dock-rail-glass.md) — `0059-mac-search-ai-dock-rail-glass.md`
- [卡片与详情按 12 类专用重建，来源改用单色品牌圆标](../../adr/0060-card-rebuild-by-type-and-source-marks.md) — `0060-card-rebuild-by-type-and-source-marks.md`
- [视频与播客在 Sill 内播放，新增 PR 卡片类型](../../adr/0061-in-app-media-playback-and-pr-cards.md) — `0061-in-app-media-playback-and-pr-cards.md`
- [卡片收回改用弹簧，读完确认后松手即关闭](../../adr/0062-card-close-spring-and-read-end-release.md) — `0062-card-close-spring-and-read-end-release.md`
- [详情文字统一为一个 Markdown 正文字段](../../adr/0063-markdown-body.md) — `0063-markdown-body.md`
- [AI 对话：同一个框的三种高度与结果行](../../adr/0064-ai-conversation-three-heights.md) — `0064-ai-conversation-three-heights.md`
- [0064 内容排版偏好](../../adr/0064-content-layout-preferences.md) — `0064-content-layout-preferences.md`
- [统一登录与授权布局](../../adr/0064-unified-auth-layout.md) — `0064-unified-auth-layout.md`
- [账号共用数据、外部备份与设备提醒](../../adr/0065-account-backups-and-device-reminders.md) — `0065-account-backups-and-device-reminders.md`
- [放大阅读页按内容排版](../../adr/0065-expanded-reading-layout.md) — `0065-expanded-reading-layout.md`
- [手机 PWA 打开、抽屉开合与下拉刷新](../../adr/0066-pwa-launch-and-sheet-motion.md) — `0066-pwa-launch-and-sheet-motion.md`
- [详情放大遮罩、媒体播放与阅读进度写入](../../adr/0067-detail-resize-media-and-progress-writes.md) — `0067-detail-resize-media-and-progress-writes.md`
- [手机内容文字起点](../../adr/0068-phone-text-scale.md) — `0068-phone-text-scale.md`
- [纵向间距分六级](../../adr/0069-vertical-rhythm.md) — `0069-vertical-rhythm.md`
- [手机详情连续展开与阅读关闭](../../adr/0070-phone-detail-expansion-and-reading.md) — `0070-phone-detail-expansion-and-reading.md`
- [设置开关使用轻弹簧](../../adr/0071-settings-toggle-spring.md) — `0071-settings-toggle-spring.md`
- [动画复核后的加载与操作反馈](../../adr/0072-web-animation-review-refinements.md) — `0072-web-animation-review-refinements.md`
- [搜索、阅读与照片的第三批调整](../../adr/0073-web-search-reading-carousel.md) — `0073-web-search-reading-carousel.md`
- [第四批状态与动画交接](../../adr/0074-stage-four-motion-handoffs.md) — `0074-stage-four-motion-handoffs.md`
- [第三批复核：搜索候选、工具栏等待与照片吸附](../../adr/0075-search-combobox-photo-snap-review.md) — `0075-search-combobox-photo-snap-review.md`
- [详情承接、AI锚点收缩与手机搜索复核](../../adr/0076-review-detail-ai-and-phone-search.md) — `0076-review-detail-ai-and-phone-search.md`
- [滚动、完成与回弹的交接](../../adr/0077-scroll-completion-and-rebound.md) — `0077-scroll-completion-and-rebound.md`
- [下拉刷新的连续阻力与释放](../../adr/0078-pull-refresh-resistance-and-release.md) — `0078-pull-refresh-resistance-and-release.md`
- [正文边缘回位的速度与参数](../../adr/0079-content-edge-rebound.md) — `0079-content-edge-rebound.md`
- [补齐搜索与第三、第四批动画交接](../../adr/0080-animation-reference-completion.md) — `0080-animation-reference-completion.md`
- [ADR 0081：手机详情抽屉使用 Vaul](../../adr/0081-phone-drawer-vaul.md) — `0081-phone-drawer-vaul.md`
- [ADR 0081：右侧章节进度与底部胶囊切换](../../adr/0081-reading-spine-and-segmented-navigation.md) — `0081-reading-spine-and-segmented-navigation.md`
- [ADR 0082：Web/PWA 采用 ui-lab 交互效果](../../adr/0082-web-ui-lab-motion.md) — `0082-web-ui-lab-motion.md`
- [ADR 0083：Mac 全量对齐与原生交互边界](../../adr/0083-macos-parity-and-native-interaction.md) — `0083-macos-parity-and-native-interaction.md`
- [ADR 0084：Mac 布局回退、搜索与阅读切换](../../adr/0084-macos-feedback-layout-and-reader.md) — `0084-macos-feedback-layout-and-reader.md`
- [ADR 0085：资讯正文排版与目录](../../adr/0085-article-typeset-and-toc.md) — `0085-article-typeset-and-toc.md`
- [ADR 0086：卡片字段精简与积木配方表](../../adr/0086-card-fields-and-block-recipes.md) — `0086-card-fields-and-block-recipes.md`
- [产品需求统一为 docs 内的 PRODUCT.md](../../adr/0087-product-context-single-source.md) — `0087-product-context-single-source.md`
- [按职责与更新方式分层管理文档](../../adr/0088-documentation-layers.md) — `0088-documentation-layers.md`

## 事件记录

保存当时事实、检查、发布结果与独有证据，不把历史结果改成当前结果。以下仅列文档入口，原事件目录内附件原位保留。

- [Sill — 产品对话与需求演进记录](../2026-10-11-product-conversation/README.md) — `2026-10-11-product-conversation/README.md`
- [Sill 本地版本](../2026-10-12-local-acceptance/README.md) — `2026-10-12-local-acceptance/README.md`
- [Sill 交互与无障碍修复验收](../2026-10-13-accessibility-validation/README.md) — `2026-10-13-accessibility-validation/README.md`
- [Sill release — 2026-10-14](../2026-10-14-cloud-release/README.md) — `2026-10-14-cloud-release/README.md`
- [Sill workspace without the top toolbar — 2026-10-14](../2026-10-14-cloud-ui-no-header/README.md) — `2026-10-14-cloud-ui-no-header/README.md`
- [Sill cloud UI acceptance — 2026-10-14](../2026-10-14-cloud-ui/README.md) — `2026-10-14-cloud-ui/README.md`
- [Sill cloud UI acceptance — 2026-10-14](../2026-10-14-cloud-ui/acceptance-report.md) — `2026-10-14-cloud-ui/acceptance-report.md`
- [Remote Sill MCP: disabled consent implementation and enablement gates](../2026-10-14-mcp-consent/README.md) — `2026-10-14-mcp-consent/README.md`
- [生产动作审查：网页登录/读写先行，MCP 单独设门槛](../2026-10-14-production-actions-review/README.md) — `2026-10-14-production-actions-review/README.md`
- [Supabase V1 准备与审查结果](../2026-10-14-supabase-preparation/README.md) — `2026-10-14-supabase-preparation/README.md`
- [Sill 登录与数据边界：本地可验证，生产未应用](../2026-10-14-supabase-rollout/README.md) — `2026-10-14-supabase-rollout/README.md`
- [Sill 应用连接调整步骤与构建参数](../2026-10-15-app-connection-build/README.md) — `2026-10-15-app-connection-build/README.md`
- [Sill 图标、插件与网页登录续期验收](../2026-10-15-brand-session/README.md) — `2026-10-15-brand-session/README.md`
- [Sill 云端插件接入 · 2026-10-15](../2026-10-15-cloud-release/README.md) — `2026-10-15-cloud-release/README.md`
- [Sill Web 改进与 macOS 原生版](../2026-10-15-local-release/README.md) — `2026-10-15-local-release/README.md`
- [本地交互布局证据](../2026-10-15-local-ux/README.md) — `2026-10-15-local-ux/README.md`
- [Sill 授权测试结果](../2026-10-15-oauth/README.md) — `2026-10-15-oauth/README.md`
- [插件构建来源记录](../2026-10-15-plugin/README.md) — `2026-10-15-plugin/README.md`
- [Sill 现状与发布障碍](../2026-10-15-status/README.md) — `2026-10-15-status/README.md`
- [原 Sill App 插件添加 Skill：发布与验证记录](../2026-10-16-app-skill/README.md) — `2026-10-16-app-skill/README.md`
- [云端工作区操作与 Agent 优先](../2026-10-16-cloud-operations/README.md) — `2026-10-16-cloud-operations/README.md`
- [代码清理与跨端迁移](../2026-10-16-code-cleanup/README.md) — `2026-10-16-code-cleanup/README.md`
- [文档分类迁移](../2026-10-16-document-migration/README.md) — `2026-10-16-document-migration/README.md`
- [旧入口清理记录](../2026-10-16-legacy-removal/README.md) — `2026-10-16-legacy-removal/README.md`
- [App 插件构建证据](../2026-10-16-plugin/README.md) — `2026-10-16-plugin/README.md`
- [删除来源连接与文件导入](../2026-10-16-remove-sources-import/README.md) — `2026-10-16-remove-sources-import/README.md`
- [结构化云端卡片与技能发布](../2026-10-16-rich-cards/README.md) — `2026-10-16-rich-cards/README.md`
- [产品审查后的 CI 回归修正](../2026-10-17-ci-recovery/README.md) — `2026-10-17-ci-recovery/README.md`
- [Web/PWA 需求修正检查](../2026-10-17-issue-polish/README.md) — `2026-10-17-issue-polish/README.md`
- [内容密度、动效材质与 Agent 交接审查](../2026-10-17-product-review/README.md) — `2026-10-17-product-review/README.md`
- [AppController 职责拆分（C2）](../2026-10-18-app-controller/README.md) — `2026-10-18-app-controller/README.md`
- [浏览器回归测试修复](../2026-10-18-browser-regressions/README.md) — `2026-10-18-browser-regressions/README.md`
- [卡片详情：操作收进底部胶囊](../2026-10-18-card-detail-capsule/README.md) — `2026-10-18-card-detail-capsule/README.md`
- [hiddenActions 云端迁移验证（C6）](../2026-10-18-hidden-actions-postgres/README.md) — `2026-10-18-hidden-actions-postgres/README.md`
- [手机主页参考 X 的密度](../2026-10-18-phone-home-x-density/README.md) — `2026-10-18-phone-home-x-density/README.md`
- [预览模板与语义文案键（C3）](../2026-10-18-preview-copy/README.md) — `2026-10-18-preview-copy/README.md`
- [PWA 名称提示补入本地画板](../2026-10-18-pwa-board/README.md) — `2026-10-18-pwa-board/README.md`
- [PWA 触控与外壳检查](../2026-10-18-pwa-touch/README.md) — `2026-10-18-pwa-touch/README.md`
- [样式整理（C4）](../2026-10-18-style-cleanup/README.md) — `2026-10-18-style-cleanup/README.md`
- [Web 类型整理（C5）](../2026-10-18-web-types/README.md) — `2026-10-18-web-types/README.md`
- [卡片操作设置的类型示例（U4.5）](../2026-10-19-card-action-examples/README.md) — `2026-10-19-card-action-examples/README.md`
- [卡片详情核对（U4）](../2026-10-19-card-detail-audit/README.md) — `2026-10-19-card-detail-audit/README.md`
- [云端首次加载的保存状态（C1 补充）](../2026-10-19-cloud-sync-initial-state/README.md) — `2026-10-19-cloud-sync-initial-state/README.md`
- [桌面与手机一致性核对（U5）](../2026-10-19-cross-screen-audit/README.md) — `2026-10-19-cross-screen-audit/README.md`
- [无效代码清理](../2026-10-19-dead-code-cleanup/README.md) — `2026-10-19-dead-code-cleanup/README.md`
- [桌面分栏后的云端位置检查（U5）](../2026-10-19-desktop-filter-cloud-checks/README.md) — `2026-10-19-desktop-filter-cloud-checks/README.md`
- [桌面主页左上紧凑分栏（U5）](../2026-10-19-desktop-home-filters/README.md) — `2026-10-19-desktop-home-filters/README.md`
- [日程专属操作优先级（U4.1）](../2026-10-19-event-action-priority/README.md) — `2026-10-19-event-action-priority/README.md`
- [图标比较：保留原版（U2）](../2026-10-19-icon-choice/README.md) — `2026-10-19-icon-choice/README.md`
- [导航当前项：保留镜片（U3）](../2026-10-19-navigation-choice/README.md) — `2026-10-19-navigation-choice/README.md`
- [搜索、AI、设置与深色现状（U6）](../2026-10-19-page-audit/README.md) — `2026-10-19-page-audit/README.md`
- [照片大图页补通用操作（U4）](../2026-10-19-photo-shared-toolbar/README.md) — `2026-10-19-photo-shared-toolbar/README.md`
- [React 迁移与动效本地整合](../2026-10-19-react-motion-integration/README.md) — `2026-10-19-react-motion-integration/README.md`
- [搜索筛选排布候选（U6）](../2026-10-19-search-filter-proposals/README.md) — `2026-10-19-search-filter-proposals/README.md`
- [搜索筛选按条件分行（U6）](../2026-10-19-search-filter-rows/README.md) — `2026-10-19-search-filter-rows/README.md`
- [Web/PWA 交付与发布检查](../2026-10-19-web-pwa-delivery/README.md) — `2026-10-19-web-pwa-delivery/README.md`
- [macOS 视觉与动效对齐 Web](../2026-10-20-macos-web-alignment/README.md) — `2026-10-20-macos-web-alignment/README.md`
- [动效与流程逐行清单](../2026-10-20-macos-web-alignment/rule-checklist.md) — `2026-10-20-macos-web-alignment/rule-checklist.md`
- [Apple 设计变量增量](../2026-10-20-macos-web-alignment/tokens.md) — `2026-10-20-macos-web-alignment/tokens.md`
- [登录授权与设置画板交接](../2026-10-21-auth-settings-ui/README.md) — `2026-10-21-auth-settings-ui/README.md`
- [设计材料精简与 design-init 工具](../2026-10-21-design-streamlining/README.md) — `2026-10-21-design-streamlining/README.md`
- [Mac 性能工作流验证](../2026-10-21-macos-performance/README.md) — `2026-10-21-macos-performance/README.md`
- [无窗口交互性能基准验证](../2026-10-21-macos-performance/interactions.md) — `2026-10-21-macos-performance/interactions.md`
- [卡片校验规则重复解析的内存排查](../2026-10-21-macos-performance/memory-investigation.md) — `2026-10-21-macos-performance/memory-investigation.md`
- [测试整理](../2026-10-21-test-cleanup/README.md) — `2026-10-21-test-cleanup/README.md`
- [卡片内跳转、详情切换与播客吸顶修复](../2026-10-22-card-interaction-fixes/README.md) — `2026-10-22-card-interaction-fixes/README.md`
- [Mac 卡片补修窗口复验](../2026-10-22-card-macos-follow-up/README.md) — `2026-10-22-card-macos-follow-up/README.md`
- [卡片重建与 Markdown 正文：暂停时的待办](../2026-10-22-card-rebuild-pending/README.md) — `2026-10-22-card-rebuild-pending/README.md`
- [卡片重建设计稿合并与版本标记](../2026-10-22-card-rebuild-release/README.md) — `2026-10-22-card-rebuild-release/README.md`
- [卡片重建：本地界面接入](../2026-10-22-card-rebuild-ui/README.md) — `2026-10-22-card-rebuild-ui/README.md`
- [13 种卡片 UI check 稿](../2026-10-22-card-ui-check/README.md) — `2026-10-22-card-ui-check/README.md`
- [卡片模块源码复核与界面复验](../2026-10-22-card-ui-recheck/README.md) — `2026-10-22-card-ui-recheck/README.md`
- [Markdown 正文修复与两端接入](../2026-10-22-markdown-repair/README.md) — `2026-10-22-markdown-repair/README.md`
- [测试与旧模板清理](../2026-10-22-test-cleanup/README.md) — `2026-10-22-test-cleanup/README.md`
- [真实功能补齐与非界面验证](../2026-10-23-functional-completion/README.md) — `2026-10-23-functional-completion/README.md`
- [排版设置 PR 集成检查](../2026-10-23-layout-pr-integration/README.md) — `2026-10-23-layout-pr-integration/README.md`
- [内容排版偏好浏览器验收](../2026-10-23-layout-preferences-browser/README.md) — `2026-10-23-layout-preferences-browser/README.md`
- [账号密码登录与授权恢复](../2026-10-23-login-completion/README.md) — `2026-10-23-login-completion/README.md`
- [MCP 工作台旧入口恢复](../2026-10-23-mcp-resource-recovery/README.md) — `2026-10-23-mcp-resource-recovery/README.md`
- [近期 PR 与本地修改整合验收](../2026-10-23-pr-integration/README.md) — `2026-10-23-pr-integration/README.md`
- [发布前清空测试数据与数据库准备](../2026-10-23-pre-release-reset/README.md) — `2026-10-23-pre-release-reset/README.md`
- [手机 PWA 打开、抽屉开合与下拉刷新优化](../2026-10-23-pwa-launch-motion/README.md) — `2026-10-23-pwa-launch-motion/README.md`
- [手机 PWA 极端条件检查](../2026-10-23-pwa-stress-audit/README.md) — `2026-10-23-pwa-stress-audit/README.md`
- [手机 PWA 优化](../2026-10-23-pwa-stress-fixes/README.md) — `2026-10-23-pwa-stress-fixes/README.md`
- [登录与 MCP 调试总索引、快速发布流程](../2026-10-23-release-workflow/README.md) — `2026-10-23-release-workflow/README.md`
- [界面备注与无效设置清理](../2026-10-23-ui-copy-cleanup/README.md) — `2026-10-23-ui-copy-cleanup/README.md`
- [Sill 1.2.8 云端发布](../2026-10-24-cloud-release/README.md) — `2026-10-24-cloud-release/README.md`
- [详情开合、滑动与放大的动画和卡顿检查](../2026-10-24-detail-motion-audit/README.md) — `2026-10-24-detail-motion-audit/README.md`
- [手机详情动效修复](../2026-10-24-phone-detail-motion-fixes/README.md) — `2026-10-24-phone-detail-motion-fixes/README.md`
- [播客详情页原型：去掉播放，只做介绍](../2026-10-26-podcast-detail-prototype/README.md) — `2026-10-26-podcast-detail-prototype/README.md`
- [Agent 长期参考核对](../2026-10-27-agent-reference-audit/README.md) — `2026-10-27-agent-reference-audit/README.md`
- [审计问题修复](../2026-10-27-audit-fixes/README.md) — `2026-10-27-audit-fixes/README.md`
- [Codex 动效开发复盘：10 月 25—27 日](../2026-10-27-codex-motion-retro/README.md) — `2026-10-27-codex-motion-retro/README.md`
- [抽屉滚轮与背景恢复研究](../2026-10-27-drawer-wheel-research/README.md) — `2026-10-27-drawer-wheel-research/README.md`
- [删除动画工作台](../2026-10-27-motion-workbench-removal/README.md) — `2026-10-27-motion-workbench-removal/README.md`
- [滚动与动量设计专项：问题记录日志](../2026-10-27-scroll-momentum/README.md) — `2026-10-27-scroll-momentum/README.md`
- [测试重复断言与说明清理](../2026-10-27-test-cleanup/README.md) — `2026-10-27-test-cleanup/README.md`
- [测试精简与等待优化](../2026-10-27-test-reduction/README.md) — `2026-10-27-test-reduction/README.md`
- [过渡测试与迁移重复检查清理](../2026-10-27-transition-test-cleanup/README.md) — `2026-10-27-transition-test-cleanup/README.md`
- [Web 发布准备](../2026-10-27-web-release-preparation/README.md) — `2026-10-27-web-release-preparation/README.md`
- [Cloudflare 旧部署与版本清理](../2026-10-28-cloud-version-cleanup/README.md) — `2026-10-28-cloud-version-cleanup/README.md`
- [Mac 用户反馈修复](../2026-10-28-macos-feedback-fixes/README.md) — `2026-10-28-macos-feedback-fixes/README.md`
- [动效验证清单](../2026-10-28-macos-feedback-fixes/animation-checklist.md) — `2026-10-28-macos-feedback-fixes/animation-checklist.md`
- [功能验证清单](../2026-10-28-macos-feedback-fixes/function-checklist.md) — `2026-10-28-macos-feedback-fixes/function-checklist.md`
- [合并前文件拆分](../2026-10-28-macos-merge-file-split/README.md) — `2026-10-28-macos-merge-file-split/README.md`
- [Mac逐步对齐：输入栏与信息流位置](../2026-10-28-macos-navigation-alignment/README.md) — `2026-10-28-macos-navigation-alignment/README.md`
- [Web与Mac逐项对齐核对](../2026-10-28-macos-parity-audit/README.md) — `2026-10-28-macos-parity-audit/README.md`
- [Web ↔ Mac 动效验证清单](../2026-10-28-macos-parity-audit/animation-checklist.md) — `2026-10-28-macos-parity-audit/animation-checklist.md`
- [Web ↔ Mac 功能验证清单](../2026-10-28-macos-parity-audit/function-checklist.md) — `2026-10-28-macos-parity-audit/function-checklist.md`
- [Mac 全量对齐实施](../2026-10-28-macos-parity-implementation/README.md) — `2026-10-28-macos-parity-implementation/README.md`
- [动效补齐状态](../2026-10-28-macos-parity-implementation/animation-status.md) — `2026-10-28-macos-parity-implementation/animation-status.md`
- [功能补齐状态](../2026-10-28-macos-parity-implementation/function-status.md) — `2026-10-28-macos-parity-implementation/function-status.md`
- [Web 改动分析与 Mac 适配](../2026-10-28-macos-web-adaptation/README.md) — `2026-10-28-macos-web-adaptation/README.md`
- [Web 云端发布](../2026-10-28-web-cloud-release/README.md) — `2026-10-28-web-cloud-release/README.md`
- [卡片状态闪屏与网站图标发布](../2026-10-29-card-state-flash-release/README.md) — `2026-10-29-card-state-flash-release/README.md`
- [文档前三层整理](README.md) — `2026-10-29-doc-layers/README.md`
- [外部执行方案与技术候选的原始依据](agent-plan-context.md) — `2026-10-29-doc-layers/agent-plan-context.md`
- [卡片检查与补修历史](card-history.md) — `2026-10-29-doc-layers/card-history.md`
- [既有目录迁移记录](migration-history.md) — `2026-10-29-doc-layers/migration-history.md`
- [插件连接与验收历史](plugin-history.md) — `2026-10-29-doc-layers/plugin-history.md`
- [跨端实施与检查历史](ui-history.md) — `2026-10-29-doc-layers/ui-history.md`

## 旧归档

旧规范不再迁建备份目录。先检查独有事实与有效要求，再决定并入现行正文、保存独有证据或经确认退出工作目录。历史测试报告与重复规范分别处理。

| 当前文件 | 类型 | 建议处理 |
| --- | --- | --- |
| [Restricted external-agent access](https://github.com/dabaige53/sill/blob/d0ec15609d9485bacab1acdb568dd6097036526d/docs/archive/AGENT-ACCESS.md)<br>`docs/archive/AGENT-ACCESS.md` | 失效规范 | 核对独有内容；重复旧版交由 Git 保存，不另建备份。 |
| [F05：可选独立 AI 回答](https://github.com/dabaige53/sill/blob/d0ec15609d9485bacab1acdb568dd6097036526d/docs/archive/AI-PROVIDER.md)<br>`docs/archive/AI-PROVIDER.md` | 失效规范 | 核对独有内容；重复旧版交由 Git 保存，不另建备份。 |
| [卡片体验优化 · V0.3](../2026-10-11-design-notes/card-refinement.md)<br>`docs/archive/CARD-REFINEMENT.md` | 失效规范 | 核对独有内容；重复旧版交由 Git 保存，不另建备份。 |
| [Content and settings backups v1](https://github.com/dabaige53/sill/blob/d0ec15609d9485bacab1acdb568dd6097036526d/docs/archive/CONTENT-BACKUPS.md)<br>`docs/archive/CONTENT-BACKUPS.md` | 失效规范 | 核对独有内容；重复旧版交由 Git 保存，不另建备份。 |
| [F04：独立网页对话历史与恢复](https://github.com/dabaige53/sill/blob/d0ec15609d9485bacab1acdb568dd6097036526d/docs/archive/CONVERSATIONS.md)<br>`docs/archive/CONVERSATIONS.md` | 失效规范 | 核对独有内容；重复旧版交由 Git 保存，不另建备份。 |
| [V0.5 · Apple 方向的主题与卡片修订](../2026-10-11-design-notes/design-review-v05.md)<br>`docs/archive/DESIGN-REVIEW-V05.md` | 失效规范 | 核对独有内容；重复旧版交由 Git 保存，不另建备份。 |
| [文件管理规范](https://github.com/dabaige53/sill/blob/d0ec15609d9485bacab1acdb568dd6097036526d/docs/archive/FILE-MANAGEMENT.md)<br>`docs/archive/FILE-MANAGEMENT.md` | 失效规范 | 核对独有内容；重复旧版交由 Git 保存，不另建备份。 |
| [F03：宿主卡片上下文](https://github.com/dabaige53/sill/blob/d0ec15609d9485bacab1acdb568dd6097036526d/docs/archive/HOST-APP.md)<br>`docs/archive/HOST-APP.md` | 失效规范 | 核对独有内容；重复旧版交由 Git 保存，不另建备份。 |
| [F06：宿主协助跨应用来源与归因](https://github.com/dabaige53/sill/blob/d0ec15609d9485bacab1acdb568dd6097036526d/docs/archive/HOST-PROVENANCE.md)<br>`docs/archive/HOST-PROVENANCE.md` | 失效规范 | 核对独有内容；重复旧版交由 Git 保存，不另建备份。 |
| [本地笔记与卡片备注](https://github.com/dabaige53/sill/blob/d0ec15609d9485bacab1acdb568dd6097036526d/docs/archive/LOCAL-CONTENT.md)<br>`docs/archive/LOCAL-CONTENT.md` | 失效规范 | 核对独有内容；重复旧版交由 Git 保存，不另建备份。 |
| [Explicit recommendation preferences](https://github.com/dabaige53/sill/blob/d0ec15609d9485bacab1acdb568dd6097036526d/docs/archive/RECOMMENDATION-PREFERENCES.md)<br>`docs/archive/RECOMMENDATION-PREFERENCES.md` | 失效规范 | 核对独有内容；重复旧版交由 Git 保存，不另建备份。 |
| [Registered local jobs](https://github.com/dabaige53/sill/blob/d0ec15609d9485bacab1acdb568dd6097036526d/docs/archive/REGISTERED-JOBS.md)<br>`docs/archive/REGISTERED-JOBS.md` | 失效规范 | 核对独有内容；重复旧版交由 Git 保存，不另建备份。 |
| [Registered WebAssembly scripts v1](https://github.com/dabaige53/sill/blob/d0ec15609d9485bacab1acdb568dd6097036526d/docs/archive/REGISTERED-WASM.md)<br>`docs/archive/REGISTERED-WASM.md` | 失效规范 | 核对独有内容；重复旧版交由 Git 保存，不另建备份。 |
| [普通设置：同一份状态，多个入口](https://github.com/dabaige53/sill/blob/d0ec15609d9485bacab1acdb568dd6097036526d/docs/archive/SETTINGS.md)<br>`docs/archive/SETTINGS.md` | 失效规范 | 核对独有内容；重复旧版交由 Git 保存，不另建备份。 |
| [动画工作台](../2026-10-26-motion-library/README.md)<br>`docs/archive/motion-library.md` | 旧说明与盘点证据混合 | 核对独有盘点证据后归对应记录。 |
| [F07 restricted-agent verification](../2026-10-29-legacy-test-records/AGENT-ACCESS-REPORT.md)<br>`docs/archive/test-reports/AGENT-ACCESS-REPORT.md` | 历史测试报告 | 保留原始检查结果，待确认归入 records。 |
| [F05 验证记录](../2026-10-29-legacy-test-records/AI-PROVIDER-REPORT.md)<br>`docs/archive/test-reports/AI-PROVIDER-REPORT.md` | 历史测试报告 | 保留原始检查结果，待确认归入 records。 |
| [F11 content/settings backup verification](../2026-10-29-legacy-test-records/CONTENT-BACKUPS-REPORT.md)<br>`docs/archive/test-reports/CONTENT-BACKUPS-REPORT.md` | 历史测试报告 | 保留原始检查结果，待确认归入 records。 |
| [F04 对话持久化验收](../2026-10-29-legacy-test-records/CONVERSATIONS-REPORT.md)<br>`docs/archive/test-reports/CONVERSATIONS-REPORT.md` | 历史测试报告 | 保留原始检查结果，待确认归入 records。 |
| [F03 宿主卡片上下文验证](../2026-10-29-legacy-test-records/HOST-APP-REPORT.md)<br>`docs/archive/test-reports/HOST-APP-REPORT.md` | 历史测试报告 | 保留原始检查结果，待确认归入 records。 |
| [F06 验证记录](../2026-10-29-legacy-test-records/HOST-PROVENANCE-REPORT.md)<br>`docs/archive/test-reports/HOST-PROVENANCE-REPORT.md` | 历史测试报告 | 保留原始检查结果，待确认归入 records。 |
| [V0.2 集成验证](../2026-10-29-legacy-test-records/INTEGRATION-REPORT.md)<br>`docs/archive/test-reports/INTEGRATION-REPORT.md` | 历史测试报告 | 保留原始检查结果，待确认归入 records。 |
| [F02 本地内容验证记录](../2026-10-29-legacy-test-records/LOCAL-CONTENT-REPORT.md)<br>`docs/archive/test-reports/LOCAL-CONTENT-REPORT.md` | 历史测试报告 | 保留原始检查结果，待确认归入 records。 |
| [F08 verification](../2026-10-29-legacy-test-records/RECOMMENDATION-PREFERENCES-REPORT.md)<br>`docs/archive/test-reports/RECOMMENDATION-PREFERENCES-REPORT.md` | 历史测试报告 | 保留原始检查结果，待确认归入 records。 |
| [F09 registered jobs verification](../2026-10-29-legacy-test-records/REGISTERED-JOBS-REPORT.md)<br>`docs/archive/test-reports/REGISTERED-JOBS-REPORT.md` | 历史测试报告 | 保留原始检查结果，待确认归入 records。 |
| [F10 registered WebAssembly v1 verification](../2026-10-29-legacy-test-records/REGISTERED-WASM-REPORT.md)<br>`docs/archive/test-reports/REGISTERED-WASM-REPORT.md` | 历史测试报告 | 保留原始检查结果，待确认归入 records。 |
| [Sill · 交互验收报告](../2026-10-29-legacy-test-records/REPORT-v0.1.md)<br>`docs/archive/test-reports/REPORT-v0.1.md` | 历史测试报告 | 保留原始检查结果，待确认归入 records。 |
| [Sill · 验证记录](../2026-10-29-legacy-test-records/REPORT.md)<br>`docs/archive/test-reports/REPORT.md` | 历史测试报告 | 保留原始检查结果，待确认归入 records。 |
| [普通设置验收（2026-10-11）](../2026-10-29-legacy-test-records/SETTINGS-REPORT.md)<br>`docs/archive/test-reports/SETTINGS-REPORT.md` | 历史测试报告 | 保留原始检查结果，待确认归入 records。 |
