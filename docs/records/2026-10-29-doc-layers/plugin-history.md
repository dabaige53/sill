# 插件连接与验收历史


## 历史连接与验收

下列内容保留原时间语境。现行能力见 [Agent 与 MCP](../../implementation/agent-mcp.md)，2026-10-16 工作区工具与临时卡读写证据见 [工作区发布记录](../2026-10-16-cloud-operations/README.md)。


2026-10-15 记录：当时实验版本1.1.3。用户已在真实连接验收后确认“成功了”。本文记录这次 MCP → 自定义 App → 现有插件绑定的完整路径；历史清理与旧发布记录见 [现状盘点](../2026-10-15-status/README.md)，授权专项证据见 [授权测试记录](../2026-10-15-oauth/README.md)。

**验收对象补充：** 本次实际连接、打开和使用的是不含 Skill 的 App 自动生成插件1.0.0。含 Skill 的组合插件1.1.3已存在且引用同一个 App，但尚未完成安装切换和 Skill 使用验收。用户已接受本次先完成应用连接；不能将此结果称为“应用＋Skill 三合一已完成”。完整连接步骤和构建参数见 [连接与构建参数](../2026-10-15-app-connection-build/README.md)。

### 当前结果与证据

| 检查项 | 结果与证据范围 |
| --- | --- |
| 插件打包 | 平台重新读取确认1.1.3，包含一个 App 引用、一个 Skill、产品图标和浅深色线条图标；不包含重复 MCP 连接文件 |
| OAuth 连接 | 真实浏览器完成确认、返回 ChatGPT；刷新后“继续连接应用”变为“打开插件” |
| 工具发现 | App 弹窗列出7个工具：3个写工具、4个读工具 |
| 真实读取 | 在宿主发起 limit=1 的卡片读取，助手返回已有卡片；未修改或删除用户卡片 |
| 全局入口 | “打开插件”进入 `/mcp-app/<App ID>/sill_open_workspace` |
| 对话入口 | 宿主助手报告已调用 `sill_open_cards`；本轮未展开其逐项原始调用结果 |
| 页面最终可用 | 自动化观察曾显示“未能显示 sill”，随后用户明确确认成功；记录为用户验收成功，不将此前失败抹去 |
| 自动化测试 | `npm run test:oauth`：42项通过；新增五项身份权限进入确认页且不自动授权的用例 |


### 身份与地址

| 对象 | 2026-10-15 记录值 |
| --- | --- |
| 组合插件 | `Plugin_e3a0fc80b8a48191855711e727b2b8e1` |
| 插件版本 / release | `1.1.3` / `pluginrel_6ad0d88864c48191a3c17b9a82399006` |
| 插件范围 | `WORKSPACE` / `PRIVATE`；不改变工作空间和受众 |
| 自定义 App | `asdk_app_6ad0d805d3e88191a1c8902cf66af046` |
| App 自动生成的插件 | `plugin_asdk_app_6ad0d805d3e88191a1c8902cf66af046`；页面显示版本1.0.0，与组合插件1.1.3是不同发布对象 |
| 观察到的 App 版本 ID | `asdk_app_v_6ad0d805d3f08191a485523d41cde5f3` |
| MCP | `https://sill-web-preview.scs1213-temp-email.workers.dev/mcp` |
| 网页工作台 | `https://sill-web-preview.scs1213-temp-email.workers.dev/` |
| OAuth 客户端 | `5caffdc3-f450-4664-bd81-a65a16eace73` |
| 已核对回调 | `https://chatgpt.com/connector/oauth/ufi0fWkbCET5` |

[组合插件](https://chatgpt.com/plugins/Plugin_e3a0fc80b8a48191855711e727b2b8e1)与[App 对应插件](https://chatgpt.com/plugins/plugin_asdk_app_6ad0d805d3e88191a1c8902cf66af046)不可混作同一个对象。App ID、插件 ID、OAuth 客户端 ID 各有用途，不能互换。后续新建应用时必须读取平台实际生成的 ID 和回调，不能按名称猜测。

### 调试经过

1. **检查现有包。** 用户反馈没有侧边栏、没有工具。关联聊天中较早的1.1.2只有 MCP 与 Skill，缺少 App 绑定；本次平台读取确认已经更新为1.1.3，含 `.app.json`。以当前读取结果为准，不能继续沿用旧判断。
2. **确认服务端页面与入口。** `server/cloud/mcp.ts` 提供 `ui://sill/cloud-workspace-v3.html`，MIME 为 `text/html;profile=mcp-app`。`sill_open_workspace` 声明 `global`，`sill_open_cards` 声明 `thread`。工具通过 `_meta.ui.resourceUri` 关联页面，通过 `_meta['openai/ui'].entrypoints` 声明入口。
3. **先注册自定义 App，再绑定插件。** 按本次实验已完成的操作，通过 MCP 地址和 OAuth 创建 App，取得平台实际 App ID。原插件引用这个 App，保留 Skill 和图标，移除重复 MCP 连接配置；平台读取确认1.1.3。
5. **定位 OAuth 拒绝。** 点击继续连接后，Sill 显示权限或回调不一致。只查询授权元数据，确认账号匹配、回调匹配、客户端启用；实际请求为 `openid email offline_access profile phone`，允许列表只有 `openid email offline_access`。多出的 `profile`、`phone` 导致拒绝。
6. **修改 Sill 兼容现有宿主。** 用户明确要求“让 Sill 支持，而不是 OpenAI 调整”。仅为上述 OAuth 客户端补入 `profile`、`phone`。卡片权限、资源范围、回调和其他客户端均保持原有配置；重新读取确认生效。本次修复是服务端数据库策略更新，没有重新部署 Worker，也没有发布插件1.1.4。
7. **测试后完成授权。** 新增五项身份权限用例，42项授权测试通过。真实浏览器从拒绝页进入确认页。用户明确批准列出的身份权限及整个个人工作区的卡片权限后，点击“允许上述访问”，成功返回 ChatGPT；数据库确认卡片授权已存在。
8. **验证工具和页面。** 刷新后发现7个工具，打开全局入口，执行只读卡片查询和对话侧栏调用。页面曾显示加载失败；网络诊断受浏览器工具限制，未定位失败原因，也没有据此修改页面代码。随后用户确认成功，本次实际使用验收按该确认记录。

### 发布与配置保存

本轮平台文件快照只作证据，不是新的可发布包，也未下载二进制图标。历史文档中“没有工具”“仍待授权”“原 App 已删除”等描述保留原时间语境，查证现状时重新读取当前对象，本文只保留当时结果。
