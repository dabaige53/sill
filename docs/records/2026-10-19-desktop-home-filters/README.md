# 桌面主页左上紧凑分栏（U5）

2026-10-19。用户比较真实页面后，选择「B：左上紧凑分栏」。A 不加、C 居中不采用。先写 [ADR 0043](../../adr/0043-desktop-home-filters.md)、手册和 GlassDock 说明，再补浏览器回归与实现。复用已有五个标签和筛选，不改卡片内容、密度、搜索或底部导航；手机保持原样。Mac 未改。

临时候选覆盖 320 / 390 / 1440、浅色与深色共 18 张。B/C 只在桌面叠 CSS；对比图截取实际 1440 页面顶部左侧 1040×260，完整页面另留，未修改产品源文件。选定后另截真实实现。

公开参考：[Apple Music](https://support.apple.com/en-mide/guide/music/musf33a29ebf/mac)、[X 时间线](https://help.x.com/en/using-x/x-timeline)、[Things 筛选](https://culturedcode.com/things/support/articles/2803581/)。只参考筛选语义与文字层次，不复制资产或接入来源。

真实实现为 `22471b3`，基础为 `9e803f7`。基础运行新增专项先因桌面没有分栏失败（[before.log](before.log)）；实现后 [7/7 通过](after.log)，覆盖 1440 浅深、1920 浅色、320/390 浅深，逐项点击五个筛选并检查搜索条件与来源卡片不变。[检查数据](browser-checks.json) 保留位置和结果，不保存浏览器存储。

- [候选对比](options.jpg) 与 [候选元数据](proposals.json) 保留 A/B/C；选定方案的六张真实截图在 [42 号画板](../../../design-system/history/DesktopHomeFilters.dc.html)，原始改前 PNG 在本记录。四组手机 [逐像素对照](phone-pixels.json) 均为 0；桌面变化是获准的新分栏与内容下移。
- `npm test`：[共享约定 / Web / 服务端 36 / 196 / 92，失败 0](node.log)，包括 files:check、类型和构建。专项 [7/7](after.log)、密度 [6/6](density.log)、搜索 [2/2](search.log) 通过。提交后的最终检查与 CI 以 PR 为准。
- Web lint [0 错误、515 警告、30 提示](web-lint.log)；文案 831 键（哈希 491、panels 哈希 0），图标 69。重新生成 69 图标与组件包；只有 bundle.css 的桌面规则与内部变量变更，图标及 bundle.js 不变。
- [画板实测](board.json) 六图全部解码，无页面错误、缺失资源或外部请求；高度 1810.17px，登记 1820px，与其他画板无交叠。
- 只读核对 Mac `Workspace.visible`：全部、收藏和稍后读仍按同名状态筛选；没有新增 Mac 分栏或未读、待办筛选。Mac 未改，原生视觉未检查。

线上未同步：ADR 0043、设计手册、GlassDock 说明、Web 样式来源及生成器、bundle.css、42 号画板与六张图片、index.html、canvas.json，详见 PR Merge Danger。真机、Safari 和 Mac 原生视觉未检查；线上资产记录不改，只更新仓库，线上未同步文件由用户另行处理。
