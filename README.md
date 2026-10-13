# Sill · 窗台

Sill 是 agent 驱动的个人工作台（原名 Quiet Glass；包名、命令和本地数据路径暂沿用 `quiet-glass`）。Agent 持续负责内容采集、理解、执行与回写；卡片展示真实状态，也让用户表达完成、阅读、同步等意图。外部动作由 agent 通过宿主已有 MCP 或经核验的开源 MCP 执行，不为每个按钮增加外部应用直连接口。

**当前实现与目标有差距：** 当前页面和 agent 通过 local skill/CLI 共用本地数据，页面动作仍直接更新本地状态；持久意图队列、执行器、MCP 执行结果关联与回写协议尚未实现。本文档变更不代表这些能力已上线。架构边界、候选服务及默认禁用示例见 [Agent 与 MCP](docs/AGENT-MCP.md)。

## 启动

```sh
npm ci
npm run build
npm start
```

Node.js 24+、Python 3。打开 [本地卡片页面](http://127.0.0.1:4318/#feed)。服务仅监听本机，不需要应用授权或 MCP 连接。

页面保留卡片预览、完整阅读、来源跳转、收藏、稍后读、任务完成、提醒处理、标签、备注和筛选。内容采集、整理、生成和批量操作交给当前 AI。页面不内置聊天。来源界面仍有占位行为，不能据此判断外部应用已经连接；当前刷新只同步本地数据。

## AI 操作

```sh
node scripts/qg.mjs list
node scripts/qg.mjs get <卡片ID>
node scripts/qg.mjs capabilities
node scripts/qg.mjs apply --file /tmp/operations.json
node scripts/qg.mjs open <卡片ID>
```

写入示例：

```json
{
  "operations": [
    {"op":"card.upsert","card":{"id":"my-note","type":"note","title":"一个想法","body":["正文"],"url":"https://example.com"}},
    {"op":"item.patch","id":"my-note","values":{"bookmarked":true,"note":"下一步","tags":["工作"],"tagsEdited":true}}
  ]
}
```

替换已有卡片前先读取完整内容，保留其他字段；使用读取到的 `expectedRevision` 防止覆盖并发修改。同批操作全部成功才保存。命令默认返回简短结果，`state` 导出完整数据。详细字段以 `capabilities` 为准。AI 操作覆盖见 [本地操作说明](docs/LOCAL-OPERATIONS.md)。

Codex 插件使用 [本地技能](skills/quiet-glass/SKILL.md)。Hermes、Claude 可读取该技能或执行本地命令；这不代表外部来源无需配置。外部工具在实际 agent 宿主中配置 MCP，首次登录或 token 按上游要求由宿主/MCP 安全管理；Sill 不另建 OAuth，不保存秘密，只记录连接引用、能力和真实检测状态（该连接元数据协议仍待实现）。

## 当前生产缺口

- **P1，未修：** 正常在线页面整卡保存缺少版本保护，可能覆盖 agent 对同一卡片的新修改；离线恢复的版本校验不能替代此修复。
- **P1，未修：** 日历允许/RSS添加可写入成功状态，却没有真实读取链路；RSS地址未持久化。不可作为连接成功的依据。
- 意图调度、跨进程单写入保护、自动备份与恢复演练尚待落地。详见 [落地顺序与验收](docs/AGENT-MCP.md#落地顺序与验收)。

## 本地数据

数据保存在 `.quiet-glass/local/cards.json`。页面每秒同步；刷新重新读取数据，不生成假内容。首次打开会迁移当前浏览器 `quiet-glass-v1` 的卡片和阅读、收藏、任务、备注等记录；旧浏览器记录保留为备份。已有本地文件时不会用浏览器内容覆盖它。

原 SQLite、配置和云端数据保持原样。旧后端代码保留供历史数据维护，默认启动、构建与本地插件均不加载。历史云端发布流程不属于当前产品入口，后续发布需另行验收。

## 开发与验证

- `npm run build`：从 `src/` 构建首页。
- `npm test`：构建、语法与本地操作测试。
- `npm run test:core`：阅读、提醒及旧记录迁移检查。
- `npm run test:browser`：核心交互与响应式布局回归。
- `npm run test:local-browser`：真实浏览器验证 AI 写入、页面写回、多页面同步和重启保留。
- `npm run plugin:build`：构建无应用依赖、无 MCP 注册的本地技能插件，身份仍为 `quiet-glass@quiet-glass-local`。

设计规范保留在 [design-system](design-system/README.md)，设计画板本地副本用 `npm run boards` 打开。产品需求、交互规范和设计决策在 `docs/`；当前范围以本文件和 [本地操作说明](docs/LOCAL-OPERATIONS.md) 为准。
