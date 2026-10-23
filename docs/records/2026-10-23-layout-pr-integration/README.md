# 排版设置 PR 集成检查

在 `c801ad2`（main）上整合排版设置与界面文案清理。保留 main 新增的媒体播放、Markdown 正文、PR 卡片和 Mac 云端账号功能，并让其内容文字继承排版偏好。

## 文件职责

- Mac 的数据与隐私页移到 `SettingsDataPage.swift`，播放进度组件移到 `PlaybackScrubber.swift`。
- 卡片类型样式移到 `card-types.css`，详情正文样式移到 `detail-content.css`。加载顺序由 `styles.json` 保持。
- AppleMetrics 的源数值移到 `design-system/tokens/apple.json`；生成后的 `tokens.json` 与原读取入口不变。
- 间距与排版规则移到 `design-system/handbook/content-layout.md`，设置界面对账移到 `docs/product/ui-settings-alignment.md`，原文保留入口。
- 排版决策使用 ADR 0064，避开 main 已有的 ADR 0063 Markdown 正文约定。

## 检查

- Web 核心测试 315 项通过；排版偏好的迁移、保存、冲突、重试与重置测试 1 项通过。
- `npm run lint`、`npm run typecheck`、设计 build/check、Web 本地与云端页面构建通过。lint 仍报告仓库既有 warning/info，不作为零警告记录。
- 文件大小检查通过；未放宽既有上限或基线。
- Mac 编译与 `AppearanceTests` 两项后台测试通过；构建仍有现有 SDK 兼容和闭包捕获警告。

此前的[浏览器验收](../2026-10-23-layout-preferences-browser/README.md)发生在整合 main 之前，只证明当时的排版设置可操作、可保存。本次没有重新执行浏览器或真实 Mac 窗口检查。数据库迁移尚未部署，设计未发布到线上。
