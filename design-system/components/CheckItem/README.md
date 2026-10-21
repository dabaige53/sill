# CheckItem

待办选择项：点整行切换，完成同时用勾选、颜色和删除线表达。

- `role="checkbox"` 的整行按钮，高不小于 `hit-target`。未完成用 `check-border` 描边；完成填 `accent`，文字 `secondary` 加 `done-strike` 删除线。
- 勾选只改 Sill 的状态，不改来源。

实现：`apps/web/atoms/primitives.ts` 的 `checkItem`。示例由 `design-system/scripts/previews.ts` 从产品代码生成，不手改。
