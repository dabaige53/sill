# Mac 卡片列表滚动卡顿

## 问题与状态

状态：已修复待验证。最近检查：2026-11-03。

快速上下滚动卡片列表时，每次起手的 0.2–0.5 秒会停 1–3 帧，再一次跳 150–350px；松手后的惯性滑行基本流畅。

## 环境与触发

- macOS 27.2，`/Applications/Sill.app` 1.2.30 Release 构建，真实账号的卡片列表。卡片包含大量来源图标和图片卡。
- 触发：鼠标停在卡片区域上方，用触控板快速上下滑动。
- 预期：滚动保持 60fps。实际：滑动期间主线程占满，频繁掉帧。

## 定位依据

**录屏逐帧（观察）**：对 11 秒录屏逐帧测量卡片区的位移。5 次手势起手处都出现“位移为 0 的帧和 150–350px 跳帧交替”；惯性阶段位移均匀递减。

**Instruments 采样（已证实）**：用 Animation Hitches 和 Time Profiler 挂到 Sill，录 54 秒，其中约 28 秒在连续滑动。

- 滑动期间 Sill CPU 100–270%。主线程 17042 个采样中只有 0.8% 在等待，基本占满。
- 共 40 次掉帧（16–250ms），多数标注为 expensive app update；另有 97 次 potential hang。
- 主线程耗时分布（2–30 秒，按包含该调用的采样计）：

| 调用 | 占比 |
| --- | --- |
| 悬停命中测试（`HoverResponder.containsGlobalPoints`，经 `didRequestHoverUpdate`） | 59.1% |
| 其中：来源图标解析 SVG（`SourceBrandShape.path(in:)` → `SVGPathParser.parse()`） | 22.2% |
| 文字排版 | 4.2% |
| 瀑布流测量（`MasonryLayout`） | 0.2% |
| 图片解码（ImageIO、`AsyncImage`） | ≈0% |

**原因链（已证实）**：

1. 滚动时鼠标不动、内容在移动，SwiftUI 每帧都要重新判断鼠标下面是哪个视图，即悬停命中测试。
2. 瀑布流不是懒加载，所有已加载卡片都留在视图树中，并通过 `onHover`（[FeedView.swift](../../../apps/apple/macOS/Feed/FeedView.swift)、[CardTile.swift](../../../apps/apple/macOS/Feed/CardTile.swift)、[CardBodies.swift](../../../apps/apple/macOS/Feed/CardBodies.swift)）和 `contentShape` 参与命中测试，每帧都要遍历和换算坐标。
3. 命中测试会检查形状叶子视图是否包含该点。来源图标 `SourceBrandShape`（[SourceMark.swift](../../../apps/apple/macOS/Design/SourceMark.swift)）的 `path(in:)` 每次被调用都重新解析整段 SVG 路径字符串，没有缓存，单这一项就占主线程 22%。

**排除的方向**：录屏阶段曾推测“远程封面图在主线程解码”和“加载新页时全量重新测量”，采样中两者分别约 0% 和 0.2%，不是原因。顶栏收起、滚动位置记录也几乎不占时间。

## 处理情况

已修改（未提交）：

- 来源图标：品牌表加载时把每个品牌的 SVG 路径解析一次存为 `Path`，`SourceBrandShape.path(in:)` 只做缩放（[SourceMark.swift](../../../apps/apple/macOS/Design/SourceMark.swift)）。
- 品牌匹配：品牌表加载时按键排好序，`SourceBrand.matching` 不再每次调用都排序。匹配顺序不变。
- 滚动期间暂停卡片悬停：`FeedScroll` 在滚动位置变化时标记“正在移动”，停止变化 `gestureWheelRest`（120ms）后恢复（[Chrome.swift](../../../apps/apple/macOS/Shell/Chrome.swift)）。移动期间卡片层关闭命中测试（[FeedView.swift](../../../apps/apple/macOS/Feed/FeedView.swift) `RestingHover`）。这个标记只在滚动开始和停下时各变一次，只有卡片层读取它。

交互变化：滚动时卡片不跟随鼠标浮起；停下后鼠标下的卡片照常浮起。惯性滚动中点击卡片只会停住滚动，不会打开卡片，需要再点一次。下拉刷新、键盘操作和顶栏不受影响。

Web 端：浏览器自行处理滚动中的悬停，本次不改 Web。

另外观察到：空闲时 `DesktopView.tick → dueReminders` 会定时复制全部卡片数据。本次采样中占比很小，与卡顿无关，未处理。

## 验证与后续

- 本记录的采样只覆盖 1.2.30 Release 构建和当次账号数据，未在其他机器或数据规模下复测。
- 新增回归测试 `MotionFlowTests.feedPausesCardHoverOnlyWhileMoving`：有位移时暂停，停下后恢复，无位移的边界变化不暂停。已有的 `SourceMarkTests` 继续覆盖品牌匹配和路径。测试与构建由 GitHub Actions 执行，本地只做了语法检查。
- 下一步：装上新构建后，用同样方式滑动采样，对比主线程占用、悬停命中测试占比和掉帧次数，并确认停下后鼠标下的卡片正常浮起。
