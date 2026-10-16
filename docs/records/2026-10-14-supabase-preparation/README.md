# Supabase V1 准备与审查结果

阶段记录：下文描述 PR #19 的准备阶段。后续已增加网页登录/回调、受控 RPC 边界、真实签名 JWT、本地 HTTP/浏览器与 PostgreSQL 多会话验证；最新实现范围和权限差异见 [应用清单](../2026-10-14-supabase-rollout/README.md)。旧文的“尚未接路由”“仅 mock”“所有函数 invoker”等不代表后续实现，仍没有任何生产应用。

核查基线：远程 `docs/sill-agent-first-mcp` = `428c04bcccdc9b25ddfe22969111408b8ddcc7dd`。
隔离分支：`prep/sill-supabase-v1-review-20261014`。独立 clone，仅读取远程已提交内容。
未访问、复制或声称包含另一任务的 27 个未提交 MCP 文件。未发布 Cloudflare、未改同名分支、未推送或合并 PR。

目标项目由交接给定：sill / `moeabktxrgidrdkplvac`，组织 context_flow / `ogkexqzfbngxkvnrqeqb`，us-east-1，API `https://moeabktxrgidrdkplvac.supabase.co`。ACTIVE_HEALTHY、public 空表、advisors 空是交接信息，本次没有重查项目或读取密钥。

## 实际交付边界

本次用户授权覆盖准备代码及迁移审查，优先于 README/AGENTS 中此前“仅文档”限制。没有真实数据库写入、凭据创建、安全配置变更或应用上线。

- `supabase/drafts/sill_v1_storage.sql`：5 张私有表的可执行基础草案，全部 RLS、零客户端授权、零 RPC。不能直接投入业务；不声称已完成 V1 事务实现。
- `server/supabase-auth.mjs`：每请求独立 Supabase client，以 SDK getClaims 验证 JWT，再检查 issuer/audience/expiry/nbf/sub/role、拒绝匿名用户。只接收 publishable key，转发用户 JWT，不持久化服务端会话，不返回 token/用户 metadata。不自动授予任何业务权限，尚未接入路由。
- `server/supabase-import.mjs`：纯内存导入准备器；验证现有 State/Card/Item、保留完整卡片/阅读状态及设置，不联网、不读本地文件、不上传。每卡初始 revision=1，另存旧全局 revision；遇到重复 ID、孤立 item、未知 schema 字段停止。
- `server/local-state.mjs`：仅导出既有 State schema，未改本地存储/CLI 行为。
- `tests/supabase-preparation.test.mjs`：6 项离线测试；SDK 2.117.3 与测试用 PGlite 0.5.9 固定版本并提交 lockfile。

`.agents` 仅有 plugins/marketplace.json，没有 `.agents/skills` 或更深 AGENTS。本次读取根 AGENTS、README、LOCAL-OPERATIONS、AGENT-MCP、V1-HANDOFF、OpenAPI 与实际 local-state。使用 Supabase 与 Postgres best practices 技能。

## 与当前实现/V1 契约的差距

| 范围 | 核查结论与下一适配 |
| --- | --- |
| 当前运行入口 | `server/local.mjs` + JSON 文件；既有 `server/mcp.mjs` 是 legacy 路径，不能当成当前产品 V1。此分支不改当前启动入口 |
| 接口 | 契约是 8 HTTP 操作（含 health）、7 MCP 工具；沿用共同领域层，保留 `/api/local`，不建微服务或每应用连接器 |
| 版本 | 本地全局 revision 不能作为每卡 revision；Web 整卡编辑 P1 仍在。必须保留编辑起点，服务端 CAS，409 留草稿；不能拿最新轮询版本包装旧草稿 |
| 旧字段 | card JSONB 保存 tasks/event/media/files/来源等专属字段；item 原样保存。V1 Content 只作显式投影，PATCH 只改提供字段、state 合并，不能用精简 DTO 整卡替换 |
| 类型缺口 | V1 CreateContent 可接受 task/event 等，但不含当前 Card 要求的 tasks/start/end 等必填专属字段。不能把所有 V1 创建直接交给 Card.parse；需要领域模型/渲染兼容方案或扩契约后再接通。导入已存在卡片不受此缺口影响 |
| 状态缺口 | item.taskDone/reminderDone/dismissed/later 不等同通用 done/archived；本次只映射明确的 read，不猜测其余状态，也不把本地完成当外部完成 |
| 持久层 | workspace 保存阅读时长、preferences、sources、旧 revision；contents 保留原字段及 tombstone；events 保存分派/投递/结果；receipts 保存幂等原结果；sync_snapshots 固化分页快照。没有内部助手/任务调度器 |
| 来源 P1 | 导入保留原始来源数据用于核对，但展示必须标记未验证，停用投递。来源虚假成功/RSS 地址未存均未修 |

