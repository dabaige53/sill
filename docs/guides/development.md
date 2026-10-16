# 开发

更新：2026-10-16。

本地 Web 入口为 `npm start` → `server/local/index.ts` → `dist/web/index.html`。修改 `apps/web/` 后运行 `npm run build`，不直接修改产物。云端入口是 `server/cloud/worker.ts`；Mac 使用 Swift 原生数据层。

- `apps/web/data/store.ts`：浏览器状态与旧记录迁移。
- `apps/web/services/local-sync.ts`：页面与本地数据的双向同步。
- `server/local/repository.ts`：卡片、状态校验、原子保存与冲突检查。
- `scripts/sill.ts`：Codex / Hermes / Claude 可调用的 JSON 命令。
- `apps/web/views/app.ts`、`apps/web/cards/templates.ts`、`apps/web/interactions/`：卡片与核心交互。
- `scripts/build-plugin.ts`：从根产品版本、`plugin.json`、`.app.json` 和现有 Skill 生成本地候选包。身份检查不代表云端对象仍存在，也不执行安装或发布。

验证命令见 README。运行 `tests/e2e/local-browser.ts` 会使用独立临时数据，不修改正式卡片。响应式测试覆盖 320、390、810、1440、2048 像素。

旧宿主、直连连接器和仅测试旧入口的代码已删除，可从 `legacy-final` 找回。既有云端授权、API、MCP 和 SQL 准备脚本保留；本次清理不部署或应用数据库变更。
