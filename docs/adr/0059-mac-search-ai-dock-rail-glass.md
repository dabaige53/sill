# 桌面搜索框伸缩、AI 框拖入反馈与底部轨道玻璃统一

日期：2026-10-21。状态：已接受。

## 原因

用户在 Mac App 中反馈：

- 搜索框平时太长，点击后又画出高亮框。
- AI 输入框点击外部后不失去焦点。
- 按住卡片选中时 AI 框会闪出来，拖动卡片时也看不出 AI 框可以接收卡片。
- 多选条、详情工具条和 AI 框的玻璃不一致，且不像 Apple 的玻璃。
- 悬停按钮、搜索栏和 AI 栏时指针不变化。
- 照片卡片点击后有时空白，打开过其他卡片后才显示。

## 决定

- 桌面搜索框（Web 与 macOS）静止时宽 280，聚焦时用 `dur-state` 220ms 伸长到 480，失焦后有文字或标签时保持 360；不画聚焦边框与外圈；Web 只拉伸玻璃底，文字与光标不缩放。点击框外失去聚焦，搜索词与标签保留。
- AI 输入框点击框外失去聚焦，草稿保留。移除上下文卡片时，最后一张也淡出。
- 拖动卡片的判断从“按下”改为“已经移动”：按住选中但尚未移动时显示多选条，不显示 AI 框。拖动期间 AI 框放大到 1.02，`accent` 圆环每 1.2 秒从框边向外扩 14 并淡出；拖到框上放大到 1.05。两端相同；新增共享变量 `motion.aiDrop` 与对应的 Apple 指标 `aiDropScale`、`aiDropReadyScale`、`aiDropPulseSpread`、`aiDropPulse`。松手后卡片堆淡出并缩小。
- 详情底部工具条与多选条、AI 框统一使用同一种 Apple 风格玻璃：macOS 26+ 为原生 regular 玻璃，不叠 `card` 底色；Web 为清透的 `glass` 加 `glass-filter`。原先为压住背后文字而用的厚底（`chromeGlassOpacity`、`chrome-glass-filter`）删除。多选条采用详情工具条的按钮间距、内边距和分隔线高度。
- 指针：Mac 与 Web 的可点击按钮、卡片悬停显示手形；搜索框和 AI 框整个胶囊显示文字光标，点击空白处聚焦输入；禁用按钮保持箭头。Mac 在 macOS 15+ 用系统 `pointerStyle`，旧系统用 NSCursor 入栈出栈。
- 新增 Web 变量 `--search-width`、`--search-tagged-width`、`--search-focused-width`。

## 影响

修改 foundation 设计变量；修改 Mac `SearchField`、`AIDock`、`DesktopView`、`SelectionBar`、`ReaderToolbar`、`Controls`、`Shadow`、`CardTile`、`PhotoLightbox`（照片切换改用内容淡入，不再以 id 重建视图），Web 搜索栏、AI 框拖入、底部轨道玻璃与 `MotionEngine`；更新手册 web-interaction、foundation、motion 和 SearchField 组件说明。真实窗口中的手感需用户确认。