## 用户 JWT 与 service_role

可以复用 Supabase 用户 access JWT：业务服务用 publishable key + 当前请求 Bearer JWT 调用受限 RPC，RLS 取得 auth.uid()。无需 service_role 执行日常内容/事件读写；也无需把用户 refresh token 交给服务器或外部助手。schema 迁移是管理动作，独立于业务请求身份。

不能把“用户已登录”当“外部 MCP 获得全部用户权限”。OAuth agent token 可能与用户共享 sub；必须用经过验证的 client_id 区分授权主体，并在受保护的授权表绑定工具 scope、资源和事件分派。只在 HTTP/MCP 层检查 scope 而给 Data API 同一个 token 全量 owner 权限，可被绕过。user_metadata 不可参与授权；openid/email/profile 等身份 scope 不等于 content:write/event:result。

推荐下一步：维持 sill_private 不在 Data API exposed schemas 中；添加少量 public SECURITY INVOKER RPC，按 JWT principal 和数据库授权表检查权限，且底层 RLS 同步约束 owner/client/event。仅授予必要 schema/table/function 权限，撤销函数 PUBLIC 默认执行权限。不要为解决授权报错加入 service_role 或无检查 SECURITY DEFINER。当前草案有意完全无授权，包含 owner 本人也不能通过 API 使用。

`authenticateSupabase` 只完成身份验证，不是 scope、client allowlist、资源权限、session 吊销检查或 MCP audience 绑定的完整实现。默认 audience=authenticated 适合用户会话；远程 MCP 必须确认资源 audience 策略及客户端兼容，再设置独立 audience 和保护资源元数据，拒绝用于其他资源的 token。SDK getClaims 验证不保证立即感知登出/撤销；敏感操作是否查 session 状态需确认。外部 agent 不接受 owner 浏览器 token 粘贴作为长期配置。

后台 Webhook 投递在用户 JWT 过期后不能靠用户请求身份继续运行。需另行选最小权限服务身份/受限领取与回执 RPC；本草案没有该执行器，不能据此声称整个无人值守链路完全不需要服务器凭据。Webhook 出站秘密只存服务端安全设施，与 MCP 入站 OAuth 分开。

## 登录方案（尚未创建账户/发送邮件）

免费个人用途优先已有用户邮箱 OTP 或 magic link，`shouldCreateUser:false`；先由用户确认唯一账号和注册策略。使用官方 Auth SDK，PKCE 登录及明确回调。当前页面没有登录 UI，此文件只是接入方案，不能声称云端已可登录。

Web 若使用持久会话，推荐同源服务端安全会话方案：HttpOnly/Secure cookie、明确 SameSite、CSRF 防护、CORS 精确允许列表；需核查 JWT/refresh token 处理和浏览器重载续期。当前身份适配支持显式 Bearer，不实现 cookie 登录。遵循仓库“不在浏览器持久化存秘密”的规则，不默认使用 SDK localStorage 会话。

iOS/macOS 使用官方客户端/标准 PKCE，Keychain 保管刷新凭据、系统认证会话处理回调；共享同一 HTTPS 业务契约。不让客户端直写数据库绕过业务事务，不假设 iOS 后台常驻。本次未测试原生客户端。

外部 MCP 可复用 Supabase OAuth 2.1 Server（官方文档仍标 beta，beta 期间各计划免费），需先确认项目功能、用户同意页、准确 callback 与 client allowlist；默认不启用动态注册。不是重建 OAuth，也不是为 OpenClaw/Hermes 建一对一数据连接器。用户 Hermes 产品/版本尚待核实。

## 必须完成的事务与同步规则

