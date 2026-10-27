# 动画五阶段任务交接

更新：2026-10-27。

## 工作位置与目标

用户最新确认：创建新线程继续工作，复用当前工作树，不再创建 worktree。当前 worktree：`/Users/w/.codex/worktrees/animation-stages/sill`。原 worktree：`/Users/w/.codex/worktrees/6b13/sill`，原分支 `codex/ui`，基准提交 `c9c0c7077f1890f357cf55d954d860e56ae1c4db`。新 worktree 从同一提交建立，已逐字节核对迁入全部 tracked diff 和 3 个新增文件。改动仍未提交；原目录保留，不清理或回退。

任务：按 [完整动画清单](../product/animation-checklist.md) 的五阶段顺序优化真实产品。第一、第二阶段已经实现，用户复核提出的五项反馈也已进一步修改，尚未获得最终视觉认可。第三、第四阶段已接入，下一步为用户复核和第五阶段，不能把“已实现”当作“用户已确认”。已有 ✅、原始需求和指定参考必须保留。

## 已完成与待复核

第一阶段：分栏菜单相邻灰底间隔 2px；关联行无方形悬停底色；Web 目录即时定位并删除切换图标、PWA 无目录；顶栏初次入场取消；手机卡片 FLIP 重排取消。

第二阶段：卡片及多选右键菜单移除；提醒完成后保持详情；拖入 AI 能力保留；批量取消收藏；头像按压；设置弹簧开关；Web 边缘回弹；取消 Web/PWA 记一笔入口及专用创建流程。

最新五项反馈：

- 网页刷新首次数据直接整体显示，与后续更新和下拉刷新分离。LocalSync 首次 adopt 不触发 arrival；本地页面等首次连接完成后显现，保留草稿恢复。云端首次卡片也不播放错峰。
- 实际拖动卡片时，下方胶囊切换成 AI 输入接收框；取消恢复操作条，松手到目标加入上下文。Web 主页用现有 AI 框，手机和搜索用原胶囊位置接收。不自动发送请求，内置 AI 尚未接通。
- 收藏、稍后读和批量标签保留选中与操作胶囊。
- Web 边缘直接跟手，输入停止 40ms 后以 140ms 复位；重复结束不重启动画，反向输入从当前绘制状态接续。
- 设置 toggleSpring 为 visualDuration 0.32s / bounce 0.2 / 行程 20px；重绘不打断未变化开关。覆盖旧 0.2s 参数。

主要入口：apps/web/index.ts、services/local-sync.ts、cloud-workspace.ts、views/app-lifecycle.ts、views/app-feed.ts、views/actions/selection.ts、views/app-selection.ts、atoms/selection.tsx、interactions/drag.ts、gesture-preview.ts、toggle-motion.ts；参数源 design-system/tokens/foundation.json。上述相对路径均以当前 worktree 为根。

## 剩余阶段与下一步

第三阶段已接入：Web 固定搜索与会话历史/推荐标签、目录与正文 Grid 分栏、共用工具栏节奏、播客介绍页、照片拖动轮播。实现范围和待复核项见 checklist，不代表用户已验收。

第四阶段已实现、待用户复核：任务/取消收藏闪屏，下拉刷新满环停顿及 PWA Sill 隐藏，全屏内部组件时序，多选/AI/导航交接，上下文移除，AI 折叠，PWA 搜索上移与取消/键盘。网页刷新整体显示已按最新要求覆盖原 Bento 首屏错峰方向，别再恢复错峰。

第五阶段：PWA Vaul 抽屉及底页联动，消息统一通知中心后取消 Toast/离线浮层，Mac 参考与独立实现。Mac/iOS 未因 Web 实现而自动完成。

第三阶段已实现搜索固定宽度与会话历史/推荐标签、目录 Grid 分栏、共用工具节奏、播客介绍及照片拖动吸附，均待用户视觉复核。新增实现入口为 apps/web/cards/podcast-detail.tsx、photo-carousel.tsx；移除 audio-player.tsx，视频播放类型移至 playback.ts。下一步为第四阶段的任务/取消收藏闪屏、下拉刷新、全屏时序、底部交接、AI 折叠和手机搜索。

