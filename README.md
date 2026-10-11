# Quiet Glass

一个 **Card-first / Quiet Glass** 的个人信息流原型，基于用户与 ChatGPT 在 2026-10-10 至 2026-10-11 的产品设计讨论。

## Storybook 组件工作台

现在优先在 Storybook 中查看、试用和维护设计系统。图标、卡片、状态和基础组件按独立 Stories 保存，Controls 用于临时调整参数；正式修改保存在共享源码与 `.stories.js` 文件，并通过 Git 共享。

```sh
npm ci
npm run storybook
```

打开 `http://localhost:6006`。构建可分享的静态目录：`npm run build:storybook`；本地查看构建结果：`npm run preview:storybook`。完整使用、编辑与共享流程见 [Storybook 指南](./docs/STORYBOOK.md)。

## 独立 HTML 预览

- [信息流](./index.html)：主体交互原型
- [图标库](./icons.html)：38 个真实图标及尺寸、用途
- [卡片库](./cards.html)：10 种类型、13 个变体和 6 种状态
- [组件库](./components.html)：控件、浮层、反馈与 AI 组件
- [设计系统维护指南](./docs/DESIGN-SYSTEM.md)：独立存放与共享调用方式
- [设计与来源](./research.html)：设计参考与组件选型
- [完整产品需求](./docs/PRODUCT-REQUIREMENTS.md)
- [交互设计规范](./docs/INTERACTION-SPEC.md)
- [对话与设计决策](./docs/CONVERSATION-HISTORY.md)
- [测试说明](./tests/REPORT.md)

直接用浏览器打开五个 HTML 文件即可体验。它们是独立运行的**设计原型**，并非已经接入邮件、日程、笔记和真实 AI 的成品服务。

> 仓库为 Private。私有 GitHub 仓库不能直接当作对外公开网页访问；如果需要私密的在线预览，还应单独安排受控身份验证的部署。

## 产品立场

> 平时只有内容，操作时才有工具。卡片既可阅读，也可交给 AI 处理。

- 不要常驻导航栏、侧边栏、顶栏筛选标签、Banner 或统计面板。
- 信息流是统一入口，邮件/资讯/笔记/待办/日程/提醒/媒体/阅读反馈等都以卡片呈现。
- 收藏、标签、备注、稍后读、筛选等是**按需唤出的动作与状态**。
- Apple 风格的半透明玻璃主要用于浮动控件；内容卡片仍以明确、易读的实体表面承载信息。
- 拖动卡片至浮动 AI 接收区，即带引用打开聊天，不应自动向模型发送。
- 电脑端支持 hover、drag，触屏支持长按及显式替代入口。
- 不把卡片点击与“完整阅读”混为一谈，已读状态与阅读进度单独追踪。
- 重要提醒自然穿插信息流，不能过度打扰，也不应在刷新时打断当前阅读。

## V0.5 主题与信息层级

V0.5 视觉修订已将主题统一为中性白灰、石墨文字和蓝色动作强调，按内容用途收紧卡片信息，取消自动跨列大卡，折叠设计库中的结构与源码说明。研究依据、尺寸预算和主题基线见 [V0.5 设计修订](./docs/DESIGN-REVIEW-V05.md)。该配色是本轮可评审方案，后续可继续在共享变量中调整。

## V0.4 Storybook 设计系统

新增 Storybook HTML/Vite 工作台，94 个独立 Stories 覆盖当前完整图标、卡片、状态、组件、设计变量和参考资料。Storybook 与离线页面读取同一份 JS / CSS 构建清单，不复制组件实现。故事使用独立内存数据，预览与产品收藏、阅读及任务记录隔离。

## V0.3 卡片体验与独立设计库

新增独立图标库、卡片库和组件库，研究参考另页存放；全部复用信息流的真实实现。样式拆为变量、基础、控件、卡片、浮层、目录和响应式七层，后续可先优化库，再同步产品。优化阅读、提醒行动和 AI 引用三类卡片的层次、直接操作与连续反馈。设计资料与实现范围见[卡片优化说明](./docs/CARD-REFINEMENT.md)。研究页同步收录官方视觉说明和可体验的参考组件。

## V0.2 开发基础

已恢复共享模块化源码与可复现构建，新增提醒延后/忽略/完成/恢复/撤销、提醒去重与冷却、三种信息流排序、旧版状态兼容和刷新卡片持久化。到期提醒先暂存，点击玻璃入口旁的计数后再更新信息流。

```sh
python3 scripts/build.py
python3 tests/verify.py
```

[开发指南与后续工作](./docs/DEVELOPMENT.md)说明源码结构、运行方式与浏览器测试。V0.2 基线有 20 项核心检查与 9 组 Chromium 浏览器回归；本轮结果见[验证记录](./tests/REPORT.md)。

## 文件结构

```text
index.html / icons.html / cards.html          # 产品、图标库、卡片库
components.html / research.html              # 组件库、研究参考
src/                                       # 共享源码、样式与页面壳
scripts/build.py                           # 零第三方依赖构建器
scripts/modules.json                       # 模块依赖顺序
.storybook/                                # Storybook 配置与共享源码适配
stories/                                   # 独立 Stories、隔离交互适配与工作台样式
tests/                                     # 核心检查、浏览器回归与验收记录
docs/                                      # 产品需求、交互规范、对话与开发指南
```

