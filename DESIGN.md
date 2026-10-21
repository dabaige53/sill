# Sill 的设计约束

更新：2026-10-21。改界面、样式、文案、图标或交互之前先读本文。规则正文在 [设计手册](design-system/README.md)，本文只说明依据在哪里、改动按什么顺序做、Web 和 macOS 怎样保持一致。

## 依据

产品交互遵循 [Agent 优先与界面边界](docs/product/agent-mcp.md#agent-优先与界面边界)：已有内容由 AI 修改，界面不提供复杂编辑器；保留既有新增卡片、记一笔与其他原有轻操作，不扩大删除或改版范围。

| 内容 | 位置 |
| --- | --- |
| 设计规则：立场、文案、颜色、字体、卡片积木、动效、图标 | [design-system/README.md](design-system/README.md) |
| 设计变量的来源 | [design-system/tokens/](design-system/tokens/)；生成兼容文件 `tokens.json` |
| Web 设计变量 | [apps/web/styles/tokens.css](apps/web/styles/tokens.css) |
| 规则和代码位置的对照 | [设计系统映射](docs/design/system.md) |
| 设计决策 | [ADR-01 至 ADR-21](docs/design/decisions.md)，ADR-22 起见 [docs/adr/](docs/README.md) |
| 现行画板 | `design-system/boards/`，运行 `npm run boards` 后打开 http://127.0.0.1:4310/ |
| 设计印记 | 代码里的 `@design <编号>`，编号登记在 [marks.json](design-system/marks.json) |
| 设计版本 | [设计版本记录](docs/design/versions.md) |
| 线上版本 | [Sill Design System](https://claude.ai/artifact/8zZhgYs53aRF6Rbk5GtuBb)、[Sill · 设计画布](https://claude.ai/artifact/487W43yaF9D3Kno8c3ej6b)（「现行」页） |

- 仓库 `design-system/` 是设计材料的来源，线上是发布副本。有人在线上页面直接改了设计，先在 Claude Code 里说「同步设计」拉回仓库，再做别的改动。
- 组件示例、组件包和图标由产品代码生成，不手改。
- 手册和代码不一致时，先对照画板和实际页面，再在同一个 PR 里改掉错的一方。用户确认的新决定写入手册，必要时补 ADR。
- 只有现行画板是依据。`design-system/history/` 和线上画布的「历史」页记录被取代的定稿和过程稿，不作依据。

## 两种工作环境

| 环境 | 能做什么 | 结束时 |
| --- | --- | --- |
| Claude Code | 改仓库，并能更新 claude.ai 上的 Design System 和设计画布 | 同一次任务里 `stage`、说「发布设计」、`record`，线上与仓库一致 |
| Codex 等其他 AI 产品 | 只能改仓库，不能更新 claude.ai | 运行 `build` 和 `check`；PR 的 Merge Danger 写「设计未发布到线上」。之后在 Claude Code 里说「发布设计」补齐 |

`status` 列出仓库里还没发布到线上的改动，任何环境都可以运行。

## 工具

`scripts/design-init.sh`（`npm run design -- <命令>`）：

| 命令 | 作用 |
| --- | --- |
| `status` | 仓库与上次发布相比改了哪些文件 |
| `trace <编号或变量名>` | 找出规则、变量取值、ADR、画板和代码位置 |
| `build` | 重新生成变量文件、组件包、图标、组件示例和画板目录 |
| `check` | 检查印记、变量名、画板、组件示例、日期叙述和文件规范 |
| `retire <画板>` | 把现行画板移到历史，重排画布 |
| `stage [说明]` | build、check 后准备发布文件；然后在 Claude Code 里说「发布设计」 |
| `record <DS 版本> <画布版本> [ADR]` | 发布后记录版本 |

## 改动顺序

1. 读手册对应的一节和现行画板；用 `trace` 找到相关的变量和代码。
2. 改规则或数值：先改设计变量（`design-system/tokens/`）、手册和受影响的画板。数值有对应变量时用变量；没有对应变量的新数值，先判断它是不是一级新规则，是就加进变量，不是就改用已有的一级。
3. 改代码。关键实现处写 `@design <编号>`；新编号登记到 `marks.json`。
4. 运行 `build` 和 `check`。按变更范围选择静态检查、类型检查、构建和非浏览器测试。浏览器测试、视觉自动化和 e2e 须先取得用户明确授权；以 `AGENTS.md`「验证与测试授权」为准。
5. 发布：在 Claude Code 里运行 `stage`，说「发布设计」，发布后 `record`。在其他 AI 产品里不发布，在 PR 的 Merge Danger 写「设计未发布到线上」。

## 版本更新

改了设计变量，或同时改了多节手册与多块画板，就是一个设计版本。版本名用发布当天的日期。

1. 先写 ADR：说明原因，列出影响范围（变量、手册小节、现行画板、实现端）。
2. 变量、手册、组件说明一次改完；`build` 重新生成组件示例和组件包。
3. 刷新受影响的全部现行画板。画出来的画板改到与产品一致；截图画板重新截图。
4. 新决定画新画板。被它取代的画板用 `retire` 移到历史，在 [历史画板](design-system/history/README.md) 写一行去向。
5. 在 Claude Code 里 `stage`，「发布设计」，`record` 会在 [设计版本记录](docs/design/versions.md) 加一行。

规则文档只写现状。同步状态、经过和日期不写进手册、本文或画板说明；原因写进 ADR，发布写进版本记录，未完成的事写进 PR 的 Merge Danger。

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

macOS 的视觉与动效以 Web 的 styles/*.css、styles/tokens.css、interactions/motion*.ts，以及手册 motion.md、interaction.md 为准。不使用原生控件样式、SF Symbols、单层阴影或 Liquid Glass。

- 保留信息结构、内容顺序、文案和既有轻操作。SwiftUI 负责绘制，视觉、状态与动效参数对齐 Web。
- macOS 顶栏只有一处与 Web 不同：品牌图标左缘对齐窗口关闭按钮。设置在两端桌面都是主窗口中央的弹窗。
- 设计变量维护于 design-system/tokens/foundation.json，导出 tokens.json 后由 CardGenerator 生成 AppleMetrics、AppleColors。组件不另写动画参数。
- 保留已有 reduceMotion 分支；新增动效不加减少动态效果分支。此保留项与手册统一动效规则的差异须在交付中说明。
- 保留键盘、焦点恢复及 VoiceOver 语义。按 AGENTS.md 运行非浏览器检查；真实窗口中未观察的效果须明确标明。
