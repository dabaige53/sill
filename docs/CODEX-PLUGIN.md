# Quiet Glass：Codex 插件与连接器接入

实现版本：0.2.0，2026-10-11。运行环境：Node.js 24+。数据库：本地 SQLite。

## 现在能做什么

| 能力 | 实现与范围 |
| --- | --- |
| Codex 插件 | 生成标准 `plugin.json`、`mcp.json`、兼容清单、对话技能及本地 marketplace 入口 |
| MCP 服务 | 官方 SDK；本地 stdio 或远程 Streamable HTTP；工具、资源、提示模板 |
| Google Calendar | 读取带时间窗口的日程、分页、全天日期；可选 OAuth refresh token；准备并创建无参会人的日程 |
| Notion | 页面标题搜索、分页、递归采集正文；在指定父页面下创建笔记 |
| 其它连接器 | 通过远程 MCP、命名工具允许列表、结构化字段映射及游标接入 |
| 内容 | 来源与稳定 ID 去重、正文、采集时间、原文 URL、证据卡片、SQLite 持久化 |
| 推荐 | 关键词、兴趣、未读、收藏、时效、日程紧迫性和来源多样性；返回理由与证据 |
| 复杂任务 | 持久化依赖图、异步运行、步骤输出引用、状态查询、失败重试与中断恢复 |
| 外部写入 | 准备草稿 → 用户授权 → 提交；摘要绑定、有效期、幂等控制；结果未知时不自动重试 |
| 普通设置 | 排序与减少透明度共用 SQLite 状态；网页、MCP、HTTP 按版本更新，冲突不重放 |
| 网页 | 保留原卡片布局；真实数据、连接状态、刷新、已读/收藏同步、Codex 请求队列 |

这些能力不会自动继承 Codex 中其它插件的凭据。Notion、日历与 MCP 来源分别在此服务中配置授权；连接器凭据不经过网页或模型上下文。默认没有真实资料，也不会用演示卡片假装真实连接成功。

## 1. 准备服务

```bash
git clone https://github.com/dabaige53/quiet-glass.git
cd quiet-glass
# 若改动仍在 PR 分支，先切换到相应分支。
npm ci
cp quiet-glass.config.example.json quiet-glass.config.json
cp .env.example .env
```

编辑 `quiet-glass.config.json`，只开启你要使用的来源。配置文件不含令牌，仅引用环境变量名。把已授权的凭据放在 `.env`，限制文件权限；`.env`、实际配置、SQLite 数据及构建目录均已排除在 Git 外。

HTTP 服务还需要一个至少 32 字节的随机 `QG_AUTH_TOKEN`。可在本机生成后写入 `.env`，不要贴到聊天、提交到 Git 或放在 URL 中。本地 stdio 模式不需要此 HTTP 访问密钥。

默认数据目录为配置文件所在目录下的 `.quiet-glass/`。可用绝对路径环境变量 `QG_DATA_DIR` 改写；HTTP 与 stdio 指向同一配置和数据目录即可共享卡片与任务。

## 2. 在 Codex 中安装

### 本地插件

```bash
npm run plugin:build
```

生成的完整包在 `dist/quiet-glass/`。仓库根目录的 `.agents/plugins/marketplace.json` 指向它。打开此仓库并刷新/重启支持本地 marketplace 的 Codex 或 ChatGPT 桌面客户端，在插件目录选择 **Quiet Glass 本地插件** 并安装 Quiet Glass。

构建产物包含本机 Node 和仓库的绝对路径，不依赖插件主机对路径变量的特殊处理。**保留当前 checkout 路径；移动仓库、换电脑或更新技能后重新构建并刷新插件。** 安装包被客户端复制到缓存后，仍从已验证的仓库路径启动服务。

本地 marketplace 的可用性由客户端和工作区策略决定。云端对话无法执行你电脑上的本地 Node 进程，需要下面的 HTTPS 模式。

### Codex CLI 的直接 MCP 配置

若只需要工具，可把生成的 `dist/quiet-glass/codex-mcp.toml` 合并到自己的 Codex 配置。不要覆盖已有配置。它包含绝对路径和配置文件位置，不包含凭据。

也可以使用官方 `codex mcp add` 命令：

```bash
codex mcp add quiet-glass -- node --env-file-if-exists=/absolute/path/quiet-glass/.env /absolute/path/quiet-glass/server/index.mjs --stdio
```