1. 认证授权先于幂等查询。每个 workspace 写事务先锁 workspace 行，避免全局序列分配早于 commit 导致增量漏数据。幂等键唯一维度为 owner + verified caller + operation/resource + key，规范化请求摘要；先返回相同请求旧回执，再做 expectedRevision 检查。异请求同键 409。
2. 内容 PATCH/DELETE/事件结果必须在同一 RPC 事务中核对版本、事件目标与分派、终态，更新内容/事件/receipt。只有内容实际变化才增内容 revision；metadata-only 保留内容 revision、记录 result_revision。ack 只改 delivery，不能改 outcome 为成功。未知结果不盲重放。
3. POST event 同事务写 queued/pending 及稳定 event_id；重发不得重建事件。结果回写不能产生同一通知。事件 terminal 冲突 409。拒绝未经授权 destination_ref，配置出站 URL 需要 SSRF/重定向限制。
4. 删除增 revision，card/item/state 清空；API 可投影固定“已删除”标题。事件 summary、receipt 原响应、分页快照也可能含敏感内容，必须连同删除/保留策略处理，不能只擦 title/body/url 就称彻底清除。
5. 首次列表在一致性事务中形成稳定投影数组及 watermark；游标随机不透明、仅存摘要，绑定 caller/query/expiry。之后从 change_version 增量含 tombstone，并形成新的稳定快照。不得简单 `updated_at > since` 或翻页读取活表。游标过期 410，不能静默漏数据。
6. 普通幂等建议 7 天仅为候选；event_id 去重至少覆盖事件全生命周期。tombstone、快照、幂等原响应保留窗口与清理需共同确定；不得提前清理造成删后复活。所有时间/新内容 ID 服务端生成，导入保留旧稳定 ID。

这些规则是下一迁移/RPC实现的验收标准；当前 SQL 只有基础约束，不自动实现上述流程。

## 导入、切换与回退

- 暂停写入后由用户明确选择导出文件；备份本地 JSON、校验格式/重复/孤立关联，运行纯导入准备。不可读取另一任务未提交数据。
- 在隔离测试库先导入合成数据；正式导入使用经验证 owner（不能来自请求体），要求目标 workspace 空且单事务完成。卡片数、ID、专属字段、item、设置逐项校验；旧全局 revision 仅作为来源证据。
- 不双写两套真值；新能力全部通过契约/权限测试后再切入口。旧 `/api/local` 和 CLI 保持原行为，云端上线须单独接入异步 repository，不直接替换同步 LocalRepository。
- 未切流时回退只删除准备代码；切流后回退必须停写并导出云端新增变更，不能直接恢复陈旧 JSON。保留原文件但不默认再次上传覆盖。迁移应用前再次核对项目 ref 和当前 schema，备份及审查 dry run；本次没有执行这些云操作。

## 用户必须确认的安全配置

这些待确认事项来自本次任务禁止更改安全设置及 V1 尚未确定的部署边界，不是新的泛化审批要求：

- 单用户账号、是否关闭公开注册/匿名登录、邮箱登录方式与邮件发送能力；不为测试创建真实凭据。
- 实际 Cloudflare 生产域名、Auth Site URL、精确 Web/原生回调、CORS/cookie/CSRF 方案。不能拿静态预览 URL 自动当生产授权域。
- 是否启用 OAuth beta、签名算法/audience、明确 MCP 客户端及最小权限、同意与撤销方式；保持动态注册关闭，除非单独授权。
- 后台投递身份与秘密托管、允许目标；Hermes 产品/版本和 OpenClaw 可用实例。
- 数据导入范围、幂等/事件/游标/tombstone/备份保留及删除隐私取舍；发布前的 RLS/RPC 授权变更。

## 验证与限制

已通过：`npm test`（构建、语法、本地与插件测试 3/3）；`npm run test:core`（18/18）；`node --test tests/supabase-preparation.test.mjs`（6/6）；`python3 scripts/check-v1-contracts.py`（8 HTTP、7 MCP、11 fixtures、5 negative controls）。SQL 在 PGlite PostgreSQL 引擎实际执行，使用合成 auth.users 与角色测试默认拒绝、即便误授表权限仍受 RLS 限制、跨 owner FK、tombstone 清理和全部表 RLS。

没有真实 Supabase Auth/PostgREST/RPC、网络登录、签名密钥轮换、浏览器、Apple 设备、完整 V1 并发/幂等/增量验收。本次 JWT 测试 mock 官方 SDK 返回值，不能替代真实 token 签名与 Auth 集成测试。数据库测试是本地基础验证，不是 Supabase advisors 或生产验证。

工具限制：默认 npm cache 路径不可写，改 `/tmp/sill-npm-cache` 后依赖安装成功。Supabase CLI 2.90.1 npm postinstall 两次失败（exit 1），因此没有 CLI `migration new` 生成迁移文件，SQL 放 drafts；后续 CLI 可用时先看 `--help`，再 `migration new sill_v1_storage`，把审定 SQL 放入生成文件。未链接项目、未运行 db push。Supabase changelog.md 抓取不成功（web 不支持该 MIME，curl 403），没有声称完成 breaking-change 扫描；相关功能已通过官方 MCP search_docs 核验，正式应用前仍需重查 changelog。

