# Web 与 PWA 界面优化交接

更新：2026-10-18。

本文交给接手的 agent。它说明 2026-10-18 已定稿的手机主页（[ADR 0036](../adr/0036-phone-home-density.md)）和卡片详情（[ADR 0037](../adr/0037-card-detail-toolbar.md)）做到了哪里、还缺什么，以及怎样把 Web 本地页面和云端 PWA 的界面与代码做完整。文末附可直接使用的提示词。

范围：`apps/web/`（本地页面与云端页面共用）、云端 PWA 的安装与外壳、相关测试与设计文档。不包括 Mac、iOS 原生端，不包括服务端新功能、Webhook、内置助手和外部来源。

本轮按用户指定的仓库模式执行：只读取和修改仓库内设计文件；不访问、读取或发布 claude.ai Artifact，不使用 claude.ai 独有工具或 Mobbin 连接器。设计参考改用 3–6 个公开可访问的产品页面，或用户提供的截图。先更新仓库原则、ADR、手册与组件说明，再改实现和实际页面画板。`design-system/design-system.json` 的线上资产记录保持不变；PR 的 Merge Danger 列出线上未同步文件，由用户另行处理。下文历史记录中的线上操作只说明当时发生的事。

## 1. 开工前必读

按顺序读，读完再动手：

1. [AGENTS.md](../../AGENTS.md)：产品约束。重点：Agent 优先，数据与状态操作要能通过 MCP 完成；保留既有轻操作；不接入外部来源；不新增复杂人工编辑器；不把本地打勾说成外部完成。
2. [DESIGN.md](../../DESIGN.md) 和 [设计手册](../../design-system/README.md)：设计规则以手册为准。手册中与本次相关的章节：「手机主页」「预览与叠放」「图标」「底部导航与反馈」「动效」。
3. [ADR 0032](../adr/0032-design-online-first.md) 和 AGENTS.md「设计」一节。**本交接的工作一律只在仓库内进行，不使用任何 claude.ai 独有的工具**：不打开、不读取、不发布线上 Design System 和设计画布（claude.ai Artifact），不使用 claude.ai 的连接器（例如 Mobbin 连接器）。按 AGENTS.md 的仓库内规则：先更新仓库里的原则和规范（ADR、`design-system/README.md`、组件说明、`design-system/boards/`），再改实现。线上与仓库因此产生的差异，写进每个 PR 的 Merge Danger，由用户另行同步。
4. [ADR 0036](../adr/0036-phone-home-density.md)、[ADR 0037](../adr/0037-card-detail-toolbar.md) 和两份讨论记录：[手机主页](../records/2026-10-18-phone-home-x-density/README.md)、[卡片详情](../records/2026-10-18-card-detail-capsule/README.md)。记录里有被否决的方案和原因，不要重新提出已否决的方案。
5. [代码规范](code-standards.md)、[文件管理规范](file-management.md)、[PR 编写指南](../../pr.md)。
6. 设计画布 36 号画板 `design-system/boards/MobileHome.dc.html`、37 号画板 `design-system/boards/CardDetail.dc.html`：定稿截图来自实际页面。

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
- 设置「桌面」页的「卡片操作」开关，偏好 `hiddenActions`（`contracts/card-actions.ts`、`contracts/local.ts`、MCP 说明、云端迁移 `supabase/migrations/20261018060000_sill_hidden_card_actions.sql`）。
- 九个图标按「线条积木」重画：`bookmark`、`tag`、`glasses`、`reply`、`external`、`snooze`、`bell-off`、`video`、`download`。

### 2.3 主要代码位置

