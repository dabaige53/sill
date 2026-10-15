# Sill · 窗台

> 当前发布入口：[`sill-web-preview`](https://sill-web-preview.scs1213-temp-email.workers.dev/)。云端版本支持已有账号 PKCE 登录及内容读写，工作台没有顶部整排工具栏。远程 MCP / OAuth 授权代码默认关闭，未完成真实客户端授权。下列旧规划段落保留历史语境；当前发布状态与回滚步骤以 [发布说明](docs/RELEASE-20261014.md) 为准。


Sill 是 agent 驱动的个人工作台（原名 Quiet Glass；包名、命令和本地数据路径暂沿用 `quiet-glass`）。Agent 持续负责内容采集、理解、执行与回写；卡片展示真实状态，也让用户表达完成、阅读、同步等意图。外部动作由 agent 通过宿主已有 MCP 或经核验的开源 MCP 执行，不为每个按钮增加外部应用直连接口。

**V1 方向已收敛为外部助手驱动：** Sill 将 UI 动作/事件发送到配置好的 OpenClaw 或 Hermes Webhook，由外部助手调用 Sill MCP 读取和写回结果。V1 不做内置 LLM、聊天引擎或 agent runtime；供应商官方能力已核验，用户实例适配、框架与部署仍待确认，内置助手与上游 tools 桥接保留为远期可选。

**当前尚未实现上述链路：** 现有页面和 agent 通过 local skill/CLI 共用本地数据，没有外部 Webhook、当前产品的对外 MCP 或可靠执行队列。遵循“先排查、确认后实施”；本轮只维护方案，不修改代码或部署。已确认原则、候选 API、模块边界和实施顺序统一见 [Agent 与 MCP](docs/AGENT-MCP.md)。

## 启动

```sh
npm ci
npm run build
npm start
```

Node.js 24+、Python 3。打开 [本地卡片页面](http://127.0.0.1:4318/#feed)。服务仅监听本机，不需要应用授权或 MCP 连接。

页面保留卡片预览、完整阅读、来源跳转、收藏、稍后读、任务完成、提醒处理、标签、备注和筛选。内容采集、整理、生成和批量操作交给当前 AI。当前页面尚无内置助手入口；内置助手仅为远期可选。来源界面仍有占位行为，不能据此判断外部应用已经连接；当前刷新只同步本地数据。

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

Codex 插件使用 [本地技能](skills/quiet-glass/SKILL.md)。Hermes、Claude 可读取该技能或执行本地命令；这不代表外部来源无需配置。外部工具在实际 agent 宿主中配置 MCP，首次登录或 token 按上游要求由宿主/MCP 安全管理；Sill 不另建上游 OAuth；业务状态只记录连接引用、能力和真实检测状态。秘密由宿主或服务端安全凭据设施提供给 MCP，不向前端、模型或外部 agent 返回。对外 MCP 调用方鉴权与授权仍必须实现，不能把“不自建上游 OAuth”理解为匿名开放（上述协议均待实现）。

## 旧版本地原型的已知限制

- 旧版本地原型的整卡保存/来源接入历史限制见 [AGENT-MCP](docs/AGENT-MCP.md)。当前云端 Sill 编辑使用 expectedRevision 并保留冲突草稿，不能把两个运行路径混为一谈。
- 旧版原型的日历/RSS操作不代表真实连接。当前云端 Sill 不展示伪造来源连接成功，外部来源接入仍未启用。
- 意图调度、跨进程单写入保护、自动备份与恢复演练尚待落地。详见 [落地顺序与验收](docs/AGENT-MCP.md#落地顺序与验收)。

## 本地数据

数据保存在 `.quiet-glass/local/cards.json`。页面每秒同步；刷新重新读取数据，不生成假内容。首次打开会迁移当前浏览器 `quiet-glass-v1` 的卡片和阅读、收藏、任务、备注等记录；旧浏览器记录保留为备份。已有本地文件时不会用浏览器内容覆盖它。

原 SQLite、配置和云端数据保持原样。旧后端代码保留供历史数据维护，默认启动、构建与本地插件均不加载。历史云端发布流程不属于当前产品入口，后续发布需另行验收。

## V1 三端交接准备

[接口、架构、原生调用示例与检查脚本](docs/V1-HANDOFF.md) 集中索引 OpenAPI、MCP schemas、合成请求/响应及 Swift 示例。均为未实现契约，不是已上线接口；只准备内容，代码实施和部署仍需确认。

## 开发与验证

- `npm run build`：从 `src/` 构建首页。
- `npm test`：构建、语法与本地操作测试。
- `npm run test:core`：阅读、提醒及旧记录迁移检查。
- `npm run test:browser`：核心交互与响应式布局回归。
- `npm run test:local-browser`：真实浏览器验证 AI 写入、页面写回、多页面同步和重启保留。
- `npm run plugin:build`：构建无应用依赖、无 MCP 注册的本地技能插件，身份仍为 `quiet-glass@quiet-glass-local`。

设计规范保留在 [design-system](design-system/README.md)。历史产品文档保留在 `docs/`；当前范围以本文件和 [本地操作说明](docs/LOCAL-OPERATIONS.md) 为准。

### 从干净仓库安装 Codex 本地插件

```sh
codex plugin marketplace add dabaige53/quiet-glass
codex plugin add quiet-glass@quiet-glass-local
```

marketplace 使用已提交的 `plugins/quiet-glass`，不需要先构建。技能自带可移植 CLI；需要 Node.js 24+。开发时运行 `npm run plugin:build` 后提交生成目录。

插件只操作本机 loopback 服务。先在自己选定的仓库运行 `npm ci`，再运行 `npm start`；不要在插件缓存中启动服务或存数据。安装成功不表示云端 Sill 登录、远程 MCP 或来源已连接。本包不包含 MCP 注册、OAuth 或云端凭据。
