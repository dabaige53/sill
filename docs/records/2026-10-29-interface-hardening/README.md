# 跨端界面健壮性检查

日期：2026-10-29。状态：源码已修复，运行与视觉待验证。

## 范围与依据

本轮读取 Web 云端入口、错误恢复条、备份设置、共享设置布局，以及 Mac Account、BackupModel、BackupSettingsView。手机检查对象为同一 Web/PWA 页面；原生 iOS 当前仅有 SillMobile 存储入口。本记录不是全系统验收。

## 问题与处理

- Web 备份保存期间允许编辑输入，成功后 form.reset() 会清掉等待期间新输入的内容。现与 Mac 一致，操作期间禁用字段，失败保留原输入，并给区域标记 aria-busy。
- Web/PWA 备份行不允许换行，长目标地址与多个操作在小屏存在溢出风险。只为备份区域添加换行、输入与选择框最大宽度约束，不改变其他设置布局。
- 错误恢复条的消息缺少长字符串断行约束。补充 overflow-wrap 与可收缩宽度，保留恢复操作。

## Mac 与手机边界

Mac 备份界面已有整体 busy 禁用，Account 已区分权限、限流、网络错误，本轮未修改 Swift。手机沿用 Web 修补。未改动工作区原有手机样式及测试修改。

## 验证与后续

### Web 搜索画板诊断（2026-10-29）

- 状态：已验证。最初 59 条画板诊断，先修复搜索容器 label 嵌套，随后按用户授权处理剩余 57 条。
- 原因：通用 html-validate 推荐规则禁止内联样式、不识别画板运行时 helmet，并建议将自定义 listbox 改为 select；类型 fieldset 缺少 legend。
- 处理：54 处内联样式提取为 44 条复用样式，保留原属性值；补充隐藏 legend 和 combobox 的 aria-controls。helmet 与可编辑 combobox 的候选 listbox 各添加一处带原因的单元素校验例外，不修改全局配置。
- 验证：按报告命令调用 diagnostics_backend.py，form-controls.css 与 ScreenWebSearch.dc.html 均为 passed，diagnostics 均为空。未执行浏览器视觉验收。

本轮仅做源码和文件检查。未运行本地程序测试、构建、浏览器自动化或 Mac 窗口自动化，未作真机验收、部署。后续需在 CI 验证，并检查小屏长地址、失败后保留输入、保存期间禁用及恢复后的输入行为。

## Web 桌面重复字标（2026-10-29）

- 状态：已修复待界面验证。用户在本地开发页看到两个 Sill，菜单中的字标偏小。
- 原因：字标组件当前使用 sill-wordmark，而分栏入口的隐藏与字号规则仍匹配旧的 sill-wordmark-wrap，两个规则均未命中。
- 处理：将桌面原字标隐藏规则与菜单字标字号规则改为当前类名；手机原字标和现有字体不变。
- 检查：文件检查与差异检查通过；未执行浏览器自动化和构建，实际显示待确认。

### 轻操作保存反馈（2026-10-29）

- 状态：源码已调整，CI 与界面验证待执行。
- 定位：Web 备注动作在 Store.patch 后立即提示“已保存”，此时服务器请求尚未完成；普通保存错误同时显示 alert 和恢复条。收藏、任务与归档已有就地变化，不能把它们误报为没有反馈。
- 处理：移除备注动作中的提前成功提示；普通失败仅保留现有恢复条，认证失败保留登录相关提示。共用恢复条位置展示超过 800ms 的保存等待，只有收到实际写入回执、队列清空后才显示短暂成功。快速保存和纯阅读计时保持安静；放弃草稿不产生成功回执。
- 恢复入口核对：重试沿用原请求键和正文，导出实际草稿，使用服务端版本经过确认后重载；不是占位按钮，本轮保留。
- 平台：本次仅改 Web/PWA。Mac CloudWorkspace 独立维护 pending 请求及错误，不使用上述备注 toast；未改 Swift，未做跨端运行验收。
- 验证：补充 CloudSync 回执断言，覆盖失败无回执、重试成功有回执、清空草稿不产生回执；按项目规定留给 CI 执行。未运行浏览器自动化。