把示例路径替换为真实路径。直接添加 MCP 不会自动安装技能；需要完整对话流程时优先安装插件，或将仓库内技能按客户端支持方式加载。不要同时启用同名的直接 MCP 和插件 MCP，避免工具重复。

## 3. 连接数据源

### Google Calendar

示例配置默认读取 `primary` 日历。为自己的 OAuth 客户端获取适当范围的授权：只读使用 `calendar.events.readonly`，创建日程使用 `calendar.events`。将 access token 放入 `GOOGLE_ACCESS_TOKEN`。

要自动刷新短期访问令牌，在日历配置中加入：

```json
{
  "refreshTokenEnv": "GOOGLE_REFRESH_TOKEN",
  "clientIdEnv": "GOOGLE_CLIENT_ID",
  "clientSecretEnv": "GOOGLE_CLIENT_SECRET"
}
```

并在服务进程中设置对应变量。配置 refresh 模式后，会优先通过 refresh token 获取访问令牌并在内存缓存。授权失败会明确返回错误，不会回退到演示数据。

`qg_collect` 支持带时区偏移的 `timeMin`、`timeMax`、`query`、`cursor`、`pageSize`、`maxPages`。默认从当前时间起读取未来事件。全天事件保留 `startDate` / `endDate`，不会错误转成 UTC 零点；结束日期不包含在事件中。

开启 `allowWrites` 后，`create_event` 接受 `summary`、`description`、`location`、`start.dateTime`、`end.dateTime` 及可选 `timeZone`。当前不接受参会人和外部邀请。

### Notion

在 Notion 创建连接/integration，把需要的页面共享给它，将令牌设置为 `NOTION_TOKEN`。仅拥有令牌并不等于拥有页面权限。接口固定使用兼容版本 `2025-09-03`。

搜索只匹配页面标题。采集会分页读取页面与块，包括嵌套块；每页正文最多读取 200 块、递归深度 3、保留 50,000 字符，达到边界会返回 `truncated`。采集后的正文可通过 `qg_search` 检索。

创建笔记需要 `allowWrites: true`，以及配置 `parentPageId` 或在草稿中给出父页面 UUID。`create_page` 接受 `parentPageId`、`title`、`content`。当前以普通段落写入，不承诺保留任意 Markdown 格式，也不实现数据库字段写入。

### 通用 MCP（包括其他日历/知识库提供方）

把示例 `reading-mcp` 中的地址、允许列表、工具名与字段映射换成提供方的真实定义，再启用连接器。`qg_list_source_tools` 会返回允许使用的远程工具及参数定义。

- 支持 HTTPS Streamable HTTP；本地联调允许 loopback HTTP。
- 认证使用 `tokenEnv` 指向的 bearer token；无需鉴权的来源可省略。没有自动 OAuth 登录、DCR 或令牌保管平台。
- `readTools` 与 `writeTools` 不可重叠。采集只能调用前者，远端明确声明有副作用的工具不能用于采集。
- `collect.arguments` 是固定参数，调用时可用 `parameters` 传工具自己的查询参数。通用 `query`、`pageSize` 不会擅自推测并映射到上游参数名。
- `itemsPath` 定位结果数组；`fields` 映射 `id`、`title`、`content`、`summary`、`url`、`kind`、`publishedAt`、`start`、`end`、`tags`。必须有稳定 ID 与标题。路径是普通点号路径，不执行脚本。
- 结构化结果优先读取 `structuredContent`，其次读取 JSON 文本结果。不支持把任意非结构化文本自动猜成卡片。
- `cursorPath` 与 `cursorArgument` 配对配置；字符串和整数游标保持类型。出现 `partial` 时继续返回的游标。
- 通用 MCP 写入必须显式开启 `allowWrites` 并列入 `writeTools`，也必须先准备再确认。

## 4. 使用原信息流

```bash
npm start
```

访问 `http://127.0.0.1:4317`，在按需出现的连接界面输入 `QG_AUTH_TOKEN`。浏览器获得 HttpOnly、SameSite Cookie，密钥不进入 localStorage。刷新会创建持久化采集任务；新卡片暂存到玻璃入口旁的计数，点击后才插入，不强制把阅读位置跳到顶部。

