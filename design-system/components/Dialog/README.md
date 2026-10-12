# Dialog

对话框与面板：快速预览、完整阅读、筛选、编辑、设置都用同一个 `dialog` 外壳。

- `card` 底、1px `line`、`panel-radius`、深阴影；backdrop 20% 黑 + blur(4px)。
- 宽度：预览 620px、阅读 790px、面板 440px；手机变为底部抽屉（顶角 25px，94dvh）。
- 面板标题 `panel-title`；字段标签 12px/500 `muted`；底部 `.panel-footer` 发丝线分隔。
- 关闭按钮在右上角，`glass-thick` 圆形。关闭后恢复原阅读位置。
