# 功能补齐状态

沿用[原功能清单](../2026-10-28-macos-parity-audit/function-checklist.md)的62项编号。已补表示源码处理，不等于窗口验收通过。所有项目的跨端窗口验收仍为未执行；后台验证范围见[总览](README.md)。

| 编号 / 检查项 | 状态 | 当前实现与边界 | 实现入口 |
| --- | --- | --- | --- |
| F01 分类滚动位置和分页 | 前批已补 | 各分类保存分页和滚动位置，布局完成后恢复。 | [Feed.swift](../../../apps/apple/macOS/Model/Feed.swift) |
| F02 搜索/类型条件改变后的结果位置 | 前批已补 | 查询、类型和条件变化回第一页顶部。 | [Feed.swift](../../../apps/apple/macOS/Model/Feed.swift) |
| F03 T / 品牌回顶的筛选语义 | 前批已补 | T和品牌即时回顶，保留全部条件。 | [DesktopView.swift](../../../apps/apple/macOS/Shell/DesktopView.swift) |
| F04 状态更新的卡片高度与阅读锚点 | 本次已补 | 稳定ID缓存卡片最小高度；列宽变化才释放，正文淡入不影响卡壳。 | [MasonryLayout.swift](../../../apps/apple/macOS/Feed/MasonryLayout.swift) |
| F05 阅读关闭时的筛选成员重算 | 本次已补 | 阅读关闭重算筛选成员，原卡仍存在才恢复焦点。 | [DesktopView.swift](../../../apps/apple/macOS/Shell/DesktopView.swift) |
| F06 批量收藏/稍后读状态 | 本次已补 | 保留批量操作语义；队列空闲等待保存结果已应用，修正立即撤销的状态交接。 | [WriteQueue.swift](../../../apps/apple/macOS/Model/WriteQueue.swift) |
| F07 提醒动作后的详情/选中 | 本次已补 | 提醒动作后移除该卡选择；完成/恢复保留详情，延后/忽略关闭并刷新。 | [DesktopView.swift](../../../apps/apple/macOS/Shell/DesktopView.swift) |
| F08 叠卡形成规则 | 保留一致 | 同来源、未读、1小时内、大于5张且无筛选才形成叠卡。 | [Feed.swift](../../../apps/apple/macOS/Model/Feed.swift) |
| F09 叠卡宽度变化后的阈值 | 本次已补 | 持续测量卡宽，拖动阈值与离场距离随窗口更新。 | [FeedView.swift](../../../apps/apple/macOS/Feed/FeedView.swift) |
| F10 叠卡纵向拖动判定 | 本次已补 | 6px后锁定方向，纵向交给原生滚动，松手不误打开卡组。 | [FeedView.swift](../../../apps/apple/macOS/Feed/FeedView.swift) |
| F11 阅读会话的已存进度恢复 | 本次已补 | 新阅读会话按已存比例恢复，接近读完从头；同会话保留实际位置。 | [ReaderScroll.swift](../../../apps/apple/macOS/Reader/ReaderScroll.swift) |
| F12 嵌套阅读层的位置及返回 | 本次已补 | 父层保持挂载及位置；保存原响应控件，返回恢复链接焦点。 | [Reader.swift](../../../apps/apple/macOS/Model/Reader.swift) |
| F13 阅读层焦点进入与背景隔离 | 本次已补 | 打开聚焦阅读层，禁用背景、下层及被面板覆盖的阅读输入。 | [ReaderOverlay.swift](../../../apps/apple/macOS/Reader/ReaderOverlay.swift) |
| F14 嵌套层阅读计时 | 本次已补 | 仅当前全屏层、应用活跃、无面板且近60秒有输入时计时。 | [ReaderPage.swift](../../../apps/apple/macOS/Reader/ReaderPage.swift) |
| F15 短内容连续可见停留 | 本次已补 | 短内容要求连续可见，失焦和被覆盖会中断停留。 | [ReaderScroll.swift](../../../apps/apple/macOS/Reader/ReaderScroll.swift) |
| F16 实际刷新阶段 | 本次已补 | 真实回执决定结果；失败立即显示，成功保留加载与结果停留。 | [FeedRefresh.swift](../../../apps/apple/macOS/Model/FeedRefresh.swift) |
| F17 R快捷键的刷新反馈 | 本次已补 | R和⌘R复用同一刷新状态机。 | [DesktopView.swift](../../../apps/apple/macOS/Shell/DesktopView.swift) |
| F18 核心鼠标/键盘打开与Esc层级 | 本次已补 | 叠卡补Space，方向键即时翻页，保留普通卡选择和Esc层级。 | [FeedView.swift](../../../apps/apple/macOS/Feed/FeedView.swift) |
| F19 来源加载占位的实际入口 | 保留一致 | 直接显示本地已有正文，不制造来源加载。 | [ReaderContent.swift](../../../apps/apple/macOS/Reader/ReaderContent.swift) |
| U01 AI 引用条位置 | 前批已补 | 引用独立放在输入表面上方8px，多行向上占位。 | [AIDock.swift](../../../apps/apple/macOS/Shell/AIDock.swift) |
| U02 AI 收起后的尺寸与位置 | 本次已补 | 折叠为原输入行右侧60×60气泡。 | [AIDock.swift](../../../apps/apple/macOS/Shell/AIDock.swift) |
| U03 AI 水平移动边界与缩放窗口 | 本次已补 | 按实际宽度限制边界，反向立即跟手，窗口变化保留相对位置。 | [AIDock.swift](../../../apps/apple/macOS/Shell/AIDock.swift) |
| U04 AI 当前能力与草稿 | 保留一致 | 保留草稿与引用，发送/语音仍禁用，不表示助手已接入。 | [AIDock.swift](../../../apps/apple/macOS/Shell/AIDock.swift) |
| U05 搜索框及候选排版 | 本次已补 | 315宽搜索、16图标、40高候选、14标题、右侧48宽类型列。 | [SearchField.swift](../../../apps/apple/macOS/Shell/SearchField.swift) |
| U06 搜索分组与无结果反馈 | 本次已补 | 状态/标签分组、无结果文字、读屏候选数量。 | [SearchField.swift](../../../apps/apple/macOS/Shell/SearchField.swift) |
| U07 搜索候选悬停与滚动 | 本次已补 | 悬停只换高亮；键盘单独请求滚入视口。 | [SearchField.swift](../../../apps/apple/macOS/Shell/SearchField.swift) |
| U08 搜索键盘与输入法 | 本次已补 | Tab/Home/End/删除保护组词，再聚焦定位已选项；完整输入法操作待窗口核对。 | [SearchField.swift](../../../apps/apple/macOS/Shell/SearchField.swift) |
| U09 标签批量输入与去重 | 本次已补 | 中英文逗号和换行拆分，忽略大小写去重，保留30字符/20条限制。 | [EditorPanel.swift](../../../apps/apple/macOS/Shell/EditorPanel.swift) |
| U10 标签退格操作 | 本次已补 | 空输入第一次退格选末标签、第二次删除；输入解除选择，组词不截获。 | [EditorPanel.swift](../../../apps/apple/macOS/Shell/EditorPanel.swift) |
| U11 登录校验和显隐状态 | 本次已补 | 邮箱格式/254字符、密码256字符限制及Eye/EyeOff；原生安全输入切换保留值并恢复焦点，选区和密码管理器待实测。 | [CloudLogin.swift](../../../apps/apple/macOS/Shell/CloudLogin.swift) |
| U12 登录失败后的输入保留 | 本次已补 | 失败保留密码，成功后清空。 | [CloudLogin.swift](../../../apps/apple/macOS/Shell/CloudLogin.swift) |
| U13 账号头像内容 | 本次已补 | 账号name/email首字符，无信息时显示person图标。 | [TopBar.swift](../../../apps/apple/macOS/Shell/TopBar.swift) |
| U14 设置结构与尺寸 | 本次已补 | 四组设置固定外框，按窗口可用高度收缩，内容独立滚动。 | [SettingsView.swift](../../../apps/apple/macOS/Settings/SettingsView.swift) |
| U15 云端数据设置内容 | 本次已补 | 云端隐藏本地使用量，存储/导出/清空/退出采用对应行与文案。 | [SettingsDataPage.swift](../../../apps/apple/macOS/Settings/SettingsDataPage.swift) |
| U16 备份配置必填校验 | 本次已补 | 必填字段未齐时禁止保存和连接检查。 | [BackupSettingsView.swift](../../../apps/apple/macOS/Settings/BackupSettingsView.swift) |
| U17 备份配置保存后的表单 | 本次已补 | 成功后重置整个配置输入，更新已保存摘要。 | [BackupSettingsView.swift](../../../apps/apple/macOS/Settings/BackupSettingsView.swift) |
| U18 系统提醒能力 | 原生保留 | 保留系统通知，不模拟浏览器生命周期限制。 | [SystemReminders.swift](../../../apps/apple/macOS/Notifications/SystemReminders.swift) |
| U19 登录页布局与焦点颜色 | 本次已补 | 56高字段、16间距、焦点颜色、浮动标签及24高状态区，等待显示在按钮内。 | [CloudLogin.swift](../../../apps/apple/macOS/Shell/CloudLogin.swift) |
| U20 分栏菜单、提示及遮挡 | 源码补齐 | 菜单锚点、取消令牌和键盘路径已补；提示暂停逻辑已核对，叠加遮挡待窗口验证。 | [ScopeMenu.swift](../../../apps/apple/macOS/Shell/ScopeMenu.swift) |
| U21 窗口、主题与文本完整性 | 待窗口验证 | 同列重排、设置尺寸和长文本已补；最小窗口、主题、玻璃及字体实际测量待验。 | [DesktopView.swift](../../../apps/apple/macOS/Shell/DesktopView.swift) |
| C01 文章目录层级 | 本次已补 | 相对最浅标题缩进12px，最多两级。 | [ReaderPage.swift](../../../apps/apple/macOS/Reader/ReaderPage.swift) |
| C02 文章目录字体 | 本次已补 | 目录15px普通字重、16px List、6px圆点和强调色揭示。 | [ReaderPage.swift](../../../apps/apple/macOS/Reader/ReaderPage.swift) |
| C03 播客来源 | 本次已补 | 播客来源有URL时显示外链及箭头。 | [PodcastDetail.swift](../../../apps/apple/macOS/Reader/PodcastDetail.swift) |
| C04 播客空信息 | 本次已补 | 无信息字段时隐藏空信息标题。 | [PodcastDetail.swift](../../../apps/apple/macOS/Reader/PodcastDetail.swift) |
| C05 任务卡面 | 本次已补 | 固定三条任务预览顺序，勾选不即时换位。 | [CardState.swift](../../../apps/apple/macOS/Model/CardState.swift) |
| C08 播客主体 | 前批已补 | 保留只读播客介绍、记录、章节和摘录，不恢复播放器。 | [PodcastDetail.swift](../../../apps/apple/macOS/Reader/PodcastDetail.swift) |
| C09 PR 空结构 | 约定外保留 | 正式校验要求PR结构，不为无效输入新增空结构详情或改变契约。 | [PullRequestContent.swift](../../../apps/apple/macOS/Reader/PullRequestContent.swift) |
| C10 PR 作者 | 本次已补 | 保留并显示author.login，姓名独立保留。 | [CardRichFields.swift](../../../apps/apple/macOS/Model/CardRichFields.swift) |
| C11 PR 文件路径 | 本次已补 | PR文件路径改为末尾截断。 | [PullRequestContent.swift](../../../apps/apple/macOS/Reader/PullRequestContent.swift) |
| C12 照片封面布局稳定 | 保留一致 | 保留16:9容器和二/三图比例，慢加载实际位置待验。 | [CardBodies.swift](../../../apps/apple/macOS/Feed/CardBodies.swift) |
| C13 文章目录设计依据 | 依据已统一 | 手册统一为左侧32px紧凑目录，旧右侧规则被替代。 | [ReaderPage.swift](../../../apps/apple/macOS/Reader/ReaderPage.swift) |
| C14 视频文字稿跟随 | 本次已补 | 仅播放中且开启跟随时将当前行滚到最近可见位置。 | [MediaDetail.swift](../../../apps/apple/macOS/Reader/MediaDetail.swift) |
| C15 建议依据 | 本次已补 | 展示全部why.basis，不再截成五条。 | [ReaderContent.swift](../../../apps/apple/macOS/Reader/ReaderContent.swift) |
| C16 摘要来源 | 本次已补 | 缺少完整覆盖日期时回退卡片来源。 | [ReaderContent.swift](../../../apps/apple/macOS/Reader/ReaderContent.swift) |
| C17 关联卡片空列表 | 本次已补 | 关联ID全部不可用时隐藏区块。 | [ReaderContent.swift](../../../apps/apple/macOS/Reader/ReaderContent.swift) |
| C18 单张照片灯箱 | 本次已补 | 单张照片也展示缩略图。 | [PhotoLightbox.swift](../../../apps/apple/macOS/Reader/PhotoLightbox.swift) |
| C19 邮件卡面长文本 | 本次已补 | 邮件发件人和来源允许换行。 | [CardBodies.swift](../../../apps/apple/macOS/Feed/CardBodies.swift) |
| C20 Markdown 标题字号 | 本次已补 | H1/H2为20、H3–H6为18，随阅读字号缩放。 | [MarkdownText.swift](../../../apps/apple/macOS/Reader/MarkdownText.swift) |
| C21 Markdown 代码块 | 本次已补 | 代码块独立背景、12内边距、8圆角和水平滚动。 | [MarkdownText.swift](../../../apps/apple/macOS/Reader/MarkdownText.swift) |
| C22 日程会议详情 | 本次已补 | 会议名称和码上下排列，长内容换行。 | [DetailRows.swift](../../../apps/apple/macOS/Reader/DetailRows.swift) |
| C23 文件和附件链接 | 约定外保留 | 正式文件/附件只接受HTTP(S)，保留原有外链验证，不扩展非法输入。 | [ExternalLink.swift](../../../apps/apple/macOS/Reader/ExternalLink.swift) |
| C24 照片说明间距 | 本次已补 | 说明后4px显示地点日期，空元信息不占行，缩略图水平滚动。 | [PhotoLightbox.swift](../../../apps/apple/macOS/Reader/PhotoLightbox.swift) |