## 多选稍后读按钮（2026-10-29）

- 状态：已在隔离浏览器与临时数据库验证；未部署生产。
- 环境与触发：Web 主页和搜索页选中卡片，点击稍后读后再次点击，无法取消且按钮不显示已开启。
- 定位依据：`app-feed-updates.ts` 的 `applySelectionAction` 对 later 固定写 true；`app-selection.ts` 只同步收藏按钮状态。
- 处理：稍后读沿用详情页的开关含义。全部已开启时批量取消，混合状态时全部开启；同步 active、aria-pressed 和提示名称，保留选择。
- 补充定位：实际点击搜索多选按钮时，Playwright 报告 `ai-dock-input intercepts pointer events`。`updateSelection` 原来排除了桌面搜索场景，导致 AI 输入框仍占据多选栏的点击区域。现让搜索多选与主页多选共用 AI 栏收起及恢复逻辑。
- 验证：用户明确要求完整验证后，运行 `selection.test.ts`、`cloud-sync.test.ts`、`cloud-workspace.test.ts`，28 项全部通过。针对当前源码生成云端测试页面，`cloud-operations-browser.ts` 通过真实 Chromium 点击、服务端 HTTP 与临时 PGlite 数据库完成验证；使用合成账号，不连接生产。
- 覆盖：主页与搜索多选稍后读开启和取消、混合状态统一开启、未选卡片不变、刷新恢复；收藏开启和取消；批量标签与备注保存；AI 上下文与取消选择不写卡片；批量原子性、丢失回执重试保持请求内容与幂等键、冲突不覆盖服务器数据、会话过期清理。搜索回归在修复前因真实点击被 AI 输入框截获而失败，修复后通过。
- 限制：认证上游由测试夹具模拟，数据库使用项目 SQL 的隔离执行环境；不代表生产网络、托管数据库或线上版本已验收。未执行全项目 e2e。

## 全量按钮审查与发布跟进（2026-10-29）

状态：进行中，未发布。当前审查覆盖源码调用路径，不能替代实际点击验收。

| 入口 | 已核对的执行路径 | 当前结论 |
| --- | --- | --- |
| Web 收藏、稍后读、任务、阅读、归档、标签、备注 | actions → Store → CloudSync 差异批次 → 服务端写入 | 有真实请求路径；已有 cloud-operations 回归，待当前提交 CI |
| Web 减少此类内容 | cloud-entry 覆盖本地动作，写 lessLike | 云端不是仅 toast 的本地实现 |
| Web 清空、偏好 | Store 删除差异和 preferences.patch → CloudSync | 有服务端路径，继续核对权限及恢复 |
| Web 备份 | BackupSettings → /api/v1/backups，含创建、检查、下载、恢复状态 | 有请求路径，继续核对全部按钮及失败回执 |
| Mac 多选稍后读 | SelectionIntents → Workspace.mark → queue.write | 修复固定开启；全部开启时取消，混合状态全部开启；保存期间禁用 |
| AI 发送、语音等 | 产品明确禁用，未连接内置 AI | 不计作已实现能力，保留既定产品边界 |

云端备注原提示实际为“已保存在本机；同步状态见桌面”，不是服务端成功回执。移除重复 toast，沿用共用同步反馈。上一轮说明中的“提前提示成功”应以此处准确文案为准。

当前远端 ef056b10 的检查：Verify Sill 因 Web 格式失败；Sill integration 的 463 项核心检查中 462 通过，controls.css 的 CSS transition 违反现行动效检查；Verify Sill macOS 因 RecipeBody.swift 和 AIConversationViews.swift 格式失败。已按日志格式化对应文件，动效冲突仍待修复。认证数据与授权策略工作流成功，不代表本次修改已验证。

后续：补足按钮清单及行为证据、修复发布阻塞、提交推送并检查同一提交的 CI，按发布手册准备版本与部署回执。未执行本地完整测试、构建或新的窗口自动化。

