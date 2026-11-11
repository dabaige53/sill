# PWA 触控与外壳检查

日期：2026-10-18。工作包 U1。基于 `claude/web-pwa-ui-handoff`，沿用 [C1 PR #48](https://github.com/dabaige53/sill/pull/48) 的测试修复；基础提交 `4aad866`。没有部署网页，没有修改 Mac 或 iOS 原生代码。

## 结果

| 项目 | 实施与边界 |
| --- | --- |
| U1.1 | 详情图标与底部导航按钮禁止文字选择，并声明 `-webkit-touch-callout: none`。Chromium 长按、松手不执行动作；iPhone 系统菜单未检查 |
| U1.2 | 真实 Tab 聚焦后显示同一个名称提示；键盘不继承鼠标的 500ms 等待。系统与应用两种减少动态效果设置都只淡入淡出 |
| U1.3 | 两端提示向胶囊内侧展开；没有改按钮尺寸、顺序或胶囊布局。320px 最右提示的右边界由 341.5px 收到 299px |
| U1.4 | 本地外壳、构建后的云端网页和两种登录页都按系统深浅色选择 `theme-color`，值对应现有 canvas。云端构建复用外壳，恰好两条元数据，没有重复注入；manifest 的 theme_color 不变 |
| U1.5 | 现有 256px 彩色 PNG 与新线稿都表达双卡与窗台，但比例和细节不同。本包保留品牌资产；是否统一绘法留到 U2 确认。没有新增 192/512 或 maskable 图标 |
| U1.6 | 真机未检查：主屏幕冷启动、Safari 系统长按菜单、安全区、横竖屏和搜索键盘。没有把 Chromium 模拟说成真机通过 |

manifest 只读检查使用本机登录页、仓库 manifest 与 PNG，没有真实账号。Chromium 151.0.7922.34 的 `Page.getAppManifest` 没有解析错误，`Page.getInstallabilityErrors` 为空，见 [manifest-audit.json](manifest-audit.json)。这些结果不代替 DevTools Application 面板的人工警告检查或 Safari 安装验收。

## 改前与改后

截图来自隔离页面中的合成卡片。改前 8 个场景都在“键盘聚焦显示名称”断言失败；改后 10 个场景通过，另外增加了应用内减少动态效果的深浅色覆盖。原始测试输出摘录见 [verification.txt](verification.txt)。

| 宽度 | 主页 | 键盘名称 | 最右侧长按名称 |
| --- | --- | --- | --- |
| 320 | [改前](before-320-light-home.png) / [改后](after-320-light-home.png) | [改前](before-320-light-keyboard.png) / [改后](after-320-light-keyboard.png) | [改前](before-320-light-tip-last.png) / [改后](after-320-light-tip-last.png) |
| 390 | [改前](before-390-light-home.png) / [改后](after-390-light-home.png) | [改前](before-390-light-keyboard.png) / [改后](after-390-light-keyboard.png) | [改前](before-390-light-tip-last.png) / [改后](after-390-light-tip-last.png) |
| 1440 | [改前](before-1440-light-home.png) / [改后](after-1440-light-home.png) | [改前](before-1440-light-keyboard.png) / [改后](after-1440-light-keyboard.png) | [改前](before-1440-light-tip-last.png) / [改后](after-1440-light-tip-last.png) |

320px 深色键盘提示：[改前](before-320-dark-keyboard.png) / [改后](after-320-dark-keyboard.png)。


## 检查

| 命令 | 结果 |
| --- | --- |
| `npm run files:check`、`npm test` | 通过：约定 36、Web 169、服务端 91；失败与跳过均为 0 |
| `npm run test:pwa-touch` | 10/10，通过真实 Tab、CDP 触摸、边界和减少动态效果检查；已接入 CI |
| `npm run test:accessibility` | 13/13 通过 |
| `node tests/e2e/drawer-browser.ts` | 11/11 通过 |
| `npm run lint:web` | 通过；Web 单独 lint 为 0 错误、902 警告、30 条提示，没有新增警告 |

文案仍为 826 个键，哈希键 601 个（panels 110 个）；图标仍为 69 个。没有新增产品文案或修改公开的 `window.__app` 接口。CI 以本工作 PR 最新提交的检查为准。

## 设计同步与遗留

先读线上 README，再通过 [线上 Design System](https://claude.ai/artifact/8zZhgYs53aRF6Rbk5GtuBb) 的手册编辑器追加 U1 规则，重新读取文件确认原文完整保留，再同步到仓库。仅追加触控、键盘提示和状态栏规则，没有改品牌资产或设计变量。按现有生成脚本更新了 `components/bundle.css`；线上组件 CSS 尚未发布，须在 Merge Danger 标明。
