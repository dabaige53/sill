# 测试目录

更新：2026-10-23。自动检查验证当前代码，历史报告不表示当前全部能力通过。报告与验收记录统一从 [文档目录](../docs/README.md) 进入。

以下命令是按需入口，不是默认执行清单。运行前按 [测试与验证](../docs/guides/testing.md) 确认授权、范围和结果边界。

## 目录与默认范围

| 类型 | 源码位置 | 执行方式 |
| --- | --- | --- |
| 数据约定 | `contracts/` | `npm run test:contracts` |
| Web 非浏览器 | `web/` | `npm run test:core` |
| 服务端与集成 | `server/` | `npm run test:server`；真实 Postgres 单独运行 |
| 浏览器交互、布局与性能 | `e2e/` | 按下表选择专项，不默认执行 |
| Apple 数据与桌面状态 | `apps/apple/Tests/`、`apps/apple/DesktopTests/` | `npm run test:macos` |
| Mac 原生界面 | `apple/PerformanceUITests.swift` | 显式 `npm run perf:macos -- ui` |
| 后台性能与报告 | `apps/apple/DesktopTests/PerformanceBenchmarks.swift`、`apple/performance-report.test.ts` | `npm run perf:macos`；`npm run test:performance-report` |

`npm test` 负责静态检查、构建、数据约定、Web、服务端和性能报告解析；不启动浏览器或 Mac 窗口，不执行 Swift 测试、性能基准及 Docker Postgres。报告解析不需要 Xcode。构建产物断言统一由 `scripts/check.ts` 管理。

CI 分工：`test.yml` 执行默认 Node 检查和本地浏览器流程；`verify.yml` 负责 Web 格式、构建一致性和专项浏览器流程；`supabase.yml` 负责真实 Postgres 和云端浏览器流程。`consent-policy.yml` 保留独立的快速授权策略反馈，因此这项安全检查与默认 Node 检查有意重叠。`macos.yml` 在相关输入变更时执行 Apple lint、Swift 非界面测试和 Mac 构建与签名检查。性能基准仍按需运行。

旧数据迁移、未知字段保留、已移除入口不可见等测试属于当前兼容性检查，不按文件年龄删除。辅助模块由对应入口加载，不逐文件独立执行。删除记录见 [2026-10-21 测试整理](../docs/records/2026-10-21-test-cleanup/README.md)。

## 按改动选择检查

