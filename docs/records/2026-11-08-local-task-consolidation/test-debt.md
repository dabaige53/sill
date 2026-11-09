# 测试改写与剩余项

2026-11-09。依据当前工作区逐行统计。初始 262 处债务标记，旧聊天已改写 16 项，本轮继续改写 48 项，累计改写 64 项，剩余 198 处。统计包含共享辅助检查，不等于运行器展开后的用例数。所有本次改写仍待程序验证。

| 范围 | 整合后基准 | 旧聊天改写 | 本轮改写 | 剩余标记 |
| --- | ---: | ---: | ---: | ---: |
| Web | 103 | 6 | 16 | 81 |
| 服务端 | 9 | 5 | 4 | 0 |
| Apple | 55 | 4 | 20 | 31 |
| E2E 与辅助检查 | 95 | 1 | 8 | 86 |
| 合计 | 262 | 16 | 48 | 198 |

原始清剿记录的 258 个用例及 3 个共享检查属于 2026-11-06 快照。当前表采用整合后的源码，不把两个基准混算。

## 本轮处理依据

- 账号恢复等待工作区的状态变化；旧恢复请求使用显式暂停与释放信号。检查账号、卡片、备注、阅读记录及实际保留或清除的通知。
- 系统提醒等待工作区就绪、写请求到达和完成回调；检查具体提醒 ID、失败重试、到期回滚及容量结果。
- 清空卡片检查后端卡片与状态为空；搜索范围检查已读、未读的实际卡片结果；阅读手势检查关闭回调。
- PostgreSQL 保持第一笔事务未提交，等待竞争请求进入锁等待后提交。检查冲突、幂等回执和快照结果；5000/5001 个合法操作检查批量上限。
- Web 提示按可控时钟检查可交互状态和替换提示的完整显示时间；详情关闭和引用移除等待对应元素的动画完成，检查内容、草稿和焦点。
- 搜索与下拉输入使用固定时钟；日期在两个时区检查同一纯日期；会议工具条使用固定时间。
- React 测试改用产品的 CardView 和 PanelViews；检查任务焦点、转义、旧正文及嵌套卡片清理。导航用例执行真实返回，检查父卡内容和阅读模式。
- 浏览器任务用例移除断言前主动聚焦；隐私和主题用例先确认 Cookie 或 theme-color 存在；拖放后重新读取内容；助手更新检查真实页面中的任务文字。
- 本地浏览器刷新后重新读取服务器内容，检查真实卡片边界及重叠；工具提示通过浏览器 DOM.getBoxModel 取得伪元素边界，删除手工复算 CSS 坐标。

## 标记维护

剩余 198 处标记按当前允许的 debt 名称保存。D5 映射为 over-mock，D6 为 impl-detail，D9 为 flaky；外观用例中 D3 指向 wrong-layer。历史 D 编号与原理由仍在[原处置清单](../2026-11-06-test-purge/disposition.md)。标签替换未减少债务数量，也未计为改写。

## 累计源码改写

下表对应整合后基准至当前工作区的 64 项源码改写，包含旧聊天的 16 项；均待程序验证。

| 文件 | 改写项数 |
| --- | ---: |
| [apps/apple/DesktopTests/AccountTests.swift](../../../apps/apple/DesktopTests/AccountTests.swift) | 8 |
| [apps/apple/DesktopTests/DesktopInteractionTests.swift](../../../apps/apple/DesktopTests/DesktopInteractionTests.swift) | 1 |
| [apps/apple/DesktopTests/DesktopSearchTests.swift](../../../apps/apple/DesktopTests/DesktopSearchTests.swift) | 1 |
| [apps/apple/DesktopTests/MotionFlowTests.swift](../../../apps/apple/DesktopTests/MotionFlowTests.swift) | 3 |
| [apps/apple/DesktopTests/PerformanceTraceTests.swift](../../../apps/apple/DesktopTests/PerformanceTraceTests.swift) | 1 |
| [apps/apple/DesktopTests/SettingsTests.swift](../../../apps/apple/DesktopTests/SettingsTests.swift) | 1 |
| [apps/apple/DesktopTests/SystemReminderTests.swift](../../../apps/apple/DesktopTests/SystemReminderTests.swift) | 7 |
| [apps/apple/Tests/CardTests.swift](../../../apps/apple/Tests/CardTests.swift) | 1 |
| [apps/apple/Tests/CloudWorkspaceTests.swift](../../../apps/apple/Tests/CloudWorkspaceTests.swift) | 1 |
| [tests/e2e/browser-capture-layout.ts](../../../tests/e2e/browser-capture-layout.ts) | 1 |
| [tests/e2e/browser-card-actions.ts](../../../tests/e2e/browser-card-actions.ts) | 1 |
| [tests/e2e/cloud-browser.ts](../../../tests/e2e/cloud-browser.ts) | 2 |
| [tests/e2e/cloud-operations-browser.ts](../../../tests/e2e/cloud-operations-browser.ts) | 1 |
| [tests/e2e/local-browser.ts](../../../tests/e2e/local-browser.ts) | 1 |
| [tests/e2e/motion-material-browser-material-focus.ts](../../../tests/e2e/motion-material-browser-material-focus.ts) | 1 |
| [tests/e2e/pwa-touch-browser.ts](../../../tests/e2e/pwa-touch-browser.ts) | 2 |
| [tests/server/check-staged-file-tokens.test.ts](../../../tests/server/check-staged-file-tokens.test.ts) | 1 |
| [tests/server/cloud-app.test.ts](../../../tests/server/cloud-app.test.ts) | 1 |
| [tests/server/cloud-workspace.test.ts](../../../tests/server/cloud-workspace.test.ts) | 1 |
| [tests/server/mcp-guidance.test.ts](../../../tests/server/mcp-guidance.test.ts) | 1 |
| [tests/server/oauth-consent-review-security.ts](../../../tests/server/oauth-consent-review-security.ts) | 1 |
| [tests/server/plugin-package.test.ts](../../../tests/server/plugin-package.test.ts) | 1 |
| [tests/server/supabase-postgres-permissions.ts](../../../tests/server/supabase-postgres-permissions.ts) | 3 |
| [tests/web/app-display.test.ts](../../../tests/web/app-display.test.ts) | 4 |
| [tests/web/app.test.ts](../../../tests/web/app.test.ts) | 1 |
| [tests/web/card-metadata.test.ts](../../../tests/web/card-metadata.test.ts) | 1 |
| [tests/web/cloud-sync.test.ts](../../../tests/web/cloud-sync.test.ts) | 1 |
| [tests/web/core.test.ts](../../../tests/web/core.test.ts) | 1 |
| [tests/web/detail-toolbar.test.ts](../../../tests/web/detail-toolbar.test.ts) | 3 |
| [tests/web/nested-navigation.test.ts](../../../tests/web/nested-navigation.test.ts) | 2 |
| [tests/web/phone-drawer.test.ts](../../../tests/web/phone-drawer.test.ts) | 2 |
| [tests/web/react-renderer.test.ts](../../../tests/web/react-renderer.test.ts) | 2 |
| [tests/web/refresh-input.test.ts](../../../tests/web/refresh-input.test.ts) | 3 |
| [tests/web/search-desktop.test.ts](../../../tests/web/search-desktop.test.ts) | 2 |

