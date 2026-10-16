# 测试与报告目录

状态：检查导航。更新：2026-10-16。自动检查验证当前代码；历史报告只说明当时的环境和结果。

## 按改动选择检查

| 改动 | 入口 | 边界 |
| --- | --- | --- |
| 文件归属、导航、忽略规则 | `npm run files:check` | 只读，不启动服务 |
| 共享源码与本地卡片 | `npm test`、`npm run test:core` | 构建、语法、本地协议及既有核心行为 |
| 浏览器交互与布局 | `npm run test:browser`、`npm run test:local-browser`、`npm run test:accessibility` | 按改动选用；截图等在 `artifacts/` |
| 云端服务 | `npm run test:supabase`、`npm run test:cloud-app` | 本地测试不能代替生产数据和账号验收 |
| OAuth 策略 | `npm run test:oauth` | 真实授权另按发布范围验收 |
| 云端页面 | `npm run test:cloud-browser`、`npm run test:cloud-app-browser` | 启动条件见各测试文件；不默认访问生产 |
| Mac 原生版 | [原生检查说明](../native/macos/README.md) | 先构建；模型检查不能代替桌面视觉验收 |
| 历史能力 | `npm run test:legacy` | 独立入口，不代表当前默认路径启用了历史功能 |

其余专项命令查 [package.json](../package.json)。`helpers/` 放共享测试工具；不要把真实 token、用户卡片或导出作为 fixture 提交。

## 历史报告

下列报告保留原路径与内容，不作为当前全部能力通过的证明。

- [AGENT-ACCESS-REPORT](AGENT-ACCESS-REPORT.md)
- [AI-PROVIDER-REPORT](AI-PROVIDER-REPORT.md)
- [CONTENT-BACKUPS-REPORT](CONTENT-BACKUPS-REPORT.md)
- [CONVERSATIONS-REPORT](CONVERSATIONS-REPORT.md)
- [HOST-APP-REPORT](HOST-APP-REPORT.md)
- [HOST-PROVENANCE-REPORT](HOST-PROVENANCE-REPORT.md)
- [INTEGRATION-REPORT](INTEGRATION-REPORT.md)
- [LOCAL-CONTENT-REPORT](LOCAL-CONTENT-REPORT.md)
- [RECOMMENDATION-PREFERENCES-REPORT](RECOMMENDATION-PREFERENCES-REPORT.md)
- [REGISTERED-JOBS-REPORT](REGISTERED-JOBS-REPORT.md)
- [REGISTERED-WASM-REPORT](REGISTERED-WASM-REPORT.md)
- [REPORT-v0.1](REPORT-v0.1.md)
- [REPORT](REPORT.md)
- [SETTINGS-REPORT](SETTINGS-REPORT.md)

文件归属、证据保留和清理条件见 [文件管理规范](../docs/FILE-MANAGEMENT.md)。
