# 桌面交互架构与验证

更新：2026-10-27。

本文的 `DesktopInteraction`、`WheelPhase` 和系统结束／惯性阶段属于 Mac 原生实现。Web 的 wheel 输入和手机 Vaul 抽屉按[动效开发与排查](../../agent/motion-development.md)及当前实现分别处理，不套用 NSEvent 阶段。

## 职责

| 模块 | 负责 | 不负责 |
| --- | --- | --- |
| DesktopInteraction | 从现有状态推导输入层、关闭最上层、搜索聚焦前关闭菜单 | 绘制、存储重复的弹窗开关 |
| WheelPhase | 把 NSEvent 分类为主动阶段、惯性、无阶段滚轮 | 决定业务动作 |
| FeedRefresh / ReaderScroll | 各自手势状态、阈值、取消与回位 | 越过上层接管滚轮 |
| Feed | 合并搜索计算、取消过期输入、维护结果 | 文本输入焦点 |
| MasonryLayout.Cache | 复用同一子视图与几何下的测量 | 跨内容变更保存旧高度 |
| Motion / foundation tokens | 动画角色、参数、平台实现 | 输入归属 |
| desktopGlass | 系统玻璃材质与旧系统回退 | 自动给整个工具栏添加按压动作 |

## 扩展规则

新增浮层先明确它的层级，再接入 DesktopInteraction；不要新增独立的全窗口 Esc 或滚轮监听。系统弹窗优先，普通输入事件交回系统响应链。需要自定义边缘手势时，只在当前层与目标区域内消费事件。

手势必须覆盖：开始、变化、零位移结束、取消、惯性、无阶段滚轮。用阶段结束真实触控板手势；超时只补充没有阶段的设备。异步完成回调要核对当前会话，取消和离场使旧回调失效。

设计参数先改 `design-system/tokens/` 中对应分类文件；AppleMetrics 的数值在 `apple.json`，随后生成 AppleMetrics 与 Web 变量。菜单关闭不得复用按钮按压时长。容器与内部按钮不能同时控制整体缩放。

## 验证

以下是可选的非浏览器检查入口，按 [测试与验证](../../agent/test.md) 和本次影响范围选择，不默认逐条执行；设计生成只在相关源文件变化时运行：

```sh
node tests/apple/run.ts --filter 'DesktopInteractionTests|WorkspaceTests|MotionFlowTests'
node --import tsx --test tests/web/layout.test.ts tests/web/search-state.test.ts
npm run typecheck
sh scripts/design-init.sh build
sh scripts/design-init.sh check
npm run files:check
```

真实窗口验收场景：

- 分栏菜单打开后点击搜索，菜单退出且文字可输入；随后打开设置，Esc 只关设置。
- 阅读页打开标签或设置面板，上下滚动只作用于面板；关闭后原阅读位置保留。
- 触控板拉到刷新阈值后停留不自动提交，松手只刷新一次；取消不刷新。
- 详情关闭后，剩余惯性不带动主页；新的触控板或鼠标滚动立即响应。
- 快速输入后清空，旧搜索结果不回来；快速开关菜单或多选，不出现延迟回调重新显示旧界面。
- 卡片正文、图片加载与窗口宽度改变后，卡片高度和位置正确；不以缓存牺牲内容正确性。

只有取得当前任务的界面测试授权才执行上述窗口自动化。性能测量使用[Mac 性能追踪](../operations/macos-performance.md)，比较同一数据集、窗口尺寸和 Release 构建；不要把单元测试或构建成功写成不卡顿。