## 待执行验证

- GitHub Actions：只执行实际改写的具名 Node 测试，以及共享搜索与时钟辅助文件的直接依赖。注释标签整理不要求重新执行未改行为的测试。
- GitHub Actions：执行受影响的 Swift 套件；共享工作区就绪辅助代码的直接使用方需一并检查。
- PostgreSQL：执行 tests/server/supabase-postgres.ts 的隔离 Docker 场景；测试容器不访问真实账号或云端数据库。
- 浏览器：分别验证 task 焦点、拖放、隐私、助手任务更新、布局和 PWA 工具提示；touchCancel 必须验证改写后的真实拖动与回位条件。
- 本轮未运行测试、类型检查、构建、浏览器或 Mac 窗口。旧记录中的通过结果不能替代当前分支的结果。

## 剩余处理范围

- Web：81 处，涉及模拟动画、内部几何或计数、焦点、滚动及可控时钟。
- Apple：31 处，涉及真实布局、阅读器过渡、刷新反馈、后台保存、采样时钟和滚动位置。
- E2E 与辅助检查：86 处，涉及固定等待、内部动画断言、持续时间边界和实际内容结果。
- 先按现有回调、保存结果和可观察事件改写；真实尺寸、焦点与视觉连续性需要实际界面证据。未消除的问题保留对应 debt。
- 只有风险已有其他有效覆盖或功能已停用时才删除用例；不能通过删除标签、缩小保护目标或修改统计基准宣称完成。

## 当前清单

行号对应 2026-11-09 工作区，后续编辑可能移动；保护目标取自当前源码标记。

