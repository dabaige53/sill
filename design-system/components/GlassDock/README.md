# GlassDock

玻璃工具组：右下角 56px 玻璃圆球（#orb），展开后上方竖排筛选、刷新等工具。玻璃只属于操作层。

- 材质：`glass` + `backdrop-filter: blur(24px) saturate(1.2)` + 1px 白色 72% 描边。
- 打开：`#dock.is-open` 或 focus-within，工具 230ms `ease` 上浮淡入。
- 有筛选时 `#dock.filter-active` 右上角 7px `accent` 圆点。
- 减少透明度时改用 `card` 实体底。
- 入口球是底部轨道的锚点：多选条、「↑ 3」「未连接」排在它左边同一行，Toast 也以它为准对齐。
- 刷新时外圈细弧转动，完成后闭合并短暂显示勾。
