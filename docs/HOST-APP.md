# F03：宿主卡片上下文

Quiet Glass 新增 `qg_open_workspace({})`，注册全局入口和线程入口，打开 `ui://quiet-glass/workspace`。既有 23 个业务工具保留，总计 24 个。工具只读取数据；不会采集外部来源、修改设置或创建对话消息。

## 构建与使用

```sh
npm ci
npm run plugin:build
```

插件构建同时生成 `dist/host-app.html`。资源由同一个 MCP 服务读取，无需部署新网页。保留仓库与构建产物；未构建时返回明确的 `HOST_APP_UNAVAILABLE`，其他工具仍可使用。单独重建可运行 `npm run build:host`。

HTML 使用 MCP App MIME，声明空网络连接、外部资源、子框架及 base URI 域列表，不请求额外权限。业务调用经过宿主的同服务器 MCP bridge；不嵌入服务密钥，不登录网页，不继承或导出其他插件凭据。静态资源不包含数据库内容。入口返回的模型可见结果仅为模式、资源 URI 和计数，初始化卡片节选放入应用专用 `_meta`。

## 交互合同

- 沿用同一套卡片、样式、预览与本地内容编辑界面。`web/host-transport.js` 把共享适配器请求映射到既有 MCP 工具，业务规则仍在服务层。
- 点击卡片 AI 按钮、批量加入或拖到入口，将最多 8 张卡片作为引用。不会发送消息，也不会启动模型。
- 每张引用包含稳定 id、标题（最多 160 字符）、source（来源 ID，最多 160）、url（最多 500）、完整已存正文的 SHA-256、excerpt（最多 400）与 truncated。全文按需用 `qg_get_card` 读取。字段标记为不可信来源数据，不作指令。
- 上下文结构为 `{qgSelectionVersion:1, qgSelectionId, selectedCards:[...]}`。宿主移除上下文时，本地引用随之清除；重新挂载时从宿主状态恢复，不从浏览器记忆偷偷重新添加。主题变化不会覆盖选择。每次写入带实例内递增的标识，延迟的旧回声不会恢复已移除引用或清除新选择。
- “准备到当前对话草稿”只在明确支持消息扩展且平台为 desktop/web 时可用。实际请求始终携带 `_meta["openai/message"]={target:"active",send:false}`，准备后用户自行检查、发送。出错保留文字，不退回自动发送。
- mobile、未知平台或缺少相应能力时禁用准备操作，可显示文本引用并手动复制。上下文生命周期能力缺失时明确标注仅本地预览，不声称引用已进入模型上下文。
- 不展示伪造的宿主聊天记录，不创建任意线程恢复功能；当前宿主线程由宿主管理。宿主视图不触发外部采集；在对话中明确请求采集后，保存的卡片会同步到界面。

独立 HTTP 网页保持现有认证和待处理问题队列。它不会自行调用宿主模型；两个入口的本地笔记、备注、设置使用同一服务数据。离线 HTML 演示也保持独立。

## SDK 与宿主边界

2026-10-11 实际 npm 核验并精确锁定 `@openai/mcp-extensions@0.1.0`、`@modelcontextprotocol/ext-apps@1.7.5`；继续使用 `@modelcontextprotocol/sdk@1.32.1` 与 Zod 3。未升级 SDK 2。仓库较新的服务端示例不能代表已发布 npm 版本。

已发布 0.1.0 的 message helper 校验器仅接受 send:true，不能用于本功能的草稿操作。实现使用标准 App.sendMessage 保留当前协议的 send:false 元数据，且专门测试其线上的值；不修改 SDK，不省略该标记。

官方扩展说明将 Work 浏览器与经典 ChatGPT 区分，且移动端发送行为不同。这里按协商能力和平台保守降级，不以产品名称猜测支持。参考：[扩展规范](https://github.com/openai/mcp-extensions/blob/main/docs/spec.md)、[SDK 应用集成](https://github.com/openai/mcp-extensions/blob/main/typescript/README.md)、[MCP Apps](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx)。

本轮验证真实 MCP 协议和 Chromium 宿主模拟器，没有安装到实际 ChatGPT Work/桌面宿主。模拟器通过不等于真实宿主已验收；实际入口呈现、宿主草稿行为与平台兼容仍须安装后验证。经典 ChatGPT 支持不在本次已验证范围内。
