# 脚本目录

状态：操作说明。更新：2026-10-21。命令定义以 [package.json](../package.json) 为准，目录规则见 [文件管理规范](../docs/agent/file-management.md)。

| 用途 | 命令或脚本 | 主要输入 → 输出 |
| --- | --- | --- |
| 设计材料 | `scripts/design-init.sh` / `npm run design` | 变量、产品代码、画板 → 组件示例、画布索引、`dist/design/` 发布准备；命令见 [设计约束](../docs/implementation/design-system.md#命令) |
| 文件管理检查 | `npm run files:check` | 根目录、导航、Git 文件清单 → 终端结果；只读 |
| React 开发服务 | `npm run dev` / `scripts/dev.ts` | Vite + React Fast Refresh，5173；本地 API 代理到 4318 |
| 本地页面 | `npm run build` | Vite、`apps/web/`、共享文案与样式清单 → `dist/web/index.html` |
| 云端页面与 Worker | `npm run build:cloud` | `apps/web/`、`server/cloud/`、`contracts/` → `dist/cloud/` |
| 发布候选构建 | `npm run build:release` | 同上，压缩 Worker → `dist/cloud/`；不执行部署 |
| Tag 发布 | `scripts/release-version.ts`、`scripts/deploy-release.ts` | tag 与完整 CI → 同提交云端产物、内部 Mac 包与部署回执；由 `.github/workflows/release.yml` 调用，配置见[发布流程](../docs/implementation/operations/release-runbook.md) |
| 快速发布准备 | `npm run release:prepare -- [--plugin] [--macos]` | 顺序检查、构建并保留本次候选 → `dist/release/candidate-*/`；步骤回执、提交、改动清单与产物一起保存，失败即停；后续见 [快速发布](../docs/implementation/operations/release-runbook.md) |
| 云端 App 页面 | `node scripts/build-cloud-app.ts` | `dist/cloud/index.html` 等 → `dist/cloud/app.html`；先完成云端页面构建 |
| 插件候选包 | `npm run plugin:build` | 根产品版本、无独立版本的 `plugin.json` 元数据模板、`.app.json`、身份检查与 `skills/`（`sill-cards`、`sill-operations`）→ `dist/plugin/sill/` |
| Mac 原生包 | `npm run build:macos` | Swift 源码、Schema、tokens、文案 → `dist/macos/Sill.app`；签名前用 `CheckMacResources.swift` 在临时包内检查实际资源入口和 PNG 解码，不打开窗口；见 [原生说明](../apps/apple/README.md) |
| Mac DMG | `npm run package:macos` | 已构建的 App、安装背景、共享文案与尺寸 → 内部测试 DMG、检查回执、背景预览；`macos-package.yml` 在 Actions 执行，使用系统 Swift/AppKit、Finder、hdiutil，无新增依赖 |
| Mac 性能追踪 | `npm run perf:macos`；显式模式 `benchmark / ui / manual / report` | 默认后台 XCTest；UI 专项与人工 Instruments 单独运行 → 临时目录中的 xcresult、trace 和离线报告；见 [性能指南](../docs/implementation/operations/macos-performance.md) |
| Mac 演示数据 | `node scripts/macos-demo-data.ts <绝对路径>` | Web `SeedCards`、`SeedItems` → `<绝对路径>/cards.json`；不覆盖已有文件，供 `--data-directory` 使用 |
| 本地卡片 CLI | `node scripts/sill.ts capabilities` | 本地服务协议 → 能力说明；写入用法见 [本地操作](../docs/implementation/operations/local-operations.md) |
| 语法与配置检查 | `npm run check` | 构建后 HTML 脚本和插件模板 → 终端结果 |
| 类型检查 | `npm run typecheck` | 活跃 TypeScript 源码、脚本与测试 → 终端结果；未启用 strict |
| 格式与默认规则 | `npm run format`、`npm run lint` | 前者改写格式；后者只读检查 Biome 默认规则与 Swift 格式，保留动态类型警告 |
| 共享定义导出 | `npm run contracts:generate` | 分文件文案/变量、SQL 准备脚本、zod 与接口说明 → 兼容 JSON/SQL、Schema 与设计材料；检查使用 `contracts:check` |
| V1 设计约定检查 | `scripts/check-contracts.ts` | `contracts/design/` → 准备材料一致性；不证明 API 已实现 |
| V1 健康检查 | `scripts/smoke-health.ts` | 显式指定目标；使用前阅读 [V1 交接包](../docs/plans/external-agent-webhook.md) 的参数与边界 |

`build-cloud-worker.ts` 由云端构建调用。脚本使用 Node 24+ 直接运行 TypeScript，不再依赖 Python。`build-plugin.ts` 会替换候选产物目录，不要在产物目录保存唯一副本。候选构建保留既有 App 身份，但不能证明该云端对象当前存在；发布前仍需核对平台。

Codex 的提交前文件大小检查位于 [.codex](../.codex/README.md)，同时检查暂存版本与本地文件，不通过 npm 安装 Git hook。

设计发布索引的画布部分拆为 `design-system/published-canvas.json` 与 `design-system/published-canvas-reading.json`，后者保留放大阅读画板的文件记录。`published.json` 引用两者；`stage.ts` 兼容旧单文件引用，记录发布时按相同职责拆分。本地拆分不代表重新发布线上设计。
