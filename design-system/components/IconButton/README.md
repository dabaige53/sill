# IconButton

图标按钮：圆形触控区不小于 `hit-target`，只放一个图标，`label` 写入 `aria-label`。

- 默认透明；白色表面上悬停填 `surface`，玻璃上悬停和按下填 `glass-press`。已选择加 `.active`，图标用 `accent`。
- 详情底部胶囊里，卡片自己的操作加 `.is-own`，用 `accent`；通用操作用 `ink`。长按或悬停在图标上方显示名称。
- 不加文字或描边。图标规则见手册[图标](../../handbook/foundation.md#图标)。

实现：`apps/web/atoms/primitives.ts` 的 `button`。示例由 `design-system/scripts/previews.ts` 从产品代码生成，不手改。
