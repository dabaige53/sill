# 开发

当前产品为本地卡片工作区。入口为 `npm start` → `server/local.mjs` → `index.html`。修改 `src/` 后运行 `npm run build`，不要只修改构建后的 HTML。

- `src/data/store.js`：浏览器状态与旧记录迁移。
- `src/services/local-sync.js`：页面与本地数据的双向同步。
- `server/local-state.mjs`：卡片、状态校验、原子保存与冲突检查。
- `scripts/qg.mjs`：Codex / Hermes / Claude 可调用的 JSON 命令。
- `src/views/app.js`、`src/cards/templates.js`、`src/interactions/`：卡片与核心交互。
- `scripts/build-plugin.mjs`：从 `plugin.json` 的本地 Codex 格式构建技能插件。没有应用声明、云端连接或 MCP 配置。

验证命令见 README。运行 `tests/local-browser.mjs` 会使用独立临时数据，不修改正式卡片。响应式测试覆盖 320、390、810、1440、2048 像素。

旧 MCP、连接器、工作流与云端适配器保留为历史实现，未进入当前页面或启动链路。旧配置与数据库不迁移、不删除；其历史测试通过 `test:legacy` 单独运行，不作为当前本地产品验收。
