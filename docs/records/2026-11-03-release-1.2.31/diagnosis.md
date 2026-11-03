# 1.2.31 发布检查失败

## 问题与状态

`v1.2.31` 正式流程 `41587711811` 四项检查失败，发布跳过，线上未变化。已修复待验证（2026-11-03）。

## 环境与触发

tag `v1.2.31` 指向合并提交 `f3b884e5`。失败项：集成测试、Swift 格式、Web 浏览器 navigation 与 layout。`df6d2216` 起 main CI 已失败，问题随本次合并进入发布。

## 定位依据

- `missing_standard_top_bar_backdrop_filter`：`df6d2216` 将顶栏边缘改为 `edge-tint` 浅色罩层，`scripts/check.ts` 却改为要求不存在的 `--edge-material` 模糊；设计手册仍写三层模糊。
- Swift：`ReaderPage.swift:69` 的 `onGeometryChange` 尾随闭包未按 `swift format --strict` 换行。
- layout：`card-actions-settings-browser.ts` 仍断言阅读页封面在标题之后；源码与手册已改为封面在最上面。
- navigation：`drawer-browser-rail-material.ts` 读取 `#dock` 自身透明度；`controls.css` 已改为底栏只移动、由内部玻璃层淡出（`chrome.ts` `glassLayers`），`#dock` 透明度恒为 1，等待超时。

四项均为源码改动后检查未同步，不是产品行为回归。

## 处理情况

检查脚本改为断言 `edge-tint` 与标准 `mask-image`；手册与设计记录改为浅色罩层；Swift 按格式工具重排；两项浏览器测试改为现行顺序与玻璃层透明度。

## 验证与后续

本地：正则对 CI 实际 CSS 片段匹配通过，Swift 严格格式检查通过，Biome 无错误。浏览器测试与完整流程由新的正式流程验证。