| 文件与行号 | 债务 | 保护目标 |
| --- | --- | --- |
| [apps/apple/DesktopTests/AppearanceTests.swift:7](../../../apps/apple/DesktopTests/AppearanceTests.swift) | impl-detail | Release expanded stack height without shrinking existing cards |
| [apps/apple/DesktopTests/AppearanceTests.swift:21](../../../apps/apple/DesktopTests/AppearanceTests.swift) | impl-detail | Apply default and changed appearance settings to card layout |
| [apps/apple/DesktopTests/AppearanceTests.swift:35](../../../apps/apple/DesktopTests/AppearanceTests.swift) | wrong-layer,impl-detail | Apply spacing and reader width independently |
| [apps/apple/DesktopTests/CardRichFieldsTests.swift:26](../../../apps/apple/DesktopTests/CardRichFieldsTests.swift) | flaky | Show the same publication day on card and detail |
| [apps/apple/DesktopTests/DesktopInteractionTests.swift:8](../../../apps/apple/DesktopTests/DesktopInteractionTests.swift) | impl-detail | Reopen suggestions without disturbing existing text focus |
| [apps/apple/DesktopTests/DesktopInteractionTests.swift:20](../../../apps/apple/DesktopTests/DesktopInteractionTests.swift) | impl-detail | Close the menu for search and block search behind settings |
| [apps/apple/DesktopTests/FeedTests.swift:34](../../../apps/apple/DesktopTests/FeedTests.swift) | flaky | Keep completed cards in place until explicit refresh |
| [apps/apple/DesktopTests/FeedTests.swift:84](../../../apps/apple/DesktopTests/FeedTests.swift) | impl-detail | Restore each scope's loaded cards and scroll position |
| [apps/apple/DesktopTests/FeedTests.swift:113](../../../apps/apple/DesktopTests/FeedTests.swift) | impl-detail | Return filtered results to the top and first page |
| [apps/apple/DesktopTests/FeedTests.swift:142](../../../apps/apple/DesktopTests/FeedTests.swift) | impl-detail | Keep active filters and loaded cards when returning to the top |
| [apps/apple/DesktopTests/MotionFlowTests.swift:68](../../../apps/apple/DesktopTests/MotionFlowTests.swift) | impl-detail | Keep text aligned while the reader dismisses |
| [apps/apple/DesktopTests/MotionFlowTests.swift:83](../../../apps/apple/DesktopTests/MotionFlowTests.swift) | flaky,impl-detail | Continue a new pull from the visible position and show failure |
| [apps/apple/DesktopTests/MotionFlowTests.swift:113](../../../apps/apple/DesktopTests/MotionFlowTests.swift) | flaky,impl-detail | Prevent duplicate refreshes and allow retry after failure |
| [apps/apple/DesktopTests/MotionFlowTests.swift:135](../../../apps/apple/DesktopTests/MotionFlowTests.swift) | flaky,impl-detail | Ignore a stale refresh result after cancellation |
| [apps/apple/DesktopTests/MotionFlowTests.swift:162](../../../apps/apple/DesktopTests/MotionFlowTests.swift) | flaky,impl-detail | Refresh only after a qualifying mouse pull is released |
| [apps/apple/DesktopTests/MotionFlowTests.swift:190](../../../apps/apple/DesktopTests/MotionFlowTests.swift) | flaky,impl-detail | Show failure and then success after retry |
| [apps/apple/DesktopTests/MotionFlowTests.swift:225](../../../apps/apple/DesktopTests/MotionFlowTests.swift) | flaky,impl-detail | Restore card hover after scrolling stops |
| [apps/apple/DesktopTests/MotionFlowTests.swift:269](../../../apps/apple/DesktopTests/MotionFlowTests.swift) | impl-detail | Restore bars after closing a card opened below the feed top |
| [apps/apple/DesktopTests/NewContentTests.swift:9](../../../apps/apple/DesktopTests/NewContentTests.swift) | flaky | Show a due reminder once for the same trigger |
| [apps/apple/DesktopTests/PerformanceTraceTests.swift:49](../../../apps/apple/DesktopTests/PerformanceTraceTests.swift) | flaky | Record resource samples and main-thread delays |
| [apps/apple/DesktopTests/WorkspaceTests.swift:23](../../../apps/apple/DesktopTests/WorkspaceTests.swift) | impl-detail | Keep content and scroll position through an interrupted resize |
| [apps/apple/DesktopTests/WorkspaceTests.swift:54](../../../apps/apple/DesktopTests/WorkspaceTests.swift) | flaky,impl-detail | Prevent cancelled opening from revealing reader content |
| [apps/apple/DesktopTests/WorkspaceTests.swift:71](../../../apps/apple/DesktopTests/WorkspaceTests.swift) | flaky,impl-detail | Show content and tools after reopening the reader |
| [apps/apple/DesktopTests/WorkspaceTests.swift:90](../../../apps/apple/DesktopTests/WorkspaceTests.swift) | flaky,impl-detail | Open the newly selected card while the previous card closes |
| [apps/apple/DesktopTests/WorkspaceTests.swift:112](../../../apps/apple/DesktopTests/WorkspaceTests.swift) | flaky,impl-detail | Return to the previous card without showing desktop bars |
| [apps/apple/DesktopTests/WorkspaceTests.swift:202](../../../apps/apple/DesktopTests/WorkspaceTests.swift) | impl-detail | Keep other cards unchanged while one card is written |
| [apps/apple/DesktopTests/WorkspaceTests.swift:224](../../../apps/apple/DesktopTests/WorkspaceTests.swift) | flaky,impl-detail | Block a second write to the same card while allowing another card |
| [apps/apple/DesktopTests/WorkspaceTests.swift:280](../../../apps/apple/DesktopTests/WorkspaceTests.swift) | impl-detail | Preserve reading records without disturbing visible cards |
| [apps/apple/DesktopTests/WorkspaceTests.swift:327](../../../apps/apple/DesktopTests/WorkspaceTests.swift) | flaky | Save progress recorded while an earlier save is pending |
| [apps/apple/DesktopTests/WorkspaceTests.swift:340](../../../apps/apple/DesktopTests/WorkspaceTests.swift) | flaky | Prevent queued progress from undoing an explicit read decision |
| [apps/apple/DesktopTests/WorkspaceTests.swift:402](../../../apps/apple/DesktopTests/WorkspaceTests.swift) | impl-detail | Keep the visible read appearance stable until the transition ends |
| [tests/e2e/browser-capture-layout.ts:88](../../../tests/e2e/browser-capture-layout.ts) | flaky | prevent long press from losing selection or opening an unsupported menu |
| [tests/e2e/browser-capture-layout.ts:106](../../../tests/e2e/browser-capture-layout.ts) | flaky | prevent closing a child card from losing its parent or returning to the wrong page |
| [tests/e2e/browser-capture-layout.ts:155](../../../tests/e2e/browser-capture-layout.ts) | flaky | prevent the selection toolbar from overflowing or important notices from closing automatically |
| [tests/e2e/browser-capture-layout.ts:179](../../../tests/e2e/browser-capture-layout.ts) | flaky,impl-detail | prevent settings content from being obscured or the wrong page appearing during navigation |
| [tests/e2e/browser-capture-layout.ts:205](../../../tests/e2e/browser-capture-layout.ts) | flaky,impl-detail | prevent previews from opening at the wrong position or displaying incorrect text after closing |
| [tests/e2e/browser-touch-drag.ts:96](../../../tests/e2e/browser-touch-drag.ts) | flaky,impl-detail | prevent a stale close action from hiding a new page or duplicating cards |
| [tests/e2e/browser-touch-drag.ts:139](../../../tests/e2e/browser-touch-drag.ts) | flaky,impl-detail | prevent a stale close callback from affecting a newly opened card |
| [tests/e2e/browser-touch-drag.ts:173](../../../tests/e2e/browser-touch-drag.ts) | flaky | prevent reminder touch actions from failing, controls from overflowing, or snooze times from being wrong |
| [tests/e2e/browser-touch-drag.ts:258](../../../tests/e2e/browser-touch-drag.ts) | flaky | prevent cancelled drags from leaving previews behind or marking cards as read |
| [tests/e2e/card-actions-settings-browser.ts:112](../../../tests/e2e/card-actions-settings-browser.ts) | impl-detail | prevent incorrect note content, body order, or platform action controls |
| [tests/e2e/card-fields-browser.ts:179](../../../tests/e2e/card-fields-browser.ts) | flaky | prevent unavailable video from incorrectly updating read state or playback progress |
| [tests/e2e/cloud-app-browser.ts:299](../../../tests/e2e/cloud-app-browser.ts) | impl-detail | prevent photo navigation from hiding an error notice or sending content unexpectedly |
| [tests/e2e/cloud-browser.ts:71](../../../tests/e2e/cloud-browser.ts) | flaky | prevent an expired session from failing to recover through refresh credentials |
| [tests/e2e/cloud-operations-browser.ts:137](../../../tests/e2e/cloud-operations-browser.ts) | flaky | Persist task and reminder state |
| [tests/e2e/cloud-operations-browser.ts:291](../../../tests/e2e/cloud-operations-browser.ts) | flaky | Coalesce refresh; await result |
| [tests/e2e/cloud-welcome-browser.ts:135](../../../tests/e2e/cloud-welcome-browser.ts) | flaky | prevent cards from appearing before login or login controls from overflowing on narrow screens |
| [tests/e2e/cloud-welcome-browser.ts:168](../../../tests/e2e/cloud-welcome-browser.ts) | flaky | prevent password login from failing to submit or expired links from lacking feedback |
| [tests/e2e/cloud-welcome-browser.ts:215](../../../tests/e2e/cloud-welcome-browser.ts) | flaky | prevent horizontal overflow, blocked scrolling, or details that cannot be closed |
| [tests/e2e/drag-center-browser.ts:54](../../../tests/e2e/drag-center-browser.ts) | flaky | prevent drag previews from leaving the pointer, remaining after cancellation, or changing source cards |
| [tests/e2e/drawer-browser-detail-gestures.ts:12](../../../tests/e2e/drawer-browser-detail-gestures.ts) | flaky | prevent the drawer from resizing or failing to follow the finger |
| [tests/e2e/drawer-browser-detail-gestures.ts:36](../../../tests/e2e/drawer-browser-detail-gestures.ts) | flaky | prevent reading scroll from dismissing the drawer |
| [tests/e2e/drawer-browser-detail-gestures.ts:51](../../../tests/e2e/drawer-browser-detail-gestures.ts) | impl-detail | prevent opening interruption from leaving the drawer open |
| [tests/e2e/drawer-browser-rail-material.ts:15](../../../tests/e2e/drawer-browser-rail-material.ts) | impl-detail,flaky | prevent interrupted notice dismissal from hiding active feedback |
| [tests/e2e/drawer-browser-rail-material.ts:76](../../../tests/e2e/drawer-browser-rail-material.ts) | impl-detail,flaky | prevent scrolling or interruption from leaving navigation inaccessible |
| [tests/e2e/drawer-browser-rail-material.ts:172](../../../tests/e2e/drawer-browser-rail-material.ts) | flaky | prevent long card metadata from overflowing or overlapping content |
| [tests/e2e/drawer-browser-rail-material.ts:231](../../../tests/e2e/drawer-browser-rail-material.ts) | flaky,impl-detail | prevent short pulls from closing the drawer or long pulls from snapping back |
| [tests/e2e/drawer-browser-rail-material.ts:294](../../../tests/e2e/drawer-browser-rail-material.ts) | impl-detail | prevent opening and closing a drawer from moving the reading position |
| [tests/e2e/drawer-browser-rail-material.ts:377](../../../tests/e2e/drawer-browser-rail-material.ts) | flaky | Restore page scrolling after canceling and closing the drawer |
| [tests/e2e/gesture-performance-browser.ts:41](../../../tests/e2e/gesture-performance-browser.ts) | flaky | prevent pointer focus from keeping the header visible during scroll |
| [tests/e2e/gesture-performance-browser.ts:59](../../../tests/e2e/gesture-performance-browser.ts) | flaky | prevent opening a card from moving the feed or revealing hidden navigation |
| [tests/e2e/gesture-performance-browser.ts:106](../../../tests/e2e/gesture-performance-browser.ts) | impl-detail,flaky | prevent drawer dragging from resizing content or moving home controls |
| [tests/e2e/gesture-performance-browser.ts:237](../../../tests/e2e/gesture-performance-browser.ts) | flaky | prevent home controls from shifting when details open or close |
| [tests/e2e/gesture-performance-browser.ts:251](../../../tests/e2e/gesture-performance-browser.ts) | flaky,impl-detail | prevent mixed keyboard and wheel input from skipping the reader exit |
| [tests/e2e/gesture-performance-browser.ts:262](../../../tests/e2e/gesture-performance-browser.ts) | flaky,impl-detail | prevent completion feedback from being skipped before detail closes |
| [tests/e2e/gesture-performance-browser.ts:304](../../../tests/e2e/gesture-performance-browser.ts) | flaky | prevent refresh before release or missing loading and success feedback |
| [tests/e2e/helpers/cloud-selection-operations.ts:13](../../../tests/e2e/helpers/cloud-selection-operations.ts) | flaky | prevent selection and cancellation from writing workspace data |
| [tests/e2e/helpers/cloud-stable-detail.ts:12](../../../tests/e2e/helpers/cloud-stable-detail.ts) | impl-detail | prevent task or bookmark saves from resetting the active detail |
| [tests/e2e/helpers/cloud-stable-detail.ts:38](../../../tests/e2e/helpers/cloud-stable-detail.ts) | impl-detail | prevent remote updates from closing or resetting the active detail |
| [tests/e2e/home-tabs-browser.ts:129](../../../tests/e2e/home-tabs-browser.ts) | flaky | prevent home filters from remaining hidden after scrolling stops |
| [tests/e2e/home-tabs-browser.ts:197](../../../tests/e2e/home-tabs-browser.ts) | flaky | prevent completion from moving cards until the filter is explicitly changed |
| [tests/e2e/home-tabs-browser.ts:244](../../../tests/e2e/home-tabs-browser.ts) | flaky,impl-detail | prevent switching filters from losing the prior reading position |
| [tests/e2e/home-tabs-browser.ts:296](../../../tests/e2e/home-tabs-browser.ts) | impl-detail | prevent panel navigation from losing scroll position or keyboard focus |
| [tests/e2e/home-tabs-browser.ts:356](../../../tests/e2e/home-tabs-browser.ts) | impl-detail | prevent search shortcut failure or a hovered notice disappearing too soon |
| [tests/e2e/material-density-browser.ts:196](../../../tests/e2e/material-density-browser.ts) | impl-detail | prevent task completion from moving focus or changing stored task order |
| [tests/e2e/material-density-browser.ts:301](../../../tests/e2e/material-density-browser.ts) | impl-detail | prevent loading more cards from losing focus or jumping to the focused card |
| [tests/e2e/material-density-browser.ts:317](../../../tests/e2e/material-density-browser.ts) | impl-detail | prevent pagination from losing the active task or its visible state |
| [tests/e2e/material-density-browser.ts:360](../../../tests/e2e/material-density-browser.ts) | impl-detail | prevent compact cards from overlapping or hiding summary content |
| [tests/e2e/motion-material-browser-gesture-interruption.ts:4](../../../tests/e2e/motion-material-browser-gesture-interruption.ts) | impl-detail,flaky | prevent reading progress from displaying an incorrect position |
| [tests/e2e/motion-material-browser-gesture-interruption.ts:34](../../../tests/e2e/motion-material-browser-gesture-interruption.ts) | flaky | prevent stale transitions from replacing the latest notice or card |
| [tests/e2e/motion-material-browser-gesture-interruption.ts:61](../../../tests/e2e/motion-material-browser-gesture-interruption.ts) | impl-detail,flaky | prevent a delayed dismissal from closing a newly opened search |
| [tests/e2e/motion-material-browser-gesture-interruption.ts:81](../../../tests/e2e/motion-material-browser-gesture-interruption.ts) | flaky | prevent an interrupted transition from hiding the newly opened card |
| [tests/e2e/motion-material-browser-material-focus.ts:16](../../../tests/e2e/motion-material-browser-material-focus.ts) | impl-detail | prevent hidden navigation from becoming unreachable by keyboard |
| [tests/e2e/motion-material-browser-material-focus.ts:82](../../../tests/e2e/motion-material-browser-material-focus.ts) | impl-detail | prevent controls from becoming unreadable when backdrop blur is unavailable |
| [tests/e2e/motion-material-browser-material-focus.ts:112](../../../tests/e2e/motion-material-browser-material-focus.ts) | impl-detail,flaky | prevent hidden detail tools from remaining inaccessible to keyboard users |
| [tests/e2e/motion-material-browser-material-focus.ts:131](../../../tests/e2e/motion-material-browser-material-focus.ts) | impl-detail | prevent navigation pages from being dismissed as draggable drawers |
| [tests/e2e/navigation-recovery-browser-dialog-navigation.ts:61](../../../tests/e2e/navigation-recovery-browser-dialog-navigation.ts) | flaky | prevent a delayed update from reopening a dismissed detail |
| [tests/e2e/navigation-recovery-browser-dialog-navigation.ts:94](../../../tests/e2e/navigation-recovery-browser-dialog-navigation.ts) | impl-detail,flaky | prevent remote updates from losing detail scroll or keyboard focus |
| [tests/e2e/navigation-recovery-browser-dialog-navigation.ts:137](../../../tests/e2e/navigation-recovery-browser-dialog-navigation.ts) | flaky | prevent keyboard actions from losing focus or changing the wrong preference |
| [tests/e2e/navigation-recovery-browser-recovery-layout.ts:42](../../../tests/e2e/navigation-recovery-browser-recovery-layout.ts) | flaky | prevent an empty feed from making archived cards inaccessible |
| [tests/e2e/navigation-recovery-browser-recovery-layout.ts:67](../../../tests/e2e/navigation-recovery-browser-recovery-layout.ts) | flaky | Keep search and settings reachable without page overflow |
| [tests/e2e/navigation-recovery-browser.ts:54](../../../tests/e2e/navigation-recovery-browser.ts) | flaky | prevent navigation checks from depending on fixed animation delays |
| [tests/e2e/photo-toolbar-browser.ts:191](../../../tests/e2e/photo-toolbar-browser.ts) | impl-detail | prevent embedded photo controls from inheriting an unreadable host color |
| [tests/e2e/pwa-touch-browser.ts:115](../../../tests/e2e/pwa-touch-browser.ts) | impl-detail | prevent keyboard resizing or touch interaction from obscuring controls |
| [tests/e2e/refresh-motion-browser.ts:47](../../../tests/e2e/refresh-motion-browser.ts) | flaky,impl-detail | prevent a cancelled pull from dispatching a refresh or leaving content displaced |
| [tests/e2e/refresh-motion-browser.ts:89](../../../tests/e2e/refresh-motion-browser.ts) | flaky | prevent repeated pulls from starting concurrent refreshes or hiding feedback |
| [tests/e2e/refresh-motion-browser.ts:126](../../../tests/e2e/refresh-motion-browser.ts) | flaky,impl-detail | prevent failed refresh from blocking retry or ordinary scrolling |
| [tests/e2e/search-browser.ts:143](../../../tests/e2e/search-browser.ts) | flaky | prevent search, detail navigation or browser history from losing query and scroll position |
| [tests/e2e/search-filters-browser.ts:111](../../../tests/e2e/search-filters-browser.ts) | impl-detail | prevent the keyboard from covering the search field or leaving results unusable |
| [tests/e2e/search-filters-browser.ts:197](../../../tests/e2e/search-filters-browser.ts) | flaky | prevent a focused tag suggestion from disappearing or selecting the wrong cards |
| [tests/e2e/selection-browser-keyboard-actions.ts:24](../../../tests/e2e/selection-browser-keyboard-actions.ts) | impl-detail | prevent navigation from staying hidden or hiding while its input has focus |
| [tests/e2e/selection-browser-keyboard-actions.ts:60](../../../tests/e2e/selection-browser-keyboard-actions.ts) | flaky | prevent dragging a card into AI context from changing card data or leaving selection active |
| [tests/e2e/selection-browser-keyboard-actions.ts:84](../../../tests/e2e/selection-browser-keyboard-actions.ts) | flaky | prevent AI context from losing selected cards or changing source content |
| [tests/e2e/selection-browser-keyboard-actions.ts:125](../../../tests/e2e/selection-browser-keyboard-actions.ts) | flaky | prevent AI handoff from clearing the independent home selection or search query |
| [tests/e2e/selection-browser-press-menu.ts:31](../../../tests/e2e/selection-browser-press-menu.ts) | impl-detail | prevent bulk actions from losing accessible names or exposing removed menu controls |
| [tests/e2e/selection-browser-press-menu.ts:126](../../../tests/e2e/selection-browser-press-menu.ts) | flaky | prevent a stationary long press from opening a menu or changing card data |
| [tests/e2e/selection-browser-press-menu.ts:149](../../../tests/e2e/selection-browser-press-menu.ts) | flaky,impl-detail | prevent repeated holds from losing selection or leaving controls active |
| [tests/e2e/selection-browser-press-menu.ts:189](../../../tests/e2e/selection-browser-press-menu.ts) | flaky | prevent cancellation or window changes from leaving a stuck drag or changing cards |
| [tests/e2e/selection-browser-press-menu.ts:223](../../../tests/e2e/selection-browser-press-menu.ts) | flaky | prevent normal scrolling from failing or pull refresh from firing during selection |
| [tests/e2e/selection-browser-press-menu.ts:260](../../../tests/e2e/selection-browser-press-menu.ts) | flaky | prevent selected cards from triggering refresh or exposing a native drag payload |
| [tests/e2e/selection-browser.ts:74](../../../tests/e2e/selection-browser.ts) | flaky | prevent gesture scenarios from proceeding before selection and drag are active |
| [tests/e2e/selection-browser.ts:107](../../../tests/e2e/selection-browser.ts) | impl-detail | prevent drag previews from exposing duplicate interactive controls or incorrect card content |
| [tests/e2e/stack-browser.ts:20](../../../tests/e2e/stack-browser.ts) | flaky | prevent stack scenarios from running before the deck is ready |
| [tests/e2e/stack-browser.ts:66](../../../tests/e2e/stack-browser.ts) | impl-detail | prevent rapid keyboard input from dropping a card transition |
| [tests/e2e/stack-browser.ts:75](../../../tests/e2e/stack-browser.ts) | flaky | prevent pending wheel input from overriding a later keyboard action |
| [tests/e2e/stack-browser.ts:129](../../../tests/e2e/stack-browser.ts) | impl-detail | prevent touch swipes from skipping cards or moving past either end |
| [tests/e2e/stack-browser.ts:192](../../../tests/e2e/stack-browser.ts) | flaky | prevent vertical scrolling from changing cards or horizontal swipes from blocking opening |
| [tests/web/app-display.test.ts:129](../../../tests/web/app-display.test.ts) | over-mock | Hide navigation bars while a card is open below the feed top and restore them when closing starts |
| [tests/web/app-display.test.ts:204](../../../tests/web/app-display.test.ts) | over-mock,impl-detail | Show loaded covers without replaying a visible fade behind an open card |
| [tests/web/app.test.ts:7](../../../tests/web/app.test.ts) | over-mock | Open an internal card link in the existing surface |
| [tests/web/app.test.ts:167](../../../tests/web/app.test.ts) | impl-detail | Restore pointer press feedback after keyboard interaction |
| [tests/web/app.test.ts:198](../../../tests/web/app.test.ts) | over-mock,impl-detail | Reject unknown action names without invoking an action |
| [tests/web/app.test.ts:275](../../../tests/web/app.test.ts) | impl-detail | Keep the close control aligned after resizing every supported preview layout |
| [tests/web/chrome.test.ts:163](../../../tests/web/chrome.test.ts) | impl-detail | Keep dialog controls clear of the keyboard until it closes |
| [tests/web/chrome.test.ts:331](../../../tests/web/chrome.test.ts) | impl-detail | Keep navigation destinations and settings reachable without enabling unavailable AI actions |
| [tests/web/copy.test.ts:27](../../../tests/web/copy.test.ts) | impl-detail | Prevent missing shared copy keys from reaching the interface |
| [tests/web/core.test.ts:305](../../../tests/web/core.test.ts) | over-mock | Prevent duplicate history events from closing a newly opened panel |
| [tests/web/detail-motion-performance.test.ts:40](../../../tests/web/detail-motion-performance.test.ts) | impl-detail | prevents a visible backdrop flash during expansion |
| [tests/web/detail-motion-performance.test.ts:63](../../../tests/web/detail-motion-performance.test.ts) | impl-detail | prevents a stale backdrop after cancellation |
| [tests/web/detail-motion-performance.test.ts:140](../../../tests/web/detail-motion-performance.test.ts) | impl-detail | preserves the furthest reading position without writing on every scroll |
| [tests/web/detail-motion-performance.test.ts:186](../../../tests/web/detail-motion-performance.test.ts) | over-mock,impl-detail | prevents completion from being lost or a stale feed from appearing after closing |
| [tests/web/detail-motion-performance.test.ts:271](../../../tests/web/detail-motion-performance.test.ts) | impl-detail | Flush pending reading state before leaving a view |
| [tests/web/detail-motion-performance.test.ts:326](../../../tests/web/detail-motion-performance.test.ts) | impl-detail | prevents a video embed from blocking indefinitely or starting during detail entry |
| [tests/web/detail-motion.test.ts:6](../../../tests/web/detail-motion.test.ts) | over-mock,impl-detail | prevents a duplicate source card or a discontinuous detail entry |
| [tests/web/detail-motion.test.ts:48](../../../tests/web/detail-motion.test.ts) | over-mock,impl-detail | prevents the toolbar from remaining inaccessible after an interrupted entry |
| [tests/web/detail-motion.test.ts:90](../../../tests/web/detail-motion.test.ts) | over-mock,impl-detail | prevents duplicate or interactive content during the return to a card |
| [tests/web/detail-motion.test.ts:130](../../../tests/web/detail-motion.test.ts) | over-mock,impl-detail | prevents stale detail content or lost scroll position after interrupted navigation |
| [tests/web/detail-motion.test.ts:166](../../../tests/web/detail-motion.test.ts) | impl-detail | prevents duplicated interactive controls and missing content during detail navigation |
| [tests/web/detail-motion.test.ts:202](../../../tests/web/detail-motion.test.ts) | impl-detail | prevents the reader from jumping when a transition is interrupted |
| [tests/web/detail-motion.test.ts:227](../../../tests/web/detail-motion.test.ts) | over-mock,impl-detail | prevents an interrupted detail from jumping or retaining stale content |
| [tests/web/detail-motion.test.ts:253](../../../tests/web/detail-motion.test.ts) | over-mock,impl-detail | prevents duplicated media during reader expansion |
| [tests/web/detail-summary.test.ts:32](../../../tests/web/detail-summary.test.ts) | impl-detail | prevents summary text from being clipped or hidden after reopening |
| [tests/web/gesture-input.test.ts:23](../../../tests/web/gesture-input.test.ts) | impl-detail | prevents a decaying wheel tail from continuing a pull |
| [tests/web/gesture-rebound.test.ts:35](../../../tests/web/gesture-rebound.test.ts) | impl-detail | prevents old momentum from affecting the next surface without blocking new input |
| [tests/web/gesture-rebound.test.ts:59](../../../tests/web/gesture-rebound.test.ts) | over-mock,impl-detail | prevents content from remaining displaced after a touch ends |
| [tests/web/gesture-rebound.test.ts:81](../../../tests/web/gesture-rebound.test.ts) | over-mock,impl-detail | prevents a stationary release from pushing content outward again |
| [tests/web/gesture-refresh-continuity.test.ts:5](../../../tests/web/gesture-refresh-continuity.test.ts) | over-mock,impl-detail | prevents cards from remaining displaced after a wheel refresh |
| [tests/web/gesture-refresh-continuity.test.ts:37](../../../tests/web/gesture-refresh-continuity.test.ts) | over-mock,impl-detail | prevents cards from jumping or an old return from overriding a new pull |
| [tests/web/gesture-refresh-continuity.test.ts:84](../../../tests/web/gesture-refresh-continuity.test.ts) | over-mock,impl-detail | prevents cards from remaining displaced or loading feedback ending before the request |
| [tests/web/gesture-refresh-feedback.test.ts:5](../../../tests/web/gesture-refresh-feedback.test.ts) | over-mock,impl-detail | prevents refresh feedback from delaying results or disappearing before it can be read |
| [tests/web/gesture-refresh.test.ts:13](../../../tests/web/gesture-refresh.test.ts) | impl-detail | prevents the refresh indicator from appearing before a pull |
| [tests/web/gesture-refresh.test.ts:291](../../../tests/web/gesture-refresh.test.ts) | impl-detail | prevents short pulls or threshold crossing before release from refreshing |
| [tests/web/gesture-refresh.test.ts:347](../../../tests/web/gesture-refresh.test.ts) | impl-detail | prevents repeated activation from issuing concurrent refreshes |
| [tests/web/gesture-refresh.test.ts:457](../../../tests/web/gesture-refresh.test.ts) | over-mock,impl-detail | prevents an old success fade from hiding a new pull indicator |
| [tests/web/gesture-release.test.ts:107](../../../tests/web/gesture-release.test.ts) | impl-detail | prevents a held gesture from being mistaken for a flick while preserving a fresh flick |
| [tests/web/gesture-release.test.ts:124](../../../tests/web/gesture-release.test.ts) | over-mock,impl-detail | prevents content from flashing when an update interrupts its fade |
| [tests/web/gesture-surfaces.test.ts:5](../../../tests/web/gesture-surfaces.test.ts) | over-mock,impl-detail | prevents the backdrop from jumping or remaining dimmed after a cancelled drag |
| [tests/web/gesture-surfaces.test.ts:82](../../../tests/web/gesture-surfaces.test.ts) | impl-detail | prevents the current detail from remaining inaccessible after exit cancellation |
| [tests/web/gestures.test.ts:71](../../../tests/web/gestures.test.ts) | flaky | prevents a short pull from closing or collapsing a full preview |
| [tests/web/gestures.test.ts:139](../../../tests/web/gestures.test.ts) | impl-detail | prevents a delayed close from closing a replacement panel |
| [tests/web/gestures.test.ts:236](../../../tests/web/gestures.test.ts) | impl-detail | Delay closing and feed refresh until read completion is confirmed |
| [tests/web/gestures.test.ts:346](../../../tests/web/gestures.test.ts) | over-mock,impl-detail | prevents a detail from jumping or accepting another dismissal during exit |
| [tests/web/gestures.test.ts:381](../../../tests/web/gestures.test.ts) | over-mock,impl-detail | prevents a fast release from making the detail jump back before closing |
| [tests/web/gestures.test.ts:430](../../../tests/web/gestures.test.ts) | impl-detail | prevents detail tools from reappearing before a completed reading view closes |
| [tests/web/home-search-motion.test.ts:48](../../../tests/web/home-search-motion.test.ts) | over-mock,impl-detail | prevents a stale exit from removing a reopened list or exposing closed options to interaction |
| [tests/web/home-search-motion.test.ts:107](../../../tests/web/home-search-motion.test.ts) | over-mock,impl-detail | prevents a disappearing clear button from receiving focus |
| [tests/web/layout.test.ts:86](../../../tests/web/layout.test.ts) | impl-detail | Release stale card height when column width changes |
| [tests/web/layout.test.ts:126](../../../tests/web/layout.test.ts) | impl-detail | Keep phone cards positioned correctly after interrupting desktop animation |
| [tests/web/markdown.test.ts:169](../../../tests/web/markdown.test.ts) | flaky | Prevent malformed references from stalling text parsing |
| [tests/web/motion-sheet.test.ts:61](../../../tests/web/motion-sheet.test.ts) | impl-detail | Preserve text scale and scroll position while expanding |
| [tests/web/motion-sheet.test.ts:97](../../../tests/web/motion-sheet.test.ts) | impl-detail | Continue from the visible sheet position and ignore old completion |
| [tests/web/navigation.test.ts:90](../../../tests/web/navigation.test.ts) | impl-detail | Keep long return journeys within the intended duration |
| [tests/web/nested-navigation.test.ts:139](../../../tests/web/nested-navigation.test.ts) | impl-detail | Keep the new card when an earlier exit completes |
| [tests/web/nested-navigation.test.ts:205](../../../tests/web/nested-navigation.test.ts) | impl-detail | Prevent reading position and parent history from crossing accounts |
| [tests/web/nested-navigation.test.ts:265](../../../tests/web/nested-navigation.test.ts) | impl-detail | Restore the child scroll position when reopening during exit |
| [tests/web/nested-navigation.test.ts:326](../../../tests/web/nested-navigation.test.ts) | impl-detail | Restore the feed position after closing a phone page |
| [tests/web/phone-drawer.test.ts:154](../../../tests/web/phone-drawer.test.ts) | impl-detail | Restore feed position and content after closing the drawer |
| [tests/web/phone-drawer.test.ts:244](../../../tests/web/phone-drawer.test.ts) | flaky,impl-detail | Close a drawer with a downward drag over a scrolled feed |
| [tests/web/pwa-launch-motion.test.ts:19](../../../tests/web/pwa-launch-motion.test.ts) | impl-detail | Keep the sheet opaque while its backdrop appears |
| [tests/web/pwa-launch-motion.test.ts:43](../../../tests/web/pwa-launch-motion.test.ts) | impl-detail | Restore the backdrop after a queued sheet is cancelled |
| [tests/web/pwa-launch-motion.test.ts:65](../../../tests/web/pwa-launch-motion.test.ts) | impl-detail | Make the backdrop follow an interrupted drag |
| [tests/web/pwa-launch-motion.test.ts:88](../../../tests/web/pwa-launch-motion.test.ts) | impl-detail | Continue closing from the currently visible backdrop opacity |
| [tests/web/reading-feedback.test.ts:69](../../../tests/web/reading-feedback.test.ts) | impl-detail | Mark content read at the end and preserve the open detail |
| [tests/web/refresh-feedback.test.ts:23](../../../tests/web/refresh-feedback.test.ts) | over-mock,impl-detail | Report pull refresh failure without duplicate loading feedback |
| [tests/web/search-navigation.test.ts:77](../../../tests/web/search-navigation.test.ts) | impl-detail | Keep category content visible and noninteractive during the transition |
| [tests/web/search-navigation.test.ts:97](../../../tests/web/search-navigation.test.ts) | impl-detail | Restore search without a stale keyboard offset |
| [tests/web/search-state.test.ts:231](../../../tests/web/search-state.test.ts) | over-mock | Close the AI page and remove retained search when leaving the route |
| [tests/web/search-state.test.ts:392](../../../tests/web/search-state.test.ts) | over-mock | Prevent repeated close requests from skipping a history entry |
| [tests/web/search-state.test.ts:487](../../../tests/web/search-state.test.ts) | flaky | Keep the source card visible until detail closes and then update favorites |
| [tests/web/stage-four-motion.test.ts:49](../../../tests/web/stage-four-motion.test.ts) | impl-detail | Preserve the draft and visible position when collapse is interrupted |
| [tests/web/stage-four-motion.test.ts:95](../../../tests/web/stage-four-motion.test.ts) | impl-detail | Preserve focus and navigation ownership when search transition reverses |
| [tests/web/toggle-motion.test.ts:5](../../../tests/web/toggle-motion.test.ts) | impl-detail | Keep the switch's visible progress when settings redraw |
| [tests/web/toggle-motion.test.ts:27](../../../tests/web/toggle-motion.test.ts) | over-mock,impl-detail | Reverse the switch from its current visible position |
| [tests/web/visibility-motion.test.ts:7](../../../tests/web/visibility-motion.test.ts) | impl-detail | Cancel pointer feedback without triggering a task click |
| [tests/web/visibility-motion.test.ts:49](../../../tests/web/visibility-motion.test.ts) | impl-detail | Restore the correct visible state after chrome moves |
| [tests/web/visibility-motion.test.ts:72](../../../tests/web/visibility-motion.test.ts) | impl-detail | Keep the header visible after a rapid hide and show |
| [tests/web/visibility-motion.test.ts:197](../../../tests/web/visibility-motion.test.ts) | impl-detail | Keep host press feedback independent of pseudo-element motion |
| [tests/web/visibility-motion.test.ts:218](../../../tests/web/visibility-motion.test.ts) | impl-detail | Prevent a canceled card entry from reappearing |
