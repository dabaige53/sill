# Web ↔ Mac 功能验证清单

本表逐项比较当前 Web 桌面与 Mac 的功能、内容和位置。基准为 `f285b0af` 加本次工作区的未提交修改；产品版本1.2.8。它是2026-10-28的源码核对和待执行验收记录，不代表这些项目已通过运行验证。

每项依次记录 Web 行为、Mac 行为、差异和操作验收。所有表内的**运行验证均为未执行**，只有U01有用户截图观察；截图的具体构建版本未知。编号只在本记录内使用，不替代长期跨端检查清单编号。

状态含义：**确定差异**为两端源码已经不同；**源码一致待实测**只覆盖所列字段或参数；**待核实**需要更多路径或实际操作证据；**依据冲突**不能混用现行手册和当前Web；**已约定平台差异**有现行依据；**约定外差异**只涉及当前正式约定不接受的数据。P1先处理内容遗漏、错操作、跳位和主要交互；P2处理排版、反馈与节奏；P3为当前正式数据约定之外的问题。

执行时用同一账号、同一工作区、相同卡片ID及版本、相同筛选和主题，并记录两端可用内容区宽高。浏览器缩放100%；Mac记录显示缩放与应用构建。涉及修改的数据用隔离样例。凭据不进入记录。每项结果填写：Web结果、Mac结果、差异、证据和构建版本；修复后只复核对应项与直接关联项。

动效、速度、曲线和连续操作另见[动效清单](animation-checklist.md)。总体结论及依据冲突见[总览](README.md)。

## 1. 信息流、状态与阅读位置

