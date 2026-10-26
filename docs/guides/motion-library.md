# 动画库

更新：2026-10-26。动画库用于查找、操作和检查产品已有的动画，登记入口为 [catalog.json](../../design-system/motion/catalog.json)。

动画库只提供 Web 桌面与手机 Web / PWA，不显示 macOS 选项或原生预览占位。登记文件保留跨端源码与能力信息，不实施原生示例，也不增加 App 或构建要求。

## 启动与使用

```sh
npm run design -- build
npm run boards
```

访问 [本地动画库](http://127.0.0.1:4310/motion/)。首页按产品功能和交互类型分类，可搜索动画 ID、名称、产品位置与源码路径。平台筛选移除不适用的场景，保留尚未接入预览或产品未实现的项目。

点击封面进入单个效果。直接操作真实组件；接收内容、首屏加载、网络提示和刷新结果由画布外的示例事件触发。首屏加载只发生一次，再次操作前重置。拖动和滚动直接跟随输入，没有播放按钮或计时慢放。

「重置」重载示例，恢复示例卡片、偏好、选择、阅读位置和局部状态，不清除收藏、检查记录与备注。「单独打开」进入该 ID 的独立页面。手机 Web 使用真实的窄视口；在宽窗口单独打开时，页面提供 390px 的 iframe。

收藏按动画 ID 保存。检查项、问题标记和备注按 ID 与平台保存，只存在当前浏览器的 `sill-motion-review-v1`，不写入产品工作区。五项检查全部勾选后显示「已检查」；标记问题后优先显示「有问题」。初始记录均为「未检查」。来源、设计变量、规则和检查备注默认收起。

## 组件与数据

- 产品与示例共用 `CheckItem`、`SettingRow`、`HomeScopeMenu`、`HomeSearchField` 和通知组件。卡片、堆叠卡片、阅读层、菜单、多选条与 AI 输入框直接引用产品组件。
- 示例调用产品的 `MotionEngine`、`withFeedAnchor`、详情控制器、`DragManager`、`Gestures` 和工具条滚动控制器。画布只定义尺寸、留白和摆放；不嵌入或裁切完整产品页面。
- 每个效果生成独立的 `/motion/examples/<id>/` 页面，动画库通过 iframe 嵌入。封面也来自相同的局部组件，显示静止状态，点击后进入可操作示例。
- 每个 iframe 使用独立的合成卡片和内存状态。入口不启动产品生命周期、不加载工作区，也不启动同步；保存函数仅在该示例中替换为空操作。媒体示例没有音源，不伪造播放或完成。
- 阅读工具收起使用真实的邮件阅读组件。资讯与媒体放大页目前使用固定工具栏，不能拿来演示滚动收起。
- AI 框高度示例放入一条合成的用户消息，只操作已有的会话界面，不生成助手回复或执行结果。产品的未连接提示与禁用发送状态保持可见。

## 登记与维护

| 位置 | 用途 |
| --- | --- |
| `design-system/motion/catalog.json` | 稳定 ID、功能与交互分类、组件和实现源码、设计变量、平台能力 |
| `design-system/copy/zh-Hans/motion.json` | 名称、产品位置、触发方式、结束状态、跨端差异与示例文案 |
| `apps/web/motion-library/` | 目录页面、局部状态适配、合成数据与画布尺寸 |
| `design-system/scripts/motion-library.ts` | 构建独立页面、共享资源和源码索引到 `dist/design/motion/` |

新增效果时先找产品实现。缺少可复用组件时，从产品提取后由两处共同使用。不要复制一份外观或动画。ID 一经使用就保持稳定；产品位置或源码变化时更新登记。

平台能力区分 `preview`（真实组件可操作）、`missing-native`（尚未接入真实原生组件）、`missing-preview`（已有产品实现，缺少局部示例）、`not-implemented`（产品未实现）和 `not-applicable`（没有该平台场景）。macOS 原生不能用 Web iframe 代替。

## 逐项核对与验证边界

30 个 ID 的组件路径、实现路径、原生源码路径、局部范围和调用链已核对。下表列出自动检查覆盖；「挂载」只证明封面和示例可创建局部组件、不含全局导航、不访问产品存储或网络，不证明真实浏览器中的视觉效果。

| ID | 局部真实组件 | 非浏览器检查 |
| --- | --- | --- |
| `control.press` | 一个收藏按钮 | 挂载、收藏状态 |
| `task.mark` | 一行任务 | 挂载、双向勾选、重置数据 |
| `settings.toggle` | 一行设置与开关 | 挂载、双向切换 |
| `menu.scope` | 分栏触发按钮与菜单 | 挂载、选项、关闭、焦点返回 |
| `menu.card` | 卡片标题与右键菜单 | 挂载、真实菜单、收藏 |
| `search.resize` | 主页搜索框 | 挂载、聚焦、输入、失焦保留、清空 |
| `feed.reorder` | 到点浮上来设置与三张卡片 | 挂载、实际排序、恢复原序 |
| `feed.first-entry` | 三张首次加载的卡片 | 挂载、空状态到首屏、禁止重复加载 |
| `feed.arrival` | 少量卡片 | 挂载、接收后增加卡片 |
| `feed.departure` | 少量卡片 | 挂载、移出后减少卡片 |
| `content.fade` | 一张卡片的正文 | 挂载；更新调用产品内容过渡 |
| `reader.tools` | 邮件正文与工具栏 | 挂载、向下收起、向上恢复、交互禁用状态 |
| `detail.card-flight` | 来源卡片与详情 | 挂载；展开和收回沿用产品控制器 |
| `detail.navigate` | 摘要详情与关联卡片 | 挂载、关联进入、返回上一详情 |
| `detail.sheet` | 手机详情抽屉 | 窄视口挂载；真实触摸未验证 |
| `reader.gesture` | 阅读正文与工具 | 挂载；右滑、上推读完沿用产品手势 |
| `feedback.toast` | Toast | 挂载；显示、时钟与关闭沿用产品控制器 |
| `notice.offline` | 离线提示 | 挂载；显隐沿用产品控制器 |
| `notice.new-content` | 新内容数量提示 | 挂载；显隐沿用产品控制器 |
| `drag.selection` | 三张卡片与多选条 | 挂载、拖动选择、结束与取消 |
| `drag.ai-target` | 卡片与 AI 输入框 | 挂载、拖入后加入示例上下文 |
| `refresh.pull` | 卡片与刷新圆环 | 挂载、按住拖动、松手等待、失败重试、成功 |
| `deck.swipe` | 三张堆叠卡片 | 挂载；跟手与松手沿用产品控制器 |
| `media.scroll-collapse` | 播客详情与播放区 | 挂载；时间线沿用真实滚动实现 |
| `detail.resize` | 同一卡片的预览与阅读层 | 挂载、放大、缩小、完全关闭；桌面与窄视口 |
| `reader.outline` | 正文与真实目录 | 挂载、章节定位、目录显隐；手机目录展开与收起 |
| `selection.bar` | 三张卡片与多选条 | 挂载、选择后出现、清空后禁用与退出 |
| `ai.dock-collapse` | 桌面 AI 框 | 挂载、折叠与恢复、草稿保留、禁用发送 |
| `ai.dock-height` | 桌面 AI 框与一条用户消息 | 挂载、三档高度、Esc 退回、禁用发送、无助手结果 |
| `ai.context-entry` | 一张卡片与 AI 框上下文 | 挂载、拖入后加入条目、移除最后一条 |

Web 桌面有 29 个可预览项目，手机 Web 有 24 个。手机没有桌面分栏菜单、卡片右键入口、伸缩搜索和桌面 AI 框；桌面没有手机抽屉。macOS 原生预览尚未接入；Mac 云端离线提示记为产品缺失，其余保留各自源码和跨端差异。

```sh
node --import tsx --test tests/web/motion-library.test.ts
npm run typecheck
npm run build
npm run check
npm run lint:web
npm run test:core
npm run design -- check
npm run files:check
```

JSDOM 检查使用动画边界替身，只验证状态与调用后的 DOM。浏览器视觉、iframe 内浮层边界、真实指针与触摸、Safari、手机真机和 macOS 原生组件均未验证，按[测试与验证](testing.md)另行执行。设计材料只更新仓库，尚未发布到线上。
