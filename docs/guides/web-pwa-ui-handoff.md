# Web 与 PWA 界面优化交接

更新：2026-10-19。

本文交给接手的 agent。它说明 2026-10-18 已定稿的手机主页（[ADR 0036](../adr/0036-phone-home-density.md)）和卡片详情（[ADR 0037](../adr/0037-card-detail-toolbar.md)）做到了哪里、还缺什么，以及怎样把 Web 本地页面和云端 PWA 的界面与代码做完整。文末附可直接使用的提示词。

范围：`apps/web/`（本地页面与云端页面共用）、云端 PWA 的安装与外壳、相关测试与设计文档。不包括 Mac、iOS 原生端，不包括服务端新功能、Webhook、内置助手和外部来源。

本轮按用户指定的仓库模式执行：只读取和修改仓库内设计文件；不访问、读取或发布 claude.ai Artifact，不使用 claude.ai 独有工具或 Mobbin 连接器。设计参考改用 3–6 个公开可访问的产品页面，或用户提供的截图。先更新仓库原则、ADR、手册与组件说明，再改实现和实际页面画板。`design-system/design-system.json` 的线上资产记录保持不变；PR 的 Merge Danger 列出线上未同步文件，由用户另行处理。下文历史记录中的线上操作只说明当时发生的事。

## 1. 开工前必读

按顺序读，读完再动手：

1. [AGENTS.md](../../AGENTS.md)：产品约束。重点：Agent 优先，数据与状态操作要能通过 MCP 完成；保留既有轻操作；不接入外部来源；不新增复杂人工编辑器；不把本地打勾说成外部完成。
2. [DESIGN.md](../agents/design.md) 和 [设计手册](../../design-system/README.md)：设计规则以手册为准。手册中与本次相关的章节：「手机主页」「预览与叠放」「图标」「底部导航与反馈」「动效」。
3. [ADR 0032](../adr/0032-design-online-first.md) 和 AGENTS.md「设计」一节。**本交接的工作一律只在仓库内进行，不使用任何 claude.ai 独有的工具**：不打开、不读取、不发布线上 Design System 和设计画布（claude.ai Artifact），不使用 claude.ai 的连接器（例如 Mobbin 连接器）。按 AGENTS.md 的仓库内规则：先更新仓库里的原则和规范（ADR、`design-system/README.md`、组件说明、`design-system/boards/`），再改实现。线上与仓库因此产生的差异，写进每个 PR 的 Merge Danger，由用户另行同步。
4. [ADR 0036](../adr/0036-phone-home-density.md)、[ADR 0037](../adr/0037-card-detail-toolbar.md) 和两份讨论记录：[手机主页](../records/2026-10-18-phone-home-x-density/README.md)、[卡片详情](../records/2026-10-18-card-detail-capsule/README.md)。记录里有被否决的方案和原因，不要重新提出已否决的方案。
5. [代码规范](../agents/code-standards.md)、[文件管理规范](../agents/file-management.md)、[PR 编写指南](../agents/pr.md)。
6. 设计画布 36 号历史画板 `design-system/history/MobileHome.dc.html`、37 号画板 `design-system/boards/CardDetail.dc.html`：定稿截图来自实际页面。

仓库内的设计来源（以这些文件为准，不访问线上）：

| 名称 | 位置 |
| --- | --- |
| 设计手册 | `design-system/README.md` |
| 组件说明与组件包 | `design-system/components/` |
| 图标 | `apps/web/atoms/icons.ts`（来源）、`design-system/assets/Icons/`（生成） |
| 设计变量 | `design-system/tokens.json`、`apps/web/styles/tokens.css` |
| 画板 | `design-system/boards/*.dc.html` 与图片目录，索引 `design-system/boards/index.html`、`canvas.json` |

## 2. 当前状态

### 2.1 分支与合并顺序