拖卡片到 AI 仍只添加引用。主动发送后，问题进入本地队列；在 Codex 中说“用 Quiet Glass 处理待回答的问题”，Codex 调用 `qg_list_requests` 阅读问题，再用 `qg_answer_request` 返回结果。**网页本身不会自主调用 Codex 或订阅模型 API。** 页面保持打开时轮询接收答案；关闭页面后请求仍在服务中。

已读、收藏、个人备注和标签同步到 SQLite；阅读位置仍为浏览器局部状态。本地笔记支持创建和按版本编辑。上述本地内容不会写回 Notion/Calendar；旧浏览器备注不会自动上传。详见 [本地内容与备注](LOCAL-CONTENT.md)。

## 5. 对话编排示例

- “采集我今天的日程和项目相关 Notion 笔记，给出 5 条有来源的优先处理建议。”
- “结合这几张卡片比较两个方案，指出证据不足的地方，把结论保存为信息流建议。”
- “继续刚才失败的工作流，只重试未完成步骤。”
- “把这份已确认的总结写到指定 Notion 页面下。”

复杂任务由 Codex 理解和拆解，后端提供确定性的工具执行与状态保存。`qg_create_workflow` 支持依赖图和 `{"$ref":"stepId.field"}` 输出引用；`qg_run_workflow` 立即返回，之后查询 `qg_get_workflow`。服务进程必须继续运行；崩溃后再次运行同一任务，等 60 秒租约过期即可恢复未完成步骤。任务完成不等于采集范围完整，仍须检查每步的分页标记。

所有工作流只能采集、检索、推荐、保存本地内容、准备写入草稿，不能自动提交外部写入。写入确认绑定整个草稿摘要，30 分钟有效；重复提交已成功草稿返回原结果。超时、断线或不明确失败的操作进入 `needs_review`，服务不会猜测结果或再次创建。

## 6. 云端 / 远程 Codex

将 Node 服务部署到自己控制的持久化主机，保留数据库卷，用 HTTPS 反向代理。设置强访问密钥，并按实际地址设置 `QG_PUBLIC_ORIGIN`；非 loopback 监听同时需要 `QG_HOST` 和 HTTPS origin 配置。

```bash
npm run plugin:build -- --url https://your-private-host.example/mcp
```

这会生成远程插件包和 MCP 配置。访问密钥在客户端连接设置中提供，不进入包内。服务支持固定 bearer token，尚未实现 OAuth 身份服务；需要 OAuth 的云端连接入口或公共目录不能仅靠这个包完成上线。仓库没有自动部署到任何云平台，也没有把私有内容公开。

这是**单用户服务**：一个数据库/密钥对应一个用户。多人必须独立部署或先实现用户隔离，不能共享此令牌作为多租户产品使用。

## 验证与当前边界

运行 `npm run check && npm test`。自动测试使用真实官方 MCP SDK 与隔离资料，覆盖协议和关键业务行为。`npm run test:live-browser` 另外使用 Chromium 验证 MCP 采集、真实卡片、引用后发送、回答回流、收藏同步、刷新确认、本地备注恢复与预览中断；先执行 `npx playwright install chromium`，或用 `CHROMIUM_PATH` 指定已安装的浏览器。Google/Notion 的真实授权、客户端目录安装、HTTPS 部署和不同屏幕下的视觉验收，需要在实际环境验收。

采集是当前可访问内容的快照，不是完整的跨服务双向镜像；源内容删除、权限撤销及本地历史保留需要部署方管理。没有邮件原生适配器、向量检索、无人值守模型循环、后台定时调度或自动 OAuth 接入界面；可通过配置好的 MCP 来源扩展服务种类。推荐规则可以解释，语义比较和综合结论由 Codex 负责。

## 协议参考

- [OpenAI：插件打包与本地 marketplace](https://developers.openai.com/plugins/build/plugins)
- [OpenAI：MCP 配置](https://developers.openai.com/codex/mcp)
- [MCP 官方 TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/server)
- [Google Calendar：事件读取](https://developers.google.com/workspace/calendar/api/v3/reference/events/list)
- [Google Calendar：事件创建](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)
- [Notion：页面搜索](https://developers.notion.com/reference/post-search)
- [Notion：块读取](https://developers.notion.com/reference/get-block-children)

普通设置接口和冲突处理见 [普通设置](SETTINGS.md)；它们不接受或修改任何凭据、连接器或安全配置。
