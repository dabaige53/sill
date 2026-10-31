# 错误索引

按报错、现象或模块查找诊断正文。状态、原因和解决情况以链接内的记录为准；旧记录的验证只对当时环境成立。收录与维护方式见[错误记录规范](../agent/error.md)。

| 记录日期 | 平台或模块 | 症状与检索词 | 诊断正文 |
| --- | --- | --- | --- |
| 2026-10-31 | 卡片内容一致性 | summary 裁剪、详情概要、待办/提醒名称、截止位置、缺时间、6 项清单 | [第一批定位与修改](2026-10-31-card-content-consistency/README.md) |
| 2026-10-31 | MCP 工作台入口 | 首次未能显示 sill、重试恢复、1.2.21、网络证据未取得 | [工作台首次加载再次失败](2026-10-31-production-acceptance/diagnosis.md#工作台首次加载再次失败) |
| 2026-10-31 | 卡片类型与来源 | missing_video_image、invalid_authors_type、播客全文超时、Drive 元数据非全文 | [新增类型校验与来源缺口](2026-10-31-production-acceptance/diagnosis.md#新增类型校验与来源缺口) |
| 2026-10-31 | 插件包装与发布 | tar、AppleDouble、._ 文件、插件与云端版本差异 | [生产发布与包装清理](2026-10-31-production-acceptance/release.md#1220-实际发布与复验) |
| 2026-10-31 | 生产 MCP、skills 与工作台 | INVALID_ARGUMENT、冲突原因缺失、旧游标、回执截断、搜索工具发现、summary 示例、控件超时、日程下载回执、来源认证 | [生产流程与兼容性](2026-10-31-production-acceptance/diagnosis.md) |
| 2026-10-31 | CI 与测试 | main 持续变红、PR 继承失败、排序断言、新卡在顶部、打开即已读、missing_summary、下拉取样、Date.now 平局 | [main CI 失败诊断](2026-10-31-main-ci-tests/diagnosis.md) |
| 2026-10-31 | MCP 写入与卡片跳转 | 目录误开外链、全屏首击定位偏差、defaultPrevented、封面未显示、链接写不进去、HTTPS pattern、connector schema validation、files url、去原文打不开、加入会议无效、openLinks、mailto、sources url、missing_summary | [卡片链接写入与跳转](2026-10-31-card-links/diagnosis.md) |
| 2026-10-30 | 设置画板生成 | ERR_UNKNOWN_FILE_EXTENSION、avatar.png、window is not defined、AIDock、previews.ts | [设置画板生成修正](2026-10-30-settings-about-backup/README.md#检查) |
| 2026-10-30 | MCP 写入与信息流排序 | 导入缺时间、提醒没有 due、秒级时间、1970、正文被精简、广告没删、新卡在底部、没有新内容提示、排序乱 | [导入缺时间与新卡沉底](2026-10-30-import-time-feed-order/diagnosis.md) |
| 2026-10-30 | Mac 启动与资源包 | 打开即崩溃、EXC_BREAKPOINT、NSBundle.module、Cover.image、Sill_Sill.bundle、头像体积 | [Mac 资源包定位与头像压缩](2026-10-30-macos-resource-bundle/README.md) |
| 2026-10-30 | 手机搜索 | 点分类白闪、分类网格消失、关闭卡片后空白页、只剩搜索框和取消、分类网格截断只显示一行、--kb 残留、切换搜索一帧空白 | [手机搜索闪屏与空白页](2026-10-30-phone-search-flash/diagnosis.md) |
| 2026-10-30 | Codex 插件技能列表 | Dev 长前缀、dev mode、display_name、技能详情与输入框名称不一致 | [技能显示名称](2026-10-30-plugin-skill-names/diagnosis.md) |
| 2026-10-30 | 手机 AI 输入框与搜索抽屉 | 输入框第二次点击底部上移、键盘收起露出主页、正文截断与底部留白、下滑关闭失效、导航胶囊出现、search-background | [手机页面状态交接排查](2026-10-30-phone-page-lifecycle/README.md) |
| 2026-10-29 | Web/PWA 手机下拉刷新 | 惯性后下拉失灵、断触、要松手重拉、滑回顶部刷新异常、斜向起手、按钮上下拉无效、touchmove cancelable、scrollY | [手机下拉刷新惯性后失灵](2026-10-29-pull-refresh-handover/README.md) |
| 2026-10-29 | Web 多选操作栏 | 稍后读无法取消、按钮不生效、AI 输入框遮挡、服务器保存 | [多选操作与保存验证](2026-10-29-interface-hardening/README.md#多选稍后读按钮2026-10-29) |
| 2026-10-29 | Web 桌面分栏 | 两个 Sill、重复字标、菜单字标偏小 | [重复字标诊断](2026-10-29-interface-hardening/README.md#web-桌面重复字标2026-10-29) |
| 2026-10-29 | Web 搜索画板 | html-validate、helmet、Inline style、label、fieldset | [搜索画板诊断](2026-10-29-interface-hardening/README.md#web-搜索画板诊断2026-10-29) |
| 2026-10-29 | Web/PWA 备份与错误恢复 | 保存期间输入被清空、小屏长地址、错误消息溢出 | [跨端界面健壮性检查](2026-10-29-interface-hardening/README.md) |
| 2026-10-29 | 视频预览 | Vite、刷新仍显示旧布局、全屏页签 | [视频预览旧布局](2026-10-29-video-preview/diagnosis.md) |
| 2026-10-29 | 发布前界面审核 | 归档分组顺序、Mac 目录位置、播客空封面、键盘多选、重复清空文案 | [首次发布界面审核](2026-10-29-release-ui-polish/README.md) |
| 2026-10-29 | 设计生成检查 | stale、FeedCard、CheckItem、组件预览过期 | [设计预览检查失败](2026-10-29-doc-layers/diagnosis-design-preview.md) |
| 2026-10-23 | MCP 页面资源 | 未能显示 Sill、Resource unavailable、旧版本 URI、404、工具成功但页面打不开 | [MCP 工作台旧入口恢复](2026-10-23-mcp-resource-recovery/README.md) |
| 2026-10-23 | 登录与宿主授权 | 登录失败但刷新恢复、新标签页、会话建立但插件调用失败、over_email_send_rate_limit | [账号密码登录与授权恢复](2026-10-23-login-completion/README.md) |
| 2026-10-29 | 手机文章详情 | 关闭按钮偏低、封面、顶部间距 | [文章关闭按钮间距](2026-10-29-article-close-spacing/README.md) |
| 2026-10-29 | 手机搜索与抽屉 | 底部变白、分类截断、抽屉底部透出卡片 | [手机底部显示问题](2026-10-29-phone-bottom/README.md) |
| 2026-10-29 | Web 云端卡片与状态同步 | 闪屏、展开结束闪一下、待办打勾闪烁、收藏、稍后读、保存回执、详情重建、opacity | [卡片状态闪屏诊断与发布](2026-10-29-card-state-flash-release/README.md#闪屏诊断) |
| 2026-10-30 | 手机卡片抽屉 | 打开卡片后闪一下、关闭后卡片空白、详情白帧、背景尺寸跳变、底部工具栏、遮罩、图层重绘、Vaul | [手机抽屉打开结束闪一下](2026-10-29-card-state-flash-release/diagnosis-phone-drawer.md) |
| 2026-10-29 | Web 旧速记流程 | 记一笔已删除仍进入速记编辑、内联编辑残留、自动保存 | [删除速记专属流程](2026-10-29-quick-capture-removal/README.md) |
| 2026-10-29 | 本地同步测试 | local-sync、备注冲突、bulk tags、editorLayer、旧测试模拟 | [发布检查诊断](2026-10-29-product-refresh/README.md#发布检查诊断) |
| 2026-10-29 | 云端示例 | welcome-demo、loadDemo、示例写入账号、无法退出示例 | [发布产品仅使用云端数据](2026-10-29-cloud-only/README.md) |

| 2026-10-29 | MCP SDK | McpUiInitializeResultSchema、request、isError 类型错误 | [Codex 卡片引用发布](2026-10-29-codex-card-context/README.md#发布检查诊断) |

| 2026-10-29 | Web/PWA 与 Mac 性能 | 全量轮询、保存序列化、布局测量、页面重复下载 | [跨端性能优化](2026-10-29-performance/README.md) |
