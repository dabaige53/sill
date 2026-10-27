# 测试重复断言与说明清理

删除前本地标签：`tests-before-cleanup-2026-10-27`，指向清理前 HEAD `970d4be5`。标签保留已提交内容，不包含其他任务的未提交文档修改。

## 删除与保留

- `tests/server/plugin-package.test.ts`：删除读取 MCP 源码及匹配 `global`、`thread` 字符串的两条断言。`tests/server/cloud-app.test.ts` 通过实际 MCP 工具发现检查两类入口，并检查资源读取、旧地址兼容和撤权；插件包身份、版本和技能文件检查继续保留。
- `tests/README.md`：删除重复的逐文件目录、动画批次说明和 C3 一次性过程说明。按改动选择命令、测试授权、合成计时器用法、Postgres 共用断言、浏览器依赖与外网拦截规则继续保留。
- 云端启动、阅读保存和 CSP 等仍有独立回归价值的测试继续保留。本次不改生产实现，也不删除历史证据。

取回删除前内容：`git show tests-before-cleanup-2026-10-27:tests/server/plugin-package.test.ts`；查看测试说明时，将路径替换为 `tests/README.md`。不使用整仓回退。

## 本地验证

- 删除前 `npm run test:local`：5 项通过。
- 删除后 `npm run test:local`：5 项通过。
- 删除后 `npm run test:cloud-app`：3 项通过，包含保留的入口与权限检查。
- 未执行浏览器、e2e、Apple 窗口或线上检查。
