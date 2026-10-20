# Sill Apple

更新：2026-10-20。

一个 Swift Package。macOS 用 SwiftUI 与 AppKit 实现当前 Web 工作台，默认登录同一云端账号并读写同一工作区；不使用 WebView、Node 或后台服务。SillKit 提供卡片校验、本地存储与云端客户端。iOS 仍只有共享数据层，没有界面或设备验收。

## 产品与数据

- 卡片内容、文案、功能与业务状态以当前 Web 与设计系统为准；Mac 卡片由 SwiftUI 原生视图按现有圆角、留白与字体层级组成；动作保留键盘与 VoiceOver 语义，勾点和按钮按 Web 样式绘制。卡片不加玻璃；阴影、圆角、颜色与动效对齐 Web。浮动工具使用 Web 对应材质与阴影，右键菜单保留系统菜单。Mac 使用统一信息流：顶部品牌、分栏菜单、搜索和账号，底部 AI 输入区与多选工具条互相切换；已有正文由助手修改，用户保留速记与轻操作。
- 云端使用既有密码登录、会话、工作区与原子批量接口。Cookie 保存在系统钥匙串，密码不持久保存；固定可信 HTTPS 服务，不自动跟随重定向，不使用 service-role 凭据。账号切换清理界面中的旧账号内容。
- 邮件登录新增 `client=macos` 的 PKCE 回调适配。浏览器只把一次性 code 转给 `sill://auth/callback`，原生持有验证信息并回 HTTPS 兑换。回调地址已写入应用包；这条链路需要服务端发布并核对 Supabase redirect 配置，源码完成不表示线上已可用。
- 卡片写入携带读取时的版本；标签与备注保留打开时的编辑基准，冲突保留输入。批量操作整批保存。请求结果未知先读取确认，不重发写请求；未确认前阻止新的写操作。待核对请求只在当前进程保留，不是持久执行队列。
- AI 输入区与 Web 一样只展示所选卡片和临时输入，不能发送，不连接模型。独立原生应用没有 MCP App 宿主消息能力，不显示虚假的助手交接入口。
- 媒体正文按普通段落展示，不提供演示播放或把阅读进度当作播放进度；仅在提供时显示总时长，真实零时长保留。来源字段只记录出处，不接入来源或同步外部内容。

## 本地数据兼容

旧数据 `~/Library/Application Support/Sill/` 保持原样，不自动上传。显式传入 `--data-directory /tmp/sill-native-check` 可打开独立本地工作区，供合成数据检查使用。默认启动走云端，不把本地文件当作当前账号数据。

本地 cards.json 保留 revision/state 结构、未知字段与旧来源迁移。每次写入在文件锁内读取并检查版本，再原子替换；桌面会话持有独占锁。第二个应用不能同时编辑同一工作区。锁文件存在不表示正在占用。

## 构建与检查

需要 Apple Silicon Mac、支持 Swift 6 的 Xcode 和 Node 24+。Node 只用于构建，不进入应用包。

```sh
node tests/apple/run.ts
node scripts/build-macos.ts
codesign --verify --deep --strict dist/macos/Sill.app
```

产物为 `dist/macos/Sill.app`，仅本机 ad-hoc 签名；构建不表示安装、公证、部署或真实账号验收。测试使用临时目录与模拟 HTTP 响应，不访问真实卡片或账号。桌面视觉与交互须另外在实际窗口对照 Web 检查，不能用编译通过替代 1:1 验收。

设置使用独立 Settings 窗口，支持系统 ⌘,；阅读保留主窗口内的居中预览与展开，点击卡片不另开窗口。主窗口缩放和全屏由系统管理。速记、标签和备注通过 Sheet 操作，保存仍检查编辑基准与冲突。信息流按滚动位置分批加载，同一次呈现复用筛选和分组结果，滚动采样不重新筛选全部卡片；任务行按任务 ID 保持身份；本轮保留原有减少动态效果分支，新增动效采用手册规定的统一参数。

构建会检查 Mac 源码中的完整文案键；失效引用会阻止构建。搜索、分栏共用同一信息流，支持 ⌘1–5 切换分栏与 ⌘K 聚焦搜索；AI 上下文追加并去重。

工作区使用 Observation 按视图实际读取的字段更新。滚动位置、操作版本与阅读活动时间不发布界面更新；阅读进度由独立视图显示和延迟保存。空搜索不拼接正文，排序在每轮计算中只为每张卡计算一次优先级。日程与提醒的相对时间和退色由卡片内的分钟时钟更新，不依赖后台刷新。卡片阴影只绘制不透明的背景形状；原生标题栏、分栏菜单、速记按钮与搜索共用窗口工具栏。

类型、文案和图标在构建时由 `contracts/` 与 `design-system/` 生成。四张封面 PNG 是 Web 现有 SVG 图像的原生资源副本；构建随 SwiftPM 资源包复制，不能依赖开发机的路径。新增设计值必须回到设计系统维护。

## 源文件职责

- `Desktop.swift` 保留窗口与状态；`DesktopFeed.swift` 组织统一信息流、顶部搜索与归档；`DesktopActions.swift` 处理选择、标签与 AI 输入区；`DesktopInteraction.swift` 处理键盘、滚动与提示计时；`DesktopPresentation.swift` 保存展示状态类型。
- `CardReader.swift` 保留阅读浮层与状态；`CardReaderContent.swift` 展示正文与信息；`CardReaderMetadata.swift` 处理备注、标签、媒体正文与总时长。
- `ReaderActivity.swift` 保存阅读进度与活动时间；`ReaderProgress.swift` 独立更新进度条并保存进度，避免滚动时重新计算正文。
- `CardTile.swift` 展示卡片；`CardActions.swift` 提供共用卡片控件与动作。`WorkspaceFeed.swift` 负责主页排序与搜索过滤。
- `CloudWorkspace.swift` 负责云端工作区；`CloudSessionVault.swift` 负责会话存储。跨文件扩展只开放必要的模块内成员，不增加公共接口。

本轮视觉与动效的逐条对照、变量增量及非界面检查见 [macOS 对齐记录](../../docs/records/2026-10-20-macos-web-alignment/README.md)。`NativeMotion` 与 `NativeShadow` 读取生成变量；`FeedCollection` 管理列表入退场，`CardMenu` / `ScopeMenu` 管理独立菜单，`ReaderGestureState` 与 `ScrollObservation` 管理读完、关闭与惯性边界。
