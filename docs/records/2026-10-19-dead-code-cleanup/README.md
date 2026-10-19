# 无效代码清理

Sill 提供本地卡片工作区和云端 MCP。检查按本地单用户、云端多用户并发访问评估，重点覆盖 Web 入口、抽屉生命周期、服务端会话、构建配置与测试引用。

删除前已在可运行提交上建立本地标签 `cleanup-before-20261019-dead-code`。标签未推送。

## 清理内容与依据

1. 删除 MotionEngine 无调用的 press、pulse；删除 capture、lift、closePanel 旧流程。全仓检索确认没有动态引用，capture 的结果已不被 openPanel 消费，lift 只收到 null，closePanel 只取消动画并调用回调。关闭时直接调用 cancelPanel。保留当前进入、退出、缩放和卡片移除动画；openModal 第三个参数保留位置兼容。
2. OAuth 改用 browser-session 的 readCookie，删除相同的私有解析器。重复 Cookie 和非法编码仍返回 null，避免两份验证规则日后分歧。
3. 删除卡片模板、控制器和核心测试中的未使用导入或局部绑定。
4. 修正 review-only Wrangler 配置的不存在入口，改为现行云端构建产物。未部署。

不删除依赖、原生端代码、历史证据、发布快照、数据库迁移或用户数据。右键菜单图标未显示属于功能缺失，不把图标信息当成无效代码删除。verify 脚本可独立执行，因此保留其测试调用。

## 取回方式

先查看旧文件，再按需要恢复具体片段，避免覆盖后续修改：

```sh
git show cleanup-before-20261019-dead-code:apps/web/interactions/motion.ts
git show cleanup-before-20261019-dead-code:server/cloud/oauth-controller.ts
```

## 验证

- `npm test` 通过：36 项契约、200 项 Web、97 项服务端，共 333 项；含文件规范、契约一致性、构建、静态检查与类型检查。
- `node tests/e2e/drawer-browser.ts` 通过 11 项：窄屏布局、抽屉高度、拖动展开与折叠、取消手势、减少动态效果等。首次 Chromium 启动被沙箱阻止；允许测试进程启动后完整通过。
- `npm run build:cloud` 通过；review-only 配置所指的构建文件存在。
- `node scripts/build.ts --check`、改动 TypeScript 文件的格式检查、`git diff --check` 通过。

结论：已处理本次确认的无效流程、重复逻辑和失效入口。代码及测试净减少 80 行，依赖减少 0 项。清理仅在本地，未提交、推送或部署。

## 范围限制

未逐行审计 Apple 端，未运行真实云端账号操作、线上部署或并发压力测试。本记录不代表全仓安全审计通过。
