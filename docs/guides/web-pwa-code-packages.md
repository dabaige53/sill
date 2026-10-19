# Web 代码工作包

更新：2026-10-19。

当前范围、工作方式与状态以[交接入口](web-pwa-ui-handoff.md)为准。本文件保留原交接正文。

### C1 修复已知失败的浏览器测试（代码，不需要设计决定）

2026-10-19 补充：U5 CI 的保存等待超时已在 U5 基础与当前提交复现。已定位首次加载没有初始化 data-sync；补回原 [PR #48](https://github.com/dabaige53/sill/pull/48)。新增确定性回归在 C1 原实现上先失败，采用工作区后调用既有 syncStatus 后完整云端操作浏览器通过，原断言保留；见 [原因与前后证据](../records/2026-10-19-cloud-sync-initial-state/README.md)。没有设计或公开接口变更，最终提交检查与 CI 以 PR 为准。

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

2026-10-18 执行状态：C5 已实施，提交 [PR #54](https://github.com/dabaige53/sill/pull/54)。仅修改 `data/store.ts`、`interactions/panels.ts`、`views/app.ts` 三个文件的类型，显式 `any` 分别 49 → 0、80 → 0、231 → 0。Web lint 从 875 降至 515 条警告，0 错误、30 条提示。15 个错误调用在基准上可编译，本次全部被拒绝，合法样本仍通过；三个模块导出的类型声明没有 `any`。去掉类型并统一空白后的 JavaScript 与 C4 基准逐字一致；本地、云端构建的 HTML/CSS 原文一致，脚本只出现构建器换行差异。原有 103 个 AppController 方法及 `selected` 访问器不变。各提交 Node 三组 36 / 192 / 92，最终相关浏览器 110 项通过、失败 0。文案键 826 个（哈希键 491 个，panels 哈希键 0 个），图标 69 个。见 [检查记录](../records/2026-10-18-web-types/README.md)，最新 CI 以 PR 为准。未开启全仓 strict，未增加运行时数据校验。没有新增设计或线上待同步文件；真机、Safari 未检查，Mac 未改。

- `npx biome lint apps/web` 在交接时约 900 条警告，大多是显式 `any`。按文件逐步收紧：先 `data/store.ts`、`interactions/panels.ts`，再 `views/app.ts`。
- 不为消除警告改行为；不在一次 PR 里改超过三个文件的类型。
- 不把「零错误」写成「零警告」。

### C6 云端迁移验证（代码）

2026-10-19 发布补充：1.2.6 已发布，先将 C6 已验证的 hiddenActions 偏好函数迁移应用到生产，实际编号 20261019031622。仓库仅将 SQL 文件名及执行引用对齐平台记录，SQL 字节不变。线上 PostgreSQL 17.11 的默认空数组、九个合法动作、四组非法值拒绝、旧偏好兼容及 invoker/私有 schema 边界均通过，不改卡片数据。详见 [发布与数据库检查](../records/2026-10-19-web-pwa-delivery/README.md)。本机仍无 Docker、未执行本机 Postgres；原 CI 11/11 证据继续保留。

2026-10-18 执行状态：C6 已提交 [PR #50](https://github.com/dabaige53/sill/pull/50) 审阅，已补齐公开 RPC 的迁移前后验证。本机 PGlite 4/4、Node 三组 36 / 169 / 92 通过。云端工作台浏览器本机先后两次通过，后续一次在会话过期流程超时；基础提交也在该流程的另一断言超时，根因未定位。两组云端 CI 浏览器检查通过。实际 Postgres 17.11 在 CI 11/11 通过（含主测试及 10 个子用例），源码提交的 7 项 CI 全绿；最新状态以 PR 为准。本机因没有 Docker 未执行。详情见 [迁移检查记录](../records/2026-10-18-hidden-actions-postgres/README.md)。迁移与产品代码未改，未部署。Web lint 0 错误、902 警告，文案键 826 个（哈希键 601 个，其中 panels 110 个），图标 69 个。

- `supabase/migrations/20261019031622_sill_hidden_card_actions.sql` 交接时尚未在 Postgres 上执行。在有 Docker 的环境运行 `npm run test:supabase:postgres`，并补一个用例：带 `hiddenActions` 的偏好写入成功，带未列出值的写入被拒绝。
- 部署顺序：先部署迁移，再发布网页。迁移部署前，云端会拒绝带 `hiddenActions` 的偏好写入。

