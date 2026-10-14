# Sill 登录与数据边界：本地可验证，生产未应用

目标项目仍为 `moeabktxrgidrdkplvac`。本分支基于 PR #19 的 `8555ad928fcd0a431e88f12ac7c7374ba6e3d94e`，与静态预览 PR #18 分离。没有应用生产 SQL、修改 Auth/GraphQL/权限配置、创建凭据、发送登录邮件或部署后端。线上预览仍是合成数据，API/MCP 未接通。

## 已实现

- `server/cloud/http.mjs`：已有用户邮箱 magic link 的官方 SDK PKCE 流程、校验 state 的固定域名回调、HttpOnly/Secure/SameSite=Lax 会话 cookie、同源写请求检查、登出、HTTP 内容 CRUD/事件接口。
- `server/supabase-auth.mjs`：官方 SDK 验签，额外核验 issuer、audience、expiry、nbf、role、非匿名用户；网页登录拒绝 OAuth client token，agent bearer 必须有独立资源 audience 和 client_id。授权不读取 user_metadata。
- `server/supabase-repository.mjs`：仅四个固定业务 RPC，携带当前请求的用户 JWT；不使用 service_role，不访问裸表。
- `web/cloud-entry.js`：单独构建的登录工作台；列表、新建笔记、编辑标题/正文/已读、删除、刷新/退出。CAS 冲突保留草稿；结果未知时复用原幂等键与原请求核对；没有 token 或卡片的 localStorage 持久化。原本地网页构建不变。
- `server/cloud/worker.mjs` 与 `deploy/cloud/wrangler.jsonc`：请求级 Cloudflare 适配。`npm run build:cloud` 只在本地打包，配置中没有生产环境值或部署命令。
- 新增 CI `Sill authenticated data` 真正运行 SDK/JWT/SQL/HTTP、Docker PostgreSQL 并发测试和桌面/手机浏览器流程。

## 三份 SQL 的准确顺序与权限差异

这些仍是 `supabase/drafts/` 下的待审 SQL，不是已部署迁移。正式执行前应通过 CLI `supabase migration new` 生成文件并在独立 Supabase 环境验证，不手造 migration 时间戳。

1. `sill_v1_storage.sql`：private schema、workspaces/contents/events/receipts/sync_snapshots、约束、索引、RLS，撤销默认权限。
2. `sill_v1_rpc.sql`：caller_grants/destinations、业务函数、owner RLS；默认仍无调用权限。
3. `sill_v1_boundary.sql`：新增 grants.audience；现有授权行 audience=NULL，刻意拒绝调用直到逐行审阅补齐。建立四个 public invoker 包装与四个 private definer 网关；网关归专用非表所有者 `sill_rpc_executor` 所有。

**废止 PR #19 先前提出的 authenticated 直接表授权清单。** 仅 owner RLS 不能阻止同 owner 的不同客户端跳过业务权限检查。最终候选权限如下：

| 对象 | authenticated | sill_rpc_executor |
| --- | --- | --- |
| private schema | USAGE | USAGE；转移函数所有权时临时 CREATE 后撤销 |
| workspaces | 无 | SELECT、UPDATE |
| contents、events | 无 | SELECT、INSERT、UPDATE |
| receipts、sync_snapshots | 无 | SELECT、INSERT |
| caller_grants、destinations | 无 | SELECT |
| 四个 public 业务包装 | 明确签名 EXECUTE | 不需要 |
| 四个 private 网关 | 明确签名 EXECUTE | 函数所有者 |
| 原 private 内部业务函数 | 无 | 明确签名 EXECUTE |

专用角色 NOLOGIN/NOSUPERUSER/NOBYPASSRLS/NOINHERIT、不拥有任何表、不授给 authenticated；网关固定空 search_path、row_security=on，不接受身份/SQL/表名/授权参数。内部函数继续执行 owner RLS 和 caller/scope/resource/audience 校验。anon/PUBLIC 对 Sill 对象无权限。不得把此角色改成表所有者或授予 bypassrls。授权表修改与 workspace 创建仅供管理员 bootstrap。