| 编号 / 检查项 | Web 当前基准 | Mac 当前事实与影响 | 源码结论 | 优先级 | 证据（项目相对路径:行） | 操作与验收标准 |
| --- | --- | --- | --- | --- | --- | --- |
| F01 分类滚动位置和分页 | 切换前保存当前分类 scroll、limit；切回恢复，两分类独立。 | `select` 每次 limit=40；`scrollOffsets` 和 `scopeVersion` 没有视图消费者。不能恢复分类位置和已加载页，切回可能因内容缩短而跳位。 | 确定差异 | P1 | Web `apps/web/views/actions/navigation.ts:52`；Mac `apps/apple/macOS/Model/Feed.swift:247`、`:130`；全仓 scopeVersion/scrollOffsets 引用仅该文件 | 全部加载80张并停在第60张→未读→全部，返回原卡片和原位置，仍加载80张。 |
| F02 搜索/类型条件改变后的结果位置 | `renderHomeSearch` 及输入延迟提交均令结果从顶部显示。 | `search` / `selectKind` 只重建 entries，没有连接 feed scroll。旧位置直接套用新结果，可能落在结果中部或由系统夹到尾部。此项只覆盖结果区域，不审候选列表。 | 确定差异 | P1 | Web `apps/web/views/actions/navigation.ts:79`、`apps/web/views/app-input.ts:273`；Mac `apps/apple/macOS/Model/Feed.swift:260`、`:273`，`apps/apple/macOS/Feed/FeedView.swift:16` | 在长信息流中部提交新查询或点类型条件，结果首行回到顶端。 |
| F03 T / 品牌回顶的筛选语义 | `top` 只回顶并恢复工具，不修改分类、查询、类型、标签。 | `scrollToTop` 调用 `feed.clearFilter`，同时清查询/分类/标签。用户只是回顶，却换了内容集合。 | 确定差异 | P1 | Web `apps/web/views/actions/navigation.ts:16`；Mac `apps/apple/macOS/Shell/DesktopView.swift:252`、`:319`、`apps/apple/macOS/Shell/TopBar.swift:53` | 带分类和查询按T或点品牌，条件完整保留，只改变滚动位置。 |
| F04 状态更新的卡片高度与阅读锚点 | `preserveFeed` 保留成员、栈和任务顺序，并保存现有卡片 minHeight 与 scrollY；宽度改变才释放旧高度。 | 普通状态不重建 entries，但 Masonry 每次用当前内容测量，没有对应高度保留或可见卡片锚点恢复。例如删除标签/备注使卡片变矮时，没有Web保留原最小高度的对应机制；下方卡片与视口锚点缺少同等保护。 | 确定差异 | P1 | Web `apps/web/views/app-feed.ts:146`、`:185`、`:239`、`apps/web/interactions/layout.ts:109`；Mac `apps/apple/macOS/Feed/MasonryLayout.swift:104`、`apps/apple/macOS/Feed/CardTile.swift:65` | 在中部删除标签/备注使卡片变矮，保留原最小高度和可见锚点，匹配Web。 |
| F05 阅读关闭时的筛选成员重算 | 阅读期间 defer；桌面关闭开始时 flushReadingRefresh，使用 preserve=false 重算筛选集合。未读分类中的已读卡会按此阶段退出。 | `releaseHeld` 只释放已读颜色；`reader.onClosed` 只恢复焦点，没有 feed 重算。状态快照本身通常不触发 catalogChanged，所以已读卡在未读分类中继续保留，直到后续显式重建。 | 确定差异 | P1 | Web `apps/web/views/app-surfaces.ts:216`、`apps/web/interactions/reading-feedback.ts:23`；Mac `apps/apple/macOS/Model/Reader.swift:237`、`:307`、`apps/apple/macOS/Shell/DesktopView.swift:472`、`apps/apple/macOS/Model/Workspace.swift:177` | 未读分类读完一张再关闭，按Web关闭阶段更新成员，返回目标消失时采用同样退出方式。 |
| F06 批量收藏/稍后读状态 | 收藏值为“并非全部已收藏”；稍后读统一置true；操作后保留选中和当前成员。 | 当前 selectionIntents + Workspace.mark 使用相同值，保留选中；状态与内容分离。原子批量写入是后端合理实现差异。 | 源码一致待实测 | P1 | Web `apps/web/views/app-feed-updates.ts:165`、`apps/web/views/feed.tsx:16`；Mac `apps/apple/macOS/Shell/DesktopView.swift:409`、`apps/apple/macOS/Model/Workspace.swift:265` | 混合收藏状态批量收藏→全部选中仍在，再点→全部取消收藏，当前卡片不乱序。 |
| F07 提醒动作后的详情/选中 | 任意提醒操作移除该卡选中；只有 reminder 的 complete/restore 保留预览，其余关闭详情；随后按路径刷新。 | 当前 reminder 闭包对 complete/restore/snooze/dismiss 一律保留详情与选中，且未执行对应刷新分支。延后/忽略后的所在页面和批量数量不同。 | 确定差异 | P1 | Web `apps/web/views/app-feed-updates.ts:138`；Mac `apps/apple/macOS/Shell/DesktopView.swift:432`、`apps/apple/macOS/Model/Workspace.swift:386` | 分别在预览/选中状态执行完成、恢复、延后、忽略，详情去留与选中数量逐项匹配Web。 |
| F08 叠卡形成规则 | 同来源 article/media，排除 agent/capture，最近1小时且未读，数量>5；筛选时不成栈。 | 同样按>5、1小时、来源、未读构栈，filtering 时不启用。 | 源码一致待实测 | P2 | Web `apps/web/services/feed-policy.ts:12`、`apps/web/views/feed.tsx:43`；Mac `apps/apple/macOS/Model/FeedPolicy.swift:83`、`apps/apple/macOS/Model/Feed.swift:422` | 同一数据中5张不成栈、6张成栈，筛选后展开为独立卡片。 |
| F09 叠卡宽度变化后的阈值 | 每次 deckParts 读取当前 offsetWidth，拖动/松手阈值与当前卡宽一致。 | StackTile.width 仅在 GeometryReader.onAppear 保存一次，窗口改变卡宽后不更新；30%/35%阈值与离场距离继续使用旧宽。 | 确定差异 | P2 | Web `apps/web/views/app-stacks.ts:111`；Mac `apps/apple/macOS/Feed/FeedView.swift:199`、`:301`、`:316` | 显著调整窗口宽后，翻页阈值始终为当前卡宽的30%（手拖）/35%（横滚）。 |
| F10 叠卡纵向拖动判定 | 移动6px后检查横纵方向；纵向超过横向1.2倍放弃翻页。 | 只检查 abs(dx)>=6，没有纵向优先拒绝；纵向拖动dx不足6时松手仍调用openStack。斜拖可能翻页，纵拖可能意外展开。 | 确定差异 | P2 | Web `apps/web/views/app-stacks.ts:35`；Mac `apps/apple/macOS/Feed/FeedView.swift:275` | 在叠卡上明显纵拖和斜拖，不展开也不翻页；明确横拖才进入翻页。 |
| F11 阅读会话的已存进度恢复 | 首次打开全屏无当前会话位置时按已存progress恢复，>=.98从头；预览↔全屏保存本会话scrollTop。 | ReaderPage 只读 reader.positions[layer.id]，新Layer为新UUID，无持久progress→offset转换；新开会话从0。 | 确定差异 | P1 | Web `apps/web/views/app-panels.ts:261`、`apps/web/views/preview-controller.ts:38`；Mac `apps/apple/macOS/Reader/ReaderPage.swift:159`、`apps/apple/macOS/Model/Reader.swift:10`、`:317` | progress=.5关闭后再开全屏恢复中段，progress>=.98从头；会话内放大缩小按已保存位置衔接。 |
| F12 嵌套阅读层的位置及返回 | 保存各卡scrollTop、photoIndex、focus/link；返回恢复父层位置和原链接焦点。桌面父层视觉用快照过渡。 | Mac保留所有Layer，滚动按layer UUID保存，下面层禁止点击/VoiceOver；没有父层链接焦点保存恢复逻辑。滚动保留有源码，焦点行为需系统实测。 | 待核实 | P1 | Web `apps/web/views/preview-controller.ts:38`、`:84`；Mac `apps/apple/macOS/Reader/ReaderOverlay.swift:21`、`apps/apple/macOS/Model/Reader.swift:125`、`apps/apple/macOS/Reader/PreviewSheet.swift:153` | 父层滚到中段→开关联卡→返回，原位置和原关联入口焦点均恢复。 |
| F13 阅读层焦点进入与背景隔离 | showModal 后焦点设为modal-title；Tab/ShiftTab在对话框循环，背景inert。 | ReaderOverlay为普通ZStack；isModal是可访问性标记，未见标题defaultFocus/Tab循环/禁用背景焦点逻辑。旧CardTile保持FocusState。源码未建立同等保证，实际焦点路径待实测。 | 待核实 | P1 | Web `apps/web/views/app-surfaces.ts:120`、`:169`、`apps/web/views/app-input.ts:380`；Mac `apps/apple/macOS/Reader/ReaderOverlay.swift:16`、`:53`、`apps/apple/macOS/Reader/ReaderPage.swift:113`、`apps/apple/macOS/Feed/CardTile.swift:44` | 用键盘打开详情后焦点进入详情，连续Tab及ShiftTab不进入背景卡片；关闭回原入口。 |
| F14 嵌套层阅读计时 | 全局tick仅当当前modalKind=reader且页面可见、近60秒有活动时每秒+1。 | 每个ReaderPage各有task计时，只检查sessionActive/应用active/系统idle，不检查top layer和当前面板；下层全屏仍挂载。全屏父层上开子层，可能重复累计；前层是预览或设置时父层仍计时。 | 确定差异 | P1 | Web `apps/web/views/app-capture.ts:178`；Mac `apps/apple/macOS/Reader/ReaderPage.swift:114`、`:185`、`apps/apple/macOS/Reader/ReaderOverlay.swift:21` | 任意层数下1秒最多记1秒，当前非全屏阅读或设置遮挡时按Web计时规则停止。 |
| F15 短内容连续可见停留 | 1200ms后才标读；期间document.hidden一次即interrupted，不因随后回到前台补成完成。 | dwell只在1200ms结束时检查NSApp.isActive/window，不记录中途离开前台；离开后在期限前回来仍标读。 | 确定差异 | P2 | Web `apps/web/views/app-panels.ts:247`；Mac `apps/apple/macOS/Reader/ReaderScroll.swift:77` | 打开短文500ms→切应用→在1200ms前返回，不把这段中断停留算成连续读完。 |
| F16 实际刷新阶段 | 请求开始即回位；真实refresh完成后才success；成功加载反馈至少300ms、成功hold400ms；失败可重试。 | 同样先回位再等待workspace.refresh完成，300ms/400ms反馈；失败分支也等待最短300ms，Web失败立即error。状态不表示外部来源同步。 | 确定差异 | P2 | Web `apps/web/interactions/gesture-refresh.ts:164`、`:202`；Mac `apps/apple/macOS/Model/FeedRefresh.swift:85` | 快速失败立即出现重试，成功仅在真实请求成功后出现，反馈等待不延迟数据合入。 |
| F17 R快捷键的刷新反馈 | R调用gestures.refresh，进入同一loading/success/error圆环流程。 | R与⌘R直接workspace.refresh，只重建成员，不走FeedRefresh状态机，用户看不到同等刷新进度和成功反馈。⌘R是原生补充，R本身必须一致。 | 确定差异 | P2 | Web `apps/web/views/app-input.ts:488`；Mac `apps/apple/macOS/Shell/DesktopView.swift:317`、`apps/apple/macOS/App/SillApp.swift:175` | 按R与下拉刷新使用同一真实请求反馈阶段。 |
| F18 核心鼠标/键盘打开与Esc层级 | 卡片Enter/Space打开；Esc按当前弹层/选择处理；Shift区间选，Command/Ctrl切选。 | 普通CardTile Enter/Space、Shift/Command选择、DesktopInteraction层级有对应实现；叠卡只有Return，没有Space（A05）。Mac选择Command符合平台。 | 确定差异 | P1 | Web `apps/web/views/app-input.ts:47`、`:472`、`:499`；Mac `apps/apple/macOS/Feed/CardTile.swift:30`、`:48`、`apps/apple/macOS/Shell/DesktopInteraction.swift:40` | 普通卡与叠卡分别检查鼠标、Enter、Space打开；连续Esc只退出最近一层，不穿透误改选择。 |
| F19 来源加载占位的实际入口 | 当前正文已在设备，openCard调用Panels.reader(...false)；skeleton组件保留给将来来源获取，当前不会因打开正文而显示骨架。 | 当前ReaderContent直接显示已有正文，无来源获取流程和骨架入口。不能因Web保留组件就要求Mac显示假加载。 | 源码一致待实测 | P2 | Web `apps/web/views/preview-controller.ts:153`、`apps/web/interactions/panel-card.tsx:323`；Mac `apps/apple/macOS/Reader/ReaderPage.swift:38`、`apps/apple/macOS/Reader/ReaderContent.swift:51` | 现有正文打开即显示，不出现没有真实请求的加载占位。 |

