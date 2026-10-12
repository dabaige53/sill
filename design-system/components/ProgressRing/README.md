# ProgressRing

阅读进度圆环：读过多少由圆环表达；打开内容与读完是两种状态。

- `QuietGlass.ring(progress 0–1, size=22)`，`role="progressbar"`，aria-valuenow 自动写入。
- 颜色继承 `currentColor`，默认 `accent`；底圈 12% 不透明度。
- 卡片底部与文字「继续阅读 / 已读」成对出现（`.reading-state`）。
