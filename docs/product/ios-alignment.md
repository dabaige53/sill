# iOS 与现有界面对账

更新：2026-10-25。对应 [PR #69](https://github.com/dabaige53/sill/pull/69)。

用户本次要求构建原生 iOS 应用，并继续补齐与 macOS、手机 PWA 的功能及动画。此前卡片对账中的「iOS 不开发」属于 2026-10-22 的范围记录，不再适用于本次工作。手机布局以当前 PWA 源码为准，共享内容、状态、文案、Mono24 图标和设计变量沿用 macOS 与设计系统；不把桌面的窗口行为直接套在手机上。

下表记录代码接入点，**不代表真机或模拟器中已经完成 1:1 视觉验收**。原有 macOS、Web 的历史截图和通过记录也不能替代原生 iOS 验收。

| 范围 | 参考与 iOS 接入 | 验证状态 |
| --- | --- | --- |
| 手机外壳 | PWA `Navigation`、`phone.css`；`SillMobileRootView`、`MobileNavigation`，主页、AI、搜索、独立设置页、底部胶囊 | 原生构建待本次 CI；窗口未验收 |
| 信息流 | `feed-policy.ts`；`MobileFeedState`、`MobileFeed`，每页 40 张、同源一小时超过 5 张未读叠卡、阅读和勾选不重排 | 状态单测与构建待本次 CI |
| 信息流动画 | `motion.md`；`MobileMotion`、`MobileChromeState`、`MobileStack`，共享曲线、前十张错开、移出补位、叠卡平移、滚动隐藏和恢复工具 | 连续动画帧未验收 |
| 下拉刷新 | PWA `pull-refresh`；`MobileRefresh`、`MobileScrollObserver`，48pt 阈值、只在松手提交、慢请求释放内容、成功反馈 | 手势窗口未验收 |
| 卡面 | PWA `cards/`、手机 CSS；`MobileCardTile`、`MobileCardBodies`、`MobileSpecialCardBodies`，12 类型、13 展示形态、独立来源与日期行 | 逐卡截图未验收 |
| 已读与图片 | PWA 颜色与阴影；`MobileCardPresentation`、`MobileImages`，已读底边/文字色、无阴影、封面饱和度 0.6、缓存图片即时显示 | 图片失败及深色窗口未验收 |
| 搜索 | 手机搜索面板；`MobileSearchState`、`MobileSearchInput`、`MobileSearch`，分类封面、类型和标签条件、归档分组、输入法组合、独立滚动位置 | 状态单测与构建待本次 CI |
| 预览与层叠 | 手机抽屉；`MobileReaderHost`、`MobileReaderPresentation`，顶部 64pt、短内容自然高度、相关卡叠放、每次只退出顶层、保留父层位置 | 会话单测待本次 CI；窗口未验收 |
| 阅读手势 | `gesture-preview.ts`、`motion.md`；`MobileReaderPolicy`、`MobileReaderScroll`、`MobileReaderGestures`，下拉/右滑关闭、把手展开收起、滚动停稳后展开、取消不提交 | 阈值及会话单测待本次 CI；触摸未验收 |
| 读完与动作 | `MobileReader`、`MobileReaderToolbar`；短文停留、阅读进度、120pt 上推；完成写入确认且松手后关闭；通用及最多三个专属操作、隐藏偏好、450ms 工具名称长按 | 写入/阈值单测待本次 CI；长按与动画未验收 |
| 详情 | macOS `Reader/` 与 PWA 详情；`MobileReaderDetails`、`MobileDetailRows`，类型专用头部/字段、资讯预览和阅读封面顺序、日程/任务/附件/PR、正文不重复摘要 | 逐卡截图未验收 |
| Markdown 与关联 | 共享 `MarkdownBody`，`MobileReaderComponents`；表格对齐、标题目录、`#card/` 与 `#read/` 内链在阅读栈打开 | 解析单测待本次 CI |
| 媒体 | `MobileMedia`、`MobileReaderMedia`、`MobileMediaControls`；音频、官方视频、封面就绪层、转场稳定后挂载、播放进度、章节/文字稿/笔记、无音源禁用 | 真实网络播放与吸顶连续切换未验收 |
| 照片 | 手机 PWA 黑底照片页；`MobilePhotoLightbox`，剩余高度居中、说明/缩略图/操作贴底 | 真机及窗口未验收 |
| 批量与注释 | macOS `Workspace.saveEdits`；`MobileBatchAnnotations`、`MobileWorkspace`，所选卡标签全替换、备注只写首卡、全部基准校验、一次原子批量 | 合成 HTTP 单测待本次 CI |
| 设置与录入 | `SettingsMobile`、macOS 设置；`MobileSettings`、`MobileSettingsControls`、`MobileCapture`，五分组、排版/动作/提醒偏好、速记 | 偏好消费者逐项源码核对；窗口未验收 |
| 会话与备份 | 复用 SillKit 云端 API、钥匙串、WebDAV/R2；冲突保留输入、未知结果不重发、账号切换清理、恢复二次确认 | 初版模拟 HTTP 测试通过；真实账号/备份未验收 |

## 本次参考差异

- 当前 `phone.css` 的资讯封面高 180、媒体比例 16:9；以现有源码为准。手机导航同样沿用当前图标样式，未使用旧文字标签稿。
- 资讯和邮件摘要应在手机显示最多四行。PWA 的 CSS 已有 `reading-summary`，组件漏加该类；本次补上类名，iOS 同步四行。
- iOS 26+ 浮动工具使用系统玻璃材质；iOS 17–25 使用设计色、模糊、边缘及双层阴影回退，沿用 macOS 的版本适配方式。
- 本应用是独立客户端。AI 区保留上下文与展示，不伪造内置模型、发送能力、外部来源同步或数据导入。无媒体地址时禁用播放，只有实际加载失败才显示失败。

## 证据边界

初版 macOS CI 已执行并通过 153 项 Swift 测试；当轮 iOS 构建在 OpenAPI 生成器被错误作为设备目标编译时失败。已把官方生成插件直接挂到 SillKit，保留仓库自身的资源生成插件，并推送修复。后续 CI 和测试结果应按对应提交更新，不能用初版通过结果证明后续新增功能。

当前环境为 Linux。仓库规则没有把功能开发视作浏览器或 Apple 界面自动化授权，本次未运行此类自动化。签名、TestFlight/App Store 发布、真实账号和实际媒体播放均未执行。
