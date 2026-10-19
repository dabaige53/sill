# 照片大图页补通用操作（U4）

2026-10-19。用户比较真实页面的 A 保留现状与 B 缩略图下补胶囊后，选择「B：补通用操作胶囊」。先写 [ADR 0041](../../adr/0041-photo-shared-toolbar.md)、设计手册与 Dialog 说明，再补回归并实施。不新增复杂编辑器、更多菜单、专属动作或外部来源。Mac 未改。

候选来自隔离 localhost 的真实大图页，只含合成照片。320 / 390 / 1440、浅色与深色共 12 张；B 只注入现有工具条 HTML、既有深色变量和临时样式，产品源文件未改。用户选定后另截实际实现，不把临时方案当成改后证据。

公开参考：[Apple 照片](https://support.apple.com/en-ie/guide/iphone/iph3d267610/ios)、[Google Photos](https://support.google.com/photos/answer/6220402?hl=en)、[Lightroom](https://www.adobe.com/learn/lightroom-cc/web/use-ratings-flags-to-find-photos-lightroom-mobile)。仅参考看图时的工具与整理入口，不复制资产、不接入产品。

最终前后截图、测试和本地画板结果随本包 PR 补齐。真机与 Safari 未检查；线上资产记录不改，线上未同步文件列入 PR #55，由用户另行处理。