## 2. AI栏、搜索、登录、设置及窗口

| 编号 / 检查项 | Web 当前基准 | Mac 当前事实与影响 | 源码结论 | 优先级 | 证据（项目相对路径:行） | 操作与验收标准 |
| --- | --- | --- | --- | --- | --- | --- |
| U01 AI 引用条位置 | 引用容器位于输入栏上方8px；多行换行时向上占位，输入栏保持可用 | 用户截图中三条引用与输入占位文字重叠，已观察到位置错误。当前代码使用overlay和alignmentGuide，具体根因尚未运行定位；截图对应构建版本未确认 | 截图已观察 | P1 | 用户2026-10-28提供的第二张截图；`apps/web/styles/controls.css:550`；`apps/apple/macOS/Shell/AIDock.swift:228`；`apps/apple/macOS/Shell/FlowRow.swift:4` | 加入1、3条及跨两行引用，分别在宽/窄窗口、收起恢复后检查：引用底边距输入栏顶边8px，不盖住文字、加号或按钮 |
| U02 AI 收起后的尺寸与位置 | 当前shell按输入栏右侧原位置收成60×60圆形，与底栏同一行 | Mac收成44×44，并向上移44px；收起位置、命中面积与Web不同 | 确定差异 | P1 | `apps/web/views/shell.tsx:150`；`apps/web/styles/controls.css:668`；`apps/apple/macOS/Shell/AIDock.swift:152`、`:197` | 在默认位置及拖动后收起，对比最终圆心、60×60尺寸和恢复后的原位置；旧文档锚点冲突见总览D02 |
| U03 AI 水平移动边界与缩放窗口 | 可移动范围按当前实际宽度计算；位置用比例保存；窗口改变后保持相对位置；越界后反向立即跟手 | Mac始终按展开宽度640计算边界；保存像素偏移；越界使用整段translation，反向需走回超出距离。收起状态也只能在展开范围内移动 | 确定差异 | P2 | `apps/web/views/shell.tsx:160`、`:226`；`apps/apple/macOS/Shell/AIDock.swift:102`、`:198`、`:243` | 展开/收起分别拖至边界后反向，再缩放窗口：不留死区，不越界，相对位置一致；键盘步长另见A25 |
| U04 AI 当前能力与草稿 | 当前入口只承接草稿和引用；没有可用的内置助手发送/语音服务 | Mac发送及语音同样禁用，保留草稿引用；模型/会话的预留代码不能当成已接入 | 源码一致待实测 | P1 | `apps/web/views/shell.tsx`；`apps/apple/macOS/Shell/AIDock.swift:4`；`docs/product/agent-mcp.md` | 输入中文、增删引用、收起恢复、多选交接：草稿保留，按钮状态真实；不把未实现发送列为Mac缺陷 |
| U05 搜索框及候选排版 | 搜索宽315；前置图标16；候选40高、标题14、类型图标14和名称在右侧48宽列 | Mac宽315已接入；前置图标20；候选48高、标题15、图标18放左侧，右侧类型名无固定列。相同结果占高与排列不同 | 确定差异 | P2 | `apps/web/views/home-search-field.tsx:8`；`apps/web/views/home-search.tsx:116`；`apps/web/styles/form-controls.css:758`；`apps/apple/macOS/Shell/SearchField.swift:55`、`:289` | 同一查询显示8条、含长标题和不同类型，逐项比较图标位置、行高、标题字号、右列对齐；聚焦前后框宽不变 |
| U06 搜索分组与无结果反馈 | #条件分“状态”“标签”标题；无结果仍显示明确提示；候选数量有可访问提示 | Mac直接平铺选项，无分组标题；options为空时整个列表不渲染，没有同等无结果提示 | 确定差异 | P2 | `apps/web/views/home-search.tsx:135`；`apps/apple/macOS/Shell/SearchField.swift:274` | 输入#、已有标签和不存在的词，分别比较分组名、选中勾、空结果文案及读屏数量 |
| U07 搜索候选悬停与滚动 | 鼠标只移动高亮；键盘按需要将目标滚入可见范围 | Mac鼠标onHover改变hashIndex；统一onChange触发scrollTo。悬停也可能移动列表 | 确定差异 | P1 | `apps/web/views/home-search-motion.ts:62`；`apps/apple/macOS/Shell/SearchField.swift:311`、`:322` | 滚到候选中段，将鼠标移过可见行：列表不跳；方向键越出可见区域时才滚动 |
| U08 搜索键盘与输入法 | 当前支持方向键、Home/End、明确选择时Tab、Esc、条件组合；组词完成后提交 | Mac有相应按键与部分组词保护；Tab/Home/End、再次聚焦选中位置及连续条件的完整路径未完成运行核对 | 待核实 | P1 | `apps/web/views/app-input.ts:199`、`:252`；`apps/apple/macOS/Shell/SearchField.swift:149` | 拼音输入中按方向/Enter不提前选项；提交后结果正确；重开定位当前选择；Tab、Home/End、Esc和⌘K逐个记录 |
| U09 标签批量输入与去重 | 支持英文逗号、中文逗号和换行拆分；忽略大小写去重；单标签30字符、最多20条 | Mac只在Enter时把整个draft作为一条，按大小写敏感contains去重；混合粘贴会得到不同标签集合 | 确定差异 | P1 | `apps/web/views/actions/cards.ts:108`；`apps/web/views/app-input.ts:256`；`apps/apple/macOS/Shell/EditorPanel.swift:174` | 粘贴“研究,工作，稍后”加换行，再输入Study/study，比较实际保存的标签数量与值；20条边界不丢已有输入 |
| U10 标签退格操作 | 空输入第一次Backspace选中最后标签，第二次删除；输入新字解除选中 | Mac原生TextField没有两阶段退格处理；只有×或建议按钮增删 | 确定差异 | P2 | `apps/web/views/app-input.ts:420`；`apps/apple/macOS/Shell/EditorPanel.swift:43` | 标签输入框清空后连续两次Backspace，第一次仅标记、第二次删除；重新输入取消标记 |
| U11 登录校验和显隐状态 | 邮箱格式校验、邮箱最多254字符/密码256；密码显隐切Eye/EyeOff；保留同一输入元素 | Mac只检查非空，未见相同长度/格式限制；显隐切换TextField/SecureField，仅同一eye图标改透明度 | 确定差异 | P2 | `server/cloud/login-page.ts:14`、`:52`；`apps/apple/macOS/Shell/CloudLogin.swift:34`、`:49`、`:132` | 空值、无效邮箱、正确格式分别检查提交行为；密码显隐前后文字、焦点、光标与图标一致；使用合成值，不记录真实密码 |
| U12 登录失败后的输入保留 | 请求失败分支在清空密码前返回，用户可修改后重试 | Mac提交前立即清空password，网络/认证失败都要重新输入；行为不同 | 确定差异 | P2 | `server/cloud/login-page.ts:62`（submit）；`apps/apple/macOS/Shell/CloudLogin.swift:132` | 合成账号产生一次认证失败和一次网络失败，对比邮箱、密码显隐、错误文案及重试入口；先确定统一输入保留规则 |
| U13 账号头像内容 | 根据当前账号name/email显示账号首字符 | Mac顶栏固定person图标，没有同等账号首字符 | 确定差异 | P2 | `apps/web/cloud-workspace.ts:61`、`:291`；`apps/apple/macOS/Shell/TopBar.swift:119` | 同一账号登录后比较头像字符、可访问名称和退出后的状态 |
| U14 设置结构与尺寸 | 桌面、外观、快捷键、数据四组；左导航200，内容区固定规则；页面切换保留外框 | Mac四组和主要选项已接入；原生ScrollView与maxHeight布局的实际高度、滚动及切页稳定性未测 | 源码一致待实测 | P2 | `apps/web/interactions/panel-settings.tsx:51`；`apps/web/styles/panels.css:664`；`apps/apple/macOS/Settings/SettingsView.swift:53`、`:125`；`apps/apple/macOS/Shell/Panel.swift:65` | 四组逐页切换、缩窄窗口、修改设置后重开，核对标题/行序/选中值，外框不随短长内容跳动 |
| U15 云端数据设置内容 | 云端页显示存储位置、导出、清空和退出各自的文案与行结构 | Mac额外显示使用量；导出、清空与退出采用不同文案/行结构，不能因功能名相近判内容一致 | 确定差异 | P2 | `apps/web/views/cloud-views.tsx:94`；`apps/apple/macOS/Settings/SettingsDataPage.swift:17` | 同一云端账号打开数据页，逐行比较标签、说明、按钮文字、可用状态与先后顺序；本地页另测 |
| U16 备份配置必填校验 | 保存前由required阻止空必填项提交 | Mac保存按钮未检查所有必填字段，可提交空值后等待服务端返回 | 确定差异 | P2 | `apps/web/interactions/backup-settings.tsx:122`；`apps/apple/macOS/Settings/BackupSettingsView.swift:51`、`:174` | 各必填字段逐个留空，应在相同阶段指出具体缺项，不用真实凭据做空表单校验 |
| U17 备份配置保存后的表单 | 成功后重置整个配置表单并刷新已保存摘要 | Mac只清空secret字段，其他输入仍留在表单中；成功后的页面内容不同 | 确定差异 | P2 | `apps/web/interactions/backup-settings.tsx:78`；`apps/apple/macOS/Settings/BackupSettingsView.swift:187` | 使用测试配置保存，比较字段清空范围、已保存摘要和再次编辑入口；不在本轮连接或更改真实备份 |
| U18 系统提醒能力 | 浏览器环境按已实现权限/页面生命周期处理提醒 | Mac用系统通知调度，允许应用关闭后由系统送达。能力差异须按功能矩阵记录，不模拟浏览器限制 | 已约定平台差异 | P2 | `apps/web/services/system-reminders.ts:34`；`apps/apple/macOS/Notifications/SystemReminders.swift:26`；`docs/product/feature-matrix.md` | 分别记录允许/拒绝权限、重设提醒和关闭应用后的平台行为；卡片内提醒状态和时间含义一致 |
| U19 登录页布局与焦点颜色 | 字段间距16；浮动标签focus变强调色、字段边框随focus变化，状态行预留24高 | Mac字段间距由8+12等组合；标签始终secondary、边框始终line；状态区按有无消息条件生成。错误出现时位置是否跳动待实测 | 确定差异 | P2 | `server/cloud/login-page.ts:11`；`apps/apple/macOS/Shell/CloudLogin.swift:32`、`:102`、`:155` | 空表单→聚焦→输入→提交→错误，逐阶段对齐标签/边框颜色、字段距离与状态区占位，整张表单不因提示上下移动 |
| U20 分栏菜单、提示及遮挡 | 分栏菜单锚定展开按钮；提示与底栏独立；详情/菜单当前层处理输入 | Mac有ScopeMenu、Toast、FailureNotice；长菜单、提示叠加详情和窗口边缘的实际位置未验 | 待核实 | P2 | `apps/web/views/home-scope-menu.tsx`；`apps/apple/macOS/Shell/ScopeMenu.swift:72`；`apps/apple/macOS/Shell/Toast.swift:12`；`apps/apple/macOS/Shell/DesktopView.swift:105` | 在窗口左右边缘、打开详情和多选时分别展开菜单及提示；不挡主要操作，提示不推动AI栏，隐藏层不接收点击 |
| U21 窗口、主题与文本完整性 | 桌面布局按窗口宽度换列，浅/深色保留语义颜色；长标题与缺图按各类型规则显示 | Mac用原生布局/玻璃和同源主题变量，但最小窗口、同列变宽、深浅切换及文字实际测量未验 | 待核实 | P1 | `apps/web/interactions/layout.ts`；`apps/web/styles/base.css`；`apps/apple/macOS/Feed/MasonryLayout.swift`；`apps/apple/macOS/Shell/TopBar.swift` | 用同内容同可用宽高对比最小/常用/大窗口与浅深色，卡片位置、行数、阅读宽度、工具留白均记录；不把标题栏系统高度算产品误差 |

