# 设计版本记录

更新：2026-10-21。

每个设计版本一行。原因与影响范围见 ADR，规则见 [设计手册](../../design-system/README.md)。线上版本号可以在 Design System 和设计画布的版本历史里读回当时的内容。规则见 [设计约束](../specs/DESIGN.md)「版本更新」。

| 版本 | 决策 | Design System | 设计画布 | 说明 |
| --- | --- | --- | --- | --- |
| 2026-10-29 | [小栖角色设定](../specs/design/mascot.md) | 未发布 | 未发布 | 保存概念海报、十视角参考、表情动作分镜与安装背景；保留现有 App icon。补齐 DMG 打包脚本和 Actions 入口；文件检查通过，实际构建与 Finder 验收未执行，尚无可播放动画 |
| 2026-10-20 | [ADR 0051](../adr/0051-card-type-a-and-article-reading.md) | 1792545276-6a1f（第 48 版） | 1792545303-0201（第 68 版） | 卡片 A 字号与四列、资讯阅读、Mac 顶栏与设置弹窗 |
| 2026-10-21 | [ADR 0051](../adr/0051-card-type-a-and-article-reading.md) | 1792547638-7a7f（第 50 版） | 1792547652-f13a（第 70 版） | 精简设计材料：组件示例改由产品代码生成（30 → 18 个组件），手册去重、去掉日期叙述，9 块与产品不一致的画板移到历史，新增设计印记和 design-init 工具 |
| 2026-10-21 | [ADR 0051](../adr/0051-card-type-a-and-article-reading.md) | 1792547995-cfc3（第 52 版） | 1792547652-f13a（第 70 版） | 线上 tokens.css 改由脚本从 tokens.json 编译发布（A 字号、四列、手机间距） |
| 2026-10-21 | [ADR 0051](../adr/0051-card-type-a-and-article-reading.md) | 1792548354-a1f1（第 54 版） | 1792548350-75c2（第 73 版） | 卡片摘要按 50–60 字补齐：FeedCard 示例与 13 块现行画板；资讯阅读画板补上正文前的摘要；页面稿摘要按 3 行（手机 2 行）截断 |
| 2026-10-21 | [ADR 0057](../adr/0057-desktop-card-spatial-transition.md) | 1792569916-80c3（第 57 版） | 1792569980-0075（第 75 版） | 同步近期 Web/macOS 界面变化：顶栏收起与材质、工具条与菜单时长、外边距、卡片列数与无更多按钮、Mac 顶栏与设置弹窗 |
| 2026-10-21 | [ADR 0057](../adr/0057-desktop-card-spatial-transition.md) | 1792570761-b0a7 | 1792569980-0075 | 合入搜索失焦、卡片关闭工具先淡出、卡片头部日期，并去掉撤销文案 |
| 2026-10-22 | [ADR 0059](../adr/0059-mac-search-ai-dock-rail-glass.md) | 1792630329-233a | 1792630366-d9ab | Desktop search type chips and # conditions; card motion, rail glass and pointer rules |
| 2026-10-22 | [ADR 0059](../adr/0059-mac-search-ai-dock-rail-glass.md) | 1792631394-a95c | 1792631422-c5ff | Desktop bars tuck while a card is open; slower standalone reveal (dur-reveal, ease-reveal) |
| 2026-10-22 | [ADR 0061](../adr/0061-in-app-media-playback-and-pr-cards.md) | 1792640295-b21d | 1792640301-08a9 | 13 类卡片与详情草稿（卡面、手机 390、全屏阅读与深色、播客播放页）与卡片收回弹簧 |
| 2026-10-23 | [ADR 0064](../adr/0064-ai-conversation-three-heights.md) | 1792757085-d0c0 | 1792757058-6298 | AI 对话三种高度与手机对话页（草稿） |
| 2026-10-24 | [ADR 0064](../adr/0064-ai-conversation-three-heights.md) | 1792771727-9161 | 1792771728-b67d | AI 对话实现：三种高度、结果行、手机对话页 |
| 2026-10-24 | [ADR 0069](../adr/0069-vertical-rhythm.md) | 未发布 | 1792803081-fcea | 纵向间距六级：只发布 CardTypeDetails、CardTypeMobile、CardTypeReading 三块画板。线上 Design System 为 design/ai-conversation 分支版本，手册与变量待该分支合入 main 后一并发布 |
| 2026-10-24 | [ADR 0069](../adr/0069-vertical-rhythm.md) | 未发布 | 1792804245-1192 | PR 详情状态进入信息行，无数据的行不显示，信息行图标对齐：只发布三块详情画板，Design System 同上一行原因未发布 |
| 2026-10-27 | [ADR 0081](../adr/0081-reading-spine-and-segmented-navigation.md) | 1793088338-ddd6 | 1793088430-b6dd | 06 搜索改为卡片建议（Combobox）、新增 TagInput、搜索画板更新 |
| 2026-10-27 | [ADR 0081](../adr/0081-reading-spine-and-segmented-navigation.md) | 1793088918-5a2e | 1793088905-0897 | 06 搜索建议按参考样例：宽 360、两行候选、列表最高 232 |
| 2026-10-27 | [ADR 0081](../adr/0081-reading-spine-and-segmented-navigation.md) | 1793089131-00e5 | 1793089120-839f | 06 搜索建议改为一行：来源标志与来源名在右侧 |
| 2026-10-27 | [ADR 0081](../adr/0081-reading-spine-and-segmented-navigation.md) | 1793089528-dedf | 1793089520-5e19 | 06 Web 搜索栏固定 280；手机点分类卡后搜索栏上移 |
| 2026-10-27 | [ADR 0081](../adr/0081-reading-spine-and-segmented-navigation.md) | 1793089982-f6ea | 1793089973-388f | 06 搜索建议右侧改为类型列：图标对齐一条竖线 |
| 2026-10-27 | [ADR 0081](../adr/0081-reading-spine-and-segmented-navigation.md) | 1793091157-8a3a | 1793091165-ac1c | 06 Web 搜索栏 315、建议列表不带动卡片页；24 播客介绍页按原型重排 |
| 2026-10-27 | [ADR 0081](../adr/0081-reading-spine-and-segmented-navigation.md) | 1793102117-7f10 | 1793102104-2f50 | 06 搜索 ⌘K 不再移动、建议打开时滚动不带动卡片；24 播客与视频预览放宽到 860，播客画板换成介绍页 |
| 2026-10-27 | [ADR 0081](../adr/0081-reading-spine-and-segmented-navigation.md) | 1793102748-a5fb | 1793102751-1f3c | 手机四页页名统一：字号、行高、字距与顶边一致；设置分组胶囊对齐主页分栏 |
| 2026-10-27 | [ADR 0081](../adr/0081-reading-spine-and-segmented-navigation.md) | 1793103679-d94a | 1793103685-586f | PWA 设置页盖住顶栏与导航消除闪色；读完上推前到底不叫回工具胶囊；手机卡片建议同底色、行高 48、细线分隔 |
| 2026-10-27 | [ADR 0081](../adr/0081-reading-spine-and-segmented-navigation.md) | 1793104008-be29 | 1793104013-7cf7 | 读完上推 wheel 持续累计、停止 320ms 后回位（pushHoldMs） |
| 2026-10-27 | [ADR 0081](../adr/0081-reading-spine-and-segmented-navigation.md) | 1793104423-4ae7 | 1793104013-7cf7 | 动效手册新增「实现要点」：玻璃层、浮层、按键重复、滚动隔离、边缘归属、滚轮手势、关闭路径、共用规则、计时验证 |
