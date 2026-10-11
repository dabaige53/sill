# Quiet Glass 设计系统

先在独立参考库中优化，再由产品调用同一份实现。这些页面展示当前系统真实存在的图形、卡片、控件和状态；新增样本不能只改一张截图。

## Storybook 主入口

`npm run storybook` 启动本地工作台。94 个独立故事包含设计变量、38 个图标、13 个真实卡片变体、6 种状态、29 项组件，以及总览、调参和参考页。每个故事具有稳定链接；编辑 `src/` 的实现与 `stories/` 的参数可持续复用。Controls 只改变当前预览，永久保存需修改源文件并提交 Git。详见 [STORYBOOK.md](./STORYBOOK.md)。

下方五个 HTML 页面保留为可离线打开的整体预览。

## 独立入口

| 页面 | 内容 | 交互范围 |
| --- | --- | --- |
| `icons.html` | 全部 38 个 SVG 图标、中文名称、用途、调用键、18/24/32 px 预览 | 点击试用按钮反馈 |
| `cards.html` | 10 种业务类型、13 个真实变体、6 种状态 | 真实样卡支持预览、收藏、任务、提醒及 AI 引用；状态样本独立展示 |
| `components.html` | 29 项组件，按基础、表单、浮层、反馈和 AI 分组 | 控件可试用，筛选、编辑、预览与 AI 面板使用真实实现 |
| `research.html` | 28 项外部设计说明和组件参考 | 原始来源、适用场景和实现边界 |
| `index.html` | 使用共享图标、卡片、控件的信息流 | 产品主入口，不常驻展示参考库导航 |

所有入口由同一套源码构建，可离线打开。参考库导航仅在参考库页面出现。真实样卡与信息流共享同来源浏览器存储；已读、收藏、任务等操作会同步。六种状态样本使用显式状态覆盖，不写入用户记录，也没有可误触的操作。

## 单独维护，统一调用

| 想修改什么 | 唯一实现 / 配置位置 | 展示位置 |
| --- | --- | --- |
| 图标线条 | `src/atoms/icons.js` 的 `Glyphs` / `icon(name, size)` | 图标库与所有产品图标 |
| 图标名称、分组、用途 | `src/data/icon-catalog.js` | `src/views/icons-library.js` |
| 按钮、进度环、任务项、头像、标签 | `src/atoms/primitives.js` | 组件库、卡片和面板 |
| 卡片结构及静态状态 | `src/cards/templates.js` 的 `cardHTML(card, options)` | 信息流与卡片库 |
| 卡片清单及状态样本 | `src/data/card-catalog.js` | `src/views/cards-library.js` |
| 组件分组、说明与演示编排 | `src/views/library.js` 的 `LibraryView` | 组件库 |
| 预览、筛选、编辑和设置面板 | `src/interactions/panels.js` | 组件库入口与信息流 |
| AI 引用、会话和输入组件 | `src/services/ai.js` | 组件库与 AI 浮层 |
| 交互状态、键盘和焦点恢复 | `src/views/app.js` | 所有入口 |
| 动效 | `src/interactions/motion.js` | 卡片、浮层和组件动效样本 |
| 网络参考及研究说明 | `src/data/sources.js` | 研究页，独立于产品模板 |
| 库页面的公共页头和导航 | `src/views/catalog.js` | 三个库与研究页 |

图标库遍历真实 `Glyphs` 注册表，新增图标自动出现；应同时填写目录说明。新增卡片类型或形态时，更新 `CardTypes`、模板和 `CardCatalog.variants`，避免目录遗漏。

`cardHTML(card)` 渲染正常可交互卡片；`cardHTML(card, {state, passive: true, now})` 渲染不写入 Store 的静态状态。卡片被加入 AI 只创建引用，用户确认发送后才进入本地演示处理。

## 样式分层

`src/styles/styles.json` 明确构建顺序：

1. `tokens.css`：颜色、间距、圆角、阴影与动效变量。
2. `base.css`：页面、文字和基础布局。
3. `controls.css`：按钮、玻璃工具、选择条和反馈。
4. `cards.css`：业务卡片外观与状态。
5. `overlays.css`：预览、阅读、表单和 AI 浮层。
6. `catalog.css`：参考库页头、分组、样本底座和说明。
7. `responsive.css`：窄屏、触屏、减少动效与减少透明度适配。

优先修改共同变量或组件规则。参考库专属排版限制在 `.is-catalog` / `.catalog-*` / `.component-*` 中，避免影响信息流。图片资源集中在 `src/data/assets.js`，不散落到页面。

## 优化与验收流程

修改对应源文件 → 在独立库中看默认/悬停/焦点/选中/完成等状态 → 检查真实产品使用场景 → 构建全部入口。

```sh
python3 scripts/build.py
python3 tests/verify.py
npm run test:browser
```

HTML 是构建产物，不直接手工维护。浏览器回归记录桌面首屏、完整目录和手机截图，并检查 320 px 窄屏溢出。截图由 GitHub Actions artifact 保存；验收状态以 `tests/REPORT.md` 为准。

本项目当前使用原生 HTML/CSS/SVG/WAAPI；外部参考中的 React、Motion+ 等组件不代表已经安装或获得商业授权。组件库中的 AI、附件和数据源仍是本地交互演示。