| 改动 | 入口 | 边界 |
| --- | --- | --- |
| 排版偏好 | `node --import tsx --test tests/server/layout-preferences.test.ts tests/web/layout.test.ts`；`node tests/apple/run.ts --filter AppearanceTests` | 合成数据库：迁移保留数据、偏好批量写入、冲突、重放、非法值回滚；Mac 排版缓存与旧数据默认值，不启动界面 |
| 文件归属、导航、忽略规则 | `npm run files:check` | 只读，不启动服务 |
| Codex 提交前文件大小钩子 | `node --test tests/server/check-staged-file-tokens.test.ts` | 临时 Git 仓库与合成 hook 输入；字节边界、UTF-8、部分暂存、特殊文件名、豁免、改名、删除与 Codex 阻止结果 |
| 完整 Node 检查 | `npm test` | 文件、Schema、构建、语法、类型、共享约定、Web 核心、全部服务端测试与性能报告解析 |
| 共享约定 | `npm run test:contracts` | 合法、非法与旧来源迁移样例；纯合成文件，验证读不改写和未知字段保留 |
| 技能示例与 MCP 字段一致 | `node --import tsx --test tests/server/mcp-guidance.test.ts` | 直接读取技能 JSON 示例，通过隔离 MCP 创建、重读、更新、批量与重复请求；检查字段目录与实时工具定义一致，不访问线上 |
| 明确字段、MCP 和数据库一致 | `npm test`（`server/explicit-card-fields.test.ts`） | 3.0.0 字段、完整与局部写入、未知扩展、旧 meta 拒绝、日期精度、时长清空及过期防护；隔离 PGlite / HTTP / MCP，不操作线上 |
| 刷新手势 | `node --import tsx --test tests/web/gesture-refresh.test.ts` | 合成输入：刷新触发、取消、忙碌锁和输入归属；从通用手势测试独立拆分 |
| Web 核心 | `npm run test:core` | Node/JSDOM 与字符串打包，不代替浏览器视觉验收 |
| 浏览器交互与布局 | `npm run test:browser`、`npm run test:local-browser`、`npm run test:navigation-recovery` | 按改动选择；输出放被忽略的 `artifacts/` |
| 卡片字段显示边界 | `npm run build && node tests/e2e/card-fields-browser.ts` | 隔离合成卡片，390/1440 浅深色；缺发件人、未知与零时长、缺正文、段落和章节数分别显示，媒体没有模拟播放或进度写入 |
| 内容自适应抽屉、边界阻尼与背景锁定 | `npm run build && node tests/e2e/drawer-browser.ts` | 合成卡片：短内容高度、长文上限及滚动扩展、PWA 按钮、边界阻尼与位置还原；不代替 iPhone 实测 |
| 搜索和主页独立、详情返回 | `npm run build && node tests/e2e/search-browser.ts` | 合成卡片；查询和类型不改主页、搜索卡片组件、抽屉下方保留结果、前进后退与滚动还原 |
| 搜索条件分行 | `npm run build && node tests/e2e/search-filters-browser.ts` | 320/390/1440 浅深色及窄键盘空间；空查询留白、键盘出现后背景与输入框固定、具名分组、横滑边界、键盘类型/标签、状态筛选、详情返回和来源不变 |
| 原位多选与批量菜单 | `npm run build && npm run test:selection-browser` | 隔离合成卡片；桌面、390×844 触屏、长按原位选择、无角落对号与长按缩略图、主页/搜索独立选择、工具条进出与中断、焦点、取消、滚动与写入边界 |
| 拖动卡片中心跟随鼠标 | `npm run build && node tests/e2e/drag-center-browser.ts` | 合成卡片、桌面浅深色；单卡和多卡副本中心、原卡位置、取消和拖入 AI 框；不发送内容或改变卡片 |
| 工具条收起、输入法、搜索与导航胶囊 | `npm run test:core`（`web/chrome.test.ts`） | JSDOM：向下滚动收起、抖动不触发、到顶到底与停下回来、键盘焦点回来；拼写中不筛选；搜索不显示数量；导航胶囊四格、镜片跟随、设置「添加」组、AI 面板没有可点动作 |
| 内容保真与阅读密度 | `npm run build && npm run test:material-density` | 合成卡片：中等桌面列宽、紧凑五列上限、任务焦点、摘要原文、长要点与任务换行；1320px、390px、320px，截图在 `artifacts/material-density/` |
| 动效中断与材质回退 | `npm run build && npm run test:motion-material` | 真实 Tab、CDP touchCancel、迟到关闭、拖动层级、工具条延迟、菜单入场中断、提示替换与详情反向切换、无 blur 分支演练、引用区内滚动；不代替 Safari 或原生端验收 |
| PWA 触控与名称提示 | `npm run build && npm run test:pwa-touch` | 合成卡片，320/390/1440、深浅色、触摸长按后不执行、真实 Tab 显示名称、提示边界；不代替 iPhone 系统菜单与主屏幕实测 |
| PWA 极端内容交互预览 | `npm run build && node tests/e2e/pwa-stress-preview.ts` | 隔离随机端口；Demo／Worst case／Empty／One／1,000 rows，宽度、主题与文字切换；`pwa-stress-fixture.ts` 校验合成卡片，不读取本地产品数据，不自动启动浏览器；200% 仅为内容字号压力条件 |
| 阅读展开与触摸归属 | `node --import tsx --test tests/web/motion-sheet.test.ts tests/web/gestures.test.ts tests/web/gesture-preview.test.ts tests/web/gesture-surfaces.test.ts` | 合成尺寸、触摸、计时器和绘制帧：按住不展开、松手展开、圆角裁剪与安全区衔接、反向中断、普通点击、取消、多指、旧面板回调、横向内容与控件、每帧合并；不代表真机性能 |
| 照片通用操作 | `npm run build && node tests/e2e/photo-toolbar-browser.ts` | 合成照片，320/390/1440 与浅深色；收藏、稍后读、保存或取消标签回到原照片、隐藏偏好和生成组件包的固定深色环境；不代替真机 |
| 卡片操作设置示例 | `npm run build && node tests/e2e/card-actions-settings-browser.ts` | 三宽度、浅深色；九个示例、读屏说明、开关名称与焦点、末项可滚动到达、仅修改指定偏好，文章三视图同一字段和末尾备注框，不修改来源卡片 |
| 主页五分栏 | `npm run build && node tests/e2e/home-tabs-browser.ts` | 320/390/1440 浅深色与 1920 宽屏；桌面对齐、五个筛选结果、单个当前项、搜索条件隔离、切换后恢复阅读位置且导航保持可见、来源卡片不变 |
| 下拉刷新图标反馈与请求锁 | `npm run build && node tests/e2e/refresh-motion-browser.ts` | 合成卡片、Chromium 触屏事件、轻阈值与取消、快速请求保留反馈、真实等待、成功勾与失败重试、慢请求防重复、正常滚动；云端错误不弹文字反馈；不代替 Safari/iPhone 实测 |
| 手势布局与关闭性能 | `npm run build && node tests/e2e/gesture-performance-browser.ts` | 合成手机正文、CPU 4 倍限速；固定内容尺寸、关闭期间布局和绘制、返回后工具条与导航状态；不代表真机帧率 |
| 单卡交给宿主助手 | `npm run test:core`、`npm run build:cloud && npm run test:cloud-app-browser` | 真实 SDK 协议的 sandbox 宿主模拟：能力协商、账号条件、单次发送、回执未知、手动复制回退、外链确认与明确拒绝的草稿恢复；不发送真实对话 |
| 云端服务 | `npm run test:supabase`、`npm run test:cloud-app` | 本地检查不代替生产数据和账号验收 |
| 外部备份与恢复 | `node --import tsx --test tests/server/backup*.test.ts tests/web/backup-transport.test.ts` | 合成 WebDAV/R2、MCP 权限、AES 绑定、不可变快照、原子恢复、版本冲突及未知回执，不连接真实网盘 |
| 设备提醒 | `node --import tsx --test tests/web/system-reminders.test.ts`；`node tests/apple/run.ts --filter SystemReminderTests` | 模拟权限、通知事件、调度和账号生命周期，不投递系统通知 |
| 图片与播放器策略 | `node --import tsx --test tests/web/image-assets.test.ts tests/server/media-policy.test.ts tests/server/player-policy.test.ts tests/server/cloud-app.test.ts` | HTTPS 图片与 MCP 资源策略，实际媒体及真实宿主另验 |
| OAuth | `npm run test:oauth` | 真实授权另行验收 |
| 云端页面 | `npm run test:cloud-browser`、`npm run test:cloud-app-browser`、`npm run test:cloud-operations` | 不默认访问生产 |
| Mac | `npm run test:macos` | SillKit 数据层与桌面状态检查，再校验 `dist/macos/Sill.app` 签名；先运行 `npm run build:macos` |
| 格式与类型 | `npm run lint`、`npm run typecheck` | 只读；默认规则警告不代表已实现全仓 strict |
| Postgres | `npm run test:supabase:postgres` | 需要可用 Docker；使用合成容器数据，不连接生产 |

