# Quiet Glass Storybook 组件库

Storybook 是这套设计系统的本地工作台。它把图标、卡片、状态和组件保存为可单独选择、调参和操作的 Story；实际实现仍来自 `src/`，信息流与工作台复用同一份源码。

## 启动与查看

使用 Node.js 22.12+，推荐 Node.js 24 LTS，在项目根目录执行：

```sh
npm ci
npm run storybook
```

浏览器打开终端给出的地址，默认是 `http://localhost:6006`。开发服务器监听本机；修改共享源码或 Story 后会刷新预览。

| 侧栏 | 已登记内容 | 怎样使用 |
| --- | --- | --- |
| 开始使用 | 保存、共享和修改说明 | 先确认工作台的操作方式 |
| 设计基础 | 颜色、字体、间距、圆角、阴影与动效变量 | 检查共享设计语言 |
| 图标库 | 38 个图标、完整总览、交互调参 | 调整图标名称、尺寸、颜色和禁用状态 |
| 卡片库 | 10 类内容的 13 个形态、完整总览、交互调参 | 体验预览、任务、提醒、收藏等真实操作 |
| 卡片状态 | 默认、已读、收藏、选中、延后、完成 | 单独检查状态及并排比较 |
| 组件库 | 29 项基础、输入、面板、反馈及 AI 组件 | 直接试用或打开对应的完整面板 |
| 设计参考 | 28 项网络参考 | 查看来源、说明与适用范围 |

当前共登记 94 个 Story。每个 Story 都有固定地址，例如 `?path=/story/cards--article-image`。选择 Story 后，Canvas 显示组件；有参数的 Story 可在 Controls 中调整。

## 怎样永久保存

Controls 改动属于预览参数，不会自动改写组件源码或发布新版本。确认设计后，把改动保存到对应文件，再提交 Git。

| 修改目标 | 保存位置 |
| --- | --- |
| 公共颜色、字体、间距、圆角与阴影 | `src/styles/tokens.css` |
| 图标 SVG 路径 | `src/atoms/icons.js` |
| 图标名称、用途与分组 | `src/data/icon-catalog.js` |
| 卡片结构与状态表达 | `src/cards/templates.js`、`src/styles/cards.css` |
| 卡片类型和形态清单 | `src/data/card-catalog.js` |
| 按钮、进度、勾选等原子组件 | `src/atoms/primitives.js`、`src/styles/controls.css` |
| 弹层、AI 和操作行为 | `src/interactions/`、`src/services/ai.js`、`src/views/app.js` |
| 组件演示编排和说明 | `src/views/library.js` |
| 网络参考内容 | `src/data/sources.js` |
| 某个组件的固定示例与默认参数 | `stories/*.stories.js` |
| 工作台配置与共享源码入口 | `.storybook/` |
| 工作台独立的示例装配与排版 | `stories/runtime.js`、`stories/storybook.css` |

例如，想永久保留一个窄版阅读卡示例，可以在 `stories/Cards.stories.js` 中增加命名导出：

```js
export const CompactArticle = {
  name: '窄版阅读卡',
  args: { variant: 'article-image', width: 320 },
};
```

新增图标、卡片形态或组件时，也在对应 Story 文件增加命名导出。浏览器验收会检查源码登记与 Story 索引的覆盖关系，防止目录遗漏。

这个示例调用正式的 `cardHTML()`；没有复制一套卡片模板。调整正式卡片样式后，工作台中所有对应 Story 和重新构建后的产品页面都会采用新版本。更完整的组件来源表见 [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md)。

## 状态隔离与真实交互

工作台使用独立的内存演示状态。切换 Story、调整 Controls 或重新加载时会重新建立样例；任务、收藏、提醒和备注不会写入产品使用的 `quiet-glass-v1` 浏览器存储。

交互沿用实际组件控制器，包括预览开关、键盘焦点返回、待办勾选、提醒完成、AI 引用与草稿。AI 仍为本地演示，带入草稿或引用不会自动发送。独立的卡片状态样本只展示外观，不能误触业务操作。

## 本地保存与共享

持续维护时，保存并共享整个 Git 仓库。团队成员取得相同提交后运行 `npm ci` 和 `npm run storybook`，即可查看、修改和继续调用这套组件。

只需分享可查看版本时，构建静态工作台：

```sh
npm run build:storybook
python3 -m http.server 6006 --bind 127.0.0.1 --directory storybook-static
```

打开 `http://localhost:6006`。把整个 `storybook-static/` 目录交给对方，对方也通过 HTTP 服务打开。该目录包含 HTML、脚本和样式等多个文件，不能只复制 `index.html`，也不使用双击文件的 `file://` 方式访问。

静态版本可以放到团队已有的静态站点服务器，并按该服务器的方式配置访问权限。本次只提供本地工作台与可构建的静态版本，没有公开部署。`storybook-static/` 是生成目录，Git 保存源码及锁文件；需要时可以重新生成。

原有 `index.html`、`icons.html`、`cards.html`、`components.html`、`research.html` 继续用于产品与独立目录预览。它们由 `npm run build` 构建，Storybook 有自己的 `build:storybook` 构建入口。

## 验证与截图

```sh
npm test
npm run build:storybook
npm run test:storybook
```

最后一步需要 Playwright Chromium。首次在自己的开发机运行浏览器测试时，可执行 `npx playwright install chromium`；CI 安装过程包含浏览器运行所需依赖。

`tests/storybook.cjs` 检查 Story 索引与共享源码清单的覆盖关系，逐个加载所有 Story，并验证 Controls、预览焦点、任务与提醒、AI 草稿边界、重复渲染清理、存储隔离和窄屏布局。结果与截图写入 `tests/artifacts/`，包括工作台、图标总览、卡片、组件和手机截图。实际通过状态以本次 CI 与测试报告为准。

## 官方使用参考

- [Story 与组件示例](https://storybook.js.org/docs/writing-stories/index)
- [Args：组件参数](https://storybook.js.org/docs/writing-stories/args)
- [Controls：交互调参](https://storybook.js.org/docs/essentials/controls)
- [发布和共享 Storybook](https://storybook.js.org/docs/sharing/publish-storybook)