## 3. 卡片内容与排版逐项差异

C09、C13为依据冲突，C23仅涉及不符合当前数据约定的内容；不计入正常有效卡片的确定缺陷。C06/C07的初步发现已合并进C19/C20，编号保留空缺，避免重复计数。

| 编号 / 检查项 | Web 当前基准 | Mac 当前事实与影响 | 源码结论 | 优先级 | 证据（项目相对路径:行） | 操作与验收标准 |
| --- | --- | --- | --- | --- | --- | --- |
| C01 文章目录层级 | 根据正文标题相对最浅层级缩进，最多两级，每级 12px | 所有目录项只按选中状态设左边距，未使用标题层级；层次丢失 | 确定差异 | P1 | apps/web/interactions/reader-layout.tsx:48；apps/apple/macOS/Reader/ReaderPage.swift:130 | 多级标题目录按相对层级缩进，最多两级 |
| C02 文章目录字体 | 目录项统一普通字重，选中项用强调色覆盖揭示 | 选中项变半粗并直接切换颜色；图标为 18 而 Web 为 16 | 确定差异 | P2 | apps/web/styles/reader-layout.css:83；apps/web/interactions/reader-layout.tsx:45；apps/apple/macOS/Reader/ReaderPage.swift:123 | 选中时字体字重不变，颜色与圆点表现匹配桌面 Web |
| C03 播客来源 | 有来源且有 URL 时来源行可点击并显示箭头 | 仅显示 MetaRow 文本，无来源跳转 | 确定差异 | P1 | apps/web/cards/podcast-detail.tsx:54；apps/apple/macOS/Reader/PodcastDetail.swift:21 | 有 URL 的播客来源可点击打开并显示箭头 |
| C04 播客空信息 | 只有至少一个信息字段有值时显示信息区 | 无条件显示信息标题，所有字段为空仍显示空标题 | 确定差异 | P2 | apps/web/cards/podcast-detail.tsx:22；apps/web/cards/podcast-detail.tsx:117；apps/apple/macOS/Reader/PodcastDetail.swift:64 | 全部信息为空时不显示信息标题 |
| C05 任务卡面 | 固定当前预览顺序后再补未完成、已完成项，最多三项 | 每次按未完成优先重排，没有保留预览顺序；勾选可能使行立即换位 | 确定差异 | P1 | apps/web/cards/components.tsx:159；apps/apple/macOS/Feed/CardBodies.swift:229 | 连续勾选时可见任务顺序按 Web 同样保持，数量仍为三项 |
| C08 播客主体 | 介绍页，显示收听记录、介绍、章节、最多五条摘录和资料，不播放 | 同样采用只读介绍与相同主要区块；布局和空值差异见 C03/C04 | 源码一致待实测 | P2 | apps/web/cards/podcast-detail.tsx:13；apps/apple/macOS/Reader/PodcastDetail.swift:9 | 同一播客数据下两端区块顺序和显示内容一致 |
| C09 PR 空结构 | 即使缺少 pullRequest 结构，也显示 GitHub、标题与正文 | Mac 的整个 PR 内容在 `if let pr` 中，缺结构时为空；但正式 Zod 校验拒绝该输入，生成的 JSON Schema 仅描述必填而没有条件约束，单用 JSON Schema 会接受 | 依据冲突 | P3 | contracts/card.ts:342；contracts/card-metadata.ts:46；contracts/card-rich.ts:139；contracts/schema.json:94；apps/web/cards/pull-request.tsx:79；apps/apple/macOS/Reader/PullRequestContent.swift:13 | 正式校验拒绝缺结构 PR；若需兼容 Schema 单独接收的历史数据，应明确兼容规则 |
| C10 PR 作者 | 合并说明采用 author.login | 使用 author.name；两值不同时文案不同 | 确定差异 | P2 | apps/web/cards/pull-request.tsx:56；apps/apple/macOS/Reader/PullRequestContent.swift:117 | 同一 PR 的合并说明显示相同的作者标识 |
| C11 PR 文件路径 | 一行末尾省略 | 一行从中间省略，影响可见路径位置 | 确定差异 | P2 | apps/web/styles/card-types.css:277；apps/apple/macOS/Reader/PullRequestContent.swift:292 | 长路径与 Web 采用相同省略位置 |
| C12 照片封面布局稳定 | 卡面 16:9 容器，图片加载前预留尺寸；两张均分、三张 2:1 | 同为 16:9，二、三张网格比例一致；异步图像使用固定容器，视觉加载和位置仍需实测 | 源码一致待实测 | P2 | apps/web/styles/cards.css:260、:292；apps/apple/macOS/Feed/CardBodies.swift:435、:469 | 图片加载前后卡面高度不变，三张图片比例一致 |
| C13 文章目录设计依据 | 当前 Web 左侧、32px 最小行高、选中普通字重与色彩揭示 | 手册写右侧、44px 与 600 字重；Mac 左侧 32px 且选中半粗 | 依据冲突 | P1 | apps/web/styles/reader-layout.css:53、:83；design-system/README.md:39；design-system/handbook/web-reading.md:75；apps/apple/macOS/Reader/ReaderPage.swift:120 | 本轮以当前 Web 为基准，手册冲突单独记录，验收不混用两套规则 |
| C14 视频文字稿跟随 | 仅播放中、开启跟随且文字稿页时，当前行滚到最近可见位置 | 活跃行变化且开启跟随时无播放状态判断，滚到居中；暂停手动跳转也会改变文字稿位置 | 确定差异 | P1 | apps/web/cards/media-detail.tsx:80；apps/apple/macOS/Reader/MediaDetail.swift:170 | 暂停时调整进度不自动移动文字稿；播放时跟随只滚动到最近可见位置 |
| C15 建议依据 | 列出所有 why.basis | 只显示前五条，后续依据丢失 | 确定差异 | P1 | apps/web/cards/detail-blocks.tsx:37；apps/apple/macOS/Reader/ReaderContent.swift:210 | 6 条以上依据完整显示 |
| C16 摘要来源 | 没有完整覆盖日期时显示卡片来源 | 仅显示完整覆盖日期，不回退来源 | 确定差异 | P2 | apps/web/interactions/previews-components.tsx:450；apps/apple/macOS/Reader/ReaderContent.swift:230 | 缺少覆盖时间时展示相同来源 |
| C17 关联卡片空列表 | 关联 ID 均找不到卡片时不显示区块 | 只根据 ID 数量显示标题，实际卡片过滤后可能为空，留下空标题 | 确定差异 | P2 | apps/web/cards/detail-blocks.tsx:9；apps/apple/macOS/Reader/ReaderContent.swift:244、:252 | 所有关联项不可用时不显示空区块标题 |
| C18 单张照片灯箱 | 即使只有一张照片也显示缩略图 | 仅多张时显示缩略图；单张时底部高度和主图可用区域不同 | 确定差异 | P2 | apps/web/interactions/panel-card.tsx:448；apps/apple/macOS/Reader/PhotoLightbox.swift:39 | 单张照片的缩略图和底部占位与 Web 一致 |
| C19 邮件卡面长文本 | 桌面发送人及来源行无单行截断约束，可换行 | 两行均 `lineLimit(1)`，长内容截断，卡面高度不同 | 确定差异 | P2 | apps/web/styles/cards.css:330；apps/apple/macOS/Feed/CardBodies.swift:126 | 长发件人和来源显示与 Web 换行规则一致 |
| C20 Markdown 标题字号 | H1/H2 为 20px，H3–H6 为 18px，按阅读字号缩放 | 全部标题固定 font17，再按阅读字号缩放；标题层级视觉差异消失 | 确定差异 | P1 | apps/web/styles/overlays.css:323；apps/apple/macOS/Reader/MarkdownText.swift:29、:98 | 同一正文的 H1/H2 与 H3–H6 显示对应字号 |
| C21 Markdown 代码块 | 独立代码块有背景、内边距、圆角并允许横向滚动 | MarkdownText 将代码 run 设为等宽文本，无代码块容器与横向滚动 | 确定差异 | P2 | apps/web/styles/overlays.css:363；apps/apple/macOS/Reader/MarkdownText.swift:15、:98 | 长代码块按 Web 样式显示并可横向查看 |
| C22 日程会议详情 | 会议名称与会议码上下排列且任意位置可换行 | DetailRow 将名称与码分列且均限制一行，长码截断 | 确定差异 | P1 | apps/web/interactions/previews-components.tsx:201；apps/web/styles/detail-content.css:421；apps/apple/macOS/Reader/ReaderContent.swift:353；apps/apple/macOS/Reader/DetailRows.swift:82 | 长会议名称及会议码分行显示且完整换行 |
| C23 文件和附件链接 | 仅 HTTP(S) 地址显示可跳转行；正式文件与附件约定也只接受 HTTP(S) | Mac 对可解析 URL 显示 Link 和箭头；点击经 DesktopView 的 openURL 到 ExternalLink，仅允许 HTTP(S) 和 mailto。非 HTTP(S) 数据不符合当前约定：mailto 可尝试打开，其他协议会提示无效链接 | 约定外差异 | P3 | contracts/card.ts:46、:276；contracts/card-rich.ts:10；apps/web/cards/detail-blocks.tsx:80；apps/apple/macOS/Reader/CardDetailFields.swift:44；apps/apple/macOS/Shell/DesktopView.swift:117；apps/apple/macOS/Reader/ExternalLink.swift:6 | 合法 HTTP(S) 文件链接两端可用；如需兼容旧数据，明确其箭头与打开行为 |
| C24 照片说明间距 | 说明与地点日期同一块，日期距说明 4px | 说明上下各 12px，地点日期单独一行；改变主图剩余高度和信息间距 | 确定差异 | P2 | apps/web/interactions/panel-card.tsx:444；apps/web/styles/detail-content.css:447；apps/apple/macOS/Reader/PhotoLightbox.swift:24 | 同一说明与日期的间距和底部占位一致 |

