# Sill 设计系统

更新：2026-10-21。

改界面前先读根目录的 [设计约束](../../DESIGN.md)，其中写明改动顺序和线上同步要求。

Sill（窗台）的设计规范统一放在仓库根目录的 `design-system/`。线上版本是 [Sill Design System](https://claude.ai/artifact/8zZhgYs53aRF6Rbk5GtuBb)，画板在 [Sill · 设计画布](https://claude.ai/artifact/487W43yaF9D3Kno8c3ej6b) 的「现行」页，本地副本见下文「画板」。

组件脚本的全局名是 `Sill`（`window.Sill`）。

## 目录

| 路径 | 内容 |
| --- | --- |
| `design-system/README.md` | **设计手册，规则以它为准**：产品立场、文案、颜色、玻璃、字体、卡片积木、文字长度、间距、动效、量大与时间、图标（含「文字和图标只用一种」） |
| `design-system/boards/` | 现行画板：设计画布「现行」页的本地副本、画布索引和目录页，`npm run boards` 打开 |
| `design-system/history/` | 历史画板：被取代的定稿和过程稿，不作依据 |
| `design-system/tokens.json` | 设计变量：颜色（含深色）、字号、间距、圆角、阴影、动效时长与曲线，每项附用途 |
| `design-system/components/<组件>/` | 18 个组件的说明（README.md）和示例（preview.html，由 `scripts/previews.ts` 从产品代码生成）；`Cover/` 是封面 |
| `design-system/components/bundle.js` / `bundle.css` | 示例用的渲染函数与样式，从 `apps/web/` 生成 |
| `design-system/assets/Icons/` | 图标 SVG |
| `design-system/design-system.json` | 线上版本的索引 |
| `design-system/marks.json` | 设计印记登记：编号 → 手册小节、变量、ADR、现行画板 |
| `design-system/published.json` | 上次发布到线上的文件指纹，由 `scripts/design-init.sh record` 写入 |
| `design-system/scripts/` | 生成、检查、画布整理和发布准备脚本，统一由 `scripts/design-init.sh` 调用 |

## 画板

`design-system/boards/` 是设计画布「现行」页的本地副本。只有这里的画板是依据，分五组：

1. 手机：主页、搜索首页、结果页与 # 条件、AI 四块页面稿，手机顶行与搜索标签
2. 网页与 Mac：主页、分栏菜单、在未读里搜索、拖入卡片、多选、AI 会话六块页面稿，Web 顶栏与 AI 框，Mac 顶栏与设置弹窗
3. 卡片：A 字号与四列、卡片操作适用类型、量大与去重、下滑与等待
4. 打开：卡片详情、资讯阅读、照片通用操作、退出交互
5. 图标与品牌

各类卡片的实际样子看组件 FeedCard 的示例，它由产品代码生成。

页面稿（文件名以 `Screen` 开头）是整页布局。实现移动与网页界面时，以页面稿和手册 [交互](../../design-system/handbook/interaction.md) 的「两端对照」为准。

`design-system/history/` 是画布「历史」页的本地副本，记录被取代的定稿、早期概念稿和过程稿，不作依据；每块的去向见 [历史画板](../../design-system/history/README.md)。画布索引 `design-system/boards/canvas.json` 与线上 `project/canvas.json` 相同，两页的画板都列在里面，历史画板带 `"page": "history"`。

打开方式：

```sh
npm run boards
```

然后在浏览器打开 `http://127.0.0.1:4310/`。目录页只列现行画板；历史画板按文件名访问。不能直接双击打开 HTML 文件：画板的运行脚本 `support.js` 要读取画板文件本身，浏览器不允许本地文件这样读。

移走或重排画板用 `scripts/design-init.sh retire` 和 `layout`，发布顺序见 [设计约束](../../DESIGN.md)。

## 单一来源

产品实现以 `apps/web/` 为准，`design-system/` 记录规范，并引用同一份实现：

| 想改什么 | 实现位置 | 规范位置 |
| --- | --- | --- |
| 颜色、圆角、字号、阴影、动效变量 | `apps/web/styles/tokens.css` | `design-system/tokens.json`、手册「颜色」「动效」 |
| 图标 | `apps/web/atoms/icons.ts` 的 `icon(name, size)` | 手册「图标」、`IconSet` 画板 |
| 按钮、进度环、勾选项、头像、标签 | `apps/web/atoms/primitives.ts` | 对应组件 README |
| 卡片结构、叠卡、架子 | `apps/web/cards/components.tsx`、`templates.ts` | `FeedCard`、`StackCard`、`CardMenu`，`CardTypeA` 画板 |
| 预览、阅读、搜索、设置等弹层 | `apps/web/interactions/panels.ts` | `Dialog`，`CardDetail`、`ArticleReading`、`MacChrome` 画板 |
| 资讯阅读（预览与全屏） | `apps/web/styles/preview-media.css` 的 `.is-article`；macOS `Reader/ReaderContent.swift` | `article-*` 变量，`ArticleReading` 画板 |
| 展开与收回、落下、淡入 | `apps/web/interactions/motion.ts` | 手册「动效」 |
| 手势：下拉刷新、下拉关闭、读完上推、拖把手、右滑返回 | `apps/web/interactions/gestures.ts` | 手册「动效」，`ExitRules` 画板 |
| 卡片交接、宿主消息与外链 | `apps/web/services/agent-handoff.ts`、`apps/web/cloud-bridge.ts` | 手册「立场」、产品「当前卡片交给助手」；按宿主能力提供，AI 导航页仍为内置助手说明 |
| 信息流排序、叠卡、收起 | `apps/web/services/feed-policy.ts` | 手册「量大与时间」，`Volume` 画板 |

改了 `apps/web/` 里的变量、图标或组件样式，运行下面的命令重新生成并检查，再按 [设计约束](../../DESIGN.md) 发布：

```sh
scripts/design-init.sh build
scripts/design-init.sh check
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

`index.html` 是构建产物，由 `npm run build` 生成，不手工修改。Web 使用 React、TypeScript 和 Motion。`interactions/motion.ts` 统一动效策略，`interactions/motion-playback.ts` 管理播放、取消与手势速度；CSS 只表达静止状态。
