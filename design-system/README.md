> 东西在光里，安放一会儿。

Sill（窗台）是一个本地优先的卡片工作台：文章、消息、笔记、媒体、待办、日程和 AI 整理，都以卡片的形式放在同一张桌面上。内容在不透明的白色表面上，半透明玻璃只属于按需出现的工具。中性白灰、石墨文字，只有一种蓝色动作色。

## 手册

| 主题 | 位置 |
| --- | --- |
| 产品立场、主屏幕启动、文案 | [基础与组件](handbook/foundation.md#产品立场) |
| 颜色、玻璃、字体、卡片积木、文字长度、图标 | [基础与组件](handbook/foundation.md#颜色) |
| 两端对照：移动（650px 及以下）与网页 | [页面与交互](handbook/interaction.md#两端对照) |
| 手机主页、搜索与键盘、底部导航与反馈 | [页面与交互](handbook/interaction.md#移动650px-及以下) |
| 预览与叠放、量大与时间 | [页面与交互](handbook/card-interaction.md#预览与叠放) |
| 桌面顶栏与 AI 框、网页键盘、设置弹窗、资讯阅读 | [网页交互](handbook/web-interaction.md) |
| AI 对话：一行、展开、完整，结果行，手机 AI 页 | [AI 对话](handbook/ai-conversation.md) |
| 间距（含纵向间距六级）、尺寸与排版偏好 | [内容布局](handbook/content-layout.md) |

| 阅读、媒体与登录 | [网页阅读与系统页面](handbook/web-reading.md) |
| 动效 | [动效](handbook/motion.md) |
| 设计参考：Apple Music、X、Medium 的原图与采用范围 | [设计参考](references/README.md) |

## 数值与组件

- 数值的来源是设计变量：`tokens/*.json` 生成 `tokens.json`、Web `tokens.css` 和 macOS `AppleMetrics`。手册写数值时同时写变量名；改数值先改变量，再用 `scripts/design-init.sh trace <变量名>` 找出要同步的文字和代码。组件说明只写变量名。
- 组件示例由 `scripts/previews.ts` 从产品代码生成，和页面实际渲染一致，不手改。组件脚本的全局名是 `Sill`（`window.Sill`）。
- 产品代码里的 `@design <编号>` 是设计印记，编号登记在 `marks.json`，指向手册小节、变量、ADR 和现行画板。
- 更新、检查、反查和发布准备都用 `scripts/design-init.sh`，见 [设计约束](../DESIGN.md)。

## 登录与授权

见[网页交互](handbook/web-interaction.md#登录与授权)；现行画板为 [Login](boards/Login.dc.html) 、[Authorization](boards/Authorization.dc.html)、[LoginMobile](boards/LoginMobile.dc.html) 和 [AuthorizationMobile](boards/AuthorizationMobile.dc.html)。

## 设置

[桌面设置](boards/SettingsDesktop.dc.html)与[手机设置](boards/SettingsMobile.dc.html)由产品组件生成，可切换分组。画板中的内容和开关只展示，不写入数据。

## 放大页探索

[放大页探索画布](boards/expanded-reading.html)包含「资讯阅读」「播客介绍」和「视频对照」三块独立画板，登记在 `boards/canvas.json` 的「放大页探索」页。内容、封面、播放器与图标从 `CardTypeDetails` 和 `CardTypeReading` 提取，生成入口为 `scripts/expanded-reading.ts`。视频保留原画板的左右分栏；播客介绍由当前产品组件生成，无播放器、页签和全屏入口。资讯采用左侧文章目录与右侧正文，目录在有章节时常显，不提供展开/收起按钮；小标题取自原文，正文不增写。目录标题为「目录」，只列实际章节，不列文章开头；同级章节左对齐；「目录」用 body 字号（15px）、中等字重和 ink 深色，章节用 control 字号（14px），非当前章节为 muted 灰色与常规字重，当前章节为 accent 蓝色与 600 字重。条目至少为 hit-target 高度（44px），当前位置保留细指示线，不加整行实底。Web 点击目录直接定位章节，指示线同步定位；不播放正文滚动过渡。手机预览不提供目录。预览保留底部操作胶囊，放大后通用操作移到左上角，缩小时回到底部；操作图标与胶囊背景直接显示在对应位置，不播放位移或淡入淡出；放大页收紧顶部与底部占位。原型默认从预览开始，右上角按钮演示预览与放大的切换，沿用 `motion.expandedSpring`，正文不缩放，键盘即时切换。阅读排版依据见 [ADR 0065](../docs/adr/0065-expanded-reading-layout.md)；播放控件仅展示，不播放媒体或写入卡片。播客章节为只读，收听位置是示例记录；来源与同步规则见网页阅读手册。

目录探索参考 [shadcn 的目录源码](https://github.com/shadcn-ui/ui/blob/main/apps/v4/components/docs-toc.tsx)中的次要文字、层级缩进与当前章节高亮，以及 [Notion 的目录说明](https://www.notion.com/help/columns-headings-and-dividers#table-of-contents)中的标题跳转与常驻目录。颜色与动效仍使用 Sill 变量。
