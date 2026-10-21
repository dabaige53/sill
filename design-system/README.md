> 东西在光里，安放一会儿。

Sill（窗台）是一个本地优先的卡片工作台：文章、消息、笔记、媒体、待办、日程和 AI 整理，都以卡片的形式放在同一张桌面上。内容在不透明的白色表面上，半透明玻璃只属于按需出现的工具。中性白灰、石墨文字，只有一种蓝色动作色。

## 手册

| 主题 | 位置 |
| --- | --- |
| 产品立场、主屏幕启动、文案 | [基础与组件](handbook/foundation.md#产品立场) |
| 颜色、玻璃、字体、卡片积木、文字长度、间距与尺寸、图标 | [基础与组件](handbook/foundation.md#颜色) |
| 两端对照：移动（650px 及以下）与网页 | [页面与交互](handbook/interaction.md#两端对照) |
| 手机主页、搜索与键盘、底部导航与反馈 | [页面与交互](handbook/interaction.md#移动650px-及以下) |
| 预览与叠放、量大与时间 | [页面与交互](handbook/interaction.md#预览与叠放) |
| 桌面顶栏与 AI 框、网页键盘、设置弹窗、资讯阅读 | [网页交互](handbook/web-interaction.md) |
| 动效 | [动效](handbook/motion.md) |
| 设计参考：Apple Music、X、Medium 的原图与采用范围 | [设计参考](references/README.md) |

## 数值与组件

- 数值的来源是设计变量：`tokens/*.json` 生成 `tokens.json`、Web `tokens.css` 和 macOS `AppleMetrics`。手册写数值时同时写变量名；改数值先改变量，再用 `scripts/design-init.sh trace <变量名>` 找出要同步的文字和代码。组件说明只写变量名。
- 组件示例由 `scripts/previews.ts` 从产品代码生成，和页面实际渲染一致，不手改。组件脚本的全局名是 `Sill`（`window.Sill`）。
- 产品代码里的 `@design <编号>` 是设计印记，编号登记在 `marks.json`，指向手册小节、变量、ADR 和现行画板。
- 更新、检查、反查和发布准备都用 `scripts/design-init.sh`，见 [设计约束](../DESIGN.md)。
