# Sill 应用连接调整步骤与构建参数

2026-10-16补充：已选择原App插件直接添加Skill方案，当前版本1.0.1；不需要安装切换到1.1.3组合插件。平台已保存，网页与当前Codex已发现Skill，用户确认可用。文件映射、构建与发布参数见 [原App添加Skill记录](../2026-10-16-app-skill/README.md)。下文记录1.0.0阶段的连接与构建。

记录日期：2026-10-15。与 [调试与使用规范](../../guides/plugin-runbook.md) 配套。本文只记录连接与构建，不执行安装、发布、部署或权限变更。

## 当前实际使用对象

本次实际完成授权和使用的是 **App 自动生成的插件1.0.0，不含 Skill**。1.1.3是另外一个组合插件；它引用相同 App，包内有 Skill 和图标，但尚未验收其安装切换和 Skill 使用。用户已接受这一差异，并要求保留完整记录。

| 字段 | App 自动生成插件 | 组合插件 |
| --- | --- | --- |
| 插件 ID | `plugin_asdk_app_6ad0d805d3e88191a1c8902cf66af046` | `Plugin_e3a0fc80b8a48191855711e727b2b8e1` |
| 版本 | `1.0.0` | `1.1.3` |
| release ID | `PluginRelease_ecb8f90fb2388191afed905b91b472f1` | `pluginrel_6ad0d88864c48191a3c17b9a82399006` |
| 范围 / 可见性 | `USER` / `PRIVATE` | `WORKSPACE` / `PRIVATE` |
| 包名 | `dev-6ad0d805d3e88191a1c8902cf66af046` | `sill` |
| 包内 Skill | 无 | `skills/sill/SKILL.md` |
| 本次使用证据 | 授权、7个工具、读取、打开入口 | 文件和绑定读取确认；安装切换未完成 |

共同 App ID：`asdk_app_6ad0d805d3e88191a1c8902cf66af046`。观察到的 App 版本 ID：`asdk_app_v_6ad0d805d3f08191a485523d41cde5f3`，管理页状态为 `DEVELOPMENT` / `dev mode`。

连接 App 只解决 App 工具与页面的授权。它不会自动安装另一个插件中的 Skill，也不会将组合插件的图标、文案同步到 App 自动生成的插件。两个版本号不需要一致。

## 完整连接调整步骤

### 1. 固定对象并读取配置

1. 从插件页面或平台结果取得准确插件 ID，不用名称猜测。
2. 先读取文件列表，再按列表读取清单、`.app.json` 和 Skill；检查图标是否存在。保存当前 release ID，更新时防止覆盖其他版本。
3. 区分包、App、OAuth 客户端、服务端部署和实际已安装对象。搜索结果为空不能证明按 ID 可访问的对象不存在。
4. 本次1.1.3包内文件快照见 [release-source.json](../2026-10-15-plugin/release-source.json)。App 自动生成插件只有 `.app.json` 与 `.codex-plugin/plugin.json`，没有 `skills/`。

### 2. 检查 MCP 服务准备情况

1. 使用远程 HTTPS MCP 地址：`https://sill-web-preview.scs1213-temp-email.workers.dev/mcp`。
2. 检查受保护资源元数据：`https://sill-web-preview.scs1213-temp-email.workers.dev/.well-known/oauth-protected-resource/mcp`，资源和受众均为上述 MCP 地址。
3. 检查授权服务器发现文档，取得真实授权与令牌地址。本文记录的公开发现结果为HTTP200，不读取令牌。
4. 检查 `tools/list`、`resources/list` 和页面资源读取；授权不足时不公开用户内容。确认页面构建产物被打入 Worker，不能只注册入口名称。
5. 入口声明参数见后文。服务代码有声明，只能证明服务准备，不能替代宿主安装与渲染验收。

### 3. 通过 MCP 注册自定义 App

