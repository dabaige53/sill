# Mac 详情放大缩小卡顿与关闭后白框

## 问题与状态

状态：白框、空白帧、动画中每帧重画文字三项都已修复待验证。重画文字的原因是按最可能的一项推断并修改的，用户决定不再做对照实验。放大开头约 160ms 的布局和焦点遍历停顿未处理。最近检查：2026-11-05。

## 环境与触发

- macOS 27.2，Sill 1.2.36，真实账号，用户录屏（60fps，未入库）。
- 触发：打开已读长文卡片 → 点放大 → 点缩小 → 点关闭。
- 预期：放大缩小连续，关闭后卡片平滑回到网格。实际：放大、缩小开头各有约 2 帧空白大框，过程中有单帧停顿；关闭回落的最后几帧，灰色卡片外露出一圈白边。

## 定位依据

**录屏逐帧（观察）**：

- 关闭：回落表面比卡片面略大的部分是纯白，卡片面本身是已读灰底，白色在卡片下沿和右沿露出。
- 放大与缩小：点击后第 1–2 帧表面已变大但正文全空，随后正文淡入；帧差显示放大开头和中段、缩小开头各有一帧画面不变（主线程停顿）。

**源码（已确认 / 推测）**：

- 白框（已确认）：[ReaderOverlay.swift](../../../apps/apple/macOS/Reader/ReaderOverlay.swift) `CardFlightSurface` 的卡片层和底层始终用 `AppleColors.card`（白）并带卡片阴影；已读卡片在网格中是 `AppleColors.readCard`（灰）且无阴影（[CardTile.swift](../../../apps/apple/macOS/Feed/CardTile.swift) `CardFace`）。回落时表面与卡片面尺寸不完全重合，白底与阴影露在灰卡外。
- 空白帧（推测）：放大缩小时正文先立即隐藏，等 `CardGeometryDestination` 通过 `.task(id:)` 调用 `geometryReady` 后才开始动画和淡入；`task` 是异步调度，至少多等一帧。
- 中途掉帧（部分确认）：见下方性能追踪。卡住的具体调用未确认。

**应用内性能追踪（观察）**：追踪 `30E712F5-A628-4CF5-AC78-C079C088E8CB`（日志在 `~/Library/Logs/Sill/Performance/`，未入库）。抓取时安装的是 1.2.36 build 1793860453，安装时间早于上述源码修改，所以不包含这些修改。

- 2.04s 点放大（`openCard` 本身 2.7ms），随后在 2.25s 记到一次 135ms 主线程延迟，约 8 帧。3.26s 点缩小，没有记到 50ms 以上的延迟（采样是间隔探测，可能漏掉短停顿）。
- 打开卡片后也有一次 59ms 延迟。刷新读取 1234ms 在后台，`changed_cards` 为 0，与放大无关。
- 用户反馈“放大缩小时闪一下”。按源码推测：放大时正文先隐藏到 0（`DetailReveal` 的 settling 状态），主线程卡 135ms 后才开始动画和淡入，所以大框先空白一段，看起来像闪了一下。

**放大时会变的内容（源码，未逐项测量）**：article 的详情配方和阅读配方相同，正文视图不会因为换配方而重建。但 `MarkdownText` 的 `outline` 会从 false 变成 true，标题段落的 `.id` 随之改变（这些段落会重建），每个已排版段落还会加上上报位置的 `GeometryReader`。字号从 preview 换成 page，可见段落全部重排。同时出现右侧目录、阅读进度和顶部工具条。这 135ms 由哪一项造成，还需要 Time Profiler 调用栈确认。

## 处理情况

