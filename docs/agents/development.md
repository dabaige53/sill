# 开发

更新：2026-10-27。

Web 使用 React + TypeScript + Vite 与官方 React 插件，macOS 保留 SwiftUI，决策见 [ADR 0047](../adr/0047-react-web.md)。本地构建预览为 `npm start` → `server/local/index.ts` → `dist/web/index.html`，默认端口 4318。修改 `apps/web/` 后运行 `npm run build` 并刷新页面，不直接修改产物。

开发时保持本地服务运行，另开终端执行 `npm run dev`，访问 `http://localhost:5173/#feed`。Vite 提供组件热更新，并将本地 API 请求代理到 4318。入口和旧页面排查见 [本地操作](../guides/local-operations.md#页面入口与更新)。云端入口是 `server/cloud/worker.ts`；Mac 使用 Swift 原生数据层。本地、云端和 MCP 内嵌页共用 Web 组件，单文件 HTML 只用于构建交付。

- `apps/web/data/store.ts`：浏览器状态与旧记录迁移。
- `apps/web/services/local-sync.ts`：页面与本地数据的双向同步。
- `server/local/repository.ts`：卡片、状态校验、原子保存与冲突检查。
- `scripts/sill.ts`：Codex / Hermes / Claude 可调用的 JSON 命令。
- `apps/web/views/shell.tsx`、`feed.tsx`、`cloud-views.tsx`：页面外壳、信息流与云端视图。
- `apps/web/cards/components.tsx`、`apps/web/interactions/panel-*.tsx`、`previews-components.tsx`：卡片、面板与预览组件。
- `apps/web/views/app.ts` 与同目录 `app-*.ts`：动作、导航、状态更新及交互编排。`views/react-renderer.ts` 管理 React 根与同步测量边界；手势在 `interactions/gestures.ts` 与 `gesture-*.ts` 中。
- `apps/web/interactions/phone-drawer.tsx` 与 `apps/web/views/phone-preview-stack.ts`：手机详情的 Vaul 生命周期与嵌套详情；触控板和鼠标滚轮只滚正文，不绑定自写抽屉关闭。
- `apps/web/views/home-search*.ts(x)`：主页搜索输入、卡片建议与 `#` 条件；当前候选和键盘规则以实现及设计手册为准，不沿用历史“搜索历史与推荐标签”方案。
- `apps/web/cards/templates.ts` 等静态 HTML 导出仅供测试、设计画板与兼容调用；运行时直接渲染 TSX，不把服务端渲染器打入浏览器包。
- `scripts/build-plugin.ts`：从根产品版本、`plugin.json`、`.app.json` 和现有 Skill 生成本地候选包。身份检查不代表云端对象仍存在，也不执行安装或发布。

检查选择与授权见 [测试与验证](test.md)，命令与覆盖范围见 [测试目录](../../tests/README.md)。本地浏览器测试使用独立临时数据；只在当前任务明确授权时运行。

源码合入、构建更新、浏览器加载和行为验收分别确认。`node scripts/build.ts --check` 只证明产物与当前源码一致，不代替交互回归。动效整合后的行为与分阶段验证见 [本地整合记录](../records/2026-10-19-react-motion-integration/README.md)；后续重构不能直接沿用此前测试通过的结论。

旧宿主、直连连接器和仅测试旧入口的代码已删除，可从 `legacy-final` 找回。既有云端授权、API、MCP 和 SQL 准备脚本保留；本次清理不部署或应用数据库变更。
