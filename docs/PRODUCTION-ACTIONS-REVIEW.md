# 生产动作审查：网页登录/读写先行，MCP 单独设门槛

审查基线：PR #20，初始基线 `6012651`，以本文件所在最新提交为准。目标 Supabase 项目 `moeabktxrgidrdkplvac`；Cloudflare account `8dfc5765c957955fbcca0c22071c824d`。本文件是待批准动作计划，未执行下列生产写入。

## 真实完成度

| 路径 | 已实际执行 | 没有执行 |
| --- | --- | --- |
| 登录 | 官方 SDK PKCE challenge/verifier，真实 ES256 签名验签、HttpOnly verifier 绑定的固定回调，Chromium 登录交互 | 真实邮箱收信、真实 Supabase 用户/GoTrue、线上回调 |
| 内容 | 浏览器→HTTP→官方 SDK→测试 transport→实际 PGlite SQL；独立 Docker PostgreSQL 多会话 CAS/幂等/RLS；创建/读取/编辑/删除 HTTP 测试 | 真实 PostgREST/GraphQL、真实 Supabase 库写入、公开后端部署 |
| 权限 | 非匿名、issuer/audience/expiry、跨 owner、同 owner 不同 client/scope/resource、裸表 ACL、未知客户端拒绝 | 已有生产角色/函数旁路审计、真实 OAuth client/同意/撤销 |
| MCP | 仓库只有 legacy `server/mcp.mjs` 的 qg_* 工具，V1 七工具是 `docs/examples/v1/mcp-tools.json` 设计契约；基线 /mcp=503；后续新增官方 SDK 运输层，默认仍关闭 | 未读取旧27文件，未整合另一任务未推送七工具，未做 Codex 真实调用 |

上述本地 HTTP/浏览器测试属于集成测试，不是线上 Supabase 端到端。最终验收必须是：用户真实登录 → Codex 用自己的已授权 MCP OAuth 身份创建一条内容 → 网页刷新看到同一 ID/正文/版本 → Codex 修改后网页看到新版本；再验证无权客户端被拒绝。

## A. 请求批准的网页阶段动作（明确范围）

1. **目标域名**：沿用当前 `sill-web-preview` Worker 的 HTTPS origin `https://sill-web-preview.scs1213-temp-email.workers.dev`，待批准后将该入口切换为鉴权工作台。发布前复查现有 Worker 归属/版本，并保存原静态版本作回退。本次只审查，不创建/启用付费服务。
2. **首次账号邀请**：父任务已只读核实用户私下选定邮箱目前不在 auth.users。因此需要明确批准一次邀请/创建该唯一账号，并由用户自行验证邮箱；邀请仅用于验证邮箱，不把邀请返回的 session 当作当前 PKCE 登录；用户完成验证后从站点重新发起登录链接，之后受控读取其 UUID/验证状态再 bootstrap。代码保持 shouldCreateUser=false。邀请优先用已授权控制面，不创建/传递密码或 service_role key；若现有控制面不能安全邀请，由用户在 Dashboard 发出邀请，不用放开公开注册来绕过。邮箱/UUID不写入公开仓库。
3. **认证设置候选差异**：启用邮箱 magic link（代码 shouldCreateUser=false）；确认关闭新注册与匿名登录。Site URL 设为上述 origin，若项目已有其他应用依赖该全局值，先列出冲突，不覆盖。Redirect allowlist 精确新增 `https://sill-web-preview.scs1213-temp-email.workers.dev/auth/callback`，无通配符。代码 emailRedirectTo 固定为该路径；Supabase 后续附加单次 code，回调用 HttpOnly PKCE verifier 向官方 Auth 兑换，拒绝缺失/错误 verifier。自定义 state query 已移除，不需要模糊 query 允许规则。Supabase 邮件能力/收件限制也需只读核验；本计划不增加收费 SMTP。
4. **SQL**：在独立环境安装并验证，审阅后才应用下面四份 schema/RPC 文件；正式迁移名称由 Supabase CLI 生成，当前没有已生成或已应用的生产 migration。检查现有 schema/role 冲突与管理员是否有创建专用角色、转移函数所有权的权限；有冲突停止，不 DROP 或覆盖已有对象。
5. **owner bootstrap**：使用受控核验的 UUID 创建一行 workspace 与一行 `user:<uuid>` grant，仅 content:read/content:write/content:delete，resources=['*']，audience='authenticated'。不给网页 owner event:result，不创建 OAuth grant/destination，不导入旧本地数据。SQL 见 `supabase/drafts/sill_v1_owner_bootstrap.sql`，要求显式提供已核验 UUID。
6. **运行环境与发布**：仅绑定既有项目 URL、既有 publishable key、APP_ORIGIN（公开配置，仍不输出 key）；不取用 service_role/secret key。MCP_ENABLE 保持关闭，AGENT_AUDIENCE 未验证前不启用。打包 Cloudflare Worker，本阶段才允许公开网页登录与授权业务读写。
7. **真实验收**：用户自行从邮箱打开 magic link（同浏览器/设备，不转交验证码/token）；核对 cookie、回调、只准已授权用户；合成验收笔记新增→刷新/第二标签页→修改→冲突→删除，记录 ID/revision/HTTP 状态，不记录会话或私人正文。直接 REST/GraphQL/裸函数与其他 owner/client 拒绝必须实测。

## 准确 SQL 与权限 diff

