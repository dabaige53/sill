# 测试目录

更新：2026-10-16。自动检查验证当前代码，历史报告不表示当前全部能力通过。报告与验收记录统一从 [文档目录](../docs/README.md) 进入。

| 改动 | 入口 | 边界 |
| --- | --- | --- |
| 文件归属、导航、忽略规则 | `npm run files:check` | 只读，不启动服务 |
| 共享源码与本地卡片 | `npm test`、`npm run test:core` | 构建、语法、本地协议与核心行为 |
| 浏览器交互与布局 | `npm run test:browser`、`npm run test:local-browser`、`npm run test:accessibility` | 按改动选择；输出放被忽略的 `artifacts/` |
| 云端服务 | `npm run test:supabase`、`npm run test:cloud-app` | 本地检查不代替生产数据和账号验收 |
| OAuth | `npm run test:oauth` | 真实授权另行验收 |
| 云端页面 | `npm run test:cloud-browser`、`npm run test:cloud-app-browser` | 不默认访问生产 |
| Mac | [原生检查说明](../native/macos/README.md) | 模型检查不代替桌面视觉验收 |
| 历史能力 | `npm run test:legacy` | 迁移批次 3 删除旧代码时同步删除测试 |

专项命令以 [package.json](../package.json) 为准。`helpers/` 放测试工具，不提交真实 token、用户卡片或导出。历史报告已移入 `docs/archive/test-reports/`，不在此维护第二份文档导航。文件规则见 [文件管理规范](../docs/guides/file-management.md)。
