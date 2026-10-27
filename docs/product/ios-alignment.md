# iOS 与现有界面对账

更新：2026-10-26。对应 [PR #69](https://github.com/dabaige53/sill/pull/69)。

用户本次要求构建原生 iOS 应用，并继续补齐与 macOS、手机 PWA 的功能及动画。此前卡片对账中的「iOS 不开发」属于 2026-10-22 的范围记录，不再适用于本次工作。手机布局以当前 PWA 源码为参考。iOS 阅读只使用抽屉，不提供放大、缩小或滚动自动展开；这是用户在 2026-10-26 确定的原生端规则。共享内容、状态、文案、Mono24 图标和设计变量沿用 macOS 与设计系统；不把桌面的窗口行为直接套在手机上。

下表记录代码接入点，**不代表真机或模拟器中已经完成 1:1 视觉验收**。原有 macOS、Web 的历史截图和通过记录也不能替代原生 iOS 验收。

| 范围 | 参考与 iOS 接入 | 验证状态 |
| --- | --- | --- |
| 手机外壳 | PWA `Navigation`、`phone.css`；`SillMobileRootView`、`MobileNavigation`，主页、AI、搜索、独立设置页、底部胶囊 | 模拟器构建通过；窗口未验收 |
| 信息流 | `feed-policy.ts`；`MobileFeedState`、`MobileFeed`，每页 40 张、同源一小时超过 5 张未读叠卡、阅读和勾选不重排、离开顶部时暂存普通新卡并提示、逐卡恢复归档 | 状态单测与模拟器构建通过；窗口未验收 |
| 信息流动画 | `motion.md`；`MobileMotion`、`MobileChromeState`、`MobileStack`，共享曲线、前十张错开、移出补位、叠卡平移、滚动隐藏和恢复工具 | 连续动画帧未验收 |
| 下拉刷新 | PWA `pull-refresh`；`MobileRefresh`、`MobileScrollObserver`，48pt 阈值、只在松手提交、慢请求释放内容、成功反馈 | 手势窗口未验收 |
| 卡面 | PWA `cards/`、手机 CSS；`MobileCardTile`、`MobileCardBodies`、`MobileSpecialCardBodies`，12 类型、13 展示形态、独立来源与日期行 | 逐卡截图未验收 |
| 已读与图片 | PWA 颜色与阴影；`MobileCardPresentation`、`MobileImages`，已读底边/文字色、无阴影、封面饱和度 0.6、缓存图片即时显示、阅读层退出后才释放源卡已读外观 | 图片失败及深色窗口未验收 |
| 搜索 | 手机搜索面板；`MobileSearchState`、`MobileSearchInput`、`MobileSearch`，分类封面、类型和标签条件、归档分组、输入法组合、独立滚动位置 | 状态单测与模拟器构建通过；窗口未验收 |
| 预览与层叠 | 手机抽屉；`MobileReaderHost`、`MobileReaderPresentation`，顶部 64pt、短内容自然高度、相关卡叠放、每次只退出顶层、保留父层位置 | 会话单测通过；窗口未验收 |
| 阅读手势 | `gesture-preview.ts`、`motion.md`；`MobileReaderPolicy`、`MobileReaderScroll`、`MobileReaderGestures`，下拉/右滑关闭、把手下拉关闭、上拉不足确认时回弹、取消不提交；无全屏状态与切换 | 阈值及会话单测通过；触摸未验收 |
| 读完与动作 | `MobileReader`、`MobileReaderToolbar`；短文停留、阅读进度、120pt 上推；完成写入确认且松手后关闭；通用及最多三个专属操作、隐藏偏好、450ms 工具名称长按 | 写入/阈值单测通过；长按与动画未验收 |
| 详情 | macOS `Reader/` 与 PWA 详情；`MobileReaderDetails`、`MobileDetailRows`，类型专用头部/字段、资讯抽屉封面位于头部之前、日程/任务/附件/PR、正文不重复摘要 | 逐卡截图未验收 |
| Markdown 与关联 | 共享 `MarkdownBody`，`MobileReaderComponents`；表格对齐、标题目录、`#card/` 与 `#read/` 内链在阅读栈打开 | 解析单测通过 |
| 媒体 | `MobileMedia`、`MobileReaderMedia`、`MobileMediaControls`；音频、官方视频、封面就绪层、转场稳定后挂载、播放进度、章节/文字稿/笔记、无音源禁用 | 真实网络播放与吸顶连续切换未验收 |
| 照片 | 手机 PWA 黑底照片页；`MobilePhotoLightbox`，剩余高度居中、说明/缩略图/操作贴底 | 真机及窗口未验收 |
| 批量与注释 | macOS `Workspace.saveEdits`；`MobileBatchAnnotations`、`MobileWorkspace`，所选卡标签全替换、备注只写首卡、全部基准校验、一次原子批量 | 合成 HTTP 单测通过 |
| 设置与录入 | `SettingsMobile`、macOS 设置；`MobileSettings`、`MobileSettingsControls`、`MobileCapture`，五分组、排版/动作/提醒偏好、速记 | 偏好消费者逐项源码核对；窗口未验收 |
| 会话与备份 | 复用 SillKit 云端 API、钥匙串、WebDAV/R2；冲突保留输入、未知结果不重发、账号切换清理、恢复二次确认 | 模拟 HTTP 测试通过；真实账号/备份未验收 |

## 本次参考差异

- 当前 `phone.css` 的资讯封面高 180、媒体比例 16:9；以现有源码为准。手机导航同样沿用当前图标样式，未使用旧文字标签稿。
- 资讯和邮件摘要应在手机显示最多四行。PWA 的 CSS 已有 `reading-summary`，组件漏加该类；本次补上类名，iOS 同步四行。
- iOS 26+ 浮动工具使用系统玻璃材质；iOS 17–25 使用设计色、模糊、边缘及双层阴影回退，沿用 macOS 的版本适配方式。
- 本应用是独立客户端。AI 区保留上下文与展示，不伪造内置模型、发送能力、外部来源同步或数据导入。无媒体地址时禁用播放，只有实际加载失败才显示失败。

## 证据边界

[`546a619` 的 macOS CI](https://github.com/dabaige53/sill/actions/runs/40169209708) 已通过 Apple 格式检查与 192 项 Swift 测试（37 个 suite，性能基准按既有规则跳过）。覆盖新增的信息流、搜索、阅读阈值/层叠会话、批量基准、读状态外观、媒体保存、提醒条件及共享 Markdown。

同一代码提交的 [iOS CI](https://github.com/dabaige53/sill/actions/runs/40169209614) 已通过，成功生成 `dist/ios/DerivedData/Build/Products/Debug-iphonesimulator/Sill.app`。这是无签名的 iPhone/iPad 模拟器构建，不启动应用界面。已修复 OpenAPI 主机工具依赖、资源输出沙盒、无窗口图标编码、Swift 并发隔离和日程/信息流视图的类型推导问题。

上述远端 CI 不含界面验收。2026-10-26 已在本地 macOS 获得原生界面测试授权；本次修复阅读进度后台保存、清空长正文请求过大和预览目录入口，并加入原生测试目标及内存合成数据。此前完整 Swift Package 检查共 198 项测试通过；移除全屏后，55 项 iOS 状态测试再次通过。最终在 iPhone 12（iOS 18.6.2）上通过 55 项原生单元测试和 2 项界面测试，覆盖目录、后台返回后的进度保存、关闭、长按不执行动作及确认清空。其他卡片类型、连续动画、媒体播放与 iPad 布局仍未验收。

按用户要求，本地 iOS 模拟器设备与运行时已卸载，后续本地验证改用真实 iPhone；CI 保留显式模拟器构建和单元测试。真机证书、Team 与开发者模式已配置；Debug 真机构建、签名校验与安装完成。开发证书已在手机确认信任，真机启动与上述测试已通过。Release arm64 未签名归档也已生成；它只用于编译和资源检查，不能直接分发。TestFlight/App Store 发布、真实账号和实际媒体播放均未执行。

本次真机证据、构建编号与验证范围见 [2026-10-26 记录](../records/2026-10-26-ios-device-readiness/README.md)。
