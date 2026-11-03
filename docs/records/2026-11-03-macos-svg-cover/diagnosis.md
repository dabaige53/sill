# Mac 卡片 SVG 封面不显示

## 问题与状态

已定位，未修复（2026-11-03）。资讯卡片「Kenn 在 2026 年 8 月如何开展 Agent 工程」在 Mac 信息流只显示浅色封面底色，没有图片。

## 环境与触发

Mac 应用 1.2.32，macOS 27.2。卡片 `images` 第一项为 `https://wesmckinney.com/blog/agentic-engineering-aug-2026/how-kenn-builds.svg`，第二项为同目录 `kenn-forge.png`。预期显示封面图，实际只显示 `Cover.tone` 底色。

## 定位依据

- 两个地址直接请求均返回 200：SVG `image/svg+xml` 14 KB，PNG `image/png` 1.2 MB；图片未失效。
- 封面只取 `images[0]`（Web `cardCover`，Mac `CoverImage` 同一含义），即 SVG。
- Mac `CoverImage`（`apps/apple/macOS/Feed/CardParts.swift`）用 SwiftUI `AsyncImage` 加载远程图片，失败时不绘制任何内容。
- 本机复现：同一 SVG 文件 `CGImageSourceCreateWithData` 返回 0 帧，`AsyncImage` 进入 `failure(LoadingError)`；PNG 为 `success`。`NSImage(data:)` 能解码该 SVG（`_NSSVGImageRep`，940×1490）。
- Web 云端页面 CSP 为 `img-src 'self' data: https:`，浏览器 `<img>` 支持 SVG，按源码判断 Web 可显示；未做浏览器验证。

结论：`AsyncImage` 经 ImageIO 解码，不支持 SVG；Mac 端 SVG 封面全部会落空。

## 处理情况

未改源码。候选办法：Mac 远程封面改为下载数据后用 `NSImage(data:)` 解码（支持 SVG 与位图），保留现有底色和裁切；未执行。

## 验证与后续

只做了地址请求和本机解码脚本复现，未运行 Sill 窗口。修复后需在 Mac 打开该卡核对封面，并回归 PNG/JPEG 封面。