按本次用户提供的实验步骤，先通过 ChatGPT 的自定义应用创建入口添加 MCP 地址，选择 OAuth，取得实际生成的 App ID。此前初次创建表单的逐项点击、原始请求和完整 OAuth 表单导出没有保存在本轮证据中；不得把下面的已核对参数称为创建表单的完整原始导出。

创建后记录 App ID、App 版本 ID、平台生成的插件 ID和回调。不要自行拼造 App ID，不因创建结果未返回 ID 就反复新建副本。本次实际回调是 `https://chatgpt.com/connector/oauth/ufi0fWkbCET5`，与服务端登记一致；新 App 不保证仍使用这个回调。

### 4. 让现有组合插件引用 App

1. 添加 `.app.json`，使用平台已生成的 App ID；具体 JSON 见后文。
2. 主清单以 `extensions.com.openai.apps` 指向 `./.app.json`；兼容清单使用顶层 `apps`。
3. 保留原 Skill、产品 PNG 与浅深色透明 SVG；移除同一 MCP 的重复连接文件和对应清单引用。
4. 将两份清单的 `requires_local_executor` 设置为 `false`，不要求启动本机服务。
5. 通过原组合插件的更新流程提交，保留原插件身份、工作空间和受众。本次实验已更新至1.1.3；初次打包命令、上传归档校验和未在本轮保存，不臆造该记录。
6. 重新读取版本、App ID、文件列表、Skill 和图标；遗漏文件不会必然从远端删除，删除必须使用支持的明确文件删除参数。当前远端文件列表已无重复 MCP 配置。

### 5. 在实际安装对象中继续连接

本轮浏览器从组合插件详情的 App 弹窗看到“此应用暂无可用工具”，随后打开导航中已安装的 App 自动生成插件。该页面显示“继续连接应用”。本轮因此转到不含 Skill 的 App 插件完成连接，没有完成组合插件的安装切换。

操作路径：App 插件详情 → 应用区域的“连接”或“继续连接应用” → Sill 登录或授权页。首次点击后跳转可能延后发生，先检查页面和标签状态，不立即重复创建连接。

### 6. 根据真实请求定位权限拒绝

实际请求五项身份权限：`openid email offline_access profile phone`。Sill 拒绝页显示“权限或回调配置不一致”。只读取以下元数据进行区分：客户端 ID、请求 scope、请求回调、登记回调、Sill 策略允许列表、客户端启用状态，以及账号是否匹配。

本次结果：账号匹配、回调匹配、客户端启用；Sill 允许列表只有前三项。因此拒绝来自 `profile` 和 `phone` 未在该客户端允许列表，而非 MCP 地址、Skill 或图标。

### 7. 修改 Sill 的客户端策略

用户明确要求“让 Sill 支持，而不是 OpenAI 调整”，本次没有修改 OpenAI 请求权限设置。

| 调整项 | 实际值 |
| --- | --- |
| 数据库项目 | `moeabktxrgidrdkplvac`，项目名 `sill` |
| 表 / 字段 | `sill_private.oauth_clients.policy.identityScopes` |
| 客户端 | `5caffdc3-f450-4664-bd81-a65a16eace73` |
| 调整前 | `["openid","email","offline_access"]` |
| 调整后 | `["openid","email","offline_access","profile","phone"]` |
| 更新约束 | 客户端准确匹配、旧列表仍为前三项、audience准确匹配、enabled=true |
| audience | `https://sill-web-preview.scs1213-temp-email.workers.dev/mcp` |
| 保留的卡片权限 | `content:read`、`content:write`、`content:delete` |
| 保留的资源范围 | `*`，整个个人工作区 |
| 保留的回调 | `https://chatgpt.com/connector/oauth/ufi0fWkbCET5` |

更新返回目标记录，随后独立重新查询确认允许列表。没有开放其他客户端、任意回调或事件权限，没有直接写入用户授权。身份权限与卡片权限分别检查。

