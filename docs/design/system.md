# Sill 设计系统

更新：2026-10-17。

改界面前先读根目录的 [设计约束](../../DESIGN.md)，其中写明改动顺序和线上同步要求。

Sill（窗台）的设计规范统一放在仓库根目录的 `design-system/`。线上版本是 [Sill Design System](https://claude.ai/artifact/8zZhgYs53aRF6Rbk5GtuBb)，全部定稿画板在 [Sill · 设计画布](https://claude.ai/artifact/487W43yaF9D3Kno8c3ej6b)，本地副本见下文「画板」。

组件脚本的全局名是 `Sill`（`window.Sill`）。

## 目录

| 路径 | 内容 |
| --- | --- |
| `design-system/README.md` | **设计手册，规则以它为准**：产品立场、文案、颜色、玻璃、字体、卡片积木、文字长度、间距、动效、量大与时间、图标（含「文字和图标只用一种」） |
| `design-system/boards/` | 设计画布的本地副本和目录页，包含导航胶囊画板 35，`npm run boards` 打开 |
| `design-system/tokens.json` | 设计变量：颜色（含深色）、字号、间距、圆角、阴影、动效时长与曲线，每项附用途 |
| `design-system/components/<组件>/` | 30 个组件的说明（README.md）和静态示例（preview.html） |
| `design-system/components/bundle.js` / `bundle.css` | 示例用的渲染函数与样式，从 `apps/web/` 生成 |
| `design-system/assets/Icons/` | 图标 SVG |
| `design-system/design-system.json` | 线上版本的索引 |
| `design-system/scripts/` | 从 `apps/web/` 重新生成上述文件的脚本 |

其中 CardBlocks、StackCard、KeyPoints、ReadEndRing、SourceRow 五个组件是这一版新增的静态示例，直接用设计变量写成，还没有进 bundle。

## 画板

`design-system/boards/` 保存了设计画布上的全部画板，按画布的分区排好：

1. 品牌与全貌：品牌、页面地图
2. 进来：首次打开与导入、来源与导入、收集入口
3. 桌面：桌面信息流 1440、手机 390、桌面交互原型、手机交互原型、下滑与等待、量大与去重
4. 打开：弹层、弹出动效原型、站内详情、退出交互
5. 找与管：搜索与归档、来源与信任、设置
6. 底层：卡片积木、预设卡片、文字长度、图标、规范总表
7. 过程稿：现状盘点、Apple 风格对照、卡片体系与尺寸等

打开方式：

```sh
npm run boards
```

然后在浏览器打开 `http://127.0.0.1:4310/`。标「可交互」的四块原型（卡片积木、桌面交互、手机交互、弹出动效）可以直接点、滑。不能直接双击打开 HTML 文件：原型的运行脚本 `support.js` 要读取画板文件本身，浏览器不允许本地文件这样读。

这个目录是线上设计画布的副本。视觉定稿或交互规则变了，先在线上设计画布改画板，再把变化的画板同步到这里，顺序见 [设计约束](../../DESIGN.md)。

## 单一来源

产品实现以 `apps/web/` 为准，`design-system/` 记录规范，并引用同一份实现：

| 想改什么 | 实现位置 | 规范位置 |
| --- | --- | --- |
| 颜色、圆角、字号、阴影、动效变量 | `apps/web/styles/tokens.css` | `design-system/tokens.json`、手册「颜色」「动效」 |
| 图标 | `apps/web/atoms/icons.ts` 的 `icon(name, size)` | 手册「图标」、画板 13 |
| 按钮、进度环、勾选项、头像、标签 | `apps/web/atoms/primitives.ts` | 对应组件 README |
| 卡片结构、叠卡、架子 | `apps/web/cards/templates.ts` | `FeedCard`、`StackCard`、`CardBlocks` 等，画板 21、22 |
| 预览、阅读、搜索、设置、来源、导入等弹层 | `apps/web/interactions/panels.ts` | `Dialog`，画板 15、29、30–32 |
| 展开与收回、落下、淡入 | `apps/web/interactions/motion.ts` | 手册「动效」，画板 16 |
| 手势：下拉刷新、下拉关闭、读完上推、拖把手、右滑返回 | `apps/web/interactions/gestures.ts` | 手册「动效」，画板 17–19 |
| 卡片交接、宿主消息与外链 | `apps/web/services/agent-handoff.ts`、`apps/web/cloud-bridge.ts` | 手册「立场」、产品「当前卡片交给助手」；按宿主能力提供，AI 导航页仍为内置助手说明 |
| 信息流排序、叠卡、收起 | `apps/web/services/feed-policy.ts` | 手册「量大与时间」，画板 25 |
| 文件导入与去重 | `apps/web/services/importers.ts` | 画板 24、31 |

改了 `apps/web/` 里的变量、图标或组件样式：变量和说明先在线上 Design System 改，再同步回 `design-system/`；然后重新生成图标和 bundle，并发布到线上：

```sh
node design-system/scripts/generate.ts design-system .
```

## 样式分层

`apps/web/styles/styles.json` 规定构建顺序：

1. `tokens.css`：颜色、间距、圆角、字号、阴影、动效变量，深色主题。
2. `base.css`：页面、文字、基础布局，信息流底部短线。
3. `controls.css`：按钮、底部导航胶囊与镜片、提示条、选择条。
4. `cards.css`：各类卡片、已读色、叠卡（牌堆）、按压反馈。
5. `overlays.css`：预览、阅读、面板、读完圆环、下拉刷新圆环、手势过渡。
6. `responsive.css`：窄屏、触屏、手机抽屉、减少动效、减少透明度。

## 验收

```sh
npm test
node tests/e2e/local-browser.ts
node tests/e2e/browser.ts
```

`index.html` 是构建产物，由 `npm run build` 生成，不手工修改。项目只用原生 HTML、CSS、SVG 和 Web Animations；没有引入 React 或第三方动效库。
