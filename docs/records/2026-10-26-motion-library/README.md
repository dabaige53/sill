不再适用：2026-10-27 用户要求删除动画工作台。以下保留历史使用说明与证据，不表示入口仍存在。

# 动画工作台

更新：2026-10-26。画廊只属于设计体系。所有界面、演示、参数、文案和 shadcn 组件保存在 `design-system/motion/workbench/`，只读复用产品局部组件、样式和动画。示例使用独立内存数据，不启动产品加载、保存或同步。

## 启动与使用

`npm run design -- build` 构建设计，`npm run boards` 提供 [本地工作台](http://127.0.0.1:4310/motion/)。

左边是动画目录和配置面板，右边是预览。配置面板用「参数 / 检查 / 源码」页签切换；各区独立滚动，参数与预览之间可拖动调整宽度。窄窗口保留横向工作区，不把配置叠到预览下方。

30 个稳定 ID 对应真实产品局部 UI。Web 可预览 29 项，手机可预览 24 项；不适用的视口显示占位。列表使用真实卡片，详情使用真实抽屉与阅读层，媒体使用真实播放器。只挂载当前动画所需范围，不加载整个应用。支持按钮触发的效果提供「播放动画」；拖动、刷新和滑动直接手动操作。

参数立即更新，短暂合并连续输入后重载独立 iframe。调试值按动画 ID 和视口保存在本机 `sill-motion-preview-drafts-v3`。切换「默认 / 调试」可比较；「恢复默认」只清除此项调试值。「重置示例」保留参数、恢复示例状态。导出文件标记 `design-preview-only`，不写回共享设计变量或生产源码。

收藏和检查仍保存在独立的 `sill-motion-review-v1`。检查结果针对设计演示，不代表产品已通过。源码页只展示设计演示代码。产品组件作为只读依赖参与示例构建，画廊代码不接入产品入口。

## Motion 参考

已映射的模式在预览底部附上具体官方预览页，链接集中在 `references.ts`。这些是模式参考，不表示复制了官方源码，也不表示与产品实现完全相同。部分官方示例源码需 Motion+，公开预览入口仍在对应页面。

- [Sheet Modal](https://motion.dev/examples/react-sheet-modal)
- [Shared layout animation](https://motion.dev/examples/js-shared-layout-animation)
- [Drag](https://motion.dev/examples/js-drag)
- [Base UI: Switch](https://motion.dev/examples/react-base-switch)
- [Scroll Direction: Hide Header](https://motion.dev/examples/react-scroll-hide-header)
- [Toast: Stacked notifications](https://motion.dev/examples/react-toast-stack)
- [Reorder items](https://motion.dev/examples/js-reorder-items)

## 维护与验证边界

| 位置 | 用途 |
| --- | --- |
| `design-system/motion/catalog.json` | 稳定 ID 与产品实现盘点 |
| `design-system/motion/workbench/` | 设计工作台、真实局部 UI 的示例适配、参数与文案 |
| `design-system/scripts/motion-library.ts` | 只构建设计资源到 `dist/design/motion/`；工作台与产品样式分开加载 |

新增动画复用相关产品 UI，只展示必要的卡片或控件。参数默认值读取产品设计变量；调整值只在独立 iframe 内覆盖，不修改文件，不接回产品。抽象演示的旧调试记录保留在 v2 存储键，真实 UI 参数另存在 v3。

画廊不维护自动测试代码。维护时只做类型检查、设计构建和文件检查；页面内的人工检查记录仍保留。

本次浏览器视觉、指针/触摸、Safari 和 PWA 真机未验证；静态渲染和构建不能证明稳定帧率。设计只更新仓库，未发布到线上。

以下为 PR #71 合并时的产品源码盘点与旧画廊接入记录，保留历史基准。其中“可预览”与数量描述属于当时的产品组件画廊，不代表本次浏览器验收结果。

## 合并后的逐项盘点

### 范围与结论

PR [#71](https://github.com/dabaige53/sill/pull/71) 已合并，主分支合并提交为 `e95bd3506a722916d9b0b65f047c23e77055d1e1`。本表核对该版本的 30 个稳定 ID，并注明当前工作区尚未提交的手机修复。画廊数量不等于所有独立动画调用数量；此前按交互归并的 28 类不能与这里直接加减。

- 30 个目录条目：Web 桌面可预览 29 项，手机 Web 可预览 24 项。交集 23 项，桌面独有 6 项，手机独有 1 项。
- 按条目的主要播放路径：27 项经过项目自建 MotionEngine；2 项直接调用 Motion；1 项直接调用浏览器 Web Animations API。分类不把跟手更新和原生滚动误算成另一套动画库。
- 手机 Web 与安装后的 PWA 共用代码；手机 iframe 没有真实设备安全区、浏览器栏、系统键盘和触摸惯性的完整条件，不能据此认定 PWA 真机通过。
- 此次完成源码与调用链盘点，没有对 30 项逐一执行浏览器视觉或性能测试；没有 FPS、掉帧率或响应延迟实测数据。

### 30 项清单

“可预览”表示画廊接入了局部产品组件，不表示视觉验收通过。源码列为目录登记的入口，补充路径见备注。

| ID / 名称 | Web | 手机/PWA | 播放路径 | 产品实现入口 | 核对结果与关注点 |
| --- | --- | --- | --- | --- | --- |
| `control.press` · 按压反馈 | 可预览 | 可预览 | MotionEngine | [motion.ts](../../../apps/web/interactions/motion.ts) | 按下缩至 0.97，松手恢复；共用参数。 |
| `task.mark` · 任务勾选 | 可预览 | 可预览 | MotionEngine | [motion.ts](../../../apps/web/interactions/motion.ts) | 勾选状态即时更新，按压反馈只作用于标记；不是整行翻转动画。 |
| `settings.toggle` · 设置开关 | 可预览 | 可预览 | MotionEngine | [toggle-motion.ts](../../../apps/web/interactions/toggle-motion.ts) | toggle-motion 复用 MotionEngine，滑块使用伪元素位移。 |
| `menu.scope` · 分栏菜单 | 可预览 | 不适用 | MotionEngine | [motion.ts](../../../apps/web/interactions/motion.ts) | 桌面分栏菜单；显隐、焦点返回使用产品逻辑。 |
| `menu.card` · 卡片菜单 | 可预览 | 不适用 | MotionEngine | [app-card-actions.ts](../../../apps/web/views/app-card-actions.ts) | 桌面卡片右键菜单；手机画廊不提供该入口。 |
| `search.resize` · 搜索框伸缩 | 可预览 | 不适用 | MotionEngine | [motion.ts](../../../apps/web/interactions/motion.ts) | 桌面搜索框背景伸缩，输入文字不缩放。 |
| `feed.reorder` · 卡片排序 | 可预览 | 可预览 | MotionEngine | [layout.ts](../../../apps/web/interactions/layout.ts) | FLIP 平移；宽度改变时正文淡入，布局计算仍在主线程。 |
| `feed.first-entry` · 首屏进入 | 可预览 | 可预览 | MotionEngine | [app-feed.ts](../../../apps/web/views/app-feed.ts) | 首批卡片按 30ms 间隔入场；需重置示例才能再次触发。 |
| `feed.arrival` · 接收卡片 | 可预览 | 可预览 | MotionEngine | [app-feed-updates.ts](../../../apps/web/views/app-feed-updates.ts) | 新卡片下落与现有卡片重排；示例用合成事件接收。 |
| `feed.departure` · 移出卡片 | 可预览 | 可预览 | MotionEngine | [app-feed-updates.ts](../../../apps/web/views/app-feed-updates.ts) | 退出副本淡出，剩余卡片重排。 |
| `content.fade` · 内容更新 | 可预览 | 可预览 | MotionEngine | [motion.ts](../../../apps/web/interactions/motion.ts) | 正文短淡入；连续更新接续当前透明度。 |
| `reader.tools` · 阅读工具收起 | 可预览 | 可预览 | MotionEngine | [chrome.ts](../../../apps/web/interactions/chrome.ts) | 邮件阅读工具收起与恢复；停顿等待 650ms，显示 320ms，可能被感知为迟缓。 |
| `detail.card-flight` · 卡片展开与收回 | 可预览 | 可预览 | MotionEngine | [motion-panels.ts](../../../apps/web/interactions/motion-panels.ts) | 桌面来源卡片展开；手机底部抽屉。来源副本及胶囊跟随有额外逐帧计算。 |
| `detail.navigate` · 关联详情进入与返回 | 可预览 | 可预览 | MotionEngine | [motion-panels.ts](../../../apps/web/interactions/motion-panels.ts) | 复制旧详情再过渡；长正文的复制成本待测。本地修复让手机继承抽屉高度或全屏。 |
| `detail.sheet` · 手机详情抽屉 | 不适用 | 可预览 | MotionEngine | [gesture-surfaces.ts](../../../apps/web/interactions/gesture-surfaces.ts) | 手机抽屉进入、跟手及退出；登记只指 gesture-surfaces，实际还经过 gesture-pull、gesture-preview、motion-sheet。 |
| `reader.gesture` · 阅读右滑与读完上推 | 可预览 | 可预览 | MotionEngine | [gesture-preview.ts](../../../apps/web/interactions/gesture-preview.ts) | 读完上推与阅读返回；跟手更新不应强制变成定时动画。播客已排除右滑关闭。 |
| `feedback.toast` · 提示出现与关闭 | 可预览 | 可预览 | MotionEngine | [app-feedback.ts](../../../apps/web/views/app-feedback.ts) | 显示、进度与退出；手势可滑走，时钟暂停行为独立于运动。 |
| `notice.offline` · 离线提示 | 可预览 | 可预览 | MotionEngine | [app-card-actions.ts](../../../apps/web/views/app-card-actions.ts) | 状态驱动的提示显隐；示例事件不证明真实网络恢复。 |
| `notice.new-content` · 新内容提示 | 可预览 | 可预览 | MotionEngine | [app-card-actions.ts](../../../apps/web/views/app-card-actions.ts) | 新内容提示显隐；不代表来源同步功能。 |
| `drag.selection` · 长按选择与拖动 | 可预览 | 可预览 | MotionEngine | [drag.ts](../../../apps/web/interactions/drag.ts) | 选择拖动逐帧跟手，选择反馈走共用动画。 |
| `drag.ai-target` · 卡片放入 AI 上下文 | 可预览 | 可预览 | MotionEngine | [drag.ts](../../../apps/web/interactions/drag.ts) | 目标弹簧缩放走 Motion；循环脉冲动画化 inset，有绘制成本风险。仅加入上下文，不执行 AI。 |
| `refresh.pull` · 下拉刷新 | 可预览 | 可预览 | MotionEngine | [gesture-pull.ts](../../../apps/web/interactions/gesture-pull.ts) | 原生输入归属、拖动阈值与请求状态决定反馈；转圈走 Motion，跟手逐帧更新。 |
| `deck.swipe` · 叠卡翻动 | 可预览 | 可预览 | MotionEngine | [app-stacks.ts](../../../apps/web/views/app-stacks.ts) | 叠卡左右跟手，松手切换或回弹；键盘即时。 |
| `media.scroll-collapse` · 播客播放区收合 | 可预览 | 可预览 | 直接 Motion | [media-detail.tsx](../../../apps/web/cards/media-detail.tsx) | 直接使用 Motion 暂停时间线，滚动设置进度；需要共用时间线接口，不能简单换成定时淡入。 |
| `detail.resize` · 预览与放大切换 | 可预览 | 可预览 | MotionEngine | [motion-panels.ts](../../../apps/web/interactions/motion-panels.ts) | 阅读层与预览切换；手机滚动全屏另经过 motion-sheet。本地修复正文不缩放、滑动中展开。 |
| `reader.outline` · 阅读目录 | 可预览 | 可预览 | 直接 Motion | [reader-layout.tsx](../../../apps/web/interactions/reader-layout.tsx) | 直接使用 Motion；章节滚动写 scrollTop，目录指示线位移。键盘即时，滚动可中断。 |
| `selection.bar` · 多选条显隐 | 可预览 | 可预览 | MotionEngine | [app-selection.ts](../../../apps/web/views/app-selection.ts) | 选择数量控制工具条显隐与缩放；取消后禁用旧操作。 |
| `ai.dock-collapse` · AI 框折叠 | 可预览 | 不适用 | 浏览器 animate() | [shell.tsx](../../../apps/web/views/shell.tsx) | 直接调用 surface.animate / child.animate；是现有明确绕过 Motion 播放的过渡入口。 |
| `ai.dock-height` · AI 框高度切换 | 可预览 | 不适用 | MotionEngine | [app-ai.ts](../../../apps/web/views/app-ai.ts) | 共用 MotionEngine 改变背景与内容位置；示例只有用户消息，无真实助手。 |
| `ai.context-entry` · 上下文条目进入与移除 | 可预览 | 不适用 | MotionEngine | [app-selection.ts](../../../apps/web/views/app-selection.ts) | 上下文条目入场与退出；示例不调用模型。 |

### 统一入口的后续清单

1. `ai.dock-collapse`：将浏览器原生播放调用接入共用封装，保留当前几何计算、取消与草稿状态。这是把过渡播放统一到 Motion 的直接缺口。
2. `media.scroll-collapse`：为 MotionEngine 增加可暂停、由滚动设置进度的时间线能力后再接入；保持同一时刻只有一组播放器可操作。
3. `reader.outline`：如需统一入口，应覆盖数值滚动和完成/取消回调；不把滚动强行改成元素位移。
4. `drag.ai-target`：核验脉冲的 inset 绘制开销，再决定是否改为独立图层缩放。
5. `detail.navigate`：优先测长正文与图片详情复制、快速连续进退的首帧耗时；不能只调短动画时长。

以上为盘点后的待办，本次没有实施全量动画迁移。

### 目录覆盖缺口

目录目前没有单列封面加载淡入、主页顶栏收起/恢复、通用加载旋转、Toast 滑走、把手展开/收起、滚动展开全屏及动作中断。部分包含在现有综合示例中，部分只在产品生命周期中触发。后续应先补充现有示例的检查步骤，再判断是否需要新 ID，避免同一动画重复登记。

`detail.sheet` 和 `detail.resize` 的单一 implementation 字段不足以表达当前全部调用路径。关键补充入口：

- [gesture-preview.ts](../../../apps/web/interactions/gesture-preview.ts)：滚动展开与把手手势。
- [gesture-pull.ts](../../../apps/web/interactions/gesture-pull.ts)：顶部下拉关闭。
- [motion-sheet.ts](../../../apps/web/interactions/motion-sheet.ts)：手机抽屉尺寸过渡。
- [preview-controller.ts](../../../apps/web/views/preview-controller.ts)：内嵌卡片尺寸继承与返回。
- [motion-playback.ts](../../../apps/web/interactions/motion-playback.ts)：共用播放、属性占用与取消。

### 验证证据

- #71 合并前：`npm test` 通过，69 项约定、409 项 Web、138 项服务端、3 项性能报告解析，共 619 项；设计 build/check、构建、类型与文件检查通过。
- 为满足提交文件大小约束，将刷新用例从 gestures.test.ts 原样移到 gesture-refresh.test.ts；拆分后 25 项手势测试通过。没有删减用例。
- 恢复本轮手机修复后，动画库、内嵌导航、阅读反馈与本地同步共 43 项通过；构建、类型与设计检查通过。
- 合并后 CI 报告测试文件末尾多余空行，已用提交 `8fe1de0f` 修正并推送；该文件格式检查通过，远端后续检查以 GitHub 当前状态为准。
- PR 的动画库专项 20 项通过，覆盖目录、局部组件挂载、状态、隔离与交互调用；使用动画替身，不证明流畅度。
- 本会话此前局部浏览器证据：WebKit 邮件滚动卡死修复；Chromium 手机抽屉滑动中展开、关闭；播客顶部布局；内嵌卡片 780px 抽屉尺寸继承、844px 全屏返回和模态焦点阻止。上述证据只适用于对应场景，不扩展为 30 项全通过。
- iPhone 安装版 PWA、Safari 真机、全部桌面场景、性能时间线与 macOS 原生窗口仍未完整验证。设计未发布到线上。

### 查看动画库

运行 `npm run design -- build` 和 `npm run boards`，访问 [本地动画库](http://127.0.0.1:4310/motion/)。使用说明见 [动画库使用与维护](README.md)。该服务默认只监听本机，手机不能直接访问电脑的 127.0.0.1。
