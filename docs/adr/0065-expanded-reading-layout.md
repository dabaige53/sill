# 放大阅读页按内容排版

日期：2026-10-23。状态：已采纳；媒体能力与目录规则按后续决定更新，最近修订于 2026-11-08。

## 原因

资讯、播客与视频放大后仍沿用预览的窄栏、顶部留白和底部工具占位，桌面阅读空间不足。用户确认仓库放大页原型，并要求同步 Web、Mac 与手机 Web，暂不部署。

## 决定

- 预览保留底部操作胶囊；资讯放大页将操作放到左上角，关闭和缩小在右上角。顶部占位使用 space-64，正文底部使用 space-24，取消放大页上下渐隐。
- 视频使用预览页，官方播放器下方依次显示概要和正文。播客使用只读介绍页，展示章节与外部收听记录。两者的现行能力与布局见[功能矩阵](../implementation/feature-matrix.md)和[阅读手册](../../design-system/handbook/web-reading.md#卡片详情内的导航与媒体)；探索画板中的视频分栏仅供对照。
- 资讯放大正文列最大宽度使用 reader-column（800px），封面置顶并与正文列同宽（reader-cover-ratio 2:1）；目录使用 reader-outline-width（200px），与正文相隔 space-64，两者作为一组居中，两侧留白最小 space-32，窗口窄于 900 时收起目录（2026-11-03 修订，参考 Obvious、Codecademy、Notion 的长文阅读页）。目录只取 Markdown 的真实标题，不生成「文章开头」或虚构章节；无标题时不显示目录。
- 桌面目录在有真实章节且窗口宽度允许时常显，支持跳转和滚动跟随；手机预览省略目录。标题、条目与当前位置的样式按[阅读手册](../../design-system/handbook/web-reading.md#资讯阅读)，画板范围见[设计系统说明](../../design-system/README.md#放大页探索)。
- 展开和收起共用 expandedSpring：mass 1、stiffness 274、damping 27。正文不缩放，操作按钮不从底部飞到顶部；键盘操作即时完成。卡片与信息流之间的原有 cardSpring 保持不变。
- 不改变媒体播放、已读判断、阅读记录、收藏、标签与稍后读的数据操作。原生 iOS 当前只有数据层，不新增原生阅读界面。

## 影响

设计变量、放大页原型、阅读规则与界面对账表同步。Web 使用 ReaderLayout 与 reader-layout.css；Mac 使用 ReaderPage、MediaDetail 与 MarkdownText。设计在线副本仍按 DESIGN.md 的发布流程处理。
