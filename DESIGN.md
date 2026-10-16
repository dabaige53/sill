# Sill 的设计约束

更新：2026-10-16。改界面、样式、文案、图标或交互之前先读本文。规则正文在 [设计手册](design-system/README.md)，本文只说明依据在哪里、改动按什么顺序做、Web 和 macOS 怎样保持一致。

## 依据

| 内容 | 位置 |
| --- | --- |
| 设计规则：立场、文案、颜色、字体、卡片积木、动效、图标 | [design-system/README.md](design-system/README.md) |
| 设计变量的来源 | [design-system/tokens.json](design-system/tokens.json) |
| Web 设计变量 | [apps/web/styles/tokens.css](apps/web/styles/tokens.css) |
| 规则和代码位置的对照 | [设计系统映射](docs/design/system.md) |
| 设计决策 | [ADR-01 至 ADR-21](docs/design/decisions.md)，ADR-22 起见 [docs/adr/](docs/README.md) |
| 定稿画板 | `design-system/boards/`，运行 `npm run boards` 后打开 http://127.0.0.1:4310/ |
| 线上版本 | [Sill Design System](https://claude.ai/artifact/8zZhgYs53aRF6Rbk5GtuBb)、[Sill · 设计画布](https://claude.ai/artifact/487W43yaF9D3Kno8c3ej6b) |

- 仓库是唯一来源。线上版本只从仓库同步过去，不在线上直接改规则。
- 手册和代码不一致时，先对照画板和实际页面，再在同一个 PR 里改掉错的一方。用户确认的新决定写入手册，必要时补 ADR。

## 改动顺序

1. 读手册对应的一节和相关画板。交互改动先看可交互原型（桌面交互、手机交互、弹出动效、卡片积木）。
2. 改代码。数值有对应变量时用变量：颜色、圆角、字号（`--text-<样式名>`）、阴影、动效时长。没有对应变量的新数值，先判断它是不是一级新规则；是就加进 `tokens.json` 和 `tokens.css`，不是就改用已有的一级。
3. 改手册。规则、数值或交互变了，同一个 PR 里更新手册和相关组件说明。
4. 重新生成组件包和图标：`node design-system/scripts/generate.ts design-system .`。
5. 检查：`npm test`、`node tests/e2e/browser.ts`；在浏览器里看浅色、深色、手机宽度和减少动态效果。
6. 同步线上：合并后把变化的手册、变量、组件说明、组件包和图标发布到线上 Design System。画板只在设计定稿变化时更新。没有同步时，在 PR 的 Merge Danger 里写明。

## 不能做的事

- 不为了显得专业而加装饰：彩色左边条、渐变、emoji、状态句（「已读」「已经结束」「加载中」）都不加。
- 已读、已结束只用卡片颜色表达，不加文字或符号（ADR 0030）。
- 一个控件只用文字或只用图标，不同时用两种表达同一个意思。
- 不在样式里写和已有变量相同的固定数值。
- 不给底部浮层单独定位。新的底部浮层放进以入口球为锚点的底部轨道，遵守「一格一样」的规则（手册「底部轨道与反馈」）。
- 同一张卡在信息流和预览里不用两套说法：头部、动作文字和动作位置保持一致。
- 不把本地反馈画成外部完成：待处理、执行中、失败、结果未知要能分辨。

## Web 与 macOS 一致

- macOS 的尺寸和颜色由构建插件从 `tokens.json` 生成（`AppleMetrics`、`AppleColors`），文案来自 `design-system/copy/zh-Hans.json`。改 Mac 界面时，按手册的角色取值，例如卡片标题 17、摘要 15、内边距 18、卡片圆角 22，不按像素另起一套。
- macOS 可以用系统控件、SF Symbols 和系统颜色，但含义必须和 Web 相同：同一个动作用同一个词，同一种状态用同一种表达。
- 已知差距（2026-10-16，只读代码，未在真实桌面核对）：Mac 卡片标题 19、摘要 14、内边距 22，和手册不同；已读卡的底色可能与未读相同，主要靠标题变灰；没有映射 `accent`，按钮颜色跟随系统强调色；卡片只显示标题和摘要，没有封面、日程时间、头像、附件等积木。改 Mac 卡片时一并修正。
