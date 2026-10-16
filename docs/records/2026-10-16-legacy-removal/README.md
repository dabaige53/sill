# 旧入口清理记录

2026-10-16。仅删除 Git 管理的退役实现与对应测试，不读取或删除本地卡片、Mac 数据、数据库迁移、发布快照和历史证据。

取回入口：`git show legacy-final:<原路径>`。本地标签 `legacy-final` 指向仍含完整旧实现的 `65bcb5d`；标签未推送。

保留现行本地服务、云端 Worker、Web 界面、官方 MCP 调用、用户 JWT 鉴权与授权测试。`server/supabase-import.mjs` 是纯数据迁移准备，不属于退役连接器，保留后迁入 `scripts/prepare-import.ts`。删除的功能文档保留在 `docs/archive/`。

移除已无引用的 `@openai/mcp-extensions`，删除旧命令与连接器环境变量。实际引用检查发现 `@modelcontextprotocol/ext-apps` 仍被现行云端 bridge 使用，因此保留，不按交接的候选清单误删。不恢复直连接口，不变更线上 OAuth 或授权范围。秘密仅由宿主或部署环境提供。

## 删除文件

- `server/access.mjs`
- `server/ai.mjs`
- `server/backup-format.mjs`
- `server/backups.mjs`
- `server/config.mjs`
- `server/connectors.mjs`
- `server/host-app.mjs`
- `server/http.mjs`
- `server/index.mjs`
- `server/jobs.mjs`
- `server/mcp.mjs`
- `server/schemas.mjs`
- `server/scripts.mjs`
- `server/service.mjs`
- `server/store.mjs`
- `server/wasm-registry.mjs`
- `server/wasm-runtime.mjs`
- `server/wasm-runner.py`
- `scripts/build-host.mjs`
- `sill.config.example.json`
- `requirements-sandbox.txt`
- `web/ai.js`
- `web/backups.js`
- `web/content.js`
- `web/conversations.js`
- `web/host-transport.js`
- `web/host.js`
- `web/jobs.js`
- `web/live.js`
- `web/preferences.js`
- `web/scripts.js`
- `scripts/wasm/README.md`
- `scripts/wasm/bounded-echo.wasm.b64`
- `scripts/wasm/bounded-echo.wat`
- `scripts/wasm/build-fixtures.py`
- `scripts/wasm/integer-stats.wasm.b64`
- `scripts/wasm/integer-stats.wat`
- `tests/access-protocol.test.mjs`
- `tests/access.test.mjs`
- `tests/ai-browser.mjs`
- `tests/ai-protocol.test.mjs`
- `tests/ai.test.mjs`
- `tests/backup-format.test.mjs`
- `tests/backups-browser.mjs`
- `tests/backups-protocol.test.mjs`
- `tests/backups-ui.test.mjs`
- `tests/backups.test.mjs`
- `tests/connectors.test.mjs`
- `tests/content-browser.mjs`
- `tests/content.test.mjs`
- `tests/conversations-browser.mjs`
- `tests/conversations.test.mjs`
- `tests/core.test.mjs`
- `tests/host-browser.mjs`
- `tests/host.test.mjs`
- `tests/jobs-browser.mjs`
- `tests/jobs-protocol.test.mjs`
- `tests/jobs.test.mjs`
- `tests/live-browser.mjs`
- `tests/preferences-browser.mjs`
- `tests/preferences-protocol.test.mjs`
- `tests/preferences.test.mjs`
- `tests/protocol.test.mjs`
- `tests/provenance-browser.mjs`
- `tests/provenance-protocol.test.mjs`
- `tests/provenance.test.mjs`
- `tests/scripts-browser.mjs`
- `tests/scripts-protocol.test.mjs`
- `tests/scripts.test.mjs`
- `tests/settings-browser.mjs`
- `tests/settings.test.mjs`
- `tests/ui.test.mjs`
- `tests/wasm-runtime.test.mjs`

## 检查

现行入口的引用检查和完整本地测试在本批次执行；线上两个 P1 仍未修复。本记录不代表线上验收或部署。
