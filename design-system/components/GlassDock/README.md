# GlassDock

底部导航胶囊：居中的一条玻璃胶囊，四格：主页、搜索、AI、设置。一块透明镜片标出当前一格，换格时滑过去。

- 结构：`nav#nav.nav-capsule.glass` 里是 `.nav-lens` 和四个 `.nav-tab`（`data-action="nav"`，`data-extra` 为 `home`、`search`、`ai`、`settings`）。当前一格带 `aria-current="page"`。
- 每格：桌面图标 22px 在上、文字 10.5px 在下；手机只有图标 24px，不写文字（`aria-label` 保留）。当前一格 `ink`，其余 62% 的 `ink`。设置格显示头像（`account-face`，26px），有账号名时显示首字，没有时显示 `person`。
- AI 格：图标 `chat`。内置助手还没有，打开后只写「即将推出」和一句说明，不放输入框或可点的动作。读屏读作「AI，即将推出」。
- 添加（记一笔）不在胶囊里，在设置的第一组「添加」；键盘 `N` 照旧打开记一笔面板。
- 镜片：`glass-press` 底，上沿 `glass-edge` 高光。用 `--lens-x`、`--lens-w` 定位，`ease-spring` 520ms（`dur-lens`）滑动；移动途中 `scale: 1.16 0.9` 再回到 1。桌面上面板晚 160ms 打开，底栏 220ms 淡出；手机上页面立即切换（180ms 淡入），胶囊不离开。减少动态效果时直接到位。
- 尺寸：高 `rail-row` 60，每格 `nav-tab` 76（手机 60，胶囊共 248 宽，不占满一行），4px 内边距。
- 手机上每一格都是页面：`#modal.page` 用非模态 `dialog.show()` 打开，铺满胶囊后面的屏幕（`z-index` 低于底栏），没有把手、关闭按钮和遮罩；Esc 回主页。离底 28（手机 16 加安全区）。
- 材质：`glass` + `glass-filter` + 左上 `glass-edge`、右下 `glass-shade`、外圈 `glass-rim`、`shadow-glass`。减少透明度时改用 `card` 实底加描边。
- 向下滚动 28px 完全收起（`dur-tuck`），停下 `rest-show`、向上滚、到顶或到底时回来；弹层打开、拖动或键盘弹出时让开。
- 筛选进行中，搜索图标右上有 5px `ink` 小点，不显示数量。同步中，头像外有一段转动的细弧。
