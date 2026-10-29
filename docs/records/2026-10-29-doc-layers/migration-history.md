# 既有目录迁移记录

记录整理：2026-10-29。下文保留原段落的日期、状态和证据，不表示本轮重新执行或验收。

## 9. 迁移进度

| 批次 | 内容 | 状态 |
| --- | --- | --- |
| 1 | 文档迁入 `product/`、`design/`、`guides/`、`records/`、`archive/`；证据并入记录；展开 ZIP 独有报告后删除两个重复 ZIP；更新 `files:check` | 已完成 |
| 2 | 建立 `contracts/`；合并本地与云端 zod 定义；导出 JSON Schema | 已完成，2026-10-16；本地、约定、云端授权测试及云端构建通过 |
| 3 | 删除旧代码与旧测试，打 tag `legacy-final`，写删除记录；同时删除 `sill.config.example.json`、`requirements-sandbox.txt` 及 `.env.example` 中旧连接器的变量 | 已完成，2026-10-16；完整本地、约定、云端授权测试通过；保留现行 cloud bridge 依赖 |
| 4 | Web 与服务端迁入 `apps/web/`、`server/local/`、`server/cloud/`，改为 TypeScript | 已完成，2026-10-16；26 项约定、45 项 Web、78 项服务端检查及云端构建通过 |
| 5 | Apple 端迁入 `apps/apple/`，Swift 原生数据层，Mac 不再打包 Node | 已完成，2026-10-16；16 项 Swift 测试、原生包构建与严格验签通过；视觉和 iOS 设备未验收 |
| 6 | 统一版本号为 1.2.0；文案集中；整体格式化 | 已完成，2026-10-16；166 项 Node、18 项 Swift、格式/类型检查与 Web、云端、Mac 候选构建通过；未执行 GUI 或发布 |

