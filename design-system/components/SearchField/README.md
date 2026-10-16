# SearchField

搜索输入：左侧搜索图标，白色胶囊输入框。手机在底部、跟着键盘升起；桌面在顶部，⌘K / Ctrl K 打开。

- `.search-pill` > `icon('search')` + `input`；高 52px，`card` 底，0.5px `line-card` 加 `shadow-glass`。聚焦时贴着输入框的 3px 柔和光圈（`accent` 32%），不加外描边。
- 不显示数量：输入框和结果分组都不写张数，数量只交给读屏软件（`role=status` 的隐藏文字）。
- 输入法拼写中不筛选，`compositionend` 后再筛选；本地搜索不显示加载态。
- 手机上筛选胶囊在输入框上方一行，结果从下往上排。
