# 设计版本记录

更新：2026-10-21。

每个设计版本一行。原因与影响范围见 ADR，规则见 [设计手册](../../design-system/README.md)。线上版本号可以在 Design System 和设计画布的版本历史里读回当时的内容。规则见 [设计约束](../../DESIGN.md)「版本更新」。

| 版本 | 决策 | Design System | 设计画布 | 说明 |
| --- | --- | --- | --- | --- |
| 2026-10-20 | [ADR 0051](../adr/0051-card-type-a-and-article-reading.md) | 1792545276-6a1f（第 48 版） | 1792545303-0201（第 68 版） | 卡片 A 字号与四列、资讯阅读、Mac 顶栏与设置弹窗 |
| 2026-10-21 | [ADR 0051](../adr/0051-card-type-a-and-article-reading.md) | 1792547638-7a7f（第 50 版） | 1792547652-f13a（第 70 版） | 精简设计材料：组件示例改由产品代码生成（30 → 18 个组件），手册去重、去掉日期叙述，9 块与产品不一致的画板移到历史，新增设计印记和 design-init 工具 |
| 2026-10-21 | [ADR 0051](../adr/0051-card-type-a-and-article-reading.md) | 1792547995-cfc3（第 52 版） | 1792547652-f13a（第 70 版） | 线上 tokens.css 改由脚本从 tokens.json 编译发布（A 字号、四列、手机间距） |
| 2026-10-21 | [ADR 0051](../adr/0051-card-type-a-and-article-reading.md) | 1792548354-a1f1（第 54 版） | 1792548350-75c2（第 73 版） | 卡片摘要按 50–60 字补齐：FeedCard 示例与 13 块现行画板；资讯阅读画板补上正文前的摘要；页面稿摘要按 3 行（手机 2 行）截断 |
| 2026-10-21 | [ADR 0057](../adr/0057-desktop-card-spatial-transition.md) | 1792569916-80c3（第 57 版） | 1792569980-0075（第 75 版） | 同步近期 Web/macOS 界面变化：顶栏收起与材质、工具条与菜单时长、外边距、卡片列数与无更多按钮、Mac 顶栏与设置弹窗 |
| 2026-10-21 | [ADR 0057](../adr/0057-desktop-card-spatial-transition.md) | 1792570761-b0a7 | 1792569980-0075 | 合入搜索失焦、卡片关闭工具先淡出、卡片头部日期，并去掉撤销文案 |
| 2026-10-22 | [ADR 0059](../adr/0059-mac-search-ai-dock-rail-glass.md) | 1792630329-233a | 1792630366-d9ab | Desktop search type chips and # conditions; card motion, rail glass and pointer rules |
| 2026-10-22 | [ADR 0059](../adr/0059-mac-search-ai-dock-rail-glass.md) | 1792631394-a95c | 1792631422-c5ff | Desktop bars tuck while a card is open; slower standalone reveal (dur-reveal, ease-reveal) |
