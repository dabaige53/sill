# V0.5 · Apple 方向的主题与卡片修订

2026-10-11。此文保存本轮研究依据与实现规则，便于后续单独调整。中性白灰与蓝色强调是本轮可评审基线，尚不代表最终品牌色已经由用户确认；Apple 也没有规定网页必须使用某个蓝色或固定卡片尺寸。

## 为什么原来显得堆砌

此前绿灰、米黄、橄榄色同时出现在底色、文字、阴影、控件和工作台。每类内容又普遍重复“来源—标题—摘要—业务区—底栏”。图文资讯自动跨两列，体量与优先级无关；提醒、任务和数据卡没有自己的信息预算。组件外还有编号、解释、源码和多重舞台边框。

本轮同时调整颜色、内容、尺寸和展示方式，不能只换强调色或增加玻璃效果。

## 参考与采用范围

| 官方参考 | 可观察的做法 | 本项目采用 | 不照搬 |
| --- | --- | --- | --- |
| [Apple · Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/) | 内容层与导航、操作层分开；避免玻璃叠玻璃 | 白色实体卡；玻璃留给浮动工具 | 全屏内容磨砂、每张卡发光 |
| [Apple · New design system](https://developer.apple.com/videos/play/wwdc2025/356/) | 布局分组建立层级；次要操作进入 More；嵌套形状同心 | 单一强调色；20px 外圆角、8px 图片内距、12px 内圆角 | 给每个按钮增加独立装饰背景 |
| [Things · Features](https://culturedcode.com/things/features/) | 任务展开后才出现详细字段 | 去除任务说明段落，完成与期限常驻 | 将所有内容改成任务列表；把旧宣传图当最新像素规范 |
| [Readwise Reader](https://readwise.io/read) | 标题、短摘要、元信息分层；操作围绕当前条目出现 | 阅读卡文字预算；预览与全文分层 | 高密度侧栏、高亮面板全部搬进首页 |
| [Craft · Gallery View](https://www-staff.craft.do/blog/craft-update-3-3-9) | Small/Large 卡片与可见字段控制 | 大小按用途，默认只显示必要字段 | 多色属性药丸与任意装饰主题 |
| [mymind](https://mymind.com/what) | 图片、文章、笔记使用各自的识别方式 | 图片承担图文识别，摘录保留文字主体 | 把时间敏感信息做成无序图片墙 |

官方界面图用于研究，不打包为本项目资产：

- [Things Today](https://static.culturedcode.com/things/videos/2017-05-18-website-videos/2-today-mac.png)
- [Things 展开任务](https://static.culturedcode.com/things/videos/2017-05-18-website-videos/5-checklists-mac-2.png)
- [Reader Inbox](https://d34adp677peecb.cloudfront.net/static/images/reader/Hero-Screen%401x.72ad6bf1deaa.webp)
- [Craft Gallery](https://www-staff.craft.do/images/content/blog/craft-update-3-3-9/gallery-view.jpeg)

参考目录在 `src/data/sources.js` 单独维护，本轮新增 6 条，共 34 条；可从 research.html 或 Storybook 的设计参考打开。

## 主题基线

| 角色 | 值 | 使用范围 |
| --- | --- | --- |
| 画布 | `#f5f5f7` | 页面与工作台 |
| 内容表面 | `#ffffff` | 卡片、预览、阅读、AI 正文 |
| 正文 | `#1d1d1f` | 标题与主要内容 |
| 次级文字 | `#6e6e73` | 来源、摘要、说明 |
| 动作强调 | `#0066cc` | 主操作、选择、焦点、进度 |
| 成功 | `#248a3d` | 完成符号 |
| 分隔 | `rgba(0,0,0,.08)` | 轻边界 |

蓝色是交互色，不是给所有卡片染色的背景。全站采用系统字体，卡片正文不靠浅色小字制造精致感。共享变量集中在 `src/styles/tokens.css`。

## 卡片信息与尺寸

以下是项目设计目标，不是 Apple 或参考产品的官方尺寸。高度由真实内容决定，不设裁断内容的固定高度。

| 类型 | 首层内容预算 | 约 350–360px 卡宽下的高度目标 |
| --- | --- | --- |
| 图文 / 媒体 | 16:9 封面、标题至多两行、来源与时长一行；摘要进预览 | 280–340px |
| 文字 / 邮件 | 元信息一行、标题两行、必要摘要两行；邮件附件只展示文件名 | 170–240px |
| 摘录 | 一个归属、引文至多三行 | 150–230px |
| 待办 | 标题、最多三项可操作任务、期限与完成数量；更多项目在预览中操作 | 220–290px |
| 日程 | 日期与相对时间、标题、起止时间 | 150–190px |
| 提醒 | 状态、标题、延后和完成 | 140–170px |
| 数据 / 完成 | 标题及必要实际数值或完成标识 | 100–190px |

- 桌面内容外框最大 1184px，左右内距 32px；三列时每列约 357px，列间距 24px。中屏两列，小屏一列。
- 手机外边距与卡间距 16px；390px 设备上内容卡宽 358px，320px 上 288px。
- 标题 18px / 1.4，摘要 14px / 1.55，元信息 12px / 1.5。摘录 22px，最多三行。保留 44px 点击区域。
- 移除自动双列精选。任务和提醒不被拉成文章大小；图文和文字使用同一视觉语言。
- 初始无阅读进度时不显示空圆环；移除与实际数据无关的固定柱状条。
- 完整摘要、正文、任务、附件操作仍在预览或阅读层；首层省略不等于删除数据。

## 组件与工作台

图标、卡片、控件继续复用产品源码。Storybook 仍登记 94 个样例。展台采用中性背景，去除多层嵌套框；“结构与交互”“使用说明与源码”默认收起，需要时原地展开。参数修改仍通过 Controls，正式规则保存在源码与 Story 文件中。

## 验证入口

`npm test`、`npm run build:storybook`、`npm run test:browser`、`npm run test:storybook`。浏览器工作流保留桌面、390px、320px 截图及 `v05-layout-metrics.json` 实测卡片宽高。新增检查确认卡片省略的摘要仍在预览中，超过三项的任务仍可在预览中完成。实际结果以本轮 PR 工作流为准。