用户在本线程授权合并 PR #72，已于 2026-10-26 合并为 be882e9996ddc6dd2008064e36990d6c432c1d4f，远端检查全部通过。该 PR 仅合并原型与记录；本 worktree 没有拉取、提交或推送动画改动。播客原型最新文件已核对。照片参考采用 Motion Carousel 的 snap: page / loop: false、拖动和按钮方向，项目已有 Motion 自行实现，未购买或安装 Motion+。

第三阶段完整 Web 非浏览器检查 402/402 通过；类型、本地/云端构建、脚本、设计 build/check 与 files:check 通过。设计画板的播客页已改由产品组件生成，真实窗口、真机和 Mac 均未视觉验收。用户参考与历史确认在 checklist 完整保存。

## 验证与运行

迁移前：类型检查、Web/云端构建、设计 build/check、files:check 已通过。最新针对性 52 项通过；完整 Web 测试 403/404，唯一失败为仍要求首屏入场的旧断言；修正该断言后相关 22 项复测全部通过。没有运行浏览器、真机、Mac 窗口验收；不宣称实际流畅度已通过。

页面继续使用 http://localhost:5173/#feed，须运行新 worktree 的 npm run dev。数据服务在 /Users/w/code/sill，4318，仅提供既有数据。它停服时 Vite 代理返回502空响应，会出现 JSON 解析错误；先恢复服务，不清空浏览器草稿，不点“放弃本机修改”。5173 与4318不同源；不要以4318旧静态前端验收新worktree。不得复制或覆盖真实本地数据。

构建/检查按 docs/guides/testing.md 选用。用户未授权浏览器自动操作、截图自动验证或 e2e；由用户手动验收。仅打开网页不构成测试授权。代码可继续修改；未经请求不提交、推送、部署。

## 协作与交付

用户此前明确允许同一 worktree 两个 fork 执行、主线程审查。旧线程第一批 01a177f1-1425-7c53-8bd9-bc5f64185d57、第二批 01a177f1-811e-7f50-a5fc-43806994eae9 已结束，仍指向旧目录；不要继续让它们写旧目录。后续是否委派遵循当前 delegation.md，明确文件责任，避免共享文件冲突。

交付用简体中文，不用加粗或表格；逐项提供 Web/PWA 的位置、动画名称、参数、预期效果。完整需求、决策与反馈记入 checklist；界面对账同步登记 Mac 缺失/未验证。最终回复以“喵～”结束。当前状态仍未提交或推送；设计未发布线上。

## 第四阶段交接（2026-10-26）

第四阶段完整范围已接入，逐项位置、动画名称、参数与待复核状态见 checklist「第四批已实现，待用户复核」。未改前三阶段的用户确认与原始反馈；历史“未实施”仅描述当时状态。

主要修改：任务详情使用React节点协调，保留工具与焦点；收藏详情退出来源列表后使用无来源关闭；刷新立即释放内容、圆环独立等待并保留Sill；文章/视频先等外框动画完成，再显示全部内部UI；视频实际Grid双栏与各自滚动；多选条与AI/导航双向接力；上下文进入/移除；AI折叠改为固定尺寸表面的接力淡化；手机搜索上移、文字取消、会话历史与输入节点保留。网页刷新仍整体直接显示，不恢复Bento或顶部入场。规则与理由为ADR0074。

实施目录始终为本文件指定的animation-stages工作树；主目录和旧6b13目录未修改。保留全部既有未提交修改。不启动浏览器、视觉自动化或e2e，不操作真实数据、草稿或本机冲突按钮。没有提交、推送或部署。Mac差异已登记缺失/未验证，设计未发布到线上。下一阶段仍为Vaul、通知中心和Mac独立实现，不在本批顺带处理。

第四阶段最终检查：406/406 项 Web 非浏览器测试通过；类型检查、本地/云端构建、独立脚本检查、设计 build/check、files:check 与 git diff --check 均通过。5173 监听进程的工作目录已确认是当前 animation-stages 工作树。未运行浏览器、视觉自动化、e2e、真机或 Mac 窗口验收。设计未发布到线上，未提交、推送或部署。

## 第三阶段复核交接（2026-10-27）

本轮仅完成用户新授权的第三阶段复核修改，没有继续第四阶段，没有迁移或新建 worktree。唯一实施目录仍为本文指定的 animation-stages/sill，全部既有未提交修改保留。