## 4. 12类卡片覆盖及逐张操作清单

均已读取所列两端主要渲染源码，按标题、元信息、正文、字段和主要布局进行源码对照；“未发现新增差异”仅指这次所看代码，不代表像素、字体、滚动手感或所有数据组合已经验收。未打开界面。

| 类型 | Web 已读取 | Mac 已读取 | 结果 |
|---|---|---|---|
| article | `apps/web/cards/components.tsx:46`、`apps/web/interactions/previews-components.tsx:425`、`apps/web/interactions/reader-layout.tsx:7`、`apps/web/styles/reader-layout.css:53` | `apps/apple/macOS/Feed/CardBodies.swift:87`、`apps/apple/macOS/Reader/ReaderContent.swift:162`、`apps/apple/macOS/Reader/ReaderPage.swift:120` | 卡面均为封面、来源日期时长、标题和摘要；详情与目录见 C01、C02、C13、C20、C21。图片加载与长文位置未实测。 |
| pr | `apps/web/cards/pull-request.tsx:29`、`apps/web/styles/card-types.css:277` | `apps/apple/macOS/Reader/PullRequestContent.swift:4` | 卡面与详情均检查，差异 C10–C11；C09 为正式校验与 JSON Schema 约束冲突。 |
| mail | `apps/web/cards/components.tsx:59`、`apps/web/interactions/previews-components.tsx:154`、`apps/web/cards/detail-blocks.tsx:54` | `apps/apple/macOS/Feed/CardBodies.swift:120`、`apps/apple/macOS/Reader/ReaderContent.swift:265`、`apps/apple/macOS/Reader/CardDetailFields.swift:33` | 顺序均为发送人/来源、标题、正文、附件；长发件人 C19，附件链接 C23。 |
| note | `apps/web/cards/components.tsx:115`、`apps/web/interactions/previews-components.tsx:375`、`:425` | `apps/apple/macOS/Feed/CardBodies.swift:173`、`apps/apple/macOS/Reader/ReaderContent.swift:187` | 普通、引用、记录卡面分支均已看；详情来源、标题、标签、正文的主要顺序已看；未发现新增确定差异，Markdown 见 C20/C21。 |
| task | `apps/web/cards/components.tsx:159`、`apps/web/interactions/previews-components.tsx:312`、`apps/web/cards/detail-blocks.tsx:107` | `apps/apple/macOS/Feed/CardBodies.swift:223`、`apps/apple/macOS/Reader/ReaderContent.swift:395` | 卡面勾选顺序 C05；详情均有来源/项目、标题、截止、参与者、优先级、任务和正文；变化时位置待实测。 |
| event | `apps/web/cards/components.tsx:230`、`apps/web/interactions/previews-components.tsx:196`、`apps/web/styles/detail-content.css:421` | `apps/apple/macOS/Feed/EventBody.swift:4`、`apps/apple/macOS/Reader/ReaderContent.swift:300` | 卡面均为日期、时间、标题/地点、参与者和适时加入；详情会议长文字差异 C22。 |
| reminder | `apps/web/cards/components.tsx:288`、`apps/web/interactions/previews-components.tsx:312` | `apps/apple/macOS/Feed/CardBodies.swift:313`、`apps/apple/macOS/Reader/ReaderContent.swift:395` | 卡面与详情均检查来源、时间、勾选、标题、摘要/正文和项目；未发现新增确定差异，勾选时位置待实测。 |
| media：video | `apps/web/cards/media-card.tsx:6`、`apps/web/cards/media-detail.tsx:55`、`apps/web/styles/reader-layout.css:140` | `apps/apple/macOS/Feed/MediaBody.swift:4`、`apps/apple/macOS/Reader/MediaDetail.swift:4` | 卡面封面/进度/时长/来源/标题和详情播放器/章节/文字稿/介绍均已看；跟随滚动 C14。实际视频加载与双栏尺寸未实测。 |
| media：podcast | `apps/web/cards/media-card.tsx:6`、`apps/web/cards/podcast-detail.tsx:16` | `apps/apple/macOS/Feed/MediaBody.swift:4`、`apps/apple/macOS/Reader/PodcastDetail.swift:5` | 卡面及介绍页主要字段已看；来源及空信息 C03/C04；不是播放器详情。 |
| digest | `apps/web/cards/components.tsx:341`、`apps/web/interactions/previews-components.tsx:425`、`apps/web/cards/detail-blocks.tsx:9` | `apps/apple/macOS/Feed/DigestBody.swift:4`、`apps/apple/macOS/Reader/ReaderContent.swift:229` | 卡面覆盖范围、关联数、标题、摘要及详情正文/关联项均检查；详情来源 C16、空关联 C17。 |
| suggestion | `apps/web/cards/components.tsx:365`、`apps/web/interactions/previews-components.tsx:425`、`apps/web/cards/detail-blocks.tsx:9` | `apps/apple/macOS/Feed/CardBodies.swift:381`、`apps/apple/macOS/Reader/ReaderContent.swift:187` | 卡面来源、标题、理由、最多两条关联及更多数量；详情理由、依据及关联均检查；依据截断 C15、空关联 C17。 |
| photo | `apps/web/cards/components.tsx:403`、`apps/web/interactions/panel-card.tsx:392`、`apps/web/styles/cards.css:260` | `apps/apple/macOS/Feed/CardBodies.swift:435`、`apps/apple/macOS/Reader/PhotoLightbox.swift:8` | 卡面图片网格、地点日期、数量、标题说明及灯箱均检查；图片容器 C12、单张缩略图 C18、说明位置 C24。 |
| file | `apps/web/cards/components.tsx:442`、`apps/web/interactions/previews-components.tsx:293`、`apps/web/cards/detail-blocks.tsx:54` | `apps/apple/macOS/Feed/CardBodies.swift:497`、`apps/apple/macOS/Reader/ReaderContent.swift:374`、`apps/apple/macOS/Reader/CardDetailFields.swift:33` | 卡面来源/数量、标题、摘要、前三文件及更多数量；详情正文与完整文件列表均检查；链接类型差异 C23。 |

