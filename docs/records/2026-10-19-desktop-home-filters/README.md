# 桌面主页左上紧凑分栏（U5）

2026-10-19。用户比较真实页面后，选择「B：左上紧凑分栏」。A 不加、C 居中不采用。先写 [ADR 0043](../../adr/0043-desktop-home-filters.md)、手册和 GlassDock 说明，再补浏览器回归与实现。复用已有五个标签和筛选，不改卡片内容、密度、搜索或底部导航；手机保持原样。Mac 未改。

临时候选覆盖 320 / 390 / 1440、浅色与深色共 18 张。B/C 只在桌面叠 CSS；对比图截取实际 1440 页面顶部左侧 1040×260，完整页面另留，未修改产品源文件。选定后另截真实实现。

公开参考：[Apple Music](https://support.apple.com/en-mide/guide/music/musf33a29ebf/mac)、[X 时间线](https://help.x.com/en/using-x/x-timeline)、[Things 筛选](https://culturedcode.com/things/support/articles/2803581/)。只参考筛选语义与文字层次，不复制资产或接入来源。

真实前后、手机对照和检查随原 PR #56 补齐。真机、Safari 和 Mac 原生视觉未检查；线上资产记录不改，只更新仓库，线上未同步文件由用户另行处理。
