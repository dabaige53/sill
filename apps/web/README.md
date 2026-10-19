# 浏览器端

更新：2026-10-18。现行运行代码；通用规则见 [代码规范](../../docs/guides/code-standards.md)。

`index.ts` 启动本地界面，`cloud-entry.ts` 启动云端界面。两者共用同一套卡片、状态与交互模块；模块通过 ES imports 连接，不再按文件顺序拼接全局变量。

`views/app.ts` 保留状态和公开入口。设置保存与重绘位于 `views/settings-controller.ts`，详情打开和定位位于 `views/preview-controller.ts`。`views/actions/` 按导航筛选、卡片、多选、设置、外链交接、提醒媒体、反馈恢复分组；`action()` 只按原名称分发。

`interactions/panels.ts` 保留弹层入口，`interactions/previews.ts` 按卡片类型组织预览，共用外壳与工具栏。文案键按预览、阅读、照片、搜索、设置等用途命名，实际文字仍只从 `design-system/copy/zh-Hans.json` 读取。

`npm run build` 用 esbuild 生成 `dist/web/index.html`，`npm start` 提供本地页面。`npm run build:cloud` 生成 `dist/cloud/`。产物不提交到 Git，不手工修改。

卡片类型从 `contracts/` 导入。浏览器根据导出的 JSON Schema 检查写入，复用纯数据转换与业务规则，不打包 zod。未知卡片类型采用通用卡片；未知字段保持不变。

来源设置的本地状态不是外部连接回执。线上整卡覆盖与虚假连接成功两个 P1 不因本次迁移关闭。浏览器视觉及辅助功能验收需单独执行。

## 添加到 iPhone／iPad 主屏幕

云端页面使用 manifest 的 standalone 模式和 Apple 兼容元数据。Safari 打开云端首页后，选择分享 → 添加到主屏幕，再从新图标启动。iOS 26 的「作为网页 App 打开」（Open as Web App）须保持开启。普通 Safari 标签页仍有地址栏。

已安装的旧书签可能保留旧启动方式。先确认云端内容已保存，再重新添加；不要为此清除网站数据。安装后如需重新登录，继续现有登录流程。跨站登录／原文链接可能由系统打开浏览器，这是正常边界，不强制拦截。

Worker 直接提供 /manifest.webmanifest 和现有品牌 PNG。manifest 的 id、start_url、scope 均为 /，不写登录参数、账号或卡片内容；不注册 Service Worker，不缓存私有 API 或登录响应。MCP 内嵌页和本地页面不输出安装元数据。默认状态栏样式保留系统状态栏；现有 viewport-fit、安全区和 visualViewport 键盘处理继续生效。

发布后设备验收：从主屏幕冷启动，检查没有 Safari 底部地址栏；检查登录、重新打开、卡片详情、搜索键盘开关、横竖屏及底部安全区。自动构建与浏览器模拟不等于真实 iPhone 验收。

依据：[WebKit Safari 26](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/#every-site-can-be-a-web-app-on-ios-and-ipados)、[Apple Web App 配置](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)。
