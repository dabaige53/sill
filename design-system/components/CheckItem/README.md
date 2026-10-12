# CheckItem

待办选择项：点击整行切换状态，完成同时用勾选、颜色和删除线表达。

- `QuietGlass.checkItem(card, {id,text,done})` 生成 `role="checkbox"` 的整行按钮，min-height 44px。
- 未完成：20px 圆点，1.2px `check-border` 描边；hover 描边变 `accent`。
- 已完成：圆点填 `accent` + 白勾，文字 `secondary` + `done-strike` 删除线。
