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
| 线上版本 | [Sill Design System](https://claude.ai/artifact/8zZhgYs53aRF6Rbk5GtuBb)、[Sill · 设计画布](https://claude.ai/artifact/487W43yaF9D3Kno8c3ej6b)、[Sill 界面定稿](https://claude.ai/artifact/7VR39DnLMEVoJgV1kn62JV)（移动与网页最新界面，本地 `design-system/boards/final-ui/`） |

- 线上先改，线下后同步。设计规则、组件说明、变量和画板先在线上 Design System 和设计画布里改，再同步回仓库的 `design-system/`。线上和仓库不一致时，以线上为准。
- 组件包（`bundle.css`、`bundle.js`）和图标由仓库代码生成，生成后再发布到线上。
- 手册和代码不一致时，先对照画板和实际页面，再在同一个 PR 里改掉错的一方。用户确认的新决定写入手册，必要时补 ADR。
- 用户已明确要求本次在 Codex 内完成、不调整 claude.ai 云端设计：先更新仓库内产品原则与设计规范，再修改代码。下述线上同步步骤本次不执行，不能因此停止已授权的仓库工作。

2026-10-20 起恢复线上优先：手机顶行与搜索标签（[ADR 0048](docs/adr/0048-phone-top-row-and-search-tokens.md)）先发布到线上 Design System 和设计画布 44 号画板，再同步回仓库。此前几轮只在仓库内修改的规则、画板（39–43 号）和手册拆分尚未发布到线上，线上与仓库仍有差异，需要另做一次完整对齐；对齐前不要用线上整份文件覆盖仓库。

## 改动顺序

1. 读线上手册对应的一节和相关画板。交互改动先看可交互原型（桌面交互、手机交互、弹出动效、卡片积木）。
2. 先改线上：规则、数值或交互要变时，先在线上 Design System 改手册和组件说明，在线上设计画布改受影响的画板，包括可交互原型和退出交互表。交互规则包括浮层位置、反馈时长、选择、拖动、刷新、打开和关闭。只改代码实现、规则不变时跳过这一步。
3. 同步线下：读取线上变化的文件，覆盖到仓库对应路径：Design System 的 `project/<路径>` 对应 `design-system/<路径>`，设计画布的 `project/<画板>` 对应 `design-system/boards/<画板>`。画板尺寸变了，同时更新 `design-system/boards/canvas.json` 和 `index.html`。
4. 改代码。数值有对应变量时用变量：颜色、圆角、字号（`--text-<样式名>`）、阴影、动效时长。没有对应变量的新数值，先判断它是不是一级新规则；是就回到第 2 步，在线上加进变量，再同步到 `tokens.json` 和 `tokens.css`；不是就改用已有的一级。
5. 重新生成组件包和图标：`node design-system/scripts/generate.ts design-system .`，再把变化的组件包和图标发布到线上 Design System。
6. 按变更范围选择静态检查、类型检查、构建和非浏览器测试。浏览器测试、视觉自动化和 e2e 须先取得用户明确授权；获准后只测本次修改涉及的场景，完整 e2e 须另有明确授权。以 `AGENTS.md`「验证与测试授权」为准。
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

- macOS 的工作范围是适配和性能优化。保留 Sill 的信息结构、卡片构图、内容顺序、字号层级、留白与轻操作，不把原生化解释为重新设计产品。内容、功能、文案与业务状态继续与 Web 一致。
- 卡片由 SwiftUI 原生视图组成，沿用设计系统的卡片圆角、内边距、字体尺寸与已读退色；不为使用标准容器而把内容卡片改成 GroupBox 表单分组。字体使用系统字体，动作使用 SF Symbols、原生按钮、复选框和菜单。
- 顶栏、搜索、菜单、窗口缩放和系统快捷键遵循 macOS。设置保留独立 Settings 窗口；阅读恢复主窗口内的预览与展开，不在点击卡片时强制另开窗口。速记、备注和标签使用系统 Sheet，清空数据使用系统确认弹窗。
- 玻璃只用于功能层，卡片与正文保持不透明。macOS 26 及以上使用系统 Liquid Glass，旧系统使用原生 material，不叠加手工模糊和多层阴影。
- 参考 [Apple macOS 设计资源](https://developer.apple.com/design/resources/#macos-apps)、[Designing for macOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-macos) 与 [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass)，按现有产品结构适配窗口、控件和材质。
- 按用户要求以代码检查和构建交付，不运行测试或视觉自动化。构建通过不表示实际交互和性能已验收。

## 产品设置边界

不新增应用内无障碍设置。macOS 遵循系统的减少动态效果、材质和对比度设置，保留键盘、焦点与 VoiceOver 语义。Web 的既有规则不变。