共享正文代码额外检查 `apps/web/atoms/markdown.ts`、`apps/web/styles/overlays.css:313`、`apps/apple/macOS/Reader/MarkdownText.swift`；Markdown 解析的所有输入边界、视频网络行为及字号缩放下的实际视觉仍未通过运行验证。源码中的字段路径与顺序已检查，不能由此推断动效或真实渲染完全一致。


使用同一账号与同一张卡片，分别在 Web 桌面和 Mac 检查；比较卡面、打开详情后的顺序及字段，并执行列出的轻操作。下列为空值与长字段准备数据，不代表已经运行；动作结果应检查卡片状态，外部链接仅确认目标一致。

| 类型 / 同一输入 | 卡面与详情核对 | 轻操作 | 空值 / 长字段 |
|---|---|---|---|
| article：含封面、分级标题、来源日期和正文 | 封面、来源、标题、摘要；详情封面、标题、正文和目录 | 打开、展开、跳章节、收藏、稍后读、标已读 | 无封面/无标题；长标题、长正文、多级标题；检查 C01/C02/C20/C21 |
| pr：含状态、分支、检查、审阅人、统计及文件 | 卡面仓库、标题、状态、分支、统计；详情行和文件顺序 | 打开、展开检查、访问检查/审阅链接、收藏 | 缺结构在正式校验中无效；长分支、路径和不同 login/name；检查 C10/C11 |
| mail：含发件人、时间、正文和四附件 | 两行来源、标题、摘要与前三附件；详情正文和完整附件 | 打开、展开阅读、访问附件、收藏、稍后读 | 无发件人/附件；长发件人、来源、文件名；检查 C19/C23 |
| note：普通、引用、记录各一张 | 比较来源、标题或记录文字、摘要；详情正文与标签 | 打开、展开阅读、收藏、稍后读 | 空摘要、长引用、长 Markdown 与代码块；检查 C20/C21 |
| task：含四项任务、项目、截止和人员 | 卡面计数、三项顺序；详情事实、完整任务及正文 | 连续勾选、撤销、关闭重开 | 无任务/截止；长任务名、长参与者；检查 C05 和更新时是否跳位 |
| event：含开始结束、时区、会议、地点和人员 | 卡面日期时间和地点；详情时间、会议、地点、人员、议程 | 打开，处于可加入时检查加入入口 | 无会议/地点；长会议码、地点、人员；检查 C22 |
| reminder：含时间、项目、摘要与正文 | 卡面时间、勾选、标题、摘要；详情标题、正文、项目 | 完成、恢复、关闭重开 | 无时间/项目；长标题；检查状态更新时高度与位置 |
| media/video：含封面、音视频地址、章节和文字稿 | 卡面封面与进度；详情播放器、介绍、全屏章节与文字稿 | 播放、暂停、跳章节、切页、跟随、关闭重开 | 不支持 URL、无章节/文字稿、长文字稿；检查 C14、图片加载前后位置 |
| media/podcast：含封面、来源 URL、章节与六条文字稿 | 卡面进度；介绍页收听记录、介绍、章节、前五条摘录、资料 | 打开来源、收藏、稍后读 | 无封面/来源/全部资料；长章节、资料；检查 C03/C04 |
| digest：含覆盖日期、正文和三张关联卡片 | 卡面覆盖期、关联数、摘要；详情正文与关联列表 | 打开关联、返回、收藏 | 无覆盖日期、关联 ID 均不可用、长摘要；检查 C16/C17 |
| suggestion：含六条依据和三张关联卡片 | 卡面理由、前两张关联及剩余数；详情完整依据及关联 | 打开关联、返回、收藏 | 无依据、关联 ID 不可用、长理由；检查 C15/C17 |
| photo：一张及三张照片各一张卡 | 卡面图片网格、标题和说明；灯箱大图、说明、地点日期及缩略图 | 切换前后图片、选缩略图、关闭重开、收藏 | 单张/无照片、长说明、慢图片加载；检查 C12/C18/C24 |
| file：含四个不同类型文件和正文 | 卡面数量、前三项和更多数；详情完整文件及描述 | 打开 HTTP(S) 文件、收藏 | 无文件、长文件名；合法HTTP(S)逐项检查。非HTTP(S)是约定外数据，另见C23 |


