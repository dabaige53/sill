# 跨端实现对照

更新：2026-10-29。本文记录当前源码中的共用方式与平台差异。产品能力见[功能矩阵](../feature-matrix.md)，检查项目见[跨端检查标准](../../specs/cross-platform-checklist.md)；窗口与真机结果单独保存为事件记录。

## 共用来源

| 内容 | 源文件 | Web | Mac |
| --- | --- | --- | --- |
| 设计变量 | `design-system/tokens/` | 生成 CSS 变量与 motion 参数 | 生成 AppleMetrics、AppleColors |
| 界面文案 | `design-system/copy/zh-Hans/` | copy() | Copy.text()，使用相同键名 |
| 图标 | 设计系统 SVG | Icon | Icon，读取同批素材 |

修改源文件后按[设计系统说明](../design-system.md)生成；变量一致仍需核对行为。

## 顶栏与搜索

两端已接入顶栏收起恢复、搜索宽度变化、分栏标签、组合筛选、输入法处理和分栏位置保存。Web 手机使用独立搜索页。

- Web 桌面分栏入口由 Sill 字标与箭头组成同一个按钮，悬停或键盘聚焦显示轻微底色；Mac 暂保留单独箭头，菜单含义与操作相同。
- Mac 顶栏恢复已使用 `Motion.topReveal`；分栏菜单灰底通过内边距避让行边缘。
- Mac 顶栏材质使用系统原生材质，Web 使用分层 backdrop-filter。
- Web 桌面搜索采用玻璃底色、贴边细描边和柔和阴影的 160ms 透明度过渡，悬停轻显、内部聚焦完整显示；不改变布局。Web 候选面板使用厚玻璃底色与背景模糊、半透明活动行；Mac 保留现有原生搜索材质与焦点表现。
- 入口：Web `apps/web/views/home-search.tsx`；Mac `Shell/TopBar.swift`、`Shell/ScopeMenu.swift`（相对 `apps/apple/macOS/`）。

## 底部轨道

AI 栏的缩小、拖动、上下文和多选交接见[AI 栏实现状态](ai-dock-status.md)。两端采用各自平台的玻璃实现；手机导航与操作条共用底部位置。占位界面不表示内置助手已经接通。

## 键盘与指针

两端提供 R 刷新与 T 回顶；输入框聚焦时由输入框处理文字。菜单、搜索和详情按当前层处理键盘与焦点。Mac 源码中未发现 Shift+F10 的显式处理；键盘打开卡片菜单的实际效果待验证。

## 刷新与状态

- Web 与 Mac 都有下拉刷新阶段、最短加载和成功停留；Mac 使用共享 Apple 参数，成功后按 `Motion.fast` 退出。
- 两端已接入加载、错误、Toast 与新内容反馈。Mac 未发现独立离线提示；云端断网时的实际反馈待验证。
- 源码入口：Mac `Model/FeedRefresh.swift` 与 `design-system/tokens/apple.json`；Web 刷新逻辑见[桌面交互实现](../engineering/desktop-interaction.md)。

## 专题

| 范围 | 当前说明 |
| --- | --- |
| 信息流、卡片、详情与阅读 | [卡片实现对照](ui-card-alignment.md) |
| 设置与账号 | [设置实现对照](ui-settings-alignment.md) |
| 备份、提醒与外链 | [入口差异](ui-backup-reminders-alignment.md) |
| 长内容与窄空间 | [内容适配](ui-content-alignment.md) |

文件详情在两端均使用文件名、类型和大小的两行信息，并在右侧保留日期。Mac 文件卡面仍使用单行 FileRow；此差异不要与详情混写。

## 维护方式

改动对应端时同步更新当前范围、差异和源码入口。明确区分已接入、缺失、平台专有和未核对；删除已过期的缺失结论。数值与设计规则在各自正文维护，逐次检查、修复过程和截图进入[事件记录](../../records/README.md)。
