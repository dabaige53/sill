# 脚本目录

状态：操作说明。更新：2026-10-19。命令定义以 [package.json](../package.json) 为准，目录规则见 [文件管理规范](../docs/guides/file-management.md)。构建只生成本地文件，不代表安装、发布或线上验收。

| 用途 | 命令或脚本 | 主要输入 → 输出 |
| --- | --- | --- |
| 文件管理检查 | `npm run files:check` | 根目录、导航、Git 文件清单 → 终端结果；只读 |
| React 开发服务 | `npm run dev` / `scripts/dev.ts` | Vite + React Fast Refresh，5173；本地 API 代理到 4318 |
| 本地页面 | `npm run build` | Vite、`apps/web/`、共享文案与样式清单 → `dist/web/index.html` |
| 云端页面与 Worker | `npm run build:cloud` | `apps/web/`、`server/cloud/`、`contracts/` → `dist/cloud/` |
| 发布候选构建 | `npm run build:release` | 同上，压缩 Worker → `dist/cloud/`；不执行部署 |
| 云端 App 页面 | `node scripts/build-cloud-app.ts` | `dist/cloud/index.html` 等 → `dist/cloud/app.html`；先完成云端页面构建 |
| 插件候选包 | `npm run plugin:build` | 根产品版本、无独立版本的 `plugin.json` 元数据模板、`.app.json`、身份检查与 `skills/sill/` → `dist/plugin/sill/` |
| Mac 原生包 | `npm run build:macos` | Swift 源码、Schema、tokens、文案 → `dist/macos/Sill.app`；不含 Node，见 [原生说明](../apps/apple/README.md) |
| 本地卡片 CLI | `node scripts/sill.ts capabilities` | 本地服务协议 → 能力说明；写入用法见 [本地操作](../docs/guides/local-operations.md) |
| 语法与配置检查 | `npm run check` | 构建后 HTML 脚本和插件模板 → 终端结果 |
| 类型检查 | `npm run typecheck` | 活跃 TypeScript 源码、脚本与测试 → 终端结果；未启用 strict |
| 格式与默认规则 | `npm run format`、`npm run lint` | 前者改写格式；后者只读检查 Biome 默认规则与 Swift 格式，保留动态类型警告 |
| 共享定义导出 | `npm run contracts:generate` | zod → `contracts/schema.json`、Apple OpenAPI 与设计材料；检查使用 `contracts:check` |
| V1 设计约定检查 | `scripts/check-contracts.ts` | `contracts/design/` → 准备材料一致性；不证明 API 已实现 |
| V1 健康检查 | `scripts/smoke-health.ts` | 显式指定目标；使用前阅读 [V1 交接包](../docs/guides/handoff.md) 的参数与边界 |

`build-cloud-worker.ts` 由云端构建调用。脚本使用 Node 24+ 直接运行 TypeScript，不再依赖 Python。`build-plugin.ts` 会替换候选产物目录，不要在产物目录保存唯一副本。候选构建保留既有 App 身份，但不能证明该云端对象当前存在；发布前仍需核对平台。

Codex 的提交前文件大小检查位于 [.codex](../.codex/README.md)，不通过 npm 安装 Git hook。
