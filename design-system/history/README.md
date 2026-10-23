# 历史画板

这里的画板已被后续定稿取代，或只记录设计过程。**不作设计依据。** 现行画板在 [`../boards/`](../boards/)，规则以 [设计手册](../README.md) 为准。

线上设计画布把这些画板放在「历史」页。本地用 `npm run boards` 打开时，按文件名访问，例如 http://127.0.0.1:4310/FinalFeed.dc.html。

| 画板 | 去向 |
| --- | --- |
| 19 手机交互 `MobileProto`、35 底部导航胶囊 `NavCapsule`、36 手机主页 `MobileHome`、39 导航当前项 `NavigationState` | 手机页面稿（`ScreenMobile*`）、44 手机顶行；导航规则见手册「底部导航与反馈」 |
| 43 搜索条件分行 `SearchFilters` | 44 手机顶行的 # 条件 |
| 21 卡片积木 `CardBlocks`、22 预设卡片 `CardRecipes`、23 文字长度 `TextLimits` | 组件 FeedCard 示例（由产品代码生成）、手册「卡片积木」「文字长度」 |
| 32 设置 `Settings` | 48 Mac 顶栏与设置弹窗、组件 Dialog 示例 |
| 11 桌面信息流 `FinalFeed` | 网页页面稿与 45 Web 顶栏、46 卡片 A 字号 |
| 12 手机 390 `FinalMobile` | 手机页面稿 |
| 13 图标 36 + 4 `FinalIcons` | 38 保留原版图标 |
| 14 规范总表 `FinalSpec` | 设计变量与设计手册 |
| 15 弹层 v2 `FinalOverlays` | 37 卡片详情、47 资讯阅读 |
| 16 弹出动效 `MotionProto` | 手机页面稿与手册「动效」 |
| 20 桌面交互 `WebProto` | 45 Web 顶栏与 AI 框、网页页面稿 |
| 34 玻璃底栏与工具条 `GlassRail` | 手机页面稿、37 卡片详情 |
| 42 桌面主页分栏 `DesktopHomeFilters` | 45 Web 顶栏的分栏菜单 |
| 网页 AI 会话（接入后）`ScreenWebSession` | 49 网页 AI 对话规则、网页 AI 展开、网页 AI 完整视图 |
| 24、26、28–31、33 概念稿 | 设计手册；导入与来源按 ADR 0033 不在产品范围 |
| 01–10 过程稿 | 记录现状盘点、优化方向和卡片重构的过程 |