- Web 搜索采用指定 Combobox 公开注册源码的交互：固定480px、0ms列表开关、48px行高、共享候选高亮；条件图标从候选移入框内280ms、cubic-bezier(0.32,0.72,0,1)，前置图标spring300ms、bounce0，键盘选择即时。历史填入查询，条件进入token；保留父线程最近修正的“已有查询再次聚焦仍显示历史/标签”。补Home/End、Esc先关闭、Tab只接受明确指向的候选。没有移植人名和头像业务，未宣称完整视觉还原通过。
- Web/PWA共用工具栏停顿等待使用rest-show450ms；动画仍240/420ms，阈值28/14px。Mac chromeRest仍0.65秒，缺失待同步。
- Web/PWA照片去除标题、说明、按钮的fixed-white覆盖，使用ink/muted/canvas主题角色。释放时用最近指针速度驱动photoSnapSpring（mass1、stiffness300、damping32）；暂停/取消清除旧速度，反向按释放方向吸附。25%或500px/s门槛、首尾不循环和纵向手势放行保留。弹簧是项目试验数值，不是Motion+已核实原始参数；完整参考还原待用户确认。
- 播客由用户明确改为待定，本轮未修改播客布局或参数，也未标通过。所有既有✅保留。

主要新增/修改入口：views/home-search-motion.ts、home-search-field.tsx、home-search.tsx、app-feed.ts、app-input.ts、app-lifecycle.ts、actions/navigation.ts、cards/photo-carousel.tsx、interactions/chrome.ts、motion-playback.ts、styles/form-controls.css、detail-content.css、preview-media.css，以及tokens/foundation.json。相对代码路径均以apps/web为根；设计变量路径以仓库为根。规则与来源为ADR0075。

本轮检查：23项针对性检查通过；完整Web非浏览器409/409通过；类型检查、本地/云端构建、独立脚本检查、设计build/check、files:check与git diff --check通过。没有浏览器、e2e、视觉自动化、真机或Mac窗口验收；设计未发布到线上，未提交、推送或部署。

下一步交回第四阶段线程，按checklist末尾最新方案处理其授权范围。用户提供的 /Users/w/Downloads/apple_music_search_transition.html 是手机设计数据，PWA搜索点击和加载交互由第四阶段负责；Web继续使用Combobox且不恢复伸缩。本轮没有向其他线程发送消息。

## 第四阶段复核交接（2026-10-27）

已等待第三阶段线程01a1782e-ca8e-7770-968a-3398b670aefe本轮completed后才开始写入与构建；未与其并发修改共享树，也未向其发送消息。继续在唯一目录/Users/w/.codex/worktrees/animation-stages/sill实施。当前树本来已有第四阶段和ADR0074，不做复制迁移，不修改主目录或6b13，不创建worktree，保留所有未提交修改。

本轮第四阶段修正：Web/PWA移除整组动作隐藏设置和hiddenActions过滤，所有动作按类型与可用条件显示，旧数据兼容保留；全屏以旧内容视觉层承接并同时120ms交叉淡化；视频使用共享VideoSurface和同一播放器iframe；AI引用移动/透明分离为500/180、220/140及补位280ms；AI气泡对齐缩小按钮中心，外壳裁切260/300ms；手机搜索按用户下载附件的410ms及配套编排实施，覆盖旧240ms研究建议，使用真实历史/标签/搜索结果、真实系统键盘和原三项导航。

新增主要代码：interactions/video-surface.tsx、ai-collapse.ts、ai-context-motion.ts、phone-search-motion.ts，均位于apps/web下。设计参数源为design-system/tokens/foundation.json中aiContext、aiCollapse、phoneSearch；来源与决定为ADR0076。Web Combobox、rest-show450ms、照片主题与photoSnapSpring均保留，播客待定。PWA Vaul、通知中心和Mac独立实现仍为第五阶段，不纳入本轮。

实际视觉、键盘弹出、真机和Mac窗口仍待用户复核；不运行浏览器/e2e，不操作真实数据或草稿，不提交推送部署；设计未发布到线上。原始反馈与全部✅保留，当前完整范围和实际参数见checklist文末本轮章节。

本轮最终检查：Web非浏览器测试416/416通过；类型检查、本地/云端构建、两端独立脚本检查、设计build/check、files:check和git diff --check通过。动作隐藏开关、命令和Web/PWA过滤已移除，旧偏好字段只作兼容保留。浏览器、e2e、视觉自动化、真机与Mac窗口未运行；设计未发布到线上，未提交、推送或部署。
