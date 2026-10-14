# Quiet Glass

本地卡片工作区。页面负责查看与核心交互，Codex、Hermes、Claude 通过同一套本地命令管理内容。页面和 AI 共用一份本地数据，修改后自动同步。

## 启动

```sh
npm ci
npm run build
npm start
```

Node.js 24+、Python 3。打开 [本地卡片页面](http://127.0.0.1:4318/#feed)。服务仅监听本机，不需要应用授权或 MCP 连接。

页面保留卡片预览、完整阅读、来源跳转、收藏、稍后读、任务完成、提醒处理、标签、备注和筛选。内容采集、整理、生成和批量操作交给当前 AI。页面不提供模拟聊天、应用连接或兼容插件列表。

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

Codex 插件使用 [本地技能](skills/quiet-glass/SKILL.md)。Hermes、Claude 读取该技能或直接执行上述命令；无需另外连接应用。获取外部资料由当前 AI 使用用户已授权的能力完成，再写入卡片。

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

设计规范保留在 [design-system](design-system/README.md)。历史产品文档保留在 `docs/`；当前范围以本文件和 [本地操作说明](docs/LOCAL-OPERATIONS.md) 为准。

### 从干净仓库安装 Codex 本地插件

```sh
codex plugin marketplace add dabaige53/quiet-glass
codex plugin add quiet-glass@quiet-glass-local
```

marketplace 使用已提交的 `plugins/quiet-glass`，不需要先构建。技能自带可移植 CLI；需要 Node.js 24+。开发时运行 `npm run plugin:build` 后提交生成目录。

插件只操作本机 loopback 服务。先在自己选定的仓库运行 `npm start`；不要在插件缓存中启动服务或存数据。安装成功不表示云端 Sill 登录、远程 MCP 或来源已连接。本包不包含 MCP 注册、OAuth 或云端凭据。
