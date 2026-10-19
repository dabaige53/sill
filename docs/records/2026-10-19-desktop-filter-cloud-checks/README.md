# 桌面分栏后的云端位置检查（U5）

2026-10-19。U5 用户选择 B 后，实际桌面分栏占正常排版高度；共享云端检查仍要求 main 顶部小于等于 1px，导致 CI 两次 boundary 失败。属于本次获准布局变化与旧测试前提的冲突，不是基础已有失败。不跳过、禁用或放宽断言，不改产品实现。Mac 未改。

- [CI 失败](ci-failed.log) 与 [push 失败](ci-push-failed.log)：`content starts at viewport top`，出现在云端工作台和欢迎页。
- 先在基础 `9e803f7` 重新构建云端并复跑：[云端页 1/1](base-cloud.log)、[欢迎页 2/2](base-welcome.log) 通过。
- 恢复当前 `7d5e1fe` 重建，同一云端检查 [复现失败](current-before.log)，没有先改断言。
- `tests/server/helpers/cloud-ui.ts` 保留「没有 cloud-account 工具栏」检查；桌面按 ADR 0043 精确检查分栏距顶部 24px、高 44px、relative 排版和 main 起点 68px。手机 main 起点精确为 0、顶栏为 fixed。加回页面 scrollY 后判断排版位置，滚动本身不能造成误判。
- 修复后完整 [云端页 1/1](current-after.log)、[欢迎页桌面/手机 2/2](welcome-after.log) 通过，类型检查通过。没有扩大容差，没有用存在任意顶栏作为通过条件。

产品截图、样式与生成包没有变化，原 [U5 设计证据](../2026-10-19-desktop-home-filters/README.md) 继续有效。该补充随原 PR #56 提交；每次提交后的 Node、主页专项与 CI 结果以 PR Evidence 为准。没有新增线上未同步设计文件；原清单继续有效。真机、Safari、Mac 原生视觉未检查。
