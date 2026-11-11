# 测试整理


## 删除与替代

- `tests/e2e/cloud-full-walkthrough.ts`：旧录像验收脚本要求点击卡片菜单进入正文编辑器，已不符合当前由 AI 修改既有卡片的边界。保留现行 `cloud-browser.ts` 的登录、新增、未知写入结果与草稿检查，以及 `cloud-operations-browser.ts` 的操作、API 内容更新和无正文编辑器检查。历史录像与验收记录不删除。
- `tests/web/build.test.ts`：与 `scripts/check.ts` 重复检查打包脚本。独有的页面标识、脚本类型、DOM 位置和图片资源断言移入后者，随 `npm test` 运行。
- 删除 CI 中不存在的 `test:accessibility` 调用；这不是恢复旧无障碍专项覆盖，现有键盘与触控专项继续保留。

取回单个旧文件：`git show tests-before-cleanup-2026-10-21:tests/e2e/cloud-full-walkthrough.ts`（另一个文件替换路径即可）。不使用整仓回退。

## 入口整理

默认 Node 检查只执行一次数据约定生成检查，并新增性能报告解析入口。CI 的 Web 专项与云端专项不重复运行完整 Node 或服务端子集；独立授权策略工作流保留快速反馈。Mac、性能基准与真实 Postgres 不混入默认 Node 检查。


## 本地验证

- `npm run files:check` 通过。
- `npm run typecheck` 通过。
- `npm run test:performance-report`：3 项通过。
- 工作流引用的全部 `npm run` 命令均存在；`git diff --check` 通过。
- 未执行浏览器、UI 自动化、Mac 基准或线上 CI。