请修改 `src/` 后重新构建五个 HTML 入口。独立 HTML 页面运行不需要安装第三方依赖；Storybook 开发需要先安装 package-lock.json 锁定的工具依赖，Playwright 用于浏览器回归。

## 后续开发原则

设计变量 → 图标/玻璃/按钮等原子组件 → 四种外观形态和业务卡片模板 → 筛选/预览/拖拽/AI 等交互状态机 → 信息流编排 → 真实数据源连接。

设计研究建议：Apple Human Interface Guidelines、Lucide、Motion、Radix、dnd-kit。当前独立 HTML 演示并不代表已实际安装这些库。

版权所有：项目所有者。

## MCP 与真实数据接入

同一仓库同时提供 V0.5 设计原型与单用户 MCP / HTTP 后端。完整安装使用 Node.js 24+、Python 3 和 `npm ci`。`npm start` 启动连接模式，静态打开 HTML 仍为离线演示；凭据和真实来源不会自动继承。详见 [Codex 插件与连接器接入](docs/CODEX-PLUGIN.md)。

- `npm test`：源码与生成页面一致性、核心测试，以及后端、MCP/HTTP 协议和页面联调。
- `npm run test:browser`：离线产品浏览器回归。
- `npm run test:live-browser`：隔离 MCP 来源 → HTTP 服务 → 真实浏览器的完整联调。
- `npm run build:storybook && npm run test:storybook`：共享设计库构建与浏览器回归。
- `npm run plugin:build`：生成本地插件包。

真实模式的初始化维护在 `src/views/app.js`、`src/index.js`、`src/shell.html`，由构建生成全部五个入口；运行适配器为 `web/live.js`。请勿只修改生成后的首页。

## 普通设置跨入口同步

排序和减少透明度现在可通过网页、MCP 或 HTTP 修改，并由 SQLite 持久保存。使用 `qg_read_settings` / `qg_update_settings` 读取和按版本更新；冲突不会自动覆盖。离线演示仍只保存本地设置。范围、接口及验收见 [普通设置](docs/SETTINGS.md)。

## 本地内容与备注

连接模式可新建、读取和编辑本地笔记，并持久保存卡片个人备注与标签。网页、MCP 和 HTTP 共用版本检查；冲突、延迟响应与刷新后保留草稿。来源正文与来源标签保持原样。接口与边界见 [本地内容](docs/LOCAL-CONTENT.md)，浏览器联调运行 `npm run test:content-browser`。

## 宿主卡片上下文

`qg_open_workspace` 可打开 MCP App 卡片视图：将选中卡片作为有大小限制的引用带入当前宿主对话，讨论操作只准备草稿，需手动发送。保留独立网页的队列模式。运行 `npm run plugin:build` 生成内嵌资源；实际宿主安装尚未验证，接口与兼容边界见 [宿主卡片上下文](docs/HOST-APP.md)。

## 独立网页对话恢复

应用自己的对话、消息、引用快照与待处理状态已持久保存；刷新后可继续等待回答，也能从历史恢复多轮内容。没有自动调用付费 AI。接口、幂等重试与旧数据迁移见 [对话历史](docs/CONVERSATIONS.md)。

## 可选独立 AI 回答

独立网页现在可以显式调用已配置的 OpenAI API，流式显示内容并将回答保存到应用历史。默认关闭、模型留空；次数限制、并发限制、取消与未知结果恢复均由服务器处理，不自动调用或重试。运行 `npm run test:ai-browser` 验证假提供方联调。配置、费用边界与工具合同见 [独立 AI](docs/AI-PROVIDER.md)。

## 宿主协助的跨应用来源

当宿主确实提供已授权的 Notion、Google Calendar 或 Linear 工具时，可由宿主读取指定内容，再通过 `qg_ingest` 保存带范围、稳定上游 ID、链接、读取时间和完整性标记的卡片。原文与模型摘要分开显示；更新经过版本检查。Quiet Glass 不继承宿主凭据，也不宣称这些应用已经安装。合同、导入示例与边界见 [宿主来源归因](docs/HOST-PROVENANCE.md)。

## 外部代理的受限访问

运营者可以给外部代理单独配置有限的卡片读取与本地写入权限，并限制来源、卡片、请求大小、速率和并发。默认关闭；示例只包含环境变量名，不创建任何凭据。HTTP 与 MCP 共用权限边界，审计记录实际身份；所有者模式仍是完整维护入口。配置、能力范围与限制见 [受限代理访问](docs/AGENT-ACCESS.md)。

## 可检查的推荐偏好

关注词、来源优先级、排除来源和已读策略可保存到现有普通设置，并通过网页、HTTP 与 MCP 同步。推荐返回规则理由和来源证据；单次调用可显式覆盖，受限代理不会继承所有者偏好。详见 [推荐偏好](docs/RECOMMENDATION-PREFERENCES.md)。