| 文件 | 行数 | 职责 |
| --- | --- | --- |
| `apps/web/views/app.ts` | 2716 | AppController：路由、渲染、动作分发入口、刷新；设置与预览已拆分 |
| `apps/web/interactions/panels.ts` | 424 | 弹层模板入口、阅读、设置、搜索、菜单；`panels/` 下按卡片类型生成预览 |
| `apps/web/interactions/gestures.ts` | 1072 | 抽屉跟手、下拉关闭、下拉刷新、长按选择 |
| `apps/web/interactions/chrome.ts` | 156 | 工具条随滚动收起（ChromeAutoHide）、胶囊长按名称（toolbarTips） |
| `apps/web/cards/templates.ts` | 283 | 信息流卡片模板 |
| `apps/web/atoms/icons.ts` | — | 所有图标路径；`design-system/assets/Icons/` 由它生成 |
| `apps/web/styles/overlays.css` | 2004 | 弹层、抽屉、预览、设置 |
| `apps/web/styles/responsive.css` | 892 | 手机规则在一个 650px 区块中，按区域排序；保留 ADR 0036 注释 |
| `apps/web/styles/controls.css` | 811 | 按钮、胶囊、导航、toast、`.toolbar-sep`、`.is-own`、名称提示 |
| `apps/web/styles/cards.css` | 955 | 卡片、勾选圈、提醒圆圈 |
| `apps/web/styles/tokens.css` | — | CSS 变量；与 `design-system/tokens.json` 对应 |
| `design-system/copy/zh-Hans.json` | — | 所有界面文案；新键用语义名（如 `web.actions.reply`） |
| `deploy/web-manifest.json`、`apps/web/shell.html` | — | PWA manifest 与页面外壳 |

## 3. 工作包

按编号顺序做。每个工作包单独一个 PR，叠在前一个上或在合并后从 `main` 开始。标「需用户确认」的项目，先出效果图和选项，等用户选定，再写代码。

### U1 PWA 触控与外壳（不需要新的设计决定）

