# Quiet Glass

一个 **Card-first / Quiet Glass** 的个人信息空间，基于用户与 ChatGPT 在 2026-10-10 至 2026-10-11 的产品设计讨论。

V0.2 在原有设计原型上增加了可运行的 **Codex 插件 + MCP 服务 + SQLite 数据层**，支持 Google Calendar、Notion、通用 Streamable HTTP MCP 数据源，以及在 Codex 对话中采集、检索、推荐、编排任务和准备外部写入。

**开始使用：[Codex 插件与连接器接入说明](./docs/CODEX-PLUGIN.md)。** 插件可在本机安装，也可连接自行部署的 HTTPS MCP 服务；仓库中的实现不代表已经安装到你的 Codex 或已经授权真实账号。

## 在线查看与本地运行

- [信息流](./index.html)：主体交互原型
- [组件实验室](./components.html)：原子组件、卡片与控件
- [设计与来源](./research.html)：设计参考与组件选型
- [完整产品需求](./docs/PRODUCT-REQUIREMENTS.md)
- [交互设计规范](./docs/INTERACTION-SPEC.md)
- [对话与设计决策](./docs/CONVERSATION-HISTORY.md)
- [测试说明](./tests/REPORT.md)

直接用浏览器打开三个 HTML 文件仍可体验离线设计原型。使用 Node.js 24+ 运行服务后，首页进入真实数据模式，读取服务中的卡片；`components.html` 和 `research.html` 保留设计演示。对话推理由 Codex 完成，网页问题通过本地队列交给 Codex，网页不会自行唤起模型。

```bash
npm ci
cp quiet-glass.config.example.json quiet-glass.config.json
cp .env.example .env
# 按接入说明配置来源与环境凭据后：
npm run plugin:build
npm start
```

HTTP 模式必须配置 `QG_AUTH_TOKEN`；本地 stdio 插件可独立使用。默认所有外部写入关闭，开启后仍需准备具体草稿并确认。密钥仅保留在服务进程环境或未提交的 `.env` 中。

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

## 文件结构

```text
index.html
components.html
research.html
docs/
  PRODUCT-REQUIREMENTS.md
  INTERACTION-SPEC.md
  CONVERSATION-HISTORY.md
  DESIGN-DECISIONS.md
tests/
  REPORT.md
  *.test.mjs
server/                 # MCP、连接器、持久化与任务编排
web/live.js             # 原信息流的真实数据适配
skills/quiet-glass/     # Codex 对话编排技能
scripts/                # 插件构建与校验
plugin.json             # 可移植插件清单
quiet-glass.config.example.json
```

原始模块化构建包此前已在对话中作为 `quiet-glass-source.zip` 交付；保留的单文件 HTML 是设计基线，不代表最终组件架构。新增后端和真实数据适配使用独立模块。

## 验证

```bash
npm run check
npm test
```

测试通过官方 MCP SDK 验证 stdio / HTTP 连接、工具与资源、跨 MCP 采集、日历/Notion 协议、去重与持久化、推荐、工作流恢复、确认与幂等写入、网页请求回传。外部服务使用隔离测试数据；真实账号必须完成授权后单独验收。详见 [集成验证记录](./tests/INTEGRATION-REPORT.md)。

## 后续开发原则

设计变量 → 图标/玻璃/按钮等原子组件 → 四种外观形态和业务卡片模板 → 筛选/预览/拖拽/AI 等交互状态机 → 信息流编排 → 真实数据源连接。

设计研究建议：Apple Human Interface Guidelines、Lucide、Motion、Radix、dnd-kit。当前独立 HTML 演示并不代表已实际安装这些库。

版权所有：项目所有者。
