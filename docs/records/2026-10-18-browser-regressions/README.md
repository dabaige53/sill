# 浏览器回归测试修复

日期：2026-10-18。工作包 C1。基础提交为 `8b875a7ffd6abfb4454b880ff80dc9ba9fdd638b`（`claude/web-pwa-ui-handoff`）。#45、#46、#47 尚未合并；本工作依赖这三个 PR，不发布网页或迁移。

## 基础检查与修复

环境：macOS、Node 26.11.1、Playwright 1.62.1，使用本机已安装的 Chromium；另以系统 Chrome 复查。没有安装浏览器。所有页面和接口均在本机，数据为合成内容。

| 交接项 | 基础提交实测 | 修复 |
| --- | --- | --- |
| 深色设置图标 | 本机通过；原测试分两次读取颜色，可能跨过颜色过渡 | 同一帧读取图标 stroke 与按钮 color，保留严格相等断言 |
| 刷新保持位置 | 基础提交本机 23/23 通过；调整滚动前提时复现位置变化 | 等首屏入场动画和布局完成，再立即滚到有效范围；新增大于 40px 的前提断言，保留小于 3px 的位置差要求 |
| PWA 无放大按钮 | Playwright Chromium 通过；系统 Chrome 的关闭断言失败 | 保留无放大按钮和无位移动画断言；以一秒内实际关闭代替固定等待 150ms |
| Real Tab | Playwright Chromium 与系统 Chrome 均超时 | 滚到实际可滚范围中点，并检查远离两端；Linux 保留 SwiftShader 参数，macOS 使用默认渲染 |
| workspace-polish | `source.status` 读取失败 | ADR 0033 已删除来源连接；检查旧操作不发写请求、不改版本、不生成来源，设置中无连接入口。保留并发冲突和草稿恢复检查 |
| 云端欢迎页 | 桌面与手机均通过 | 等布局可滚后立即滚动，保留 `scrollY > 0` 断言，避免读取平滑滚动首帧 |

macOS 强制 SwiftShader 时，诊断读到隐藏过渡在 400ms 后仍为 `currentTime: 0`，650ms 自动恢复先发生。移除该平台的强制参数后，真实 Tab 用例通过。抽屉套件中的提示动画与把手拖动也出现同类偶发失败；采用相同平台条件后 11/11 通过。Linux 的渲染参数不变。

基础分支 CI（run `39113409545`）和本机均复现 `cloud-app-browser.ts:260` 点击被手机顶栏拦截。改为点击顶栏下面真实露出的页边距，新增菜单关闭断言；完整模拟宿主流程通过，不使用强制点击。

另修复基础分支已有的 `detail-toolbar.test.ts` import 排序错误，它会阻止 CI 的 `lint:web`；没有改测试行为。

## 验证

对应命令输出摘录见 [verification.txt](verification.txt)。

| 检查 | 结果 |
| --- | --- |
| `npm test` | 约定 36、Web 168、服务端 91 通过；失败、取消、跳过均为 0 |
| `npm run files:check` | 通过（包含于完整检查） |
| `node tests/e2e/browser.ts` | 23/23 通过 |
| `node tests/e2e/drawer-browser.ts` | 11/11 通过 |
| `node tests/e2e/motion-material-browser.ts` | 11/11 通过 |
| `node tests/e2e/workspace-polish-browser.ts` | 1/1 通过 |
| `node tests/e2e/cloud-welcome-browser.ts` | 桌面 1440×1000、手机 390×844，2/2 通过 |
| `node tests/e2e/cloud-app-browser.ts` | 完整模拟宿主流程 1/1 通过 |
| `npx biome lint apps/web --reporter=json` | 0 错误、902 警告、30 条提示；不是零警告 |

文案键共 826 个，其中 601 个为哈希键，`web.panels` 下为 110 个；图标 69 个。C1 不修改这些数字。CI 结果以本工作 PR 的最新检查为准。

## 边界

只修改测试及记录，界面和 `window.__app` 公开接口不变。没有修改设计规则、线上 Design System 或设计画布。Mac 未改；真实 iPhone、Safari 长按、安全区和主屏幕启动均未检查。Postgres 留给 C6，不以本次 Node 测试代替。
