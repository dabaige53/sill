# Quiet Glass · 验证记录

## V0.3 卡片体验与独立设计库

本轮新增阅读卡层次、提醒卡内操作、连续预览转场、更多菜单焦点和可查看/移除的 AI 引用。独立设计库包含 38 个图标、10 类 / 13 个卡片变体、6 种静态状态、29 项组件和 28 项设计参考。所有入口复用产品源码；静态状态不写入 Store。

- `python3 scripts/build.py`：五个独立 HTML 入口成功生成。
- `python3 tests/verify.py`：22 项核心与构建检查通过，21 个源模块通过语法检查。
- 浏览器脚本包含 21 组场景；新增三个库的 1440 / 390 / 320 px 完整性、操作与布局验收。提交 `ff63d33` 的 [第 8 次工作流](https://github.com/dabaige53/quiet-glass/actions/runs/38105728110) 中，21 组真实 Chromium 浏览器场景全部通过，0 失败。

新增浏览器检查包括完整注册项数量、真实预览与筛选、静态样本隔离、AI 草稿带入但不发送、真实引用删除后焦点不落到目录示例、28 个唯一外部参考，以及运行时页面错误和外部请求。截图保存在工作流的 `browser-verification` artifact：三个库分别生成 `*-library-desktop.png`、`*-library-all.png` 和 `*-library-390.png`。

已检查三个库的桌面首屏、完整长图及手机截图。测试同时推动修复了任务完成重排、菜单关闭和卡片更新后的焦点恢复；组件目录与真实 AI 引用共存时，焦点限定在正确面板内。所有 1440 / 390 / 320 px 目录场景通过，无横向溢出。

下方保留 V0.2 基线，不能替代本轮验收。

## V0.2 基线

本轮在 `7029e18` 上补齐模块化源码、构建器、提醒生命周期、信息流排序和回归脚本。上轮原型报告原样保存在 [REPORT-v0.1.md](./REPORT-v0.1.md)，其中的通过结论不能作为本轮改动的验收结论。

## 已实际执行

- `python3 scripts/build.py`：三个独立 HTML 入口成功生成。
- `python3 tests/verify.py`：20 项检查通过，0 失败、0 跳过。
- 16 个源模块均通过 `node --check`；三个构建入口的内嵌脚本通过语法编译。
- 17 项行为检查覆盖旧版状态迁移、演示时钟恢复、延后状态持久化、去重与冷却、排序稳定性、过期日程与已完成待办排除、提醒暂存、显式确认、恢复/撤销、组合筛选、刷新卡片状态恢复，以及存储损坏/不可写的降级行为；另覆盖重复导航事件不应关闭新打开面板，以及具有 hover 能力的设备使用真实触摸输入时的工具展开逻辑。

核心测试使用 Node VM 和受控时钟、存储及最小控制器替身。它验证策略与应用状态转换，不验证浏览器布局、真实点击、焦点、滚动或真实持久化策略。

## 浏览器回归

新增 `tests/browser.cjs`，覆盖实际 localhost 来源上的阅读、收藏撤销、备注恢复、AI 引用、桌面拖拽与取消、提醒到期与去重、真实 localStorage 重载、排序焦点、滚动锚点、390/320px 触屏布局与触控尺寸、减少动态效果、三个独立入口、页面错误及外部运行时请求。

本地环境无法启动 Chromium，浏览器验收改在 GitHub Actions 的 Ubuntu / Chromium 151 / Playwright 1.62.1 环境执行。提交 `df1f73f` 的 [第 3 次工作流](https://github.com/dabaige53/quiet-glass/actions/runs/38102394372) 全部通过：20 项核心检查、9 组真实浏览器场景，0 失败。截图与逐项结果保存在工作流的 `browser-verification` artifact 中。

浏览器回归发现并推动修复了两项真实交互问题：重复 popstate/hashchange 可能关闭刚打开的备注面板；具有 hover 能力的触控环境中，首次轻触玻璃球可能直接打开 AI。对应修复均有核心与浏览器回归覆盖。

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
