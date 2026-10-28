# 动效补齐状态

独立保留[原动效清单](../2026-10-28-macos-parity-audit/animation-checklist.md)的41项编号，与[功能清单](function-status.md)分开。参数和源码已核对，窗口速度、手感、反向连续性和帧时间均未验收；后台合成测试不代替真实设备。

| 编号 / 检查项 | 状态 | 当前实现与边界 | 实现入口 |
| --- | --- | --- | --- |
| A01 首次卡片显示 | 保留一致 | 首次卡片同时显示，不补虚构的错峰入场。 | [FeedView.swift](../../../apps/apple/macOS/Feed/FeedView.swift) |
| A02 筛选/分页时的入场和重排节奏 | 本次已补 | 分类、条件和分页不播普通入场/重排；显式数据更新才走对应动效。 | [Feed.swift](../../../apps/apple/macOS/Model/Feed.swift) |
| A03 窗口改变但列数不变 | 本次已补 | 列宽变化触发220ms布局过渡；140ms淡入仅作用正文，卡壳保持稳定。 | [CardTile.swift](../../../apps/apple/macOS/Feed/CardTile.swift) |
| A04 叠卡运动几何 | 原生保留 | 保留Mac叠卡纯水平平移，不复制Web倾斜和下落；见ADR 0083。 | [FeedView.swift](../../../apps/apple/macOS/Feed/FeedView.swift) |
| A05 叠卡键盘速度 | 本次已补 | 方向键即时翻页，Enter和Space展开。 | [FeedView.swift](../../../apps/apple/macOS/Feed/FeedView.swift) |
| A06 叠卡连续反向与中断 | 本次已补 | 从当前绘制值接手，用代次令牌取消旧落定回调，反向不再被旧目标覆盖。 | [FeedView.swift](../../../apps/apple/macOS/Feed/FeedView.swift) |
| A07 卡片打开的几何路径 | 原生保留 | 正文最终字号布局一次，外框移动并裁切露出，不缩放正文与按钮。 | [ReaderOverlay.swift](../../../apps/apple/macOS/Reader/ReaderOverlay.swift) |
| A08 打开时正文/工具出现时序 | 原生保留 | 保留Mac几何进度20%–75%交接卡面与正文，区别于Web延迟淡入。 | [ReaderOverlay.swift](../../../apps/apple/macOS/Reader/ReaderOverlay.swift) |
| A09 关闭回卡的正文交接 | 原生保留 | 收回期间按原生几何进度交接，结束再交还真实卡片；位置实测待补。 | [ReaderOverlay.swift](../../../apps/apple/macOS/Reader/ReaderOverlay.swift) |
| A10 同一卡放大/缩小 | 保留接入 | 同卡预览/全屏使用当前外框、cardSpring及100/120ms正文交接，保留媒体状态。 | [Reader.swift](../../../apps/apple/macOS/Model/Reader.swift) |
| A11 嵌套层进入离开 | 保留一致 | 只前层opacity和Y10进入/退出，280/220ms；父层保持挂载。 | [ReaderOverlay.swift](../../../apps/apple/macOS/Reader/ReaderOverlay.swift) |
| A12 阅读工具隐去的位置 | 本次已补 | 顶部工具只变透明度且锚点固定；底部才下移20px。 | [ReaderScroll.swift](../../../apps/apple/macOS/Reader/ReaderScroll.swift) |
| A13 阅读顶部工具恢复节奏 | 本次已补 | 顶部恢复560ms、底部420ms，隐藏240ms，静止450ms恢复。 | [ReaderScroll.swift](../../../apps/apple/macOS/Reader/ReaderScroll.swift) |
| A14 信息流工具触发边界 | 本次已补 | 信息流顶底24px保持工具；Tab和栏内键盘焦点恢复并保留工具。 | [Chrome.swift](../../../apps/apple/macOS/Shell/Chrome.swift) |
| A15 阅读工具“读完区域”触发 | 本次已补 | 按真实滚动末尾120px判断读完区域，零增量不触发隐藏。 | [ReaderScroll.swift](../../../apps/apple/macOS/Reader/ReaderScroll.swift) |
| A16 读完上推累计距离 | 本次已补 | 每事件最多40px再乘0.5累计，目标120；离散输入静默320ms回位。 | [ReaderScroll.swift](../../../apps/apple/macOS/Reader/ReaderScroll.swift) |
| A17 读完上推达标后的关闭时机 | 原生保留 | 等真实保存回执成功及原生手势结束后关闭；失败保持可重试，不能称Web逐帧一致。 | [ReaderScroll.swift](../../../apps/apple/macOS/Reader/ReaderScroll.swift) |
| A18 刷新跟手、阻力与回位 | 本次已补 | 刷新重抓采当前绘制值并反算阻力，释放速度传入弹簧，向下速度限制60。 | [FeedRefresh.swift](../../../apps/apple/macOS/Model/FeedRefresh.swift) |
| A19 刷新离散滚轮与鼠标起点 | 本次已补 | 首个滚轮事件只建原点，离散80ms结束；鼠标越过门槛后重建起点，原生阶段另处理。 | [FeedRefresh.swift](../../../apps/apple/macOS/Model/FeedRefresh.swift) |
| A20 刷新圆环转速/成功淡出 | 本次已补 | 加载800ms一圈，成功停400ms后140ms淡出，不随回位弹簧拖尾。 | [FeedRefresh.swift](../../../apps/apple/macOS/Model/FeedRefresh.swift) |
| A21 回顶动画速度 | 前批已补 | T和品牌回顶即时完成。 | [DesktopView.swift](../../../apps/apple/macOS/Shell/DesktopView.swift) |
| A22 键盘动画模态维持 | 本次已补 | 键盘模态持续至指针输入，异步后续也跳过动画，按钮按压和卡片淡入同样处理。 | [Motion.swift](../../../apps/apple/macOS/Design/Motion.swift) |
| A23 核心曲线/弹簧参数 | 原生引擎 | 核心曲线和参数沿用共享值；SwiftUI与Web停止阈值、插值及设备输入不宣称逐帧等价。 | [Motion.swift](../../../apps/apple/macOS/Design/Motion.swift) |
| A24 实际速度与卡顿 | 待性能实测 | 最小高度缓存及局部更新已接入；未采集帧时间、主线程延迟，不宣称无卡顿。 | [MasonryLayout.swift](../../../apps/apple/macOS/Feed/MasonryLayout.swift) |
| A25 AI 拖动与键盘步长 | 本次已补 | AI拖动门槛4px、边界实时重设，键盘按可用范围10%移动。 | [AIDock.swift](../../../apps/apple/macOS/Shell/AIDock.swift) |
| A26 AI 收起/恢复时序 | 本次已补 | 外壳260/300ms，文字100ms退出、气泡80ms进入、恢复文字120ms进入。 | [AIDock.swift](../../../apps/apple/macOS/Shell/AIDock.swift) |
| A27 AI 引用进入/移除曲线 | 本次已补 | 引用移动、透明和补位统一ease-reveal，保留500/180、220/140、280ms。 | [Motion.swift](../../../apps/apple/macOS/Design/Motion.swift) |
| A28 多选加入AI的引用启动时间 | 本次已补 | 数据立即加入，引用140ms后进入，先交接多选条与AI栏。 | [AIDock.swift](../../../apps/apple/macOS/Shell/AIDock.swift) |
| A29 搜索列表开合 | 本次已补 | 列表150ms开、100ms关、scale .97，保留退出过渡。 | [SearchField.swift](../../../apps/apple/macOS/Shell/SearchField.swift) |
| A30 搜索共享高亮 | 本次已补 | 共享高亮鼠标180ms、键盘即时；悬停不自动滚列表。 | [SearchField.swift](../../../apps/apple/macOS/Shell/SearchField.swift) |
| A31 搜索清空图标与输入占位 | 本次已补 | 固定32px尾槽，清空按钮scale .25、blur4、300ms弹簧。 | [SearchField.swift](../../../apps/apple/macOS/Shell/SearchField.swift) |
| A32 搜索结果提交等待 | 本次已补 | 输入停止140ms提交，最新结果回顶。 | [Feed.swift](../../../apps/apple/macOS/Model/Feed.swift) |
| A33 设置开关按下与跟手 | 本次已补 | 按下200ms拉伸7px，3px后拖动；绘制阶段计算最多5px压缩，重抓采当前进度。 | [SettingsControls.swift](../../../apps/apple/macOS/Settings/SettingsControls.swift) |
| A34 设置开关落定速度 | 本次已补 | 单一指针手势处理点击/拖动；传释放速度，300ms/bounce .25，失焦恢复，键盘即时。实际引擎落定待测。 | [SettingsControls.swift](../../../apps/apple/macOS/Settings/SettingsControls.swift) |
| A35 标签新增、删除、补位 | 本次已补 | 标签250ms弹出/补位、150ms退出、模糊过渡、删除按钮延后60ms、重复300ms摇动。 | [EditorPanel.swift](../../../apps/apple/macOS/Shell/EditorPanel.swift) |
| A36 照片拖动释放与连续翻页 | 原生优化 | 鼠标从起始页选择落点，避免再加一页；失焦取消，缩放窗口保持当前页，触控板用原生分页。手感待测。 | [PhotoLightbox.swift](../../../apps/apple/macOS/Reader/PhotoLightbox.swift) |
| A37 照片按钮与键盘定位速度 | 本次已补 | 照片方向键即时定位，按钮/缩略图保留原生程序滚动，首尾不循环。 | [PhotoLightbox.swift](../../../apps/apple/macOS/Reader/PhotoLightbox.swift) |
| A38 登录浮动标签 | 本次已补 | 标签120ms上移8px并缩到.75，焦点独立变色，键盘即时。 | [CloudLogin.swift](../../../apps/apple/macOS/Shell/CloudLogin.swift) |
| A39 登录密码显隐与等待 | 本次已补 | Eye/EyeOff交叉透明和scale .9，按钮内真实等待圆环800ms一圈，处理中禁用重复提交。 | [CloudLogin.swift](../../../apps/apple/macOS/Shell/CloudLogin.swift) |
| A40 提示条、菜单与批量栏完整交接 | 本次已补 | 分栏菜单180/100ms、进入.95/退出.98、取消旧回调；保留Toast暂停和底栏交接。组合场景待验。 | [ScopeMenu.swift](../../../apps/apple/macOS/Shell/ScopeMenu.swift) |
| A41 按压、悬停与焦点反馈 | 源码补齐 | 图标、实心按钮和主操作键盘不缩放；任务只动圆圈，开关独立负责，焦点/hover保留。逐控件窗口反馈待验。 | [Controls.swift](../../../apps/apple/macOS/Design/Controls.swift) |

参数源为[apple.json](../../../design-system/tokens/apple.json)，原生差异依据[ADR 0083](../../adr/0083-macos-parity-and-native-interaction.md)。没有将原有一致项、平台差异或未测性能计作已修复缺陷。键盘、鼠标和触控板须分别记录窗口结果。
