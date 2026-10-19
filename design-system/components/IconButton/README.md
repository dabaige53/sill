# IconButton

图标按钮：44×44 圆形触控区，只放一个 Mono24 图标，覆盖默认、已选择、聚焦、禁用四态。

2026-10-19，用户比较全套候选后选择保留当前 69 个图标，见 [ADR 0038](../../../docs/adr/0038-keep-original-icons.md)。不采用 A/B 重画，不替换图标路径或三档线宽；ADR 0037 的九个已确认图标同样保留。导航的当前项状态不在这次决定中修改。

- 用 `Sill.button(glyph, label, action, id?, extra?, className?)` 生成；`label` 必填，写入 `aria-label`。
- 默认透明；在白色表面上 hover 填 `surface`，在玻璃上 hover 和按下填 `glass-press`。已选择加 `.active`：图标填 `accent`（例如已收藏）。
- 浮在内容上的圆片版本（详情的关闭、全屏）：36px 可见圆、44px 点击区，`card` 底加 `shadow-float`。
- 详情底部胶囊里，卡片自己的操作加 `.is-own`，图标用 `accent`；通用操作保持 `ink`。名称在 `aria-label`，长按（`.is-tipping`）或鼠标悬停时显示在图标上方。
- 焦点环统一为 2px `accent` outline、4px offset。
- 不要给图标按钮加文字或描边；一组工具之间间距 4–8px。