`hiddenActions` 的迁移前拒绝、迁移后保存、非法批量回滚由 `server/helpers/hidden-actions-migration.ts` 共用断言验证。`server/cloud-workspace.test.ts` 在 PGlite 运行，Postgres 入口加载相同迁移并调用同一断言。本机没有 Docker 时写明「未执行」；CI 结果另记，不代替生产迁移部署。

`server/` 的云端迁移检查之外，`web/app.test.ts` 验证控制器拆分前后的设置焦点、滚动、动作开关、外链账号边界和详情尺寸定位。完整 Node 检查会自动运行；真实抽屉、键盘与云端保存仍由相关浏览器专项覆盖。

`web/panels.test.ts` 覆盖 11 类卡片、播客、转义、助手动作位置、关联卡片、任务与提醒状态。C3 的完整 HTML 比较仅在本机运行，摘要保存在检查记录。非 Linux 环境运行 `test:cloud-welcome` 时，通过 `CHROMIUM_PATH` 指定已安装的 Chromium，不安装新浏览器或修改断言。

专项命令以 [package.json](../package.json) 为准。`server/helpers/` 放服务端测试工具；跨端浏览器流程位于 `e2e/`。旧入口专用测试已随实现删除，可从 `legacy-final` 查阅。不提交真实 token、用户卡片或导出。历史报告已移入 `docs/archive/test-reports/`，不在此维护第二份文档导航。文件规则见 [文件管理规范](../docs/guides/file-management.md)。