2026-10-18 执行状态：U1 已提交 [PR #49](https://github.com/dabaige53/sill/pull/49) 审阅，U1.1–U1.4 实施与本地检查完成，见 [检查记录与前后截图](../records/2026-10-18-pwa-touch/README.md)。专项浏览器 10/10、无障碍 13/13、抽屉 11/11；Node 三组 36 / 169 / 91，失败 0。Web lint 0 错误、902 警告；文案键 826 个（哈希键 601 个，其中 panels 110 个），图标 69 个。线上手册已先更新并同步；生成的组件 CSS 尚未发布到线上，37 号画板尚未补本次提示截图，两项须在 PR 的 Merge Danger 说明。U1.5 已核对原资产并保留：本机 Chromium 无 manifest 解析或安装错误，品牌绘法是否统一留到 U2，不擅自补安装图标。U1.6 真机未检查。

| 编号 | 问题 | 做法 | 验收 |
| --- | --- | --- | --- |
| U1.1 | 详情胶囊的图标按钮没有禁止 iOS 长按菜单和放大镜。`-webkit-touch-callout: none` 只加在卡片上（`cards.css`）。长按名称在 iOS Safari 上可能被系统菜单或文字选择打断。 | 给 `.float-bar .icon-button`（以及 `#dock` 按钮，如果也缺）加 `-webkit-touch-callout: none; user-select: none; -webkit-user-select: none`。 | 真实 iPhone：长按胶囊图标只显示名称，不出系统菜单，松手不执行。 |
| U1.2 | 名称提示只对触屏和鼠标有效。键盘用户聚焦图标时看不到名称。 | `:focus-visible` 时也显示名称提示（同一个 `::after`）；减少动态效果时不做位移。 | `npm run test:accessibility` 通过；新增一个键盘聚焦显示名称的浏览器测试。 |
| U1.3 | 名称提示固定在图标正上方居中，胶囊最左、最右的图标在 320px 宽时可能超出屏幕。 | 测量后靠边对齐（左端图标左对齐、右端右对齐），不用 JS 定位能解决就不用。 | 320、390 宽截图：提示完整可见。 |
| U1.4 | 页面只有一个浅色 `theme-color`（`#f5f5f7`）：`apps/web/shell.html`、云端构建时 `scripts/build.ts` 写入的安装元数据、`server/cloud/login-page.ts`。深色模式下状态栏区域可能是浅色。 | 三处都加 `media="(prefers-color-scheme: dark)"` 的第二个 `theme-color`，值取 `tokens.css` 深色 `--canvas`（`#111113`）。manifest 的 `theme_color` 不支持媒体查询，保持不变。 | 深色模式下从主屏幕启动，状态栏区域与页面底色一致。 |
| U1.5 | manifest 只有一个 256px 图标。`assets/sill-line*.svg` 在 #45 已改成新标志，PNG 图标是否同步未核对。 | 核对 `assets/sill-icon.png` 与新标志一致；如需补 192、512 尺寸和 `maskable`，先问用户是否改品牌资产。 | Chrome DevTools Application 面板没有 manifest 警告。 |
| U1.6 | 手机主页顶栏、底部胶囊、详情胶囊都依赖安全区。自动测试只模拟了 390×844。 | 按 [apps/web/README.md](../../apps/web/README.md)「发布后设备验收」在真实 iPhone 上检查：冷启动、详情、搜索键盘、横竖屏、底部安全区、长按名称。 | 在 PR 的 Evidence 里写明设备、系统版本和截图；没有真机就写「未检查」。 |

### U2 剩余图标统一为线条积木（需用户确认）

- 规则在手册「图标」一节：圆角方块（2–2.5px 圆角）、地平线（窗台）、「窗」短线；线宽档位不变。
- 已完成 9 个，`design-system/assets/Icons/` 共 69 个。剩余约 60 个按同一规则重画。
- 做法：先出 1 张对照图（现在 / 改后，16、20、24px，浅色和深色），一次给用户看全部；用户逐个确认后再改 `apps/web/atoms/icons.ts`。
- 先更新仓库内 ADR、手册和组件说明，再改实现。运行 `node design-system/scripts/generate.ts design-system .` 生成图标和组件包；更新本地画板、`index.html` 和 `canvas.json`。不改 `design-system.json` 的线上资产记录；在 Merge Danger 列出线上未同步文件。
- 图标是全局的，信息流、多选菜单、设置都会变化；在 PR 的 Merge Danger 里写清楚。

### U3 底部导航胶囊的图标（需用户确认）

讨论中断时的状态：

- 用户已决定保留居中的玻璃胶囊（ADR 0035），不改成通栏标签栏。
- 未决定：当前一格怎么表示。现在是灰色圆底（镜片）。讨论中提过的参考：Shop 的「当前一格实心图标、无底色」、X 的「实心 / 线条切换」。
- 未决定：四个图标（主页、搜索、AI、设置）是否按线条积木重画；AI 的对话气泡是否换成更明确的图标；设置格已用 `sill` 标志（用户已同意顶栏标志和设置格用同一个图标）。
- 做法：出 2–3 套效果图（真实页面上叠临时样式截图），连同 3–6 个公开产品参考链接给用户选；定稿后先更新仓库 ADR、手册和组件说明，再改代码，并更新本地 35 号画板或新增画板。

### U4 卡片详情的遗留项

| 编号 | 问题 | 做法 |
| --- | --- | --- |
| U4.1 | 日程有 4 个自己的操作时按顺序截断，会议快开始时「忽略此提醒」不显示。 | 先问用户：保持截断，还是快开始时把「下载日程」让出位置。 |
| U4.2 | 邮件只放一个「回复」，因为「回复」和「打开原邮件」是同一个动作（打开 `c.url`）。 | 如果以后卡片有单独的回复链接（如 `mailto:` 或来源提供的回复地址），再拆成两个；拆之前要有契约字段。 |
| U4.3 | 照片大图页（`Panels.lightbox`）和播客播放器没有按「通用｜专属」检查过。 | 对照 ADR 0037 检查；不一致时出截图给用户确认。 |
| U4.4 | 全屏阅读页（`Panels.reader`）已用同一个胶囊，但阅读页顶部的玻璃按钮组仍是旧样式。 | 只核对，不主动改；有差异就记录到 U6 一起讨论。 |
| U4.5 | 「卡片操作」设置只有开关，没有说明哪些卡片会受影响。 | 不加复杂编辑器。只在每行右侧加一行灰字示例（如「邮件」「日程」）时也需用户确认。 |

### U5 桌面与手机的一致性

- 手机主页的顶栏和分栏标签只在手机宽度生效；桌面没有。是否给桌面加分栏标签，需用户确认。
- 改任何一端，都要检查另一端同一功能是否用同样的词、状态表达和设计变量角色（AGENTS.md）。
- Mac 原生端不在本文范围，但 [DESIGN.md](../../DESIGN.md) 已列出 ADR 0036、0037 在 Mac 上未核对的项目；改到相同功能时在 PR 里写明「Mac 未改」。

### U6 尚未讨论的页面（需用户确认，先讨论再动手）

用户在 2026-10-18 的讨论里把这些留到以后，一次讨论一个：

1. 搜索页
2. AI 页（目前是本地占位窗，不能假装已连接）
3. 设置页整体
4. 深色模式整体检查

每一项按同一流程：截现状 → 找 3–6 个公开产品参考（用户偏好 X 和 Apple 系的质感）→ 出 2–3 个方案的效果图 → 用户选定 → 写仓库 ADR、手册和组件说明 → 改代码 → 生成组件包与图标 → 更新本地画板截图和索引 → 在 Merge Danger 列线上未同步文件。

### C1 修复已知失败的浏览器测试（代码，不需要设计决定）

2026-10-18 执行状态：C1 已提交 [PR #48](https://github.com/dabaige53/sill/pull/48) 审阅，本地检查通过；最新 CI 以 PR 为准。见 [检查记录](../records/2026-10-18-browser-regressions/README.md)。下表保留交接时的失败线索；本次抽屉 11/11、基础浏览器 23/23、动效材质 11/11、工作台 1/1、云端欢迎页 2/2、云端 MCP App 1/1，通过用例共 49 项，失败 0。`npm test` 三组通过数为 36 / 168 / 91。Web lint 为 0 错误、902 警告、30 条提示；文案键 826 个（哈希键 601 个，其中 panels 110 个），图标 69 个。本次只改测试，不改变界面或公开接口。

下面这些在 #45 的基础提交上就失败，不是 ADR 0036、0037 引起的。先逐个找根因；不跳过、不禁用、不放宽断言来变绿。

| 测试 | 现象 | 线索 |
| --- | --- | --- |
| `tests/e2e/drawer-browser.ts`「Sill settings icon: dark」 | 图标 `stroke` 与按钮 `color` 不相等。`main` 的 CI 也失败（run 39014449076）。 | 深色下颜色有过渡（`.icon-button` 的 `transition: color`），或 `.account-wrap > .icon` 有单独的颜色规则；先确认读数时过渡是否结束。 |
| `tests/e2e/browser.ts`「Refresh keeps the reading position…」 | refresh moved the reading position。只在本地容器失败，CI 通过。 | 平滑滚动下 50ms 内读到的位置不足 40，触发了直接插入。 |
| `tests/e2e/drawer-browser.ts`「PWA has no maximize button…」 | 第 417 行 `true !== false`。只在本地失败。 | 对照 CI 的 Chromium 版本，确认 `display-mode: standalone` 的模拟方式。 |
| `tests/e2e/motion-material-browser.ts`「Real Tab reaches a completely hidden rail」 | `railHide.hide()` 后马上被 `show()`。#45 上本地失败，CI 通过。 | 页面高度变化后，`scrollTo(600)` 落在离底部 24px 以内，触发了「到底就显示」。测试不应依赖页面高度。 |
| `tests/e2e/workspace-polish-browser.ts` | 第 141 行 `source` 为 undefined。`main` 本地同样失败。 | 本地 API 返回的来源列表与测试预期不同；先看测试数据如何准备。 |
| `tests/e2e/cloud-welcome-browser.ts` | 本地第 243 行 `scrollY > 0` 失败（`main` 本地同样）；CI 通过。 | 本地容器字体或视口差异导致页面不够长。 |

### C2 拆分 AppController（代码）

2026-10-18 执行状态：C2 已实施，提交 [PR #51](https://github.com/dabaige53/sill/pull/51)。主文件 3314 → 2716 行；先补 9 项测试，再分提交移动设置、详情和完整动作 switch，最后独立改为 7 组查表处理。103 个公开方法签名不变，78 个动作名称与 72 段处理逻辑逐项对应；模板、文案、设计变量、样式不变。各代码提交后的 Node 三组均为 36 / 178 / 92；相关浏览器专项去重后 49 项通过，失败 0。Web lint 0 错误、906 警告、30 条提示；文案键 826 个（哈希键 601 个，其中 panels 110 个），图标 69 个。见 [拆分与检查记录](../records/2026-10-18-app-controller/README.md)，最新 CI 以 PR 为准。真机未检查，Mac 未改。

交接时 `apps/web/views/app.ts` 为 3314 行，`action()` 的 `switch` 集中了几乎所有动作；`click()` 负责点击与选择入口。目标：行为不变，文件更小，每块职责清楚。

- 先补测试再拆：对要移动的动作（设置、预览定位、提醒、外链、刷新），确认 `tests/web/` 或 `tests/e2e/` 已覆盖；没有就先补。
- 建议的切分（可以调整，切之前在 PR 里写清楚）：
  - `views/actions/`：按领域分组的动作处理（卡片状态、提醒、设置、外链与交接、筛选）。`click()` 只查表分发。
  - `views/preview-controller.ts`：打开、定位关闭圆钮（`--preview-title-top`）、尺寸观察、叠放。
  - `views/settings-controller.ts`：`setPref`、`repaintSettings`、`action-toggle`。
- 每次只移动一组，移动和改写分两次提交；每次提交后运行 `npm test` 和相关浏览器测试。
- 不改公开的 `window.__app` 接口，浏览器测试依赖它；确需改时同步改测试并在 PR 里说明。

### C3 整理弹层模板与文案键（代码）

2026-10-18 执行状态：C3 已实施，提交 [PR #52](https://github.com/dabaige53/sill/pull/52)。先补 14 项测试，再分提交原样移动与按类型拆分；预览入口 121 → 23 行。110 个 panels 哈希键全部改为语义键，1122 份 HTML 在移动、拆分和替换后均逐字一致。Node 三组 36 / 192 / 92，相关浏览器专项去重后 51 项通过。首次欢迎页因本机缺少默认 Chromium 路径而未启动，基础提交同样失败；指定预装路径后 2/2 通过。Web lint 0 错误、903 警告、30 条提示；文案键 826 个（哈希键 491 个，panels 哈希键 0 个），图标 69 个。见 [检查记录](../records/2026-10-18-preview-copy/README.md)，最新 CI 以 PR 为准。组件 JS 已重建，线上发布未执行；U1 组件 CSS、37 号画板仍待同步。真机未检查，Mac 未改。

- `apps/web/interactions/panels.ts` 用长模板字符串拼 HTML，每种卡片的预览混在 `preview()` 一个函数里。按卡片类型拆成小函数（`mailPreview`、`eventPreview`……），共用 `sheet()`、`tools()`、`own()`。
- `design-system/copy/zh-Hans.json` 交接时有 110 个 panels 哈希键，现已改为语义键（如 `web.preview.cardTools`）。先 `grep` 全仓库（包括 `apps/apple/`、`scripts/`、`tests/`）确认引用，再一次改完；不留旧键。
- 每次改动后对比改前改后的预览 HTML（可以写一个只在本地运行的对比脚本，不提交），确认输出一致。

证据提交后的云端工作台曾在会话过期流程等待保存状态超时；先在 C2 基础提交复跑通过，再回到 C3 复跑通过。根因未定位，未改断言。失败与复跑均保留在检查记录；源码及首份证据提交的 7 项 CI 全绿。

### C4 整理样式（代码）

2026-10-18 执行状态：C4 已实施，提交 [PR #53](https://github.com/dabaige53/sill/pull/53)。先原样移动，再提取现有数值，最后清理规则与优先级。117 条手机规则集中在一个 650px 区块，移动时全部 151 条响应式规则保持原声明；删除 9 条无引用规则，固定颜色增加 22 个变量、内部间距增加 36 个变量，`!important` 33 → 6，仅保留覆盖内联样式的声明并注明来源。新增动画中断检查检出并修复了 3 处本次回归，保持菜单打开时固定卡片、关闭后恢复同一动画，减少动态效果切换时保留淡入。`window.__app` 的 103 个公开方法签名不变。Node 三组 36 / 192 / 92，相关浏览器 112 项通过、失败 0；Web lint 0 错误、875 警告、30 条提示。文案键 826 个（哈希键 491 个，panels 哈希键 0 个），图标 69 个。普通模式 18 张最终截图均零像素差异；系统减少动态效果出现的 1 像素波动也在基础重复截图出现，原始对照均保留。详见 [检查记录](../records/2026-10-18-style-cleanup/README.md)，最新 CI 以 PR 为准。线上未同步：`design-system/README.md`、`design-system/tokens.json`、`design-system/components/bundle.css`；线上资产记录未改。真机、Safari 未检查，Mac 未改。

- 手机规则分散在 `responsive.css` 的多个 `@media (max-width: 650px)` 块里（包括 ADR 0036 一段），合并成一块，按区域排序；保留指向 ADR 的注释。
- 查找不再使用的选择器（例如已删除的 `.reminder-actions` 一类），用 `grep` 确认模板里没有再删。
- 硬编码的颜色、间距改用 `tokens.css` 变量；`!important` 只留在确实需要压过内联样式的地方，并写明原因。
- 每次整理后截 390、320、1440 三个宽度的主页、详情、设置，和改前逐张对比；有差异就说明原因或撤回。

### C5 类型与静态检查（代码）

- `npx biome lint apps/web` 当前约 900 条警告，大多是显式 `any`。按文件逐步收紧：先 `data/store.ts`、`interactions/panels.ts`，再 `views/app.ts`。
- 不为消除警告改行为；不在一次 PR 里改超过三个文件的类型。
- 不把「零错误」写成「零警告」。

### C6 云端迁移验证（代码）

2026-10-18 执行状态：C6 已提交 [PR #50](https://github.com/dabaige53/sill/pull/50) 审阅，已补齐公开 RPC 的迁移前后验证。本机 PGlite 4/4、Node 三组 36 / 169 / 92 通过。云端工作台浏览器本机先后两次通过，后续一次在会话过期流程超时；基础提交也在该流程的另一断言超时，根因未定位。两组云端 CI 浏览器检查通过。实际 Postgres 17.11 在 CI 11/11 通过（含主测试及 10 个子用例），源码提交的 7 项 CI 全绿；最新状态以 PR 为准。本机因没有 Docker 未执行。详情见 [迁移检查记录](../records/2026-10-18-hidden-actions-postgres/README.md)。迁移与产品代码未改，未部署。Web lint 0 错误、902 警告，文案键 826 个（哈希键 601 个，其中 panels 110 个），图标 69 个。

- `supabase/migrations/20261018060000_sill_hidden_card_actions.sql` 交接时尚未在 Postgres 上执行。在有 Docker 的环境运行 `npm run test:supabase:postgres`，并补一个用例：带 `hiddenActions` 的偏好写入成功，带未列出值的写入被拒绝。
- 部署顺序：先部署迁移，再发布网页。迁移部署前，云端会拒绝带 `hiddenActions` 的偏好写入。

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

下面三段可以直接交给接手的 agent。按需替换方括号里的内容。

### 7.1 界面与 PWA（U1–U6）

```text
你在 Sill 仓库（dabaige53/sill）工作。先完整阅读 docs/guides/web-pwa-ui-handoff.md，再按其中「开工前必读」的顺序读 AGENTS.md、DESIGN.md、design-system/README.md、ADR 0032、0036、0037 和两份 2026-10-18 讨论记录。

任务：完成交接文档中的工作包 [U1]（只做这一个）。
- U1 不需要新的设计决定：直接实现，补测试，截 390、320、1440 宽的改前改后图。
- 如果做的是 U2–U6 中标「需用户确认」的项：先截现状，找 3–6 个公开产品参考，出 2–3 个方案的效果图（真实页面叠临时样式截图），一次讨论一个问题，等我选定后再更新仓库 ADR、手册和组件说明，最后改代码及本地画板。
约束：遵守交接文档第 5 节「不做的事」；不使用任何 claude.ai 独有的工具（线上 Design System、设计画布、claude.ai 连接器、Artifact），设计只改仓库内文件，线上未同步的内容写进 Merge Danger；所有文案进 design-system/copy/zh-Hans.json；不改 Mac、iOS 原生代码。
交付：新分支，运行 npm run files:check、npm test 和相关浏览器测试，按 pr.md 和 PR 模板写 PR（Summary / Evidence / Merge Danger）。待完成的检查不写成通过；真机没测就写「未检查」。
```

### 7.2 代码优化（C1–C6）

```text
你在 Sill 仓库（dabaige53/sill）工作。先完整阅读 docs/guides/web-pwa-ui-handoff.md、AGENTS.md、docs/guides/code-standards.md、docs/guides/file-management.md 和 tests/README.md。

任务：完成交接文档中的工作包 [C1]（只做这一个）。目标是行为不变的代码优化，不改界面设计。
- C1：逐个找出列出的浏览器测试失败的根因并修复。先在基础提交上复现，再修，再证明同一测试通过。不跳过、不禁用、不放宽断言。
- C2–C5：先确认测试覆盖，再小步移动；移动和改写分开提交；每次提交后运行 npm test 和相关浏览器测试；改前改后截图对比，界面不能变化。
- C6：在有 Docker 的环境运行 npm run test:supabase:postgres，并为 hiddenActions 补用例。
约束：不改 window.__app 的公开接口（除非同步改测试并说明）；不引入新语言或新依赖（需要时先写 ADR）；不改 Mac、iOS 原生代码。
交付：新分支，按 pr.md 和 PR 模板写 PR。写清楚哪些失败在基础提交上就存在、哪些是本次修复的；警告数量按实际写，不说「零警告」。
```

### 7.3 验收与真机检查

```text
你在 Sill 仓库（dabaige53/sill）工作，只做验收，不改产品代码。先阅读 docs/guides/web-pwa-ui-handoff.md 第 6 节、apps/web/README.md「添加到 iPhone／iPad 主屏幕」一节、ADR 0036 和 ADR 0037。

任务：对 [PR 编号或分支] 做验收。
1. 运行 npm run files:check、npm test，以及 tests/README.md 中与手机主页、卡片详情相关的浏览器测试；记录通过数和失败项，并在基础提交上复跑失败项，判断是否本次引入。
2. 在本地页面截 390、320、1440 宽的主页、各类卡片详情（邮件、文章、视频、日程、提醒、待办）、长按名称、设置「卡片操作」、深色模式，与 design-system/boards/ 里的 36、37 号画板（MobileHome.dc.html、CardDetail.dc.html）逐项对照。
3. 列出与 ADR 0036、0037 和设计手册不一致的地方，每条写：位置、期望、实际、截图。
4. 真机项目（主屏幕冷启动、安全区、长按、键盘）如果没有设备，写「未检查」。
交付：把结果写成 docs/records/<日期>-<主题>/README.md 加截图，按 pr.md 写 PR；不修改实现代码。
```

### 7.4 goal 模式（交给一个长时间自主运行的 agent）

这段把 U1–U6、C1–C6 和验收串成一个目标。agent 会自己排顺序、开分支和写 PR，只在需要用户做设计决定时停下。

```text
# 目标
把 Sill 的 Web 本地页面和云端 PWA 做到「界面与代码都完整」：完成 docs/guides/web-pwa-ui-handoff.md 中的全部工作包（U1–U6、C1–C6），每个工作包都以一个通过检查、证据齐全的 PR 结束。需要用户做设计决定的地方，准备好选项后停下来问，不替用户决定。

# 仓库与起点
- 仓库：dabaige53/sill。
- 先检查 #45、#46、#47 是否已合并到 main。已合并：从 main 开新分支。未合并：从 claude/web-pwa-ui-handoff 开新分支，PR 的 base 设为它，并在 PR 里写明依赖。
- 每个工作包一个分支、一个 PR，分支名 claude/<工作包编号>-<主题>，例如 claude/u1-pwa-touch。

# 开工前必读（读完再动手，不跳读）
1. docs/guides/web-pwa-ui-handoff.md（全文，这是任务清单和边界）
2. AGENTS.md
3. DESIGN.md 和 design-system/README.md（「手机主页」「预览与叠放」「图标」「底部导航与反馈」「动效」）
4. docs/adr/0032、0035、0036、0037
5. docs/records/2026-10-18-phone-home-x-density/README.md 和 docs/records/2026-10-18-card-detail-capsule/README.md
6. docs/guides/code-standards.md、docs/guides/file-management.md、tests/README.md、pr.md、.github/pull_request_template.md
读完后，用 10 行以内向我复述：已完成什么、你准备的执行顺序、哪些项需要我确认。然后直接开始，不等我回复（除非你发现文档和代码有冲突）。

# 执行顺序
1. C1 修复已知失败的浏览器测试（先有可靠的测试，后面的改动才有保护）
2. U1 PWA 触控与外壳
3. C6 云端迁移验证（没有 Docker 就跳过，并在最终报告写「未执行」）
4. C2 拆分 AppController → C3 模板与文案键 → C4 样式 → C5 类型
5. U4、U5 中不需要确认的核对项
6. 需要我确认的设计项：U2 图标统一、U3 导航胶囊图标、U4.1/U4.5、U5 桌面分栏标签、U6 搜索 / AI / 设置 / 深色

# 设计决定的停点（必须遵守）
凡交接文档标「需用户确认」的项：
1. 截现状（真实页面，390 / 320 / 1440，按需深色）。
2. 找 3–6 个成熟产品的公开参考，每个附可访问的链接；必要时请用户提供截图。我偏好 X 和 Apple 系的质感，不要重新提交接文档第 5 节列出的已否决方案。
3. 在真实页面上叠临时样式截图，做 2–3 个方案的效果图，并排对比，标出推荐和理由。
4. 一次只问一个问题，把图和选项发给我，然后停下等回复。等待期间可以继续做其他不需要确认的工作包，但不要动这一项的代码。
5. 我选定后：写仓库 ADR（编号接最大值）→ 改设计手册和组件说明 → 改代码 → 生成组件包和图标 → 更新本地画板、index.html 与 canvas.json（截图来自实际页面）→ 写讨论记录 docs/records/<日期>-<主题>/ → 在 Merge Danger 列线上未同步文件。

# 代码优化的规则
- 行为和界面都不变。移动和改写分两次提交。
- 改前先确认测试覆盖；没有覆盖就先补测试。
- 每次提交后运行 npm test 和相关浏览器测试；整理样式时截 390、320、1440 的主页、详情、设置，改前改后逐张对比，有差异就撤回或说明。
- 浏览器测试失败时先在基础提交上复跑，判断是不是本次引入。不跳过、不禁用、不放宽断言，不用空提交触发 CI。
- 不改 window.__app 的公开接口；确需改时同步改测试并在 PR 说明。

# 不可违反的约束
- 交接文档第 5 节「不做的事」全部适用。
- 不使用任何 claude.ai 独有的工具：不读取、不发布线上 Design System 和设计画布（claude.ai Artifact），不调用 claude.ai 连接器（包括 Mobbin 连接器），不创建 Artifact。按 AGENTS.md 的仓库内规则：先改仓库里的原则和规范，再改实现；design-system/design-system.json 的线上资产记录不改。每个改了设计的 PR 在 Merge Danger 列出线上未同步的文件。
- 所有用户可见文字放 design-system/copy/zh-Hans.json；文档用 80% ASD-STE100 风格的简体中文。
- 不改 Mac、iOS 原生代码；改到同一功能时在 PR 里写「Mac 未改」。
- 不提交 token、真实账号内容、浏览器存储；单个证据文件不超过 2 MB。
- 环境已预装 Chromium 时用它，不重复下载浏览器。

# 每个 PR 的完成标准
- npm run files:check 和 npm test 通过（写出三组测试的通过数）。
- 相关浏览器测试结果；失败项注明是否在基础提交上同样失败。
- 界面改动有改前、改后截图；真机没测就写「未检查」。
- 按 pr.md 和 PR 模板写 Summary / Evidence / Merge Danger，待完成的检查不写成通过。
- 交接文档中对应工作包的状态和数字（失败测试、警告数、文案键数、图标数）同步更新。
- PR 开出后跟进 CI：红了就修到绿；不是本 PR 引起的失败，在 PR 里写一条说明。

# 汇报
- 每完成一个 PR，用 3–5 行告诉我：做了什么、PR 链接、检查结果、遗留问题。
- 遇到停点，按上面的格式发图和选项，然后停下。
- 全部完成后给一份总报告：每个工作包的 PR 链接与状态、仍需我决定的事项、没有执行的检查（例如真机、Postgres）及原因。

# 结束条件
U1–U6、C1–C6 都有已合并或待审的 PR，或者明确记录了「等用户确认」「环境不具备」的原因；交接文档已更新到最新状态。
```