此时运行 `npm run test:oauth`，42项通过。新增测试名为 `ChatGPT five identity scopes reach review only when explicitly allowed for this client`，确认五项请求能进入确认页且不自动创建授权。本次现有服务代码已支持这些身份权限，修复只改数据库策略；未重新部署 Worker，未发布1.1.4。

### 8. 完成明确授权并刷新

1. 从原 App 重新发起连接；授权页列出五项身份权限、读取/创建修改/删除卡片，以及整个个人工作区范围。
2. 由用户明确确认实际权限后点击“允许上述访问”。本次用户已明确回复“允许，继续验收”。
3. 成功经过 ChatGPT OAuth 回调并返回 App 插件页。不要保存含授权码、state、Cookie的临时 URL。
4. 返回后页面短暂仍显示“继续连接应用”；刷新后变为“打开插件”。数据库确认卡片授权 `consent_version=2`；这不是插件版本。
5. 打开应用弹窗，确认4个读工具和3个写工具。工具清单取决于当前授权，而不是包内 Skill 写了哪些名称。

### 9. 按能力分别验收

- 读取：宿主发起 `sill_listContents`，参数 `{"limit":1}`，返回已有卡片；不修改或删除卡片。
- 全局工作台：点击“打开插件”，进入 `https://chatgpt.com/mcp-app/asdk_app_6ad0d805d3e88191a1c8902cf66af046/sill_open_workspace`。
- 对话侧栏：要求宿主调用 `sill_open_cards`，参数 `{}`；宿主助手报告已调用，本轮未展开原始调用结果。
- 页面：自动化观察曾显示“未能显示 sill”，网络诊断受浏览器工具限制；未取得确定原因，未发布页面修复，随后用户确认成功。
- Skill：组合插件安装切换和 Skill 使用未完成，不能用以上成功替代。生产写入/删除、长期续期、重启和跨宿主也未在本轮完整验收。

## OAuth 与运行参数

| 参数 | 已核对值或要求 |
| --- | --- |
| App 名称 / 描述 | 实际 App 自动生成插件显示 `sill` / `sill`；不是组合插件的完整展示文案 |
| 认证方式 | OAuth |
| issuer | `https://moeabktxrgidrdkplvac.supabase.co/auth/v1` |
| 发现地址 | `https://moeabktxrgidrdkplvac.supabase.co/auth/v1/.well-known/openid-configuration` |
| authorization_endpoint | `https://moeabktxrgidrdkplvac.supabase.co/auth/v1/oauth/authorize` |
| token_endpoint | `https://moeabktxrgidrdkplvac.supabase.co/auth/v1/oauth/token` |
| client_id | `5caffdc3-f450-4664-bd81-a65a16eace73` |
| token_endpoint_auth_method | 本地客户端登记为 `none`；没有需要写入包的客户端秘密 |
| scope | 本轮实际请求 `openid email offline_access profile phone`，Sill 逐项允许 |
| PKCE | 公开发现支持 `S256` 和 `plain`；后续配置应使用 `S256`，本轮未另存真实请求挑战参数，不声称已逐项验收 |

下表为 `server/cloud/worker.mjs` 消费的配置。值来自当前代码与已确认服务地址，不是本轮完整生产环境变量导出。

| 变量 | 所需值 |
| --- | --- |
| `SUPABASE_URL` | `https://moeabktxrgidrdkplvac.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | 由部署环境提供项目 publishable key；本文不复制值 |
| `APP_ORIGIN` | `https://sill-web-preview.scs1213-temp-email.workers.dev`，不带末尾 `/` |
| `AGENT_AUDIENCE` | `https://sill-web-preview.scs1213-temp-email.workers.dev/mcp` |
| `MCP_ENABLE` | 字符串 `true` |
| `OAUTH_CONSENT_ENABLE` | 字符串 `true` |
| `OAUTH_CLIENT_IDS` | JSON数组，须包含当前客户端；不覆盖或猜测其他现有客户端 |

