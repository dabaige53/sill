# 脚本目录

状态：操作说明。更新：2026-10-16。命令定义以 [package.json](../package.json) 为准，目录规则见 [文件管理规范](../docs/guides/file-management.md)。构建只生成本地文件，不代表安装、发布或线上验收。

| 用途 | 命令或脚本 | 主要输入 → 输出 |
| --- | --- | --- |
| 文件管理检查 | `npm run files:check` | 根目录、导航、Git 文件清单 → 终端结果；只读 |
| 本地页面 | `npm run build` | `src/`、`modules.json`、`apps/web/styles/styles.json` → `index.html` |
| 云端页面与 Worker | `npm run build:cloud` | 共享 `src/`、`web/cloud-*`、`server/cloud/` → `dist/cloud/` |
| 发布候选构建 | `npm run build:release` | 同上，压缩 Worker → `dist/cloud/`；不执行部署 |
| 云端 App 页面 | `node scripts/build-cloud-app.ts` | `dist/cloud/index.html` 等 → `dist/cloud/app.html`；先完成云端页面构建 |
| 插件候选包 | `npm run plugin:build` | `plugin.json`、`.app.json`、`deploy/sill/release.json`、`skills/sill/` → `dist/plugin/sill/` |
| Mac 原生包 | `npm run build:macos` | Swift 源码、本地服务、依赖 → `dist/macos/Sill.app`；限制见 [原生说明](../apps/apple/README.md) |
| 本地卡片 CLI | `node scripts/sill.ts capabilities` | 本地服务协议 → 能力说明；写入用法见 [本地操作](../docs/guides/local-operations.md) |
| 语法与配置检查 | `npm run check` | JS、HTML 脚本及公开配置示例 → 终端结果 |
| V1 设计约定检查 | `scripts/check-contracts.ts` | `contracts/design/` → 准备材料一致性；不证明 API 已实现 |
| V1 健康检查 | `scripts/smoke-health.ts` | 显式指定目标；使用前阅读 [V1 交接包](../docs/guides/handoff.md) 的参数与边界 |

`build-cloud-worker.mjs` 由云端构建调用。Python 沿用项目已有环境与全局执行约定，不为目录整理另建环境。`build-plugin.mjs` 会替换该候选产物目录，不要在产物目录保存唯一副本。
