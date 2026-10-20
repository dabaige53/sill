# 测试目录

更新：2026-10-20。自动检查验证当前代码，历史报告不表示当前全部能力通过。报告与验收记录统一从 [文档目录](../docs/README.md) 进入。

以下命令是按需入口，不是默认执行清单。浏览器测试、视觉自动化及 e2e 仅在用户明确确认需要时执行；e2e 只覆盖本次修改涉及的场景，完整 e2e 须另有明确授权。未获授权时直接跳过，不例行询问。详见 [项目测试授权](../AGENTS.md#验证与测试授权)。

| 改动 | 入口 | 边界 |
| --- | --- | --- |
| 文件归属、导航、忽略规则 | `npm run files:check` | 只读，不启动服务 |
| Codex 提交前文件大小钩子 | `node --test tests/server/check-staged-file-tokens.test.ts` | 临时 Git 仓库与合成 hook 输入；字节边界、UTF-8、部分暂存、特殊文件名、豁免、改名、删除与 Codex 阻止结果 |
| 完整 Node 检查 | `npm test` | 文件、Schema、构建、语法、类型、共享约定、Web 核心和全部服务端测试 |
| 共享约定 | `npm run test:contracts` | 合法、非法与旧来源迁移样例；纯合成文件，验证读不改写和未知字段保留 |
| 明确字段、MCP 和数据库一致 | `npm test`（`server/explicit-card-fields.test.ts`） | 3.0.0 字段、完整与局部写入、未知扩展、旧 meta 拒绝、日期精度、时长清空及过期防护；隔离 PGlite / HTTP / MCP，不操作线上 |
| Web 核心 | `npm run test:core` | Node/JSDOM 与字符串打包，不代替浏览器视觉验收 |
| 浏览器交互与布局 | `npm run test:browser`、`npm run test:local-browser`、`npm run test:navigation-recovery` | 按改动选择；输出放被忽略的 `artifacts/` |
| 内容自适应抽屉、边界阻尼与背景锁定 | `npm run build && node tests/e2e/drawer-browser.ts` | 合成卡片：短内容高度、长文上限及滚动扩展、PWA 按钮、边界阻尼与位置还原；不代替 iPhone 实测 |
| 搜索和主页独立、详情返回 | `npm run build && node tests/e2e/search-browser.ts` | 合成卡片；查询和类型不改主页、搜索卡片组件、抽屉下方保留结果、前进后退与滚动还原 |
| 搜索条件分行 | `npm run build && node tests/e2e/search-filters-browser.ts` | 320/390/1440 浅深色及窄键盘空间；空查询留白、键盘出现后背景与输入框固定、具名分组、横滑边界、键盘类型/标签、状态筛选、详情返回和来源不变 |
| 原位多选与批量菜单 | `npm run build && npm run test:selection-browser` | 隔离合成卡片；桌面、390×844 触屏、长按原位选择、无角落对号与长按缩略图、主页/搜索独立选择、工具条进出与中断、焦点、取消、滚动与写入边界 |
| 拖动卡片中心跟随鼠标 | `npm run build && node tests/e2e/drag-center-browser.ts` | 合成卡片、桌面浅深色；单卡和多卡副本中心、原卡位置、取消和拖入 AI 框；不发送内容或改变卡片 |
| 工具条收起、输入法、搜索与导航胶囊 | `npm run test:core`（`web/chrome.test.ts`） | JSDOM：向下滚动收起、抖动不触发、到顶到底与停下回来、键盘焦点回来；拼写中不筛选；搜索不显示数量；导航胶囊四格、镜片跟随、设置「添加」组、AI 面板没有可点动作 |
| 内容保真与阅读密度 | `npm run build && npm run test:material-density` | 合成卡片：中等桌面列宽、紧凑五列上限、任务焦点、摘要原文、长要点与任务换行；1320px、390px、320px，截图在 `artifacts/material-density/` |
| 动效中断与材质回退 | `npm run build && npm run test:motion-material` | 真实 Tab、CDP touchCancel、迟到关闭、拖动层级、工具条延迟、菜单入场中断、提示替换与详情反向切换、无 blur 分支演练、引用区内滚动；不代替 Safari 或原生端验收 |
| PWA 触控与名称提示 | `npm run build && npm run test:pwa-touch` | 合成卡片，320/390/1440、深浅色、触摸长按后不执行、真实 Tab 显示名称、提示边界；不代替 iPhone 系统菜单与主屏幕实测 |
| 照片通用操作 | `npm run build && node tests/e2e/photo-toolbar-browser.ts` | 合成照片，320/390/1440 与浅深色；收藏、稍后读、保存或取消标签回到原照片、隐藏偏好和生成组件包的固定深色环境；不代替真机 |
| 卡片操作设置示例 | `npm run build && node tests/e2e/card-actions-settings-browser.ts` | 三宽度、浅深色；九个示例、读屏说明、开关名称与焦点、末项可滚动到达、仅修改指定偏好，文章三视图同一字段和末尾备注框，不修改来源卡片 |
| 主页五分栏 | `npm run build && node tests/e2e/home-tabs-browser.ts` | 320/390/1440 浅深色与 1920 宽屏；桌面对齐、五个筛选结果、单个当前项、搜索条件隔离、切换后恢复阅读位置且导航保持可见、来源卡片不变 |
| 下拉刷新图标反馈与请求锁 | `npm run build && node tests/e2e/refresh-motion-browser.ts` | 合成卡片、Chromium 触屏事件、轻阈值与取消、快速请求保留反馈、真实等待、成功勾与失败重试、慢请求防重复、正常滚动；云端错误不弹文字反馈；不代替 Safari/iPhone 实测 |
| 手势布局与关闭性能 | `npm run build && node tests/e2e/gesture-performance-browser.ts` | 合成手机正文、CPU 4 倍限速；固定内容尺寸、关闭期间布局和绘制、返回后工具条与导航状态；不代表真机帧率 |
| 单卡交给宿主助手 | `npm run test:core`、`npm run build:cloud && npm run test:cloud-app-browser` | 真实 SDK 协议的 sandbox 宿主模拟：能力协商、账号条件、单次发送、回执未知、手动复制回退、外链确认与明确拒绝的草稿恢复；不发送真实对话 |
| 云端服务 | `npm run test:supabase`、`npm run test:cloud-app` | 本地检查不代替生产数据和账号验收 |
| OAuth | `npm run test:oauth` | 真实授权另行验收 |
| 云端页面 | `npm run test:cloud-browser`、`npm run test:cloud-app-browser`、`npm run test:cloud-operations` | 不默认访问生产 |
| Mac | `npm run build:macos`、`npm run test:macos` | Swift 模型检查及产物验签，不启动应用，不代替桌面视觉验收 |
| 格式与类型 | `npm run lint`、`npm run typecheck` | 只读；默认规则警告不代表已实现全仓 strict |
| Postgres | `npm run test:supabase:postgres` | 需要可用 Docker；使用合成容器数据，不连接生产 |

`hiddenActions` 的迁移前拒绝、迁移后保存、非法批量回滚由 `server/helpers/hidden-actions-migration.ts` 共用断言验证。`server/cloud-workspace.test.ts` 在 PGlite 运行，Postgres 入口加载相同迁移并调用同一断言。本机没有 Docker 时写明「未执行」；CI 结果另记，不代替生产迁移部署。

`server/` 的云端迁移检查之外，`web/app.test.ts` 验证控制器拆分前后的设置焦点、滚动、动作开关、外链账号边界和详情尺寸定位。完整 Node 检查会自动运行；真实抽屉、键盘与云端保存仍由相关浏览器专项覆盖。

`web/panels.test.ts` 覆盖 11 类卡片、播客、转义、助手动作位置、关联卡片、任务与提醒状态。C3 的完整 HTML 比较仅在本机运行，摘要保存在检查记录。非 Linux 环境运行 `test:cloud-welcome` 时，通过 `CHROMIUM_PATH` 指定已安装的 Chromium，不安装新浏览器或修改断言。

专项命令以 [package.json](../package.json) 为准。`server/helpers/` 放服务端测试工具；跨端浏览器流程位于 `e2e/`。旧入口专用测试已随实现删除，可从 `legacy-final` 查阅。不提交真实 token、用户卡片或导出。历史报告已移入 `docs/archive/test-reports/`，不在此维护第二份文档导航。文件规则见 [文件管理规范](../docs/guides/file-management.md)。

浏览器入口保留服务启动、合成数据和结果汇总；相邻模块按卡片操作、阅读与选择、捕获与布局、触控与拖动、材质和抽屉场景分组，按原顺序执行。`web/selection.test.ts` 与 `server/oauth-consent.test.ts` 分别注册相邻模块中的全部测试；`server/supabase-postgres.ts` 在同一容器中依次运行权限与 OAuth 检查。拆分模块不单独启动浏览器、服务或数据库。

`web/gesture-fixture.ts` 提供手势测试的合成页面、计时器和动画边界；`web/gestures.test.ts` 只保留行为断言。