权限允许列表保存在数据库，不由插件 scope 文本自动创建。网页登录不等于批准 OAuth；OAuth 身份权限也不等于卡片授权。

## 页面资源与入口参数

以下来自当前服务源代码 `server/cloud/mcp.mjs`：

| 参数 | 值 |
| --- | --- |
| 页面 URI | `ui://sill/cloud-workspace-v3.html` |
| MIME | `text/html;profile=mcp-app` |
| 全局入口 | `sill_open_workspace`，标题 `Sill · 窗台`，`entrypoints:[{"type":"global"}]` |
| 对话入口 | `sill_open_cards`，标题 `云端卡片`，`entrypoints:[{"type":"thread"}]` |
| 入口参数 | 空对象；`additionalProperties:false` |
| 工具页面绑定 | `_meta.ui.resourceUri` 为上述 URI，`visibility:["model","app"]` |
| 入口声明位置 | `_meta["openai/ui"].entrypoints` |
| 展示模式 | 资源 `_meta["openai/ui"]` 中 `availableDisplayModes:["fullscreen"]`、`preferredDisplayMode:"fullscreen"` |
| UI CSP | `connectDomains`、`resourceDomains`、`frameDomains`、`baseUriDomains` 均为空数组；`permissions:{}` |
| 可打开条件 | 页面 HTML非空、workspaceRead=true、包含 `content:read` |
| 页面数据通道 | `web/cloud-bridge.js` 使用宿主 `callServerTool`；页面不复制令牌或直接连接数据库 |
| 初始读取重试 | 仅首次 `sill_open_workspace` / `sill_listContents` 可重试2次，等待300/900ms；401/403及其他非5xx错误不重试，写入不自动重试 |
| MCP 传输 | 无会话 ID 的 Streamable HTTP；`enableJsonResponse:true`；请求上限524288字节；每次请求复查授权 |

产品 PNG 地址为 `/assets/sill-icon.png`，声明 `image/png`、256×256。入口图标为 `/assets/sill-line.svg` 与 `/assets/sill-line-dark.svg`，声明 `image/svg+xml`、`sizes:["any"]`，分别使用 `theme:light/dark`。SVG为透明背景，viewBox `0 0 24 24`，浅色主题线色 `#858585`，深色主题线色 `#b8b8bd`，线宽1.65。宿主最终展示位置需实际验收，不能从 `composerIcon` 推断。

## 组合插件参数

实际1.1.3的 `.app.json`：

```json
{
  "apps": {
    "dev-6ad0d805d3e88191a1c8902cf66af046": {
      "id": "asdk_app_6ad0d805d3e88191a1c8902cf66af046"
    }
  }
}
```

| 清单参数 | 1.1.3平台值 |
| --- | --- |
| `name` / `version` | `sill` / `1.1.3` |
| V2 schema | `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json` |
| V2 `extensions.com.openai.apps` | `./.app.json` |
| 兼容清单 `apps` / `skills` | `./.app.json` / `./skills` |
| `requires_local_executor` | 两份清单均为 `false` |
| displayName | `Sill` |
| shortDescription / description | `查看、整理和管理你的云端卡片。` |
| longDescription | `Sill · 窗台。东西在光里，安放一会儿。通过应用、侧边栏和技能管理同一份云端卡片。` |
| author / developerName | `Sill` / `Sill`；平台展示开发者另由账号身份决定 |
| category / capabilities | `Productivity` / `["Interactive"]` |
| defaultPrompt | `在侧边栏打开 Sill`；`查看我的 Sill 云端卡片` |
| logo | `./assets/sill-icon.png` |
| composerIcon / composerIconDark | `./assets/sill-line.svg` / `./assets/sill-line-dark.svg` |
| Skill | `skills/sill/SKILL.md`；完整内容保存在平台快照 |

