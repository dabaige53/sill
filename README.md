# Sill · 窗台

已删除云端侧边栏包装插件，保留原 Sill 应用；旧插件发布对象仍待删除。准确身份、地址、登录状态与发布障碍见 [现状盘点](docs/SILL-STATUS-20261015.md)。网页登录续期代码已部署，但真实账号长期续期和宿主应用、侧边栏仍待验收；全部问题关闭后再发布统一版本，不再本地安装插件。

本地开发新增 **SwiftUI macOS 原生应用**，以及 Web 编辑草稿保护、卡片并发保存检查与布局优化。Mac 构建和数据位置见 [原生应用说明](native/macos/README.md)，本轮变更与发布边界见 [本地交付说明](docs/LOCAL-RELEASE-20261015.md)。这些变更尚未发布到下述云端入口。

> 当前发布入口：[`sill-web-preview`](https://sill-web-preview.scs1213-temp-email.workers.dev/)。云端版本支持已有账号 PKCE 登录及内容读写，工作台没有顶部整排工具栏。Codex 云端插件接入变更见 [2026-10-15 发布说明](docs/RELEASE-20261015.md)；实际账号授权完成情况以该次部署验收为准。下列旧规划段落保留历史语境；当前发布状态与回滚步骤以 [最新发布说明](docs/RELEASE-20261015.md) 为准。


Sill 是 agent 驱动的个人工作台。包名和本地数据目录已统一为 `sill`。Agent 持续负责内容采集、理解、执行与回写；卡片展示真实状态，也让用户表达完成、阅读、同步等意图。外部动作由 agent 通过宿主已有 MCP 或经核验的开源 MCP 执行，不为每个按钮增加外部应用直连接口。

**V1 方向已收敛为外部助手驱动：** Sill 将 UI 动作/事件发送到配置好的 OpenClaw 或 Hermes Webhook，由外部助手调用 Sill MCP 读取和写回结果。V1 不做内置 LLM、聊天引擎或 agent runtime；供应商官方能力已核验，用户实例适配、框架与部署仍待确认，内置助手与上游 tools 桥接保留为远期可选。

**当前实现：** 云端已提供鉴权网页、卡片 API 和对外 MCP；本地 Web 与 CLI 仍共用本地数据。外部助手 Webhook 的端到端执行尚未验收，不能以排队状态表示任务完成。已确认原则、候选 API、模块边界和实施顺序统一见 [Agent 与 MCP](docs/AGENT-MCP.md)。

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

Codex 插件使用云端 MCP App，接入状态见 [最新发布说明](docs/RELEASE-20261015.md)。Hermes、Claude 可读取 [本地技能](skills/sill/SKILL.md) 或执行本地命令；这不代表外部来源无需配置。外部工具在实际 agent 宿主中配置 MCP，首次登录或 token 按上游要求由宿主/MCP 安全管理；Sill 不另建上游 OAuth；业务状态只记录连接引用、能力和真实检测状态。秘密由宿主或服务端安全凭据设施提供给 MCP，不向前端、模型或外部 agent 返回。对外 MCP 调用方鉴权与授权仍必须实现，不能把“不自建上游 OAuth”理解为匿名开放（当前内容 MCP 与授权已实现，外部工具桥接仍待实现）。

## 旧版本地原型的已知限制

- 旧版本地原型的整卡保存/来源接入历史限制见 [AGENT-MCP](docs/AGENT-MCP.md)。当前云端 Sill 编辑使用 expectedRevision 并保留冲突草稿，不能把两个运行路径混为一谈。
- 旧版原型的日历/RSS操作不代表真实连接。当前云端 Sill 不展示伪造来源连接成功，外部来源接入仍未启用。
- 意图调度、跨进程单写入保护、自动备份与恢复演练尚待落地。详见 [落地顺序与验收](docs/AGENT-MCP.md#落地顺序与验收)。

## 本地数据

数据保存在 `.sill/local/cards.json`。页面每秒同步；刷新重新读取数据，不生成假内容。首次打开会迁移当前浏览器 `sill-v1` 的卡片和阅读、收藏、任务、备注等记录；旧浏览器记录保留为备份。已有本地文件时不会用浏览器内容覆盖它。

原 SQLite、配置和云端数据保持原样。旧后端代码保留供历史数据维护，默认本机启动不加载旧云端后端。当前云端插件发布与验收见最新发布说明。

## V1 三端交接准备

[接口、架构、原生调用示例与检查脚本](docs/V1-HANDOFF.md) 集中索引 OpenAPI、MCP schemas、合成请求/响应及 Swift 示例。均为未实现契约，不是已上线接口；只准备内容，代码实施和部署仍需确认。

## 开发与验证

- `npm run build`：从 `src/` 构建首页。
- `npm test`：构建、语法与本地操作测试。
- `npm run test:core`：阅读、提醒及旧记录迁移检查。
- `npm run test:browser`：核心交互与响应式布局回归。
- `npm run test:local-browser`：真实浏览器验证 AI 写入、页面写回、多页面同步和重启保留。
- `npm run plugin:build`：生成原 Sill 应用的未发布候选包到 `dist/plugin/sill/`；不安装、不发布。

设计规范保留在 [design-system](design-system/README.md)。历史产品文档保留在 `docs/`；当前范围以本文件和 [本地操作说明](docs/LOCAL-OPERATIONS.md) 为准。

### 云端插件

不再通过本地 marketplace 安装 Sill。统一目标是原 App 对应的云端插件，准确 ID 与验收状态见 [现状盘点](docs/SILL-STATUS-20261015.md)。构建配置已统一为原 Sill 应用，发布身份集中在 `deploy/sill/release.json`。本机旧卡片不会自动上传。

本地 CLI 仍可按上文本地操作说明单独使用。云端插件不需要启动本机服务。版本与验收限制见 [云端插件接入说明](docs/RELEASE-20261015.md)。