### 发布检查纠正

- `b3a6a787` 已推送 main。Web 格式仍失败，日志指出 foundation.json；已只调整格式。
- 动效手册第 9 行明确允许桌面搜索及 AI 胶囊材质层的 CSS opacity transition。此前判为实现冲突不准确；现只在样式检查中精确允许 `.ai-dock-surface::after` 的 `opacity var(--dur-hover) var(--ease)`，不删除效果、不放开其他属性或选择器。
- 提交钩子要求单独暂存、单独提交；云端操作测试超过 20,000 字节，已把多选场景移入 `tests/e2e/helpers/cloud-selection-operations.ts`，由原入口调用，保留断言与执行顺序。
- 源码静态入口扫描发现 `ai-result-retry` 没有动作处理，但 Web 的 aiConnected 与 Mac 的 connected 当前均为 false，相关入口禁用；未来启用内置 AI 时必须补实现，不计作当前有效按钮。

### 账号、设置与备份调用链

Mac 独立源码复核：设置与重置通过 Workspace.write(.preferences) 保存；清空经 Workspace.clear 按读取基准删除；导出当前已读状态并写入用户选择的文件。退出通过 CloudWorkspace POST /auth/logout。备份设置保存、连接检查、创建、刷新、预览、校验、下载、恢复和恢复状态均经 BackupModel → Account.backupRequest → CloudWorkspace.backupRequest 发 HTTP；服务端保存目标前实际检查 provider。失败由模型显示错误，恢复冲突清理预览，未知恢复沿用原请求。此范围未发现空动作；上述结论不等于真机验收。现有 BackupModelTests 对目标保存、检查、创建、下载等按钮绑定缺少直接覆盖。

Web 备份按钮逐项核对为 /api/v1/backups 的 POST/GET 调用；下载响应后生成文件，取消恢复仅关闭预览。账号退出 POST /auth/logout 成功后清理状态。导出生成当前工作区快照文件，本身无需新增服务端写入。系统通知开关使用浏览器权限和设备偏好，不应伪装为云端通知订阅。导航、照片前后切换和多选上下文操作本身无需服务器写入。

`c2be8fd7` 的 CI 进一步指出搜索材质层同样被旧样式检查拒绝；按同一手册只允许 `.home-search::after` 的既定 opacity 过渡。多选辅助测试的 forEach 回调违反 lint，改为不返回值的 for-of；本地只读 Biome 错误级检查通过。

### 线上迁移与剩余按钮证据

用户明确授权执行数据库迁移。线上查询确认 public/private 的 get_workspace_since 函数均不存在后，执行 `20261029160000_workspace_conditional_read.sql` 成功。重新查询：两个函数存在，authenticated 可执行公共函数，anon 不可执行。未清空数据，未改动账号；迁移只新增条件读取函数。

Mac 卡片菜单、阅读器工具栏和多选通过 DesktopView 的 cardIntents/selectionIntents 绑定至 Workspace、reader 或 panels；邮件外链成功打开后标已读，外链失败有提示。视频使用官方播放器，失败有重试；播客提供信息与外链；照片边界按钮禁用，前后切换和关闭有绑定；日历导出打开系统保存面板并报告失败。源码审查未发现当前开放按钮的空回调，实际窗口仍未验收。AI 失败重试保留空回调，但 connected 恒 false，入口未开放。

云端操作回归新增已读双向切换、提醒忽略、排序和恢复默认布局的服务端重新读取断言。不是只检查本地状态；待 CI 执行后记录结果。

### 1.2.14 发布候选

- 线上兼容性：对全部 60 张未删除卡片执行现行 validate_card 校验，60 次调用均完成，无错误；只返回总数，未读取卡片正文到日志。条件读取函数已安装，权限检查符合预期。
- 发布范围：沿用现有云端 Web/MCP Worker，并由正式工作流生成内部测试 Mac 安装包；不更新插件技能包。
- 候选版本：1.2.14。源码检查与部署尚待 tag 工作流完成，不预先宣称发布成功。