- [`sill_v1_storage.sql`](../supabase/drafts/sill_v1_storage.sql)：五张私有表、索引/约束/RLS。
- [`sill_v1_rpc.sql`](../supabase/drafts/sill_v1_rpc.sql)：caller_grants/destinations、事务/幂等/CAS/事件/快照业务函数、owner RLS。
- [`sill_v1_boundary.sql`](../supabase/drafts/sill_v1_boundary.sql)：撤销 authenticated 直接表/原私有函数权限；四个 public invoker 包装→四个 private definer 网关；专用 sill_rpc_executor NOLOGIN/NOBYPASSRLS、不拥有表；固定 search_path 与 row_security=on。新增 grants.audience，旧 NULL 行不再生效。安装者仅临时获得 executor SET 权限，以 executor 身份授网关 EXECUTE 后撤回 SET；不授 INHERIT。PG17.11 回归用 NOSUPERUSER/CREATEROLE、createrole_self_grant=空的角色安装，确认执行角色无表所有权/BYPASSRLS。实际安装者仍须有 auth schema USAGE 与 auth.uid/auth.jwt EXECUTE 的 grant option，生产前核验，不默默升级角色。
- [`sill_v1_sessions_snapshots.sql`](../supabase/drafts/sill_v1_sessions_snapshots.sql)：独立 session_info RPC、每 owner 最多8份共享快照/每份2MiB/15分钟/最多128游标；单次物化最多1000条投影（超限返回429，不截断丢数据）；分页只存引用。迁移明确清空旧临时游标投影，旧游标返回410；不删除内容或幂等回执。成功会话/列表请求清理过期快照，另提供 [管理员清理 SQL](../supabase/drafts/sill_v1_expired_snapshot_cleanup.sql)，可经批准接现有调度；没有宣称空闲时自动定期物理清理已配置。
- [`sill_v1_owner_bootstrap.sql`](../supabase/drafts/sill_v1_owner_bootstrap.sql)：仅经核验 owner 的最小网页授权，零真实身份写入仓库。

详细逐表权限见 [清单](SUPABASE-ROLLOUT-CHECKLIST.md#四份-sql-的准确顺序与权限差异)。**authenticated 没有任何 Sill 底层表 ACL；anon/PUBLIC 无 Sill 权限。** private schema 不暴露给 Data API；同时核验既有 views/generic RPC/GraphQL 无旁路。

## B. MCP 阶段单独审阅，不能与网页登录混为已批准

- 候选 MCP resource URL / audience：`https://sill-web-preview.scs1213-temp-email.workers.dev/mcp`。
- Supabase issuer：`https://moeabktxrgidrdkplvac.supabase.co/auth/v1`；授权服务器 discovery 在项目域名的 `/.well-known/oauth-authorization-server/auth/v1`。
- 候选应用 consent URL：`https://sill-web-preview.scs1213-temp-email.workers.dev/oauth/consent`。这不是网页 magic-link callback，也不是 Codex OAuth callback；当前尚无可上线的 consent 实现。
- **Codex redirect URI 不能猜**：从实际 Codex 客户端 OAuth 启动/注册信息取得完整 URI（协议/域名/路径/端口），逐字登记；若客户端发送 Origin，也需核验并单独批准精确 Origin，不能开放通配 CORS。未取得之前不能批准具体客户端注册。默认不启用 Dynamic Client Registration，不创建 confidential client secret；优先检查客户端是否支持预注册 public client + PKCE。
- 启用 Supabase OAuth server、设置 consent path、注册唯一客户端、明确 client_id、授最小 content:read/content:write 与经过用户确认的资源范围，均为后续具体安全配置变更。删除/event:* 默认不给。整体列表与创建需要当前契约的 workspace '*'，资源受限 grant 不能被自动扩大；需要用户明确选择可写整个个人 workspace 还是先限定既有卡片。
- **阻断条件**：当前官方 Supabase MCP 指南未提供本项目实际 resource-bound aud 的证明。PR20 拒绝泛用 aud=authenticated 的 agent token。必须用真实授权请求验证 resource 参数、access-token audience、PostgREST是否接受该 token、client_id；若平台不能满足，停止，不放宽 audience 校验或替换成 owner token。
- 本地可以新增官方 SDK Streamable HTTP 运输、RFC9728 protected-resource metadata、401 challenge、七工具按授权发现、复用现有 RPC；不能把这些本地准备说成 Codex OAuth 已连通。

## 回退与已知限制

本次尚无入口切换。上线失败恢复保存的静态版本；数据库有新用户数据后不能 DROP 回退或用旧 JSON 覆盖，先停写并保全变更。当前 access cookie 到期需重新登录；未知写请求只在页面内存中保留。快照现有容量/有效期限制已实现；空闲库的定期物理清理需另批准现有调度接入，未启用新定时服务。内容删除后的回执保留与隐私擦除策略仍需用户确认。

参考：[Supabase PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow)、[Supabase MCP Auth](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)、[MCP 授权规范](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization)。

## 后续本地 MCP 验证（仍非 Codex 线上验收）

`server/cloud/mcp.mjs` 新增 request-scoped/stateless 官方 Streamable HTTP：initialize、按数据库当前 scopes/resources 筛选 tools/list、七个契约工具、RFC9728 metadata/401 challenge；每请求验签并重新读取授权，资源级权限继续在同一 RPC 内判断。MCP_ENABLE 默认关闭，只有 AGENT_AUDIENCE 等于 APP_ORIGIN + /mcp 才可启用。不是继承旧27文件。

真实官方 MCP Client 已在本地通过 HTTP 调用业务函数，合成 OAuth JWT + 实际 SQL；浏览器读取同一数据库的新内容。真实 Codex、真实 Supabase OAuth/邮件、resource audience、consent/客户端注册和生产 PostgREST仍未验收。因此只可以说本地运输与共同数据层连通，不能说 Codex 已接入。