官方核验来源：
- [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [JWT getClaims](https://supabase.com/docs/reference/javascript/auth-getclaims)
- [MCP Auth](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication)
- [OAuth 2.1 setup / beta 状态](https://supabase.com/docs/guides/auth/oauth-server/getting-started)
- [邮件无密码登录](https://supabase.com/docs/guides/auth/auth-email-passwordless)

## 后续本地事务补充（2026-10-14）

`supabase/drafts/sill_v1_rpc.sql` 在基础草案之后执行，新增 caller_grants、destinations（只有引用/权限，无秘密），以及私有 SECURITY INVOKER 函数：

- `write_v1(op, resource_id, payload, idem)`：create/update/delete/submit_event，owner 行锁、规范化 JSONB SHA-256、授权先于幂等、幂等先于版本校验；内容/事件/回执同一数据库函数事务。返回 `{status_code,body}`，未接 HTTP/MCP。
- `get_content`、`get_event`：资源权限/分派检查；不返回数据库内部字段。
- `list_contents`：固定内容投影快照、不透明随机游标、caller/查询绑定、过期拒绝、最后一页增量水位、tombstone；写入统一锁 workspace，避免序列先分配后提交造成水位遗漏。
- `authorize`、`caller` 与投影/字段校验辅助函数。用户主体与 OAuth client 分开；授权表只读政策防止自授 scope。普通内容表增加 owner RLS，但仍零生产 schema/table/function grants、无 public wrappers。

导入准备现在额外携带 `content_type`，确保擦除 tombstone 正文后仍保留响应需要的内容类型。原标题/body/url及专属字段的保存/清理规则不变。

测试：`npm run test:supabase` **13/13**，新增测试文件 `tests/supabase-rpc.test.mjs` 使用本地 PGlite 与合成 auth claims；测试权限仅在测试数据库授予。覆盖请求字段顺序不影响幂等、同键异请求冲突、CAS失败不留回执、no-op不增版本、旧专属字段不丢、跨用户/未注册agent拒绝、授权先于重放、分页中修改/删除进入下一轮、游标跨身份/改查询/过期失败、删除幂等重放、结果错误分派整批回滚、metadata-only不增内容版本、终态冲突。返回的 Content/Event/ContentPage 逐项用 checked-in OpenAPI JSON Schema 校验。V1契约检查再次通过。

**仍非生产适配完成：**

- 没有真实 JWT/PostgREST 集成、公开 RPC 授权、HTTP 错误映射或既有 MCP 七工具接入；不能给当前静态预览加上这些接口就称全栈上线。
- 私有函数抛领域异常，未来边界必须映射成契约 Error 与 HTTP 状态；`idempotency_expired` 应作为409需核对提示，`event_terminal_conflict` 作为409，而非新增未经契约批准的公开 error code。
- 范围受限 caller 暂无列表投影，`list_contents` 需要显式 workspace 全范围 content:read；否则拒绝，不能自动扩大资源权限。实际 agent 如只分派一张卡，使用 get_content。最终是否支持限定集合列表需单独实现。
- 原事件版本变化时保守返回冲突，尚无人工核对后的继续流程；没有后台领取、投递重试、SSRF URL 验证或 receipt清理。queued/ack不被虚构成业务完成。
- 1天游标、7天普通幂等仅为本地原型参数，未经用户确认；快照按页复制 JSON，正式使用前应改为共享不可变快照+轻量分页引用并设存储上限/清理，避免免费额度浪费。
- 旧卡片/本地 item 与 V1 state 的双向编辑适配尚未接 UI；task/event 等最小创建 schema 与现有专属渲染字段的差距仍在。没有改动原本两个P1，也没有引入微服务/内部AI。
- PGlite只有本地单连接执行证据，未验证真实PostgreSQL多连接锁等待/死锁/并发竞争、Supabase advisors、备份恢复和生产性能。这些必须在隔离集成环境完成。

另一后续任务要求公开静态预览；本环境已从远程基线另建 `deploy/sill-web-preview-20261014`，完成合成演示及1440/390px本地测试。Cloudflare插件发布被自动审批拒绝（原任务“不发布Cloudflare”限制与后续委派授权冲突），未换通道/重试；随后只读复核同名Worker仍不存在。因此无真实URL或线上HTTP测试结果。详见另一worktree `docs/STATIC-PREVIEW-STATUS.md`。
