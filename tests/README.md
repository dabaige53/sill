# 测试目录

更新：2026-10-16。自动检查验证当前代码，历史报告不表示当前全部能力通过。报告与验收记录统一从 [文档目录](../docs/README.md) 进入。

| 改动 | 入口 | 边界 |
| --- | --- | --- |
| 文件归属、导航、忽略规则 | `npm run files:check` | 只读，不启动服务 |
| 完整 Node 检查 | `npm test` | 文件、Schema、构建、语法、类型、共享约定、Web 核心和全部服务端测试 |
| 共享约定 | `npm run test:contracts` | 合法、非法与旧来源迁移样例；纯合成文件，验证读不改写和未知字段保留 |
| Web 核心 | `npm run test:core` | Node/JSDOM 与字符串打包，不代替浏览器视觉验收 |
| 浏览器交互与布局 | `npm run test:browser`、`npm run test:local-browser`、`npm run test:accessibility` | 按改动选择；输出放被忽略的 `artifacts/` |
| 多选、提起与批量菜单 | `npm run build && npm run test:selection-browser` | 隔离合成卡片；桌面、390×844 触屏、减少动态效果、卡片缩略图隔离、指针定位与边缘翻转、焦点、取消、滚动与写入边界 |
| 云端服务 | `npm run test:supabase`、`npm run test:cloud-app` | 本地检查不代替生产数据和账号验收 |
| OAuth | `npm run test:oauth` | 真实授权另行验收 |
| 云端页面 | `npm run test:cloud-browser`、`npm run test:cloud-app-browser`、`npm run test:cloud-operations` | 不默认访问生产 |
| Mac | `npm run build:macos`、`npm run test:macos` | Swift 模型检查及产物验签，不启动应用，不代替桌面视觉验收 |
| 格式与类型 | `npm run lint`、`npm run typecheck` | 只读；默认规则警告不代表已实现全仓 strict |
| Postgres | `npm run test:supabase:postgres` | 需要可用 Docker；使用合成容器数据，不连接生产 |

专项命令以 [package.json](../package.json) 为准。`server/helpers/` 放服务端测试工具；跨端浏览器流程位于 `e2e/`。旧入口专用测试已随实现删除，可从 `legacy-final` 查阅。不提交真实 token、用户卡片或导出。历史报告已移入 `docs/archive/test-reports/`，不在此维护第二份文档导航。文件规则见 [文件管理规范](../docs/guides/file-management.md)。
