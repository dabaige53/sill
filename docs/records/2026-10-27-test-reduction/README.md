# 测试精简与等待优化

本轮净减少 2 个测试，未新增测试。删除前内容沿用本地标签 `tests-before-cleanup-2026-10-27`，不包含其他任务的未提交改动。

- 删除 `tests/web/home-screen.test.ts` 中统计 CSP 源码字符串的测试；将同源安装策略断言并入现有 `tests/server/player-policy.test.ts`，检查工作区和登录页实际响应头。页面元数据共用一次云端构建。
- 将 `tests/web/reading-feedback.test.ts` 的提醒完成样式检查并入 `tests/web/panels.test.ts` 已有完成状态场景，保留卡面样式断言，删除独立测试及其打包出口。
- 阅读停留、工具条、抽屉和滚轮测试主动推进合成时间，移除固定等待。共用现有 `react-browser-fixture.ts`，不新增测试辅助文件。

本地检查：Web 非浏览器 463 项、播放器策略 2 项通过；类型检查、差异检查通过。改动文件的 Biome 检查无错误，有 22 条警告与 7 条提示。未执行浏览器、e2e 或 Apple 窗口检查。

查看删除前内容：`git show tests-before-cleanup-2026-10-27:tests/web/home-screen.test.ts`；其他文件替换路径，不使用整仓回退。
