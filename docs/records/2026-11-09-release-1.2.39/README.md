# 1.2.39 发布准备

## 状态与范围

2026-11-09，用户要求发布新版本。当前正在准备 1.2.39 候选，尚未打 tag、运行发布检查或部署。

范围为现有云端 Web/PWA、MCP 页面与正式流程附带的内部 Mac 包。个人插件在此前已单独更新到 1.2.38，本次不另发插件；数据库无迁移改动。

## 候选内容

- Web/PWA 与 Mac 支持 Markdown 正文 HTTPS 图片、加载与失败反馈和大图查看，见[图片修复记录](../2026-10-31-inline-images/README.md)。
- 整合本地分支、工作区和暂存内容，整理文档措辞，见[整合记录](../2026-11-08-local-task-consolidation/README.md)。
- 测试改用明确的事件或保存结果判断，减少按固定时长猜测完成状态。本轮及此前共改写 64 项，仍有 198 项待处理，见[测试整理记录](../2026-11-08-local-task-consolidation/test-debt.md)。源码改写尚未经本轮运行测试确认。
- PostgreSQL 测试中的两处延迟信号改用普通 Promise，保持现有 ES2023 类型配置；诊断报告涉及的 20 个文件已全部通过 LSP 复查。这不是整库类型检查或运行测试。

## 源码与数据库

候选位于 `codex/consolidate-local-tasks`，包含到 `1b6ec512` 的本地整合与修复，以及本次版本元数据和发布记录。版本提交的完整提交号由 Git 记录。

与已发布的 `v1.2.38` 比较，`supabase/`、`server/cloud/` 无改动，`contracts/` 只修改 README。当前结论来自源码比较，尚未读取线上迁移和存量卡片兼容性，因此未更新 `production` 环境的 `SILL_DATABASE_VERIFIED_COMMIT`。

## 发布前线上状态

2026-11-09 通过 Cloudflare 连接读取现有 Worker `sill-web-preview` 的部署：

| 项 | 值 |
| --- | --- |
| 旧部署 | `833565ae-a56d-4ac2-b196-d08eb7f3d989` |
| 旧版本 | `ad86477a-aa00-4a17-a679-df121f554f83` |
| 流量 | 100% |
| 创建时间 | `2026-11-08T07:16:58.412816Z` |
| 已发布产品版本 | 1.2.38 |

远端尚无 `v1.2.39` tag。上述部署与版本保留为本次回退依据；实际上传前须再次读取。

## 检查与待办

版本元数据已用 `npm version 1.2.39 --no-git-tag-version --ignore-scripts` 更新，未运行生命周期脚本或创建 tag。

轻量检查通过：`npm run files:check`、`git diff --check`，以及 `package.json` 与 `package-lock.json` 两处版本值的一致性检查，退出码均为 0。

发布工作流会运行完整集成、Web 浏览器、PostgreSQL 与云端浏览器、授权策略及 Swift 检查。按用户全局约定，发布指令不自动授权全量测试；取得本次 Sill 全量发布检查授权后再创建 PR、推送 main 或 tag。

尚未执行发布构建、部署、Mac 安装、宿主刷新或界面验收。产品变更日志的图片条目保留在 Unreleased，成功部署后再归入正式版本。
