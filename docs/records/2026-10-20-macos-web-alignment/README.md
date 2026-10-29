# macOS 视觉与动效对齐 Web

本轮只修改仓库。保留当前信息结构、文案、数据能力和已有 ReaderActivity / ReaderProgress；未委派子代理，未修改 claude.ai 云端设计，未发布应用。

[动效与流程逐行清单](rule-checklist.md)记录 motion.md、interaction.md 的开始状态与最终状态；[Apple 变量增量](tokens.md)列出每个新增或修正的变量及 Web 依据。

## 主要变化

- 卡片：120ms 按压、160ms 悬停、圆角焦点环、纯描边选中、深浅色分层阴影、已读描边、状态颜色过渡。
- 更多菜单：右上 32px 圆钮，12px 定位；独立 180ms / 120ms 过渡，0.95 入场，避让底轨；系统右键菜单保留。
- 阅读：220ms / 10px 打开和关闭、完成回调清理、快速反向操作、全屏短淡入、逐层返回与滚动恢复；28px 圆角、sheet 阴影、白色圆盘和播客变量。
- 列表：宽度直接确定，只平移 220ms；首屏 10px / 前十张 30ms；分页即显；新增向下落入，退出先禁用、淡出后补位。当前筛选和任务行保持位置。
- 手势：触控板停止后提交关闭/刷新；读完在 120px 锁定单次提交；40px 进度圆片、确认白勾和反馈结束后退场；取消回位，残余惯性不会传给主页。
- 工具：28px / 14px / 650ms 自动收起与恢复，180ms / 220ms 过渡；AI 框和多选条交叉淡入，已有输入与引用保留；引用、封面、Toast、新内容提示和设置滑块补齐动效。
- 细节：圆形任务/提醒勾点保留 Toggle 的辅助功能表示；标题、引用、日程、百分比和编号排版对齐；到期提醒用 warning；附件改为整行背景。

## 验证

| 命令 | 最终结果 | 输出摘要 |
| --- | --- | --- |
| `node tests/apple/run.ts` | 通过，退出码 0 | `38 tests in 4 suites passed`；`27 tests in 5 suites passed`。合计 65 项。 |
| `node scripts/build-macos.ts` | 通过，退出码 0 | `Build complete! (76.12秒)`；完成应用打包和签名，产物为 `dist/macos/Sill.app`。 |
| `npm run files:check` | 通过，退出码 0 | `文件管理检查通过：目录归属、文档有效性、导航、链接、证据、依赖方向与本地文件隔离。` |

构建和测试仍输出已有 OpenAPI 生成器警告，不影响退出码：

```text
warning: Schema "null" is not supported, reason: "schema type", skipping [context: foundIn=Components.Schemas.Card (#/components/schemas/Card)/readingEstimate]
```

此前失败已处理，保留关键输出及处理结果：

| 失败检查 | 输出 | 处理结果 |
| --- | --- | --- |
| 首轮构建 | `static property 'fade' is not concurrency-safe because non-'Sendable' type 'AnyTransition' may have shared mutable state`；`conformance of 'NSEvent' to 'Sendable' is unavailable` | 动画定义限定在主线程；事件监听回调只传递是否消费事件的布尔值。最终构建通过。 |
| 沙箱内打包 | `Sill.iconset:Invalid Iconset.` | 同一 iconutil 命令在获准的沙箱外执行成功；最终完整打包通过，没有修改打包脚本。 |
| 首轮桌面测试 | `Expectation failed: model.visible.count == 2`；`Expectation failed: model.page == "search"` | 两条断言仍假设独立搜索页面，已按当前桌面共用信息流的行为更新。 |
| 新增手势测试 | `Sill/Workspace.swift:69: Fatal error: Unexpectedly found nil while implicitly unwrapping an Optional value` | 无界面测试进程没有 NSApp，当前事件读取改为可选访问。最终 65 项测试通过。 |

未启动浏览器、原生应用或视觉自动化，也未运行 e2e。所有新增动效都只完成了代码实现与非界面检查，尚未在真实窗口中观察。SwiftUI 的具体绘制、触控板手感、菜单定位、焦点环、材料效果、滚动位置恢复和动画中断仍需真实窗口验收。

## 保留差异与疑问

- 云端写入可能占用现有写入锁或等待网络回执。120px 达标后锁定意图，只提交一次；如果已有写入在进行，等待它结束再提交。确认写入成功后显示蓝底白勾并保持 460ms，再关闭当前层。失败或结果未知保留阅读层和错误，不显示成功。这个时序保证反馈与真实结果一致，慢网络下关闭会晚于手册的“达标后 460ms”。
- 原有 reduceMotion 分支继续保留在 Desktop、DesktopFeed 和 NativeStack；新增动效没有增加减弱分支。这与手册统一动效的规则存在已知差异，按本轮要求保留。
- 手机抽屉把手、软键盘、PWA、安全区、手机导航及手机页面切换不移植到 Mac。现有媒体没有分段控件，不为动效新增内容结构。
- 玻璃使用 Web 的颜色、描边和阴影，底层仍由系统材质采样背景；它与 Web 的 CSS blur / saturate 不保证像素相同，需在实际窗口对照。
- 仓库新增的 apple 设计变量尚未同步到线上。若编写 PR，Merge Danger 必须写明这一点。