## 5. 完整功能流程验证

本节覆盖功能链路，不能仅凭一个按钮存在就写通过。Mac路径省略共同前缀`apps/apple/macOS/`；标为`SillKit/`的路径位于`apps/apple/`。这些是待执行用例，不额外计为已发现缺陷。

| 编号 | 场景与步骤 | Web 对照入口 | Mac 对照入口 | 两端共同验收结果 / 已知差异 | 当前验证 |
| --- | --- | --- | --- | --- | --- |
| B01 | 使用同一测试账号登录→重开→会话过期→重新登录→退出 | `server/cloud/login-page.ts`；`apps/web/cloud-workspace.ts` | `Shell/CloudLogin.swift`；`Model/Account.swift`；`SillKit/CloudSessionVault.swift` | 账号、工作区一致；退出清除当前账号画面；本机凭据容器可不同。U11/U12/U19为已知差异；不索取或记录真实密码 | 待执行 |
| B02 | 云端同一张卡在另一端更新后刷新；离线→恢复；登录切账号 | `apps/web/cloud-workspace.ts:255` | `Model/Workspace.swift:136`；`SillKit/CloudWorkspace.swift` | 标题/正文/版本/轻操作状态来自同一工作区；旧账号结果不覆盖新账号；刷新反馈只对应真实请求 | 待执行 |
| B03 | 全部/未读/收藏/稍后读/来源分类逐个进入；查询+#标签/状态+类型组合，再清空 | `apps/web/views/actions/navigation.ts`；`apps/web/views/home-search.tsx` | `Model/Feed.swift`；`Shell/SearchField.swift` | 每一步比较卡片ID集合、顺序、数量和筛选标记；清空不留隐藏条件；F01/F02/F03、U05–U08为已知差异 | 待执行 |
| B04 | 初次加载→空列表→加载下一页→新增卡片→删去一张；切分类返回 | `apps/web/views/app-feed.ts`；`apps/web/views/app-lifecycle.ts` | `Feed/FeedView.swift`；`Model/Feed.swift` | 区分加载/空/失败；分页无重复遗漏；新增与已看卡位置可追踪；F01/F04、A01–A03对应位置/动效 | 待执行 |
| B05 | 单卡收藏→取消，稍后读→取消，已读→未读；在对应筛选和详情中重复 | `apps/web/views/actions/cards.ts`；`apps/web/views/app-feed-updates.ts` | `Model/Workspace.swift`；`Shell/DesktopView.swift`；`Reader/ReaderToolbar.swift` | 每一步按钮、颜色、状态、成员冻结和关闭后重算一致；不误改正文；失败保留可重试。F04/F05需处理 | 待执行 |
| B06 | 鼠标、⌘、Shift多选；混合收藏；批量稍后读、标签；操作后取消选择 | `apps/web/views/app-selection.ts`；`apps/web/views/app-feed-updates.ts:165` | `Model/Selection.swift`；`Shell/SelectionBar.swift`；`Model/Workspace.swift:265` | 选中ID、计数、混合状态按钮、批量结果一致；轻操作后保留选择；两端已取消的多选右键菜单不恢复 | 待执行 |
| B07 | 打开标签/备注→修改→取消；再改→保存→重开；多选同样操作 | `apps/web/interactions/panel-search.tsx`；`apps/web/views/actions/cards.ts` | `Shell/EditorPanel.swift`；`Model/Workspace.swift` | 取消不落盘；保存完整保留草稿；标签合并/备注作用目标一致；遵守30字符/20标签/4000备注；U09/U10为差异 | 待执行 |
| B08 | 两端同时打开同卡标签/备注→一端保存→另一端保存；模拟写入回执丢失 | Web编辑保存与云端写入层 | `Model/Workspace.swift`；`SillKit/CloudWriteReconciliation.swift` | 比较编辑基准、冲突提示、草稿保留和重新核对；未知结果先核对，不重复写入。此为项目既有要求，未在本轮运行 | 待执行 |
| B09 | 任务逐项完成/撤销；提醒完成/恢复/延后/忽略；在多选和详情中重复 | `apps/web/views/app-feed-updates.ts:138`；`apps/web/views/actions/cards.ts` | `Shell/DesktopView.swift:432`；`Model/Workspace.swift:386` | 任务计数、提醒时间/状态、选中数量、详情去留一致；卡片顺序/高度稳定。C05/F07是已知差异 | 待执行 |
| B10 | 打开归档列表→恢复一张；查看待归档集合→取消；隔离数据中确认批量归档 | `apps/web/views/actions/cards.ts:52` | `Feed/Archive.swift`；`Model/Workspace.swift` | ID集合与时间范围一致；恢复回正确分类；取消不更改；确认后按真实结果更新。批量执行尚未授权/未进行 | 待执行 |
| B11 | 打开→预览/全屏→滚到中段→关联子卡→返回→关闭→重开 | `apps/web/views/preview-controller.ts`；`apps/web/interactions/panel-card.tsx` | `Model/Reader.swift`；`Reader/ReaderOverlay.swift`；`Reader/ReaderPage.swift` | 当前卡、层数、滚动、焦点、进度和阅读计时一致；播客不恢复已取消全屏。F11–F15、A07–A17对应差异 | 待执行 |
| B12 | 播放视频→暂停→跳章节→切介绍/文字稿→切全屏→关闭→重开 | `apps/web/cards/media-detail.tsx` | `Reader/MediaDetail.swift`；`Reader/MediaPlayback.swift`；`Reader/OfficialVideoPlayer.swift` | 同一支持地址可播放；位置不在放大时丢失；无文字稿默认介绍；失败有真实反馈。C14/A10待处理或验收；播客是只读介绍 | 待执行 |
| B13 | 逐个修改桌面、外观、阅读字号/宽度、叠卡/读完设置；重开应用 | `apps/web/interactions/panel-settings.tsx` | `Settings/SettingsView.swift`；`Settings/SettingsControls.swift` | 每个开关/分段值、即时效果与持久化一致；设置作用对象正确；未实际改变的值不提示成功；U14/A33/A34对应细节 | 待执行 |
| B14 | 导出同一组卡片与状态→比较解析结果；清空确认框先取消 | `apps/web/views/cloud-views.tsx`；本地Store导出 | `Settings/SettingsDataPage.swift`；`Model/Workspace.swift` | 导出卡片/状态/数量完整；文件选择器可为原生实现；取消无数据改变；实际清空需隔离数据和明确授权 | 待执行 |
| B15 | 备份配置→连接检查→创建→列表→恢复预览→取消；隔离数据中确认恢复 | `apps/web/interactions/backup-settings.tsx` | `Settings/BackupSettingsView.swift`；`Model/BackupModel.swift`；`SillKit/BackupAPI.swift` | 状态以服务端回执为准；恢复先预览并核对revision；重复提交复用操作标识；U16/U17是表单差异；未触及真实备份 | 待执行 |
| B16 | 同时触发菜单、详情、设置、提示；Esc逐层返回；Tab/ShiftTab循环 | `apps/web/views/app-input.ts`；`apps/web/views/app-surfaces.ts` | `Shell/DesktopInteraction.swift`；`Shell/Panel.swift`；`Reader/ReaderOverlay.swift` | 只有顶层接收键盘/滚动；焦点返回正确入口；读屏名称与状态完整；普通卡与叠卡分别测Enter/Space；F12/F13/F18为检查重点 | 待执行 |
| B17 | 打开应用、重开窗口、最小化恢复、窗口缩放、深浅色切换；在输入和阅读时重复 | Web桌面窗口与主题入口 | `App/SillApp.swift`；`Shell/DesktopView.swift`；`Shell/TopBar.swift` | 内容/草稿/选择不丢；系统标题栏、⌘快捷键、原生窗口控制按平台记录；产品内容尺寸和位置须可逐项比较 | 待执行 |
| B18 | 查看来源链接、文件附件、关联卡片与当前外部助手入口；核对取消的流程 | `apps/web/cards/detail-blocks.tsx`；`docs/product/agent-mcp.md` | `Reader/CardDetailFields.swift`；`Reader/ExternalLink.swift`；Mac当前入口 | HTTP(S)目标一致；关联卡按层打开；不新增RSS/导入/记一笔/复杂正文编辑/假助手。云端MCP能力不等同于内置助手已实现 | 待执行 |