private schema 必须继续不列入 Data API exposed schemas。即使误暴露，authenticated 没有裸表 ACL；可执行网关仍校验业务权限。真实项目仍需检查既有 views、GraphQL、generic RPC 与角色继承，确保不存在其他间接旁路。本地 ACL 测试不能替代对真实 PostgREST/GraphQL 的网络验收。

bootstrap 应由操作者核实已有 Auth 用户 UUID 后，创建对应 workspace 及 `user:<uuid>` 行，scopes 最小为 content:read/content:write/content:delete，resources=['*']、audience='authenticated'。事件按需单独增加。禁止客户端自行注册 workspace 或授予权限。OAuth grant 另需已批准 client_id、独立资源 audience、精确 scopes/resources；不能为获得列表而擅自扩大为 '*': 当前资源受限 client 的整库列表明确拒绝。

## 验证证据与边界

- `npm run test:supabase`：旧准备测试、实际 PGlite SQL、权限旁路测试；新增使用内存临时 ES256 密钥签发合成 JWT，由真实官方 SDK 验签，覆盖篡改、过期、错误 issuer/audience、未来 nbf、client 混用。测试密钥不写入文件。
- `npm run test:supabase:postgres`：固定 PostgreSQL 17.6 Docker 镜像，network none、无端口、tmpfs、合成 auth.uid/auth.jwt。实际多连接 CAS、幂等、快照水位、tombstone、回滚、RLS，以及最终授权边界。不是线上 Supabase 数据库。
- `npm run build:cloud` 后 `npm run test:cloud-browser`：真实 Chromium 1440/390px，登录/回调/创建/刷新后读取/修改冲突保留草稿/更新/登出；模拟写成功但响应丢失后核对原请求，只有一行。没有 localStorage 卡片或 token。截图写在 tests/artifacts/cloud-*.png，CI 保存 artifact。
- HTTP/浏览器测试走真实官方 SDK 和实际 SQL；GoTrue/JWKS/PostgREST 的网络由本地合成 transport 提供。它不是 Supabase Auth 邮件、真实用户、真实 OAuth 或真实 PostgREST/GraphQL 验收。
- `CHROMIUM_PATH=/usr/bin/chromium` 可使用本机浏览器；CI 使用 Playwright Chromium。原产品回归另跑 `npm test` 与 `npm run test:core`。

## 上线前剩余项

1. 在独立 Supabase 环境验证真实 Auth 邮件回调白名单、PKCE、token claims、四个 RPC 与 REST/GraphQL 拒绝矩阵。数据库操作者权限必须足以创建专用角色并转移函数所有权；本地 superuser 安装通过不代表托管 postgres 权限必然足够。
2. 用户审阅三份 SQL 和此权限差异，确认已有用户、最终 HTTPS 域名、数据导入范围、保留/清理策略后，才考虑生产应用。没有本次授权的生产 SQL 或 Auth 配置操作。
3. 当前只保留 HttpOnly access cookie，refresh token 不持久化；到期重新登录。草稿与未知结果的原请求仅存当前页面内存，离开页面会提示但没有持久恢复队列；重新登录/刷新后必须先读取核对，不能把旧意图当作新建再次提交。登出清理 cookie，并请求撤销上游会话；已签发 access JWT 仍可能有效直到到期，不能声称即时撤销。浏览器 JS/XSS 仍能发同源请求，HttpOnly 不等于消除 XSS 风险。
4. 快照按页复制 JSON 的存储上限、过期回执/快照/tombstone 清理、特殊卡片与旧 item/state 的完整适配尚待完成。当前网页以笔记/通用内容字段为最小范围；不支持的来源、收藏、导入等明确提示未接通。
5. `/mcp` 明确返回 503。另一任务的七工具 stdio MCP 文件未推送、此分支不可见，未集成也未验收；更早提到的 27 个 MCP 文件同样未包含。远程 MCP transport/discovery、真实 OAuth resource audience 支持、同意/撤销与客户端联调仍需后续实现，不能把 HTTP bearer 接口称作已上线 MCP。
6. Supabase changelog/markdown 文档在该环境被访问策略阻止；已通过连接器检索官方 PKCE/Auth/RLS 文档，但未声称完成 changelog 全量复核。