- 回落表面按源卡片状态取底色和阴影：已读卡片用灰底、无卡片阴影，随抬起过渡到白色详情底。
- `geometryReady` 改为在测量所在的同一次更新中通过 `onChange(initial:)` 上报，去掉 `task` 的额外等待。
- 飞行表面的裁切：原来用自定义 `CardFlightMask`（路径随帧变化），现改为先把容器设成当前帧的尺寸，再用 `RoundedRectangle` 圆角裁切，同时删除 `CardFlightMask`。依据：真实数据采样中，叶子函数最多的是软件遮罩 `A8_mark_constmask`；合成数据只在含链接和行内代码时出现每帧重画文字（见下方“合成数据对照”）。`RoundedRectangle` 裁切应能交给 Core Animation 圆角处理，但这一点没有实测确认。
- 未处理：放大开头的布局约 90ms 和焦点响应者遍历约 55ms。后者的耗时随正文链接数增加，触发它的视图变化未定位。
- Web 端由浏览器排版，本次不改。

## 验证与后续

- 本地 `swift build` 通过。修改后的版本没有再采样，也没有做视觉验证。
- 待验证：装新包后打开链接多的长文，重复放大、缩小、关闭，录屏或采样。确认三点：关闭最后几帧无白边；放大缩小开头无空白帧；动画中 `CALayer _display` 文字重画明显减少。
- 若文字仍每帧重画，下一个候选是 `DetailReveal` 中正文的位移和淡入（每帧变化的位置让 CPU 绘制的文字图层重画）。
- Time Profiler 采样（2026-11-05，已完成）：结果见下方“采样结果”和“合成数据对照”。

## 合成数据对照

为隔离真实账号，用 `-DDEBUG` 的 Release 构建（Release 默认忽略 `--data-directory`）组装独立 Bundle ID 的测试 App，数据目录放在会话临时目录。文件未入库。

- 演示数据加一篇约 2.8 万字、无链接的长文：每次切换主线程忙 55–60ms，动画中几乎没有文字重画，焦点遍历 3–6ms。没有复现。
- 改为约 7 万字、293 个链接、带行内代码的长文：切换时主线程忙 250–420ms，动画中连续出现只有 `CALayer _display`（`CGDrawingLayer` 文字重画）的帧。焦点遍历升到 16–18ms。复现了真实数据的特征。
- 对照实验（只换裁切、去掉位移、去掉链接）已编好，但用户决定直接修改，没有测。

另发现：[本地测试](../../implementation/operations/local-testing.md)写的是用 `dist/macos/Sill.app --data-directory` 启动，但 Release 构建的 `LaunchOptions.current` 不读启动参数，会进入云端模式。本次未修改该文档。

## 采样结果

用 `xctrace` 的 Time Profiler 模板挂到正在运行的 1.2.36（pid 97761）上，录 30 秒，期间用户来回放大缩小。采样文件放在会话临时目录，未入库。安装包的 Swift 符号不全，只能看到少量应用函数名。

- 放大三次，每次主线程连续忙约 360ms，三次的构成几乎一样：
  - 前约 160ms 是一整段停顿：SwiftUI 更新视图图和窗口布局约 90ms；`AccessibilityNode.updateFocusResponder` 遍历整棵响应者树约 55ms（`MultiViewResponder.visit` 层层嵌套）。为每个已排版段落记位置的 `GeometryReader` 布局约 18ms。
  - 后约 200ms 是动画过程：每 20ms 里约 8ms 花在 CPU 重绘文字（`ResolvedStyledText.StringDrawing.draw`、`render_glyphs`，经 `CALayer _display`）。另有软件遮罩绘制 `A8_mark_constmask`，是这段里最多的叶子函数。主线程忙到接近每帧上限，所以掉帧。
- 缩小每次约 110–130ms：前约 100ms 一整段停顿，含点击处理（`Reader.open` 触发的 Observation 失效约 13ms）和布局；之后基本没有重绘。
- 应用自己的 `body` 计算（PreviewSheet、ReaderContent、MarkdownText）合计只有几毫秒，不是瓶颈。
- 没有 250ms 以上的 hang 记录。

**结论（观察）**：“闪一下”就是开头那 160ms 停顿，加上正文从 0 淡入。动画中途掉帧，是每帧都在 CPU 上重绘文字和遮罩。

**未确认**：遍历焦点响应者是由哪个视图变化触发的；文字每帧重绘的确切原因（已按最可能的裁切修改，见“处理情况”）。