| PR | 分支 | 内容 | 基于 |
| --- | --- | --- | --- |
| [#45](https://github.com/dabaige53/sill/pull/45) | `claude/phone-home-x-density` | 手机主页（ADR 0036） | `main` |
| [#46](https://github.com/dabaige53/sill/pull/46) | `claude/phone-detail-capsule` | 卡片详情胶囊与线条积木图标（ADR 0037） | #45 |
| 本文所在 PR | `claude/web-pwa-ui-handoff` | 本交接文档 | #46 |

合并顺序：#45 → #46 → 本文。三个 PR 合并前，新工作从本文所在分支开始；合并后从 `main` 开始。

### 2.2 已经完成

**手机主页（≤650px，ADR 0036）**

- 卡片收紧：页边距 8、间距 6、圆角 16、内边距 14，摘要 2 行。文章用右侧 76 见方缩略图；视频和照片用 2:1 大图。
- 日程时间在左侧一列；「加入」和参与者同一行。待办每项 28 高，不写「另有 N 项」。
- 提醒卡头部写「提醒 · 来源」和来源时间（到点 `alert`）；卡上没有按钮，圆圈就是完成，只改 Sill。
- 顶栏：Sill 标志（点它回到顶部）和「全部 / 未读 / 待办 / 稍后读 / 收藏」；往下滑时顶栏和底部胶囊一起收起。
- 新内容提示在顶部：「↑ N 项新内容」，最多三个来源类型图标，白色玻璃。
- `sill`、`mail`、`video`、`folder` 图标更方正。

**卡片详情（所有宽度，ADR 0037）**

- 打开方式不变：手机是从下往上的抽屉，桌面是淡入的预览。
- 操作都在底部玻璃胶囊里，只用图标：左边收藏、标签、稍后读（`ink`），竖线后是这张卡片自己的操作，最多 3 个（`accent`，`.is-own`）。
- 长按显示名称（`toolbarTips`，0.45 秒），这次按下不执行；鼠标悬停 0.5 秒显示。
- 提醒的完成是标题前的圆圈（`reminderMark`，卡面和详情共用）。
- 关闭圆钮与来源行对齐；没有值的日期不显示，日期和来源备注一行。
- 手机上正文到胶囊 26px，胶囊到底边 `max(8px, 安全区)`。
- 设置「桌面」页的「卡片操作」开关，偏好 `hiddenActions`（`contracts/card-actions.ts`、`contracts/local.ts`、MCP 说明、云端迁移 `supabase/migrations/20261019031622_sill_hidden_card_actions.sql`）。
- 九个图标按「线条积木」重画：`bookmark`、`tag`、`glasses`、`reply`、`external`、`snooze`、`bell-off`、`video`、`download`。

### 2.3 主要代码位置

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `apps/web/data/store.ts` | 352 | 卡片与个人状态、偏好、浏览器备份；类型复用契约 |
| `apps/web/views/app.ts` | 2803 | AppController：路由、渲染、动作分发入口、刷新；设置与预览已拆分 |
| `apps/web/interactions/panels.ts` | 490 | 弹层模板入口、阅读、设置、搜索、菜单；`previews.ts` 按卡片类型生成预览 |
| `apps/web/interactions/gestures.ts` | 1072 | 抽屉跟手、下拉关闭、下拉刷新、长按选择 |
| `apps/web/interactions/chrome.ts` | 156 | 工具条随滚动收起（ChromeAutoHide）、胶囊长按名称（toolbarTips） |
| `apps/web/cards/templates.ts` | 283 | 信息流卡片模板 |
| `apps/web/atoms/icons.ts` | — | 所有图标路径；`design-system/assets/Icons/` 由它生成 |
| `apps/web/styles/overlays.css` | 2014 | 弹层、抽屉、预览、设置 |
| `apps/web/styles/responsive.css` | 892 | 手机规则在一个 650px 区块中，按区域排序；保留 ADR 0036 注释 |
| `apps/web/styles/controls.css` | 811 | 按钮、胶囊、导航、toast、`.toolbar-sep`、`.is-own`、名称提示 |
| `apps/web/styles/cards.css` | 955 | 卡片、勾选圈、提醒圆圈 |
| `apps/web/styles/tokens.css` | — | CSS 变量；与 `design-system/tokens.json` 对应 |
| `design-system/copy/zh-Hans.json` | — | 所有界面文案；新键用语义名（如 `web.actions.reply`） |
| `deploy/web-manifest.json`、`apps/web/index.html` | — | PWA manifest 与页面外壳 |

## 3. 工作包

按编号顺序做。每个工作包单独一个 PR，叠在前一个上或在合并后从 `main` 开始。标「需用户确认」的项目，先出效果图和选项，等用户选定，再写代码。

界面工作包见 [U1–U6](web-pwa-ui-packages.md)；代码工作包见 [C1–C6](web-pwa-code-packages.md)。

## 4. 工作方式

- 一次只做一个工作包。设计类工作包先讨论，再改仓库里的原则和规范，再改代码。
- 效果图：在真实页面上用 Playwright 叠加临时样式截图。环境已预装 Chromium 时用它的路径（`executablePath`），不要重复下载浏览器。效果图放 `docs/records/<日期>-<主题>/`，单个文件不超过 2 MB。
- 本地页面：`npm run build` 后 `npm start`，端口 4318。云端页面：`npm run build:cloud`。
- 不使用 claude.ai 独有的工具：不读、不发布线上 Design System 和设计画布，不调用 claude.ai 连接器，不创建 claude.ai Artifact。画板只改仓库里的 `design-system/boards/`。每个改了设计的 PR，在 Merge Danger 里列出「线上未同步」的文件，由用户另行处理。
- 仓库交付：先改 ADR、手册和组件说明，再改实现并生成组件包与图标；实际截图写入 `design-system/boards/`，同时更新本地 `index.html` 与 `canvas.json`。线上资产记录不改；未同步文件逐项写入 PR 的 Merge Danger，由用户另行处理。
- 文案：所有用户可见文字放 `design-system/copy/zh-Hans.json`；文档用 80% ASD-STE100 风格的简体中文。
- 交付前运行 `npm run files:check` 和 `npm test`；按改动运行相关浏览器测试（见 [tests/README.md](../../tests/README.md)）。

## 5. 不做的事

- 不重新提出已否决的方案：卡片原地放大的详情、黑色主操作胶囊、「⋯」更多菜单、图标加文字、改成通栏列表、通栏标签栏。
- 不在正文里加回色块按钮。
- 不接入外部来源，不新增复杂人工编辑器，不把 API 字段做成表单。
- 不把 Sill 内的完成、延后说成来源里已完成或已改时间。
- 不跳过、不禁用、不放宽测试来变绿；不用空提交触发 CI。
- 不改 Mac、iOS 原生代码；需要时另开事项。
- 不提交 token、真实账号内容或浏览器存储。

## 6. 验收清单

每个 PR 至少写明：

- `npm test` 的结果（三组测试的通过数）。
- 相关浏览器测试的结果；失败项注明是否在基础提交上同样失败。
- 界面改动：改前、改后截图（390、320、1440，浅色和深色按需）。
- 真机：设备与系统版本；没有真机就写「未检查」。
- 仓库内的设计文件（手册、组件说明、画板、图标）是否已更新；Merge Danger 里列出线上未同步的文件。
- 线上未同步的仓库文件清单；本轮不读取线上，不能声称当前两边一致。

## 7. 提示词

见[接手提示词](web-pwa-agent-prompts.md)。