## 卡片与完整流程

原清单的13组卡片用例（12种类型，媒体分视频/播客）全部保留。article/note对应目录、阅读和Markdown；PR/mail/event对应作者、路径和长文本；task/reminder对应顺序及状态；视频/播客对应跟随、来源和空信息；digest/suggestion对应来源、依据和关联；photo/file对应分页、缩略图和外链。全部仍需同数据的窗口核对。

| 流程 | 关联处理与后台证据 | 运行边界 |
| --- | --- | --- |
| B01 登录/会话/退出 | U11/U12/U13/U19；Account测试通过 | 真实账号未登录 |
| B02 同步/离线/恢复 | F16；CloudWorkspace和未知结果测试通过 | 真实网络未验 |
| B03 分类/搜索/分页 | F01–F03、U05–U08；Feed测试通过 | 窗口未验 |
| B04 初次加载/空列表/分页/新增删除 | F01/F04/F08/F16；分页、新内容和刷新测试通过 | 窗口未验 |
| B05 单卡轻操作 | F04/F05；状态及失败回滚测试通过 | 窗口未验 |
| B06 批量操作 | F06；批量收藏及立即撤销测试通过 | 窗口未验 |
| B07 标签/备注 | U09/U10；拆分、去重和基准保存测试通过 | 窗口未验 |
| B08 并发/未知写入 | 编辑冲突及未知结果核对测试通过 | 双客户端实测未执行 |
| B09 任务/提醒 | C05/F07；任务顺序及状态测试通过 | 窗口未验 |
| B10 归档/恢复 | 保留功能；Archive测试通过 | 未操作用户数据 |
| B11 阅读/嵌套 | F11–F15；位置恢复、层级及手势状态测试通过 | 窗口未验 |
| B12 视频播放 | C14/A10；播放中跟随已补 | 未操作真实媒体 |
| B13 设置 | U14/A33/A34；Settings测试通过 | 窗口未验 |
| B14 导出/清空 | U15；隔离工作区清空测试通过 | 未清空用户数据 |
| B15 备份/恢复 | U16/U17；BackupModel测试通过 | 未操作真实备份 |
| B16 键盘/读屏/层级 | F12/F13/F18/U20；DesktopInteraction测试通过 | Tab和VoiceOver未实测 |
| B17 窗口/主题 | U21；静态检查及构建 | 未启动或操作窗口 |
| B18 来源/助手边界 | U04/F19/C23；保留外部助手与MCP边界 | 未触发外部操作 |
