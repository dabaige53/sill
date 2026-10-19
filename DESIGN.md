# Sill 的设计约束

更新：2026-10-18。改界面、样式、文案、图标或交互之前先读本文。规则正文在 [设计手册](design-system/README.md)，本文只说明依据在哪里、改动按什么顺序做、Web 和 macOS 怎样保持一致。

## 依据

产品交互遵循 [Agent 优先与界面边界](docs/product/agent-mcp.md#agent-优先与界面边界)：已有内容由 AI 修改，界面不提供复杂编辑器；保留既有新增卡片、记一笔与其他原有轻操作，不扩大删除或改版范围。

| 内容 | 位置 |
| --- | --- |
| 设计规则：立场、文案、颜色、字体、卡片积木、动效、图标 | [design-system/README.md](design-system/README.md) |
| 设计变量的来源 | [design-system/tokens/](design-system/tokens/)；生成兼容文件 `tokens.json` |
| Web 设计变量 | [apps/web/styles/tokens.css](apps/web/styles/tokens.css) |
| 规则和代码位置的对照 | [设计系统映射](docs/design/system.md) |
| 设计决策 | [ADR-01 至 ADR-21](docs/design/decisions.md)，ADR-22 起见 [docs/adr/](docs/README.md) |
| 定稿画板 | `design-system/boards/`，运行 `npm run boards` 后打开 http://127.0.0.1:4310/ |
| 线上版本 | [Sill Design System](https://claude.ai/artifact/8zZhgYs53aRF6Rbk5GtuBb)、[Sill · 设计画布](https://claude.ai/artifact/487W43yaF9D3Kno8c3ej6b) |

- 线上先改，线下后同步。设计规则、组件说明、变量和画板先在线上 Design System 和设计画布里改，再同步回仓库的 `design-system/`。线上和仓库不一致时，以线上为准。
- 组件包（`bundle.css`、`bundle.js`）和图标由仓库代码生成，生成后再发布到线上。
- 手册和代码不一致时，先对照画板和实际页面，再在同一个 PR 里改掉错的一方。用户确认的新决定写入手册，必要时补 ADR。
- 用户已明确要求本次在 Codex 内完成、不调整 claude.ai 云端设计：先更新仓库内产品原则与设计规范，再修改代码。下述线上同步步骤本次不执行，不能因此停止已授权的仓库工作。

本轮使用上述仓库模式：设计参考只用公开页面或用户截图，先改仓库规范，再改实现和本地画板；不访问 claude.ai Artifact；用户已指定 Mobbin，参考图通过该连接器读取。`design-system/design-system.json` 的线上资产记录不改。线上未同步文件列入 PR 的 Merge Danger，由用户处理。下列线上步骤本轮不执行。

## 改动顺序

1. 读线上手册对应的一节和相关画板。交互改动先看可交互原型（桌面交互、手机交互、弹出动效、卡片积木）。
2. 先改线上：规则、数值或交互要变时，先在线上 Design System 改手册和组件说明，在线上设计画布改受影响的画板，包括可交互原型和退出交互表。交互规则包括浮层位置、反馈时长、选择、拖动、刷新、打开和关闭。只改代码实现、规则不变时跳过这一步。
3. 同步线下：读取线上变化的文件，覆盖到仓库对应路径：Design System 的 `project/<路径>` 对应 `design-system/<路径>`，设计画布的 `project/<画板>` 对应 `design-system/boards/<画板>`。画板尺寸变了，同时更新 `design-system/boards/canvas.json` 和 `index.html`。
4. 改代码。数值有对应变量时用变量：颜色、圆角、字号（`--text-<样式名>`）、阴影、动效时长。没有对应变量的新数值，先判断它是不是一级新规则；是就回到第 2 步，在线上加进变量，再同步到 `tokens.json` 和 `tokens.css`；不是就改用已有的一级。
5. 重新生成组件包和图标：`node design-system/scripts/generate.ts design-system .`，再把变化的组件包和图标发布到线上 Design System。
6. 检查：`npm test`、`node tests/e2e/browser.ts`；在浏览器里看浅色、深色、手机宽度和快速连续操作。
7. 实现中发现规则要调整时，回到第 2 步先改线上，不只改仓库。仓库里有线上没有的设计改动时，在 PR 的 Merge Danger 里写明。

## 不能做的事

- 不把 AI 的结构化写入能力复制成面向用户的复杂表单、整卡编辑器或 JSON 编辑器。取消内容编辑时，不删除或改造其他原有产品功能。
- 不为了显得专业而加装饰：彩色左边条、渐变、emoji、状态句（「已读」「已经结束」「加载中」）都不加。
- 已读、已结束只用卡片颜色表达，不加文字或符号（ADR 0030）。
- 普通控件只用文字或只用图标；底部三项主导航使用图标与短名称，便于识别目的地。
- 不在样式里写和已有变量相同的固定数值。
- 不给底部浮层单独定位。新的底部浮层放进底部轨道，遵守「一格一样」的规则。底部导航胶囊只有主页、AI、搜索三格；设置由主页右上角头像进入，不放卡片动作；助手功能放进 AI 格，不加新的悬浮按钮（手册「底部导航与反馈」，[ADR 0035](docs/adr/0035-bottom-navigation-capsule.md)）。
- 同一张卡在信息流和预览里不用两套说法：头部、动作文字和动作位置保持一致。
- 不把本地反馈画成外部完成：待处理、执行中、失败、结果未知要能分辨。

## Web 与 macOS 一致

- macOS 的尺寸和颜色由构建插件从 `tokens.json` 生成（`AppleMetrics`、`AppleColors`），文案来自 `design-system/copy/zh-Hans.json`。改 Mac 界面时，按手册的角色取值，例如卡片标题 17、摘要 15、内边距 18、卡片圆角 22，不按像素另起一套。
- macOS 以当前 Web 为 1:1 基准，使用同一套图标、文案、颜色角色、控件外观与交互，不另做 Mac 差异化设计。SwiftUI/AppKit 负责原生实现，系统控件不得替换成另一套产品样式。
- 2026-10-17 原生源码按当前 Web 对齐：卡片标题 17、摘要 15、内边距 18，并映射浅深色、已读底色与动作色；卡片积木、导航、搜索、设置与详情继续复用 Web 的配方和文案。严格 1:1 仍须通过实际窗口的视觉与交互检查，源码对齐不等于验收完成。
- 2026-10-19 手机主页标题与头像、三项主导航按设计手册的新规则实现；Mac 同步入口和词义。2026-10-18 手机主页（[ADR 0036](docs/adr/0036-phone-home-density.md)）只改了 Web。Mac 是桌面窗口，不需要手机顶栏和分栏标签；提醒和待办的勾选圈是否用 `accent` 描边、提醒是否显示来源时间，还没有在 Mac 上核对。
- 2026-10-18 卡片详情（[ADR 0037](docs/adr/0037-card-detail-toolbar.md)）只改了 Web。Mac 的详情工具条是否按「通用｜专属」分组、是否用新的九个图标、设置里是否有「卡片操作」开关，还没有核对。

## 产品设置边界

项目不提供专门的无障碍设置或系统偏好适配。移除减少动态、减少透明度和增强对比度分支；保留正常键盘操作、焦点恢复、原生控件语义与图标名称。动效统一按设计手册执行。