## 修改文件

- [DESIGN.md](../../agent/DESIGN.md)
- [apps/apple/DesktopTests/ReaderGestureTests.swift](../../../apps/apple/DesktopTests/ReaderGestureTests.swift)
- [apps/apple/DesktopTests/WorkspaceTests.swift](../../../apps/apple/DesktopTests/WorkspaceTests.swift)
- [apps/apple/README.md](../../../apps/apple/README.md)
- [apps/apple/macOS/CardActions.swift](../../../apps/apple/macOS/CardActions.swift)
- [apps/apple/macOS/CardMedia.swift](../../../apps/apple/macOS/CardMedia.swift)
- [apps/apple/macOS/CardMenu.swift](../../../apps/apple/macOS/CardMenu.swift)
- [apps/apple/macOS/CardReader.swift](../../../apps/apple/macOS/CardReader.swift)
- [apps/apple/macOS/CardReaderContent.swift](../../../apps/apple/macOS/CardReaderContent.swift)
- [apps/apple/macOS/CardReaderMetadata.swift](../../../apps/apple/macOS/CardReaderMetadata.swift)
- [apps/apple/macOS/CardTile.swift](../../../apps/apple/macOS/CardTile.swift)
- [apps/apple/macOS/CloudLogin.swift](../../../apps/apple/macOS/CloudLogin.swift)
- [apps/apple/macOS/Desktop.swift](../../../apps/apple/macOS/Desktop.swift)
- [apps/apple/macOS/DesktopActions.swift](../../../apps/apple/macOS/DesktopActions.swift)
- [apps/apple/macOS/DesktopFeed.swift](../../../apps/apple/macOS/DesktopFeed.swift)
- [apps/apple/macOS/DesktopInteraction.swift](../../../apps/apple/macOS/DesktopInteraction.swift)
- [apps/apple/macOS/DesktopSearch.swift](../../../apps/apple/macOS/DesktopSearch.swift)
- [apps/apple/macOS/FeedCollection.swift](../../../apps/apple/macOS/FeedCollection.swift)
- [apps/apple/macOS/GlassSurface.swift](../../../apps/apple/macOS/GlassSurface.swift)
- [apps/apple/macOS/LoadingFeedback.swift](../../../apps/apple/macOS/LoadingFeedback.swift)
- [apps/apple/macOS/MasonryLayout.swift](../../../apps/apple/macOS/MasonryLayout.swift)
- [apps/apple/macOS/NativeMotion.swift](../../../apps/apple/macOS/NativeMotion.swift)
- [apps/apple/macOS/NativeShadow.swift](../../../apps/apple/macOS/NativeShadow.swift)
- [apps/apple/macOS/NativeStack.swift](../../../apps/apple/macOS/NativeStack.swift)
- [apps/apple/macOS/NativeToggle.swift](../../../apps/apple/macOS/NativeToggle.swift)
- [apps/apple/macOS/NativeTooltip.swift](../../../apps/apple/macOS/NativeTooltip.swift)
- [apps/apple/macOS/ReaderDiscStyle.swift](../../../apps/apple/macOS/ReaderDiscStyle.swift)
- [apps/apple/macOS/ReaderGestureState.swift](../../../apps/apple/macOS/ReaderGestureState.swift)
- [apps/apple/macOS/ReminderCompletion.swift](../../../apps/apple/macOS/ReminderCompletion.swift)
- [apps/apple/macOS/ScopeMenu.swift](../../../apps/apple/macOS/ScopeMenu.swift)
- [apps/apple/macOS/ScrollObservation.swift](../../../apps/apple/macOS/ScrollObservation.swift)
- [apps/apple/macOS/SettingsPanel.swift](../../../apps/apple/macOS/SettingsPanel.swift)
- [apps/apple/macOS/SillApp.swift](../../../apps/apple/macOS/SillApp.swift)
- [apps/apple/macOS/WindowAnchor.swift](../../../apps/apple/macOS/WindowAnchor.swift)
- [apps/apple/macOS/Workspace.swift](../../../apps/apple/macOS/Workspace.swift)
- [design-system/handbook/interaction.md](../../../design-system/handbook/interaction.md)
- [design-system/handbook/motion.md](../../../design-system/handbook/motion.md)
- [design-system/tokens.json](../../../design-system/tokens.json)
- [design-system/tokens/foundation.json](../../../design-system/tokens/foundation.json)
- [docs/README.md](../../README.md)
- [docs/records/2026-10-20-macos-web-alignment/README.md](README.md)
- [docs/records/2026-10-20-macos-web-alignment/rule-checklist.md](rule-checklist.md)
- [docs/records/2026-10-20-macos-web-alignment/tokens.md](tokens.md)
