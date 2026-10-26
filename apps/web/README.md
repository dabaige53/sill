# 浏览器端

更新：2026-10-19。现行运行代码；通用规则见 [代码规范](../../docs/guides/code-standards.md)。

`index.ts` 启动本地界面，`cloud-entry.ts` 启动云端界面。两者共用同一套卡片、状态与交互模块；模块通过 ES imports 连接，不再按文件顺序拼接全局变量。

`views/app.ts` 保留状态和公开入口，`views/app-*.ts` 按启动、信息流、选择、弹层、反馈、卡片动作、采集、堆叠与输入拆分方法；`app-types.ts` 保存共用类型。方法仍安装到原控制器的原型上。设置保存与重绘位于 `views/settings-controller.ts`，详情打开和定位位于 `views/preview-controller.ts`。`views/actions/` 按导航筛选、卡片、多选、设置、外链交接、提醒媒体、反馈恢复分组；`action()` 只按原名称分发。

`interactions/panels-components.tsx` 汇总卡片、搜索和设置弹层，具体组件分别在 `panel-card.tsx`、`panel-search.tsx`、`panel-settings.tsx`，共用渲染约定在 `panel-contract.ts`。`interactions/gestures.ts` 保留手势状态与通用工具，`gesture-*.ts` 分别负责刷新下拉、弹层和预览手势。

`cloud-entry.ts` 保留云端启动与事件接线；工作区读写在 `cloud-workspace.ts`，草稿、保存与退出在 `cloud-compose.ts`。样式清单 `styles/styles.json` 保持层叠顺序，并按预览媒体、弹层、动作、手势、卡片堆叠、控件、手机和无障碍分组。

`interactions/panels.ts` 保留弹层入口，`interactions/previews.ts` 按卡片类型组织预览，共用外壳与工具栏。文案键按预览、阅读、照片、搜索、设置等用途命名，实际文字仍只从 `design-system/copy/zh-Hans.json` 读取。

`npm run build` 用 Vite 生成 `dist/web/index.html`，`npm start` 提供本地页面。`npm run build:cloud` 生成 `dist/cloud/`。产物不提交到 Git，不手工修改。

卡片类型从 `contracts/` 导入。浏览器根据导出的 JSON Schema 检查写入，复用纯数据转换与业务规则，不打包 zod。未知卡片类型采用通用卡片；未知字段保持不变。

来源设置的本地状态不是外部连接回执。线上整卡覆盖与虚假连接成功两个 P1 不因本次迁移关闭。浏览器视觉及辅助功能验收需单独执行。

## React 与开发服务

Web 使用 React + TypeScript + Vite，决策见 [ADR 0047](../../docs/adr/0047-react-web.md)。

- `views/shell.tsx` 与 `views/feed.tsx` 组成页面；卡片在 `cards/components.tsx`，弹层和详情在 `interactions/*-components.tsx`，云端欢迎与速记在 `views/cloud-views.tsx`。
- `views/react-renderer.ts` 管理 React 根与同步测量边界。信息流保留稳定 key；详情覆盖搜索时保留搜索容器及节点。控制器仍负责动作、手势、焦点和网络适配，新内容布局写成 TSX，不新增整页 HTML 模板。
- `cards/templates.ts`、`interactions/panels.ts` 和 `interactions/previews.ts` 保留静态 HTML 兼容出口，供 Node 测试和画板使用。浏览器运行时直接导入组件，避免包含服务端渲染器。
- 先运行 `npm start` 提供本地 API，再运行 `npm run dev`，打开 http://localhost:5173。Vite 提供 TSX Fast Refresh，`/api/local` 代理到 4318。开发服务只监听本机。打开 http://localhost:5173/?ai-preview 加载 AI 对话的设计样例会话，用于检查展开面板、完整视图和手机 AI 页；只在开发服务生效，生产构建不含样例，发送仍禁用。
- `apps/web/index.html` 是 Vite 页面入口，`vite.config.ts` 读取原有样式清单及文案。生产用 singlefile 插件输出单文件 HTML，保留云端 MCP 的宿主脚本注入顺序。
- Node 的 Web 测试通过 tsx 加载 TSX。JSDOM 的浏览器 API 补充集中在 `tests/web/react-browser-fixture.ts`，不改变生产代码。

动效由 Motion 统一控制：`interactions/motion.ts` 管理按压、进出场和键盘立即响应；`interactions/motion-playback.ts` 管理取消、播放完成与手势速度。CSS 只描述静止状态。控制器测试用 `tests/web/motion-fixture.ts`，浏览器回归运行真实 Motion。

`motion-library/` 为独立动画库入口，使用合成状态与产品共用的局部组件。示例不启动 `AppController.init()`，不加载或保存产品工作区；构建、访问与逐项核对见[动画库指南](../../docs/guides/motion-library.md)。

## 添加到 iPhone／iPad 主屏幕

云端页面使用 manifest 的 standalone 模式和 Apple 兼容元数据。Safari 打开云端首页后，选择分享 → 添加到主屏幕，再从新图标启动。iOS 26 的「作为网页 App 打开」（Open as Web App）须保持开启。普通 Safari 标签页仍有地址栏。

已安装的旧书签可能保留旧启动方式。先确认云端内容已保存，再重新添加；不要为此清除网站数据。安装后如需重新登录，继续现有登录流程。跨站登录／原文链接可能由系统打开浏览器，这是正常边界，不强制拦截。

Worker 直接提供 /manifest.webmanifest 和现有品牌 PNG。manifest 的 id、start_url、scope 均为 /，不写登录参数、账号或卡片内容；不注册 Service Worker，不缓存私有 API 或登录响应。MCP 内嵌页和本地页面不输出安装元数据。默认状态栏样式保留系统状态栏；现有 viewport-fit、安全区和 visualViewport 键盘处理继续生效。

发布后设备验收：从主屏幕冷启动，检查没有 Safari 底部地址栏；检查登录、重新打开、卡片详情、搜索键盘开关、横竖屏及底部安全区。自动构建与浏览器模拟不等于真实 iPhone 验收。

依据：[WebKit Safari 26](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/#every-site-can-be-a-web-app-on-ios-and-ipados)、[Apple Web App 配置](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)。
