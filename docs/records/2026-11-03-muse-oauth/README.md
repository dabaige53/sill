# Muse OAuth 接入检查

检查日期：2026-11-03。关联事项：[#105](https://github.com/dabaige53/sill/issues/105)。

## 问题与状态

Sill 侧配置已完成，授权入口检查通过；等待 Muse 发起真实授权及后续读取、续期验收。
已为现有个人工作区登记 Muse 独立客户端，回调为
`https://agent.meta.ai/api/hatch/oauth/callback`。尚未取得最初失败请求，
不追认其具体错误原因。

## 环境与定位依据

- 目标 MCP：`https://sill-web-preview.scs1213-temp-email.workers.dev/mcp`。
- Supabase 项目：`moeabktxrgidrdkplvac`。
- 实际读取 `/.well-known/oauth-protected-resource/mcp`，资源地址与发行方符合接入方参数。
- 实际读取发行方的 OIDC 和 OAuth 发现信息：授权和令牌端点与接入方参数一致，
  支持 `authorization_code`、`refresh_token`、认证方式 `none`、
  PKCE `S256`，以及 `openid profile email offline_access`。
  发现信息未公布 `registration_endpoint`，不能据此确认动态注册可用。
- 修改前实际读取 Worker settings：MCP、OAuth 同意页均启用，客户端允许列表包含
  `d787a4ef-8028-4a58-a1f3-d9cd24db7f29` 和
  `5caffdc3-f450-4664-bd81-a65a16eace73`。数据库查询确认它们分别为
  `Sill · Codex`、`Sill · ChatGPT`，修改前没有 Muse 客户端或对应回调。
- 源码 `server/cloud/oauth-controller.ts` 同时检查 Worker 客户端允许列表和
  `sill_oauth_flow` 返回的客户端策略；`server/cloud/consent-policy.ts`
  检查回调、身份范围、卡片权限和资源范围。只登记 Supabase 回调不足以完成接入。

## 处理情况

首次工具搜索漏查了插件能力，关于连接器仅能暂停和恢复项目、不能执行 SQL 的判断错误。
在用户指定 Supabase 插件后，已成功调用 `get_project` 和 `execute_sql`。
实际项目名称为 `sill`，状态为 `ACTIVE_HEALTHY`。

核对 Auth 账号后确认：另一条策略属于 2026-10-23 登录验收的
`example.invalid` 测试账号，不是用户另一个个人工作区。此次仅操作
Codex、ChatGPT 共用的个人工作区，不改测试账号。

通过 SQL 在同一事务内登记公开客户端和 Sill 策略，随后更新 Worker 客户端允许列表。
实际配置如下：

| 配置 | 已保存值 |
| --- | --- |
| 名称 | `Sill · Muse` |
| Client ID | `0a610891-c2a1-48c9-b0e9-add6f0312e1f` |
| 类型 / 令牌认证 | `public` / `none`，无客户端密钥 |
| 回调 | `https://agent.meta.ai/api/hatch/oauth/callback` |
| 授权类型 | `authorization_code,refresh_token` |
| 身份范围 | `openid profile email offline_access` |
| 卡片权限策略 | `content:read` |
| 资源范围 | 个人工作区全部现有及未来卡片 |

未预建卡片访问 grant；回读为 0 条，仍由用户在授权页批准后生成。
现有客户端与其他 Worker 绑定保持原值，未读取或改写卡片内容。

首次授权入口检查返回 HTTP 500 `error validating client`。对比已有 public 客户端，
发现其 `client_secret_hash` 使用空字符串，新登记行为使用了 NULL。
仅将 Muse 对应字段改为空字符串后，同样的 S256 请求成功返回同意页地址。

Worker 本次仅更新配置，沿用线上程序，未发布本地未提交源码：

| 项目 | 标识 |
| --- | --- |
| 修改前 deployment | `d22c4412-8071-47e7-a5db-682a07c89fbe` |
| 修改前 version | `364f9ab4-a170-4f4d-8151-ee92cd40c3ee` |
| 修改后 deployment | `d016ea6f-ecbb-408a-aec9-52720aa39944` |
| 修改后 version | `d34e3a1e-260a-46dd-8b5a-4eaac92cff08` |

需要回退时，重新读取当前配置，仅移除 Muse 允许列表项并停用其客户端策略；
不覆盖其他客户端或其他任务的后续变更。

## 验证与后续

数据库和 Worker 配置均已重新读取确认。线上检查结果：

| 检查 | 实际结果 |
| --- | --- |
| 正确 Muse 回调、`response_type=code`、四项身份范围和 S256 | HTTP 302，进入 Sill `/oauth/consent`，包含授权请求 ID |
| Muse 回调增加末尾斜杠 | HTTP 400 `validation_failed` |
| `/api/v1/health` | HTTP 200 |
| 未认证 MCP 初始化 | HTTP 401 |

检查未登录、未批准授权，没有保存授权请求 ID、state、PKCE verifier 或令牌。
根路径 `/.well-known/oauth-protected-resource` 返回 404；源码规定的
`/.well-known/oauth-protected-resource/mcp` 返回成功，前者不是本次接入故障证据。

此验证中，登记精确回调后无需修改通用 Redirect URLs 列表即可进入同意页。
动态注册仍未启用或验收；Muse 应使用上面的固定 Client ID。
接下来由 Muse 使用该 Client ID 生成新的授权链接，用户登录并确认权限后，
在 Muse 调用 `sill_listContents({"limit":1})`，再验证实际令牌刷新。
真实 Muse 授权回传、卡片读取、工具发现和刷新令牌均尚未验收，事项保持打开。

参考：[Supabase OAuth Server 配置说明](https://supabase.com/docs/guides/auth/oauth-server/getting-started)。

## 公共应用接入优化

用户要求新用户仅用自己的账号密码登录并授权，不再人工配置每个账号的客户端策略。
源码新增共享应用默认策略迁移 `20261103032753_shared_oauth_applications.sql`：
已登记的 Muse 和 ChatGPT 固定回调提供公共默认策略，新账号默认只读自己的工作区。
同意页读取时只初始化缺失的账号策略，不生成访问 grant，不覆盖已有权限、限制或停用状态。
本机 Codex 回调不自动转为公共应用。

回归覆盖账号密码登录后返回原授权页、首次接入未批准无权限、共用 Client ID 下两账号的独立批准、
拒绝与撤销、既有资源限制及停用记录、缺少工作区权限时拒绝初始化。
真实 Postgres 检查另覆盖并发首次接入去重、RLS 和执行角色权限。
程序验证由 GitHub Actions 执行；本地只检查文件和差异，尚未执行新迁移或完整 Muse 验收。
决定见 [ADR 0092](../../adr/0092-shared-oauth-application-defaults.md)。
