# Quiet Glass · V0.2 验证记录

本轮在 `7029e18` 上补齐模块化源码、构建器、提醒生命周期、信息流排序和回归脚本。上轮原型报告原样保存在 [REPORT-v0.1.md](./REPORT-v0.1.md)，其中的通过结论不能作为本轮改动的验收结论。

## 已实际执行

- `python3 scripts/build.py`：三个独立 HTML 入口成功生成。
- `python3 tests/verify.py`：18 项检查通过，0 失败、0 跳过。
- 16 个源模块均通过 `node --check`；三个构建入口的内嵌脚本通过语法编译。
- 15 项行为检查覆盖旧版状态迁移、演示时钟恢复、延后状态持久化、去重与冷却、排序稳定性、过期日程与已完成待办排除、提醒暂存、显式确认、恢复/撤销、组合筛选、刷新卡片状态恢复，以及存储损坏/不可写的降级行为。

核心测试使用 Node VM 和受控时钟、存储及最小控制器替身。它验证策略与应用状态转换，不验证浏览器布局、真实点击、焦点、滚动或真实持久化策略。

## 浏览器回归

新增 `tests/browser.cjs`，覆盖实际 localhost 来源上的阅读、收藏撤销、备注恢复、AI 引用、桌面拖拽与取消、提醒到期与去重、真实 localStorage 重载、排序焦点、滚动锚点、390/320px 触屏布局与触控尺寸、减少动态效果、三个独立入口、页面错误及外部运行时请求。

本轮本地执行环境缺少 Chromium；安装尝试下载到的文件无法解压，浏览器回归暂未在本地完成。不能据此声称视觉或浏览器交互已验收通过。仓库配置的 PR 工作流会在可用的 Chromium 环境中执行，并留存结果及截图。

## 可复现命令

```sh
python3 scripts/build.py
python3 tests/verify.py
npm install --ignore-scripts --no-audit --no-fund
npx playwright install chromium
npm run test:browser
```

## 边界

仍为本地演示；没有真实邮件、日历、AI 模型或后台通知。没有进行真实 iOS / Safari / VoiceOver、生产后端、鉴权及同步验收。
