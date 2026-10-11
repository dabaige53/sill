# F03 宿主卡片上下文验证

日期：2026-10-11。范围：本地构建、真实 MCP SDK 协议、真实 Chromium 中的协议宿主模拟器。**没有安装到实际 ChatGPT Work、桌面或移动宿主，不属于原生宿主验收。**

## 自动检查

- `npm run check`：JavaScript、内联脚本和插件配置通过。
- `npm test`：22 项核心检查与 35 项后端/协议/页面检查通过。
- 新增宿主协议测试：工具发现与严格空参数、24 个工具兼容、全局/线程入口、资源 MIME/CSP、只读和有界 app-only 数据、缺少构建时错误及恢复、真实认证 HTTP MCP 调用，以及凭据不进入资源。
- `npm run test:host-browser`：官方 SDK 在真实 iframe 中握手，经真实 HTTP MCP 服务加载卡片；宿主为测试模拟器。
- `npm run test:content-browser`、`npm run test:settings-browser`、`npm run test:live-browser`：保留独立网页与此前功能的真实 Chromium 回归。

## 宿主模拟器断言

选择不发送消息；引用有稳定 ID、来源、精确正文 SHA-256、截断标记与大小上限。恶意 HTML/指令按文字呈现，未触发来源网络或外部动作。明确讨论只带 `target:active, send:false`，模拟器原有草稿保留，提交次数为零。

验证宿主移除、重挂载恢复、主题局部更新、伪造兄弟 iframe 消息被忽略，以及缺少能力、未知平台和 mobile 的保守降级。空正文不使用摘要替代哈希。

延迟测试包括：讨论期间删除引用或切换到不支持的平台；删除后旧上下文回声晚到；补偿清空期间用户又选择新卡片。旧响应不得重新引入已移除内容，也不得清除新选择。

本轮独立审查发现的两类旧响应竞态已修复，实际适配器复测与协议检查通过。每次上下文写入具有实例 UUID 和递增序号，自己旧写入的回声不覆盖新意图。

## 截图与限制

浏览器测试生成 `tests/artifacts/host-app-context.png`、`host-app-unsupported.png` 和详细 `host-browser.json`；截图顶部明确标注模拟器。产物不纳入 Git。

共享卡片源码、样式和五个生成页面未改动；宿主打包读取同一生成页面，加入专用适配器。没有重跑完整离线产品/Storybook 套件，CI 继续保留它们。实际宿主入口显示、宿主权限协商及草稿承接仍须真实安装后验证；不宣称经典 ChatGPT 或所有移动端已支持。