浏览器入口保留服务启动、合成数据和结果汇总；相邻模块按卡片操作、阅读与选择、捕获与布局、触控与拖动、材质和抽屉场景分组，按原顺序执行。`web/selection.test.ts` 与 `server/oauth-consent.test.ts` 分别注册相邻模块中的全部测试；`server/supabase-postgres.ts` 在同一容器中依次运行权限与 OAuth 检查。拆分模块不单独启动浏览器、服务或数据库。

`web/gesture-fixture.ts` 提供手势测试的合成页面、计时器和动画边界；`web/gestures.test.ts` 只保留行为断言。

Web 拆分入口：`app.test.ts` 与 `nested-navigation.test.ts` 共用 `app-fixture.ts`；`search-state.test.ts` 与 `search-desktop.test.ts` 共用 `search-state-fixture.ts`；`visibility-motion.test.ts` 与 `detail-motion.test.ts` 共用 `visibility-motion-fixture.ts`。辅助文件只提供合成环境，由测试入口加载。

`e2e/browser.ts` 将内置视频示例的精确封面地址替换为合成图片；其他意外外网请求仍中止并使场景失败。

`web/reader-outline.test.ts` 使用合成 DOM 检查鼠标与键盘目录立即定位、目录常显且无切换按钮；`web/layout.test.ts` 和 `web/visibility-motion.test.ts` 检查手机卡片重排与顶部栏首次显示。均为非浏览器检查，不代替真实页面验收。

动画第一、第二批：`app.test.ts` 覆盖提醒详情保留、头像按压、开关滑块和手动记录入口移除；`selection.test.ts` 及其辅助文件覆盖菜单移除、批量取消收藏、拖动目标显隐；`gesture-preview.test.ts` 覆盖桌面边缘复位时长。已有浏览器脚本已同步删除入口的预期，本轮未运行。

动画复核调整：`toggle-motion.test.ts` 覆盖未变化开关重绘与反向接续；`gesture-preview.test.ts` 覆盖可中断回弹；`tests/server/local-sync.test.ts` 区分首次数据无入场与后续更新；多选测试覆盖操作后保留胶囊及拖动时原位 AI 接收框切换。

`web/local-launch.test.ts` 检查快慢本地启动均保留页面框架、只在卡片区等待数据、定时占位清理和首次卡片只显示一次，并检查 HTML 启动前的主题恢复。合成 DOM 不代替真实网页刷新验收。

设置按钮按压与开关反馈的控制器检查位于 `web/control-feedback.test.ts`，共用 `web/app-fixture.ts`；公共操作路由继续由 `web/app.test.ts` 覆盖。

滚动输入与释放检查位于 `web/gesture-input.test.ts`；参考回弹、内容层与尾段接手在 `web/gesture-rebound.test.ts`；任务／提醒原位更新在 `web/completion-state.test.ts`。均为非浏览器检查，不证明实际帧率。
