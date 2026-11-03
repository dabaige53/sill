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

修复 PR 的 CI（`41588645533`）随后暴露第五项：`card-blocks.tsx(175,12)` TS2345，`useEffect` 清理函数返回了 `removeProperty` 的字符串。首次流程的集成测试在构建检查处先失败，未执行到类型检查。

类型修正后的 CI（`41589303576`）跑完 Web 单元测试，又暴露：测试打包把 `motion` 别名按前缀套到 `motion/react`（15 个文件构建失败）；新增备份测试缺少 `MessageChannel`；阅读页封面顺序、手机字号作用到 `reader-body`、顶栏隐藏选择器改为 `:is(...)`、放大改为裁切展开（`clipPath`、`expanded` 弹簧）这四处单元测试仍按旧行为断言。

第三轮 CI（`41590352009`）剩两项：`backup-database.test.ts` 报 `role "sill_consent_executor" does not exist`，该测试跳过 OAuth 初始迁移，却执行了依赖它的新 OAuth 迁移（`db402497` 起 main 即失败）；Mac `feedPausesCardHoverOnlyWhileMoving` 只在静止时长后多等 0.1 秒，上一轮通过、本轮在繁忙 runner 上未及时释放，属时间敏感测试。

## 处理情况

检查脚本改为断言 `edge-tint` 与标准 `mask-image`；手册与设计记录改为浅色罩层；Swift 按格式工具重排；两项浏览器测试改为现行顺序与玻璃层透明度；清理函数改为不返回值；测试打包为 `motion/react` 单独指向真实入口；备份测试安装共用的 React 浏览器接口；其余单元测试改按现行行为断言，放大测试的模拟位置补齐右、下坐标；备份数据库测试同样跳过 OAuth 迁移；Mac 静止测试改为在截止时间内轮询。

## 验证与后续

本地：正则对 CI 实际 CSS 片段匹配通过，Swift 严格格式检查通过，Biome 无错误，`tsc --noEmit` 通过；经本地针对性排查，`tests/web/*.test.ts` 494 项全部通过，`backup-database.test.ts` 通过，Swift 严格格式通过。修复 PR 的 CI 中 Swift、navigation、layout 已通过。浏览器测试与完整流程由新的正式流程验证。
