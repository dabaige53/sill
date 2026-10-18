# 样式整理（C4）

日期：2026-10-18。范围：Web 本地页面与云端页面共用样式。提交 [PR #53](https://github.com/dabaige53/sill/pull/53)，未合并、未部署。Mac 未改。

手机规则合成一个 650px 区块；提取现有固定颜色与内部间距，删除无引用规则，用状态变量代替不必要的 CSS 优先级。界面和行为保持不变。检查与证据对应源码 `a72de59`；基础分支文档合并为 `9e18fc5`。最新 CI 以 PR 为准。

## 分步提交

| 提交 | 变化 | 检查 |
| --- | --- | --- |
| `ea793a8` | 原样移动，117 条手机规则集中在一块；全部 151 条响应式规则的选择器、作用范围和属性值不变 | Node 36 / 192 / 92；浏览器 51 项 |
| `977a0a1` | 22 个固定颜色、36 个内部间距变量；45 处颜色引用换成相同值，保留已有语义变量 | Node 36 / 192 / 92；浏览器 74 项 |
| `1a17b52` | 先补普通、系统减少动态、应用减少动态的优先级检查 | Node 36 / 192 / 92；动效 14 项 |
| `2258858` | 删除 9 条无引用规则；`!important` 33 → 6；58 处过渡声明使用状态变量 | Node 36 / 192 / 92；原有浏览器通过；随后新增的动画中断检查检出 3 处回归 |
| `a72de59` | 修复进行中的动画；增加 3 项保护检查 | Node 36 / 192 / 92；相关浏览器 110 项，失败 0 |
| `9e18fc5` | 合入基础分支的新工具限制，只处理交接文档冲突 | Node 36 / 192 / 92；动效 17 项 |

移动和改写分开提交。[移动证明](move-proof.json)、[变量数值](token-plan.json)、[替换计数](token-replacements.json)、[源码核对](source-audit.json) 和 [检查汇总](checks.json) 保留计数与日志摘要。文案仍为 826 个键，其中哈希键 491 个、panels 哈希键 0 个；图标 69 个。Web Biome 为 0 错误、875 警告、30 条提示，不是零警告。

## 无引用样式的取回

删除前的可运行提交是 `1a17b52`，本地标签 `c4-before-unused-styles`。已删除的选择器为 `.preview-excerpt`（含渐隐和段落）、`.settings-note`、`.panel-foot-row`（含链接与手机规则）、`.search-actions`、`.app-badge`，共 9 条规则。全仓搜索确认只存在于应用样式和生成组件 CSS；没有模板、脚本、组件示例或测试调用。需要取回时，从该提交读取原 CSS，不恢复到现行实现。

`.stats-trio`、`.field-label` 和 `.card-more-trigger` 仍供组件示例或组件说明使用，保留。动态照片列数和卡片类型也保留。`.reminder-actions` 已不在样式中，无需再次删除。

## 进行中动画的回归与修复

普通 CSS 的 `transform: none` 无法压过 Web Animations API 中正在执行的位移。静态截图没有暴露这个差异。新增检查在原样式 `1a17b52` 上 17/17 通过，在 `2258858` 上 14 项通过、3 项失败：入场中打开卡片菜单、系统和应用减少动态效果切换。

`a72de59` 在 `MotionEngine.animate` 的位移关键帧中读取元素自身的 `--motion-managed-transform`。打开菜单或启用减少动态效果时，样式可立即固定该元素；透明度、时间和暂停状态不变。移除状态后恢复同一动画。每个元素重置该变量，菜单本身仍可独立入场。不增加 AppController 公开方法，不取消动画或另建监听器。

相同检查修复后 17/17 通过。保留 [基础通过日志](active-animation-base.log)、[整理后失败日志](active-animation-regression.log)、[修复后通过日志](active-animation-fixed.log)。没有跳过、禁用或放宽断言。

真实 CSS 核对覆盖 3 种模式的 42 组状态，包括直接和嵌套拖动、工具条收起及可见性延迟、遮罩、导航镜片和刷新进度。属性语义一致，见 [逐项对比](priority-comparison.json)。CSS 会重复短时长列表以匹配属性数；对比按此规则展开列表，不把计算样式字符串的重复写法算作行为差异。

保留的 6 处 `!important` 都有内联样式来源：空卡片的 left/top/width（布局）、手机人像 width/height（avatar）、刷新旋转期间的 stroke-dashoffset（手势进度）。原因写在相邻注释中。

## 实际页面截图

全部使用隔离合成卡片，不连接真实账号。固定时间为 `2026-10-17T09:00:00Z`，宽度 320、390、1440；手机高 844、桌面高 1000，深浅色各截主页、文章详情、设置外观页。改前为 `a091379`，改后为 `a72de59`。截图等待字体、图片及布局稳定；动画过程由上述浏览器检查另行验证。

原样移动、变量替换和最终修复后，普通模式各 18/18 零像素差异，元素位置及选定计算样式一致。见 [移动对比](moved-comparison.json)、[变量对比](tokens-comparison.json)、[最终对比](managed-comparison.json)。完整图片、元素数据和 SHA-256 在 [文件清单](manifest.json)，单个文件最大 350,505 字节。

| 页面 | 320 深浅色 | 390 深浅色 | 1440 深浅色 |
| --- | --- | --- | --- |
| 主页 | [改前浅](before/320-light-home.png) / [改后浅](after/320-light-home.png)；[改前深](before/320-dark-home.png) / [改后深](after/320-dark-home.png) | [改前浅](before/390-light-home.png) / [改后浅](after/390-light-home.png)；[改前深](before/390-dark-home.png) / [改后深](after/390-dark-home.png) | [改前浅](before/1440-light-home.png) / [改后浅](after/1440-light-home.png)；[改前深](before/1440-dark-home.png) / [改后深](after/1440-dark-home.png) |
| 详情 | [改前浅](before/320-light-detail.png) / [改后浅](after/320-light-detail.png)；[改前深](before/320-dark-detail.png) / [改后深](after/320-dark-detail.png) | [改前浅](before/390-light-detail.png) / [改后浅](after/390-light-detail.png)；[改前深](before/390-dark-detail.png) / [改后深](after/390-dark-detail.png) | [改前浅](before/1440-light-detail.png) / [改后浅](after/1440-light-detail.png)；[改前深](before/1440-dark-detail.png) / [改后深](after/1440-dark-detail.png) |
| 设置 | [改前浅](before/320-light-settings.png) / [改后浅](after/320-light-settings.png)；[改前深](before/320-dark-settings.png) / [改后深](after/320-dark-settings.png) | [改前浅](before/390-light-settings.png) / [改后浅](after/390-light-settings.png)；[改前深](before/390-dark-settings.png) / [改后深](after/390-dark-settings.png) | [改前浅](before/1440-light-settings.png) / [改后浅](after/1440-light-settings.png)；[改前深](before/1440-dark-settings.png) / [改后深](after/1440-dark-settings.png) |

另核对系统和应用减少动态效果，各 18 张。应用模式 [18/18 零差异](managed-app-comparison.json)。系统模式出现过 1 像素差异：390 深色设置的 `(84, 772)` 在 `(21,21,22)` 与 `(23,23,24)` 之间变化，布局和选定样式均一致。基础提交重复截图也出现相同差异；最终图与第一次基础图逐字相同，较早整理图与第二次基础图逐字相同。两类基准均保留，未修改比较断言；具体渲染原因未定位。见 [像素与哈希对照](system-pixel-control.json)、[最终对第一次基准](managed-system-comparison.json)、[最终对第二次基准](managed-system-repeatbase-comparison.json) 和 [基础重复对比](base-repeat-system-comparison.json)。

## 检查与交付边界

`npm test` 包含文件管理、契约、构建、源码、类型及 Node 三组检查，均通过。`npm run lint:web` 通过。最终相关浏览器：基础 23、抽屉 11、动效材质 17、密度 6、无障碍 13、PWA 触控 10、搜索 2、多选 28，加上 `9e18fc5` 的刷新反馈 2 项，共 112 项通过。使用本机预装 Chromium，没有下载浏览器。真机、Safari 未检查，生产未部署。

源码提交 `9e18fc5` 的 CI 有一次推送检查在 `cloud-operations-browser.ts:437` 等待已保存状态超时，见 [原始失败](ci-cloud-operations-timeout.log)。同一提交的 PR 对应检查通过；[基础提交本机复跑](cloud-operations-base.log) 和 [当前提交本机复跑](cloud-operations-current.log) 均通过，各 1 项。此前 C3 也记录过同一位置的超时，但本次根因仍未定位，不能据此断言无关。没有改测试或放宽断言。最终提交 CI 另以 PR 的检查记录为准。

先更新仓库原则和手册，再修改实现；本次不改变画板布局、图标或文案。生成命令 `node design-system/scripts/generate.ts design-system .` 已运行，组件 CSS 重建，组件 JS 和 69 个图标不变。`window.__app` 的 103 个公开方法签名不变。Mac、iOS 原生代码未改。

线上未同步：`design-system/README.md`、`design-system/tokens.json`、`design-system/components/bundle.css`；仓库模式规则另在 `DESIGN.md`、ADR 0032 和交接文档中说明。用户另行处理线上。中断前曾新增线上 `fixed-white`、`fixed-ink`；其余颜色尚未保存。收到工具限制后未再访问或更改线上。`design-system/design-system.json` 的线上资产记录保持不变。
