# IconButton

图标按钮：44×44 圆形触控区，只放一个 Mono24 图标，覆盖默认、已选择、聚焦、禁用四态。

- 用 `QuietGlass.button(glyph, label, action, id?, extra?, className?)` 生成；`label` 必填，写入 `aria-label`。
- 默认透明，hover 填 `surface`；已选择加 `.active`：`accent-soft` 底 + `accent` 图标。
- 焦点环统一为 2px `accent` outline、4px offset。
- 不要给图标按钮加文字或描边；一组工具之间间距 4–8px。