## 6. 本轮检查边界

本轮完成源码对照与清单整理；未运行登录、浏览器、Mac窗口自动化、e2e、真实媒体、云端写入、备份恢复或性能采样。用户截图只证明U01所示重叠。原有构建和后台测试结果不填入本表的界面通过栏。

后续实测逐项保存结果，不能将整个模块一次性勾为通过。具体时长用对应合成计时检查；窗口实测用于位置、内容、焦点、手感和流畅度。后续证据追加到新的日期记录并更新现行对账表，保留本次快照。

## 7. 长期跨端检查项目覆盖

对应[跨端对齐检查清单](../../agents/cross-platform-checklist.md)的所有桌面适用项。这里“对应”表示已建立检查位置，不表示实测完成；L02、M01等明确保留未验证。

| 长期编号 | 本次清单位置 | 核对范围 |
| --- | --- | --- |
| C01 | C01–C24、12类覆盖表 | 卡面与详情字段、顺序、空值、长内容 |
| C02 | F06/F07、B05/B09/B18 | 轻操作、失败、禁用、外部执行边界 |
| C03 | U21、B13/B17 | 主题、颜色、字体、圆角、图标；运行视觉未验证 |
| C04 | C01/C02/C20/C21、F11、B11 | 阅读结构、排版、位置 |
| C05 | F04/F05/F07、C05 | 更新后的成员、顺序、占位和完成状态 |
| L01 | U21、F09、A03 | 窗口宽度、列数、测量 |
| L02 | U21 | 顶栏玻璃、渐变与搜索材质；未做实际视觉对比 |
| L03 | U01/U02/U20、A26/A28/A40 | 底栏、AI、工具、提示的独立位置与切换 |
| L04 | C04/C17/C19/C22/C24、13组卡片用例 | 短/长内容、缺图、换行与遮挡 |
| M01 | A41 | 按压、悬停、焦点逐控件检查；待核实 |
| M02 | U20、A40、B16 | 分栏菜单、原生卡片菜单例外及边缘锚点 |
| M03 | F04、A01–A03 | 首屏、分页、增删、筛选与重排 |
| M04 | C05、U09/U10、A27/A35/A36 | 局部状态、图片、标签和引用变化 |
| R01 | A07、B11 | 从来源卡片展开的路径 |
| R02 | A08/A10、B11 | 外壳、正文、工具的进入时序 |
| R03 | A09、F05 | 关闭交接和来源卡片更新 |
| R04 | F05、B11 | 来源移除/屏外时的返回路径，需补实际场景证据 |
| R05 | A06/A10/A18/A26/A36 | 快速反向、中断与旧完成回调 |
| R06 | F11/F12、A10/A11、B11 | 放大缩小、嵌套、逐层返回 |
| G01 | A12–A15、U20 | 滚动、工具条显隐与边缘 |
| G02 | A16/A17、F05、B11 | 读完上推、写入回执及失败 |
| G03 | F16/F17、A18–A20 | 刷新各阶段、失败与重试 |
| G04 | A06/A16/A19/A36 | 鼠标与触控板输入分开，原生结束和惯性 |
| G05 | F08–F10、A04–A06 | 叠卡形成、跟手、首尾和Mac平移例外 |
| N01 | F02、U05–U08、A29–A32 | 搜索、输入法、候选与清空 |
| N02 | F01–F03、B03 | 分栏、标签、状态及位置保存 |
| N03 | F12/F13、U20、B16 | 顶层输入与焦点恢复 |
| N04 | U09/U10/U14–U17、B06–B08/B13–B15 | 设置、标签备注、批量、冲突与未知写入 |
| N05 | F16、U06/U20、B02/B04、A40 | 加载、空、失败、离线、新内容和提示 |
| N06 | U04/U11/U12、B01/B12/B18 | 登录、授权、媒体和未接入能力 |
| P01 | 不适用于本次桌面Mac对照 | 手机/PWA另有布局与系统键盘范围；本次不复制 |
| P02 | F13/F18、U08、B16/B17、A22 | 键盘、读屏、系统偏好与平台差异 |