以上组合插件参数不代表当前 App 自动生成插件的配置。后者清单的 displayName、description为 `sill`，category为 `Other`、capabilities为空、defaultPrompt为null，author与developerName为 `App developer`，没有 Skill 和独立图标资产文件。不能将组合插件文件直接覆盖该 App 管理的配置。

## 本地构建命令与产物

这些命令从项目根目录执行。它们是当前源代码的构建方式，不是对初次实验打包命令的追溯证明。Python使用既有指定环境；不创建新环境。

```sh
/Users/w/miniforge3/envs/work/bin/python scripts/build-cloud.py
node scripts/build-cloud-worker.mjs
```

发布候选压缩构建将第二条改为：

```sh
node scripts/build-cloud-worker.mjs --minify
```

| 构建层 | 输入与参数 | 产物 |
| --- | --- | --- |
| 云端网页 | `scripts/modules.json` 模块列表，把 `src/index.js` 替为 `web/cloud-entry.js`；合并已有样式与 `web/cloud.css`，使用 `src/shell.html` | `dist/cloud/index.html` |
| MCP App 页面 | `scripts/build-cloud-app.mjs` 自动在 Worker 构建时执行；打入 `startCloudBridge`，IIFE、browser、es2022、minify=true；转义 script结束标签；加入about:页面hash兼容处理 | `dist/cloud/app.html` |
| Worker | entry `server/cloud/worker.mjs`；bundle=true、format=esm、platform=browser、target=es2022、external=`node:*`；html/text、png/binary、svg/text；`--minify`控制Worker压缩 | `dist/cloud/worker.mjs` |
| npm 对应脚本 | `build:cloud` 对应普通构建，`build:release` 对应压缩构建；原脚本调用 `python3`，执行时需确保对应既有环境 | 同上 |
| 授权验证 | `npm run test:oauth` | 本轮42项通过 |
| 页面协议专项 | `npm run test:cloud-app` | 可用于后续修改检查；本次五项scope修复没有重新运行此套件 |

构建不部署、不注入环境变量、不注册 App，也不会安装 Skill。部署与插件发布是独立动作，当前请求只补记录，未运行这些发布动作。

### 本地插件构建的已知差异

根目录 `.app.json`、`plugin.json`、`deploy/sill/release.json` 及 `scripts/build-plugin.mjs` 仍指向旧 App `asdk_app_6ad03f09b6048191a8826a236ac9097d`。`deploy/cloud/chatgpt-client.json` 也仍记录旧 App 与三项scope，`deploy/sill/new-cloud-release.json` 记录更早的1.1.1；它们均不能当作当前成功连接的配置。

当前 `npm run plugin:build` 会先构建本地页面，再调用旧身份校验脚本，输出 `dist/plugin/sill/`。它要求旧 App ID、旧包名、release记录和候选版本一致，并不是当前组合插件1.1.3的复现工具。因此本次没有调用它或发布其产物。

下次要构建当前组合插件，先读取平台最新release，再同步构建源与身份校验，按1.1.3平台快照保留完整清单、Skill与三份图标。检查ZIP根目录直接包含插件文件，检查实际App ID、版本和引用，确认删除项；通过原对象更新并重新读取。新版本号、安装切换和部署应按当次请求处理，不能从本文自动推导为已授权执行。

## 记录边界

本轮有：平台文件与元数据、公开OIDC发现结果、服务源代码、数据库策略更新及重新查询结果、42项测试、真实授权页面和宿主工具清单、只读调用报告、用户成功确认。

本轮没有完整保存：初次App注册表单与创建请求、1.1.3初次上传命令和归档校验和、全部生产环境配置导出、对话侧栏原始调用展开结果、页面短暂失败的确定原因、含Skill组合插件实际安装验收、长期续期与跨宿主完整验收。保留这些缺口，后续补证据；不得补写为已完成。
