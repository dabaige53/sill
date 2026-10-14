# sill 项目应用清单：尚不可执行生产切换

目标仅为项目 `moeabktxrgidrdkplvac`（API `https://moeabktxrgidrdkplvac.supabase.co`）。本 PR 未连接真实数据库、未应用 migration、未创建/保存凭据、未改 Auth 或安全设置。Cloudflare 网页由其他任务发布，本 PR 不包含网页发布，也不包含另一任务的七工具 MCP 改动。

## 四个完成度必须分开

| 层面 | 已完成证据 | 尚未完成 |
| --- | --- | --- |
| 数据库连通/DDL | 两份SQL草案在本地PGlite和真正PostgreSQL 17.6成功执行 | 真实项目连通没有本轮证据；交接的ACTIVE_HEALTHY不代表应用能读写；正式迁移尚未生成/应用 |
| 网页登录 | 请求级用户JWT适配，固定版本官方SDK getClaims，额外issuer/audience/expiry/role检查 | JWT测试是SDK mock；没有真实Supabase签发/刷新/登出集成，没有网页登录UI、回调或cookie会话；静态网页可打开不代表已登录 |
| RPC数据隔离 | 本地PostgreSQL多会话CAS/幂等/水位/回滚、真实RLS检查通过；PGlite覆盖事件分派和响应schema | 私有函数零生产执行权限，无公开RPC包装、错误映射、生产RLS/真实token/PostgREST验收；范围受限列表仍明确拒绝 |
| MCP鉴权 | 领域层区分用户和OAuth client；本地测试不允许未知client借owner权限 | 没有远程MCP握手、资源audience/discovery、OAuth同意/撤销、scope适配或OpenClaw/Hermes真实联调；未验收另一任务七工具 |

现有13项测试的准确含义：6项准备测试 + RPC父测试及其6个子测试（Node计数13）。其中Auth是mock，PGlite是实际Postgres内核WASM执行，并非SQL字符串匹配；但PGlite单连接不证明多会话并发。新增 `npm run test:supabase:postgres` 使用独立Docker PostgreSQL 17.6，6个子场景加父测试，计数7。测试明确使用合成auth.uid()/auth.jwt()函数与用户ID，仍不代表真实Supabase Auth验证。

## 已执行的真实 PostgreSQL 测试

镜像固定为 `postgres:17.6@sha256:00bc86618629af00d2937fdc5a5d63db3ff8450acf52f0636ec813c7f4902929`。

运行：`npm run test:supabase:postgres`。需要Docker和本地镜像（缺少时需拉取）；脚本创建专用容器，`--network none`，不映射端口，数据在tmpfs，没有密码/云凭据，finally删除容器。local trust只限该无网络隔离容器，不能复制到真实项目。

- 两份DDL真实安装成功；anon/authenticated默认不能执行私有RPC，无SECURITY DEFINER。
- 两个psql独立会话竞争同一个expectedRevision：第一事务持锁，第二阻塞后返回revision_conflict；只有一次变更，无失败回执。
- 同一幂等键并发创建：第二请求等提交后取得同一个原回执，仅一行内容。
- 列表在未提交写事务之后取得workspace锁，水位与内容一致；之后删除在下一轮增量中返回tombstone。
- 写成功后事务内触发异常：内容、workspace水位、回执全部回滚。
- 真正RLS拒绝跨owner数据插入/读取；未知OAuth client无权限；调用方不能修改授权表给自己提权。

## 准确迁移顺序

以下是计划，不是可直接对生产运行的命令包。**目前没有任何生产apply获准或已执行。** CLI可用时通过 `supabase migration new <name>` 生成正式文件名，不手造时间戳。所有文件都要先在独立Supabase集成环境验证。

| 顺序 / 建议migration名 | 输入或待完成内容 | 生产状态 |
| --- | --- | --- |
| 1 `sill_v1_storage_foundation` | `supabase/drafts/sill_v1_storage.sql`：sill_private；workspaces、contents、events、receipts、sync_snapshots；约束/索引/RLS；撤销anon/authenticated/PUBLIC权限 | SQL已本地执行；正式文件未生成，生产未应用 |
| 2 `sill_v1_private_rpc` | `supabase/drafts/sill_v1_rpc.sql`：caller_grants、destinations；content_type、submitted_by/request_body、分页列；caller/authorize、投影/校验、write_v1/get_content/get_event/list_contents；owner RLS；零执行权限 | SQL已本地执行；正式文件未生成，生产未应用 |
| 3 `sill_v1_public_rpc_boundary` | 尚未编写：四个薄public SECURITY INVOKER包装（sill_write_v1/sill_get_content/sill_get_event/sill_list_contents）、统一契约错误映射、参数限制；只暴露这些业务RPC，沿用7工具到共同能力映射 | 不可跳过；不得直接公开sill_private表或把任意SQL当RPC |
| 4 `sill_v1_runtime_permissions` | 逐对象授予下面最小权限；复核Data API/GraphQL可见性；用真实用户及client token跑allow/deny测试 | 未授权、未应用 |
| 5 `sill_v1_owner_bootstrap` | 用户确认的已存在Auth user UUID：workspace；`user:<uuid>`授权行。既有数据导入另作单事务空库校验；本次不创建账户/凭据 | UUID与导入范围待确认 |
| 6 可选 `sill_v1_agent_grants` | 经批准client_id的最小scopes/resources，destination_ref→assigned_caller/actions；只引用秘密，不存秘密 | 外部助手接通前另行审查；无需为个人网页登录先开放 |

上线前必须解决：共享不可变快照+轻量分页引用与存储上限（当前每页复制JSON是测试原型）；游标/回执/tombstone统一过期清理和隐私删除；特殊卡片创建和旧item↔V1 state适配；字段错误和领域异常的HTTP映射。不要把这份清单当作已经补齐这些能力。

## 最小权限清单（runtime migration候选）

所有RPC一律SECURITY INVOKER，固定search_path；函数默认PUBLIC EXECUTE必须逐一撤销。sill_private不加入Data API exposed schemas，不通过views、GraphQL配置或其他RPC间接公开。grant存在不等于允许任意表API访问；上线测试必须证明无法绕过函数的scope/版本/幂等规则。

| 对象 | authenticated候选权限 | 不允许 |
| --- | --- | --- |
| sill_private schema | USAGE，仅供经过审查的函数内部访问 | Data API直接暴露 |
| workspaces | SELECT、UPDATE | INSERT/DELETE/TRUNCATE；由bootstrap创建owner行 |
| contents | SELECT、INSERT、UPDATE | DELETE/TRUNCATE；删除走tombstone |
| events | SELECT、INSERT、UPDATE | DELETE/TRUNCATE；调用方任意指派身份 |
| receipts | SELECT、INSERT | UPDATE/DELETE/TRUNCATE |
| sync_snapshots | SELECT、INSERT | UPDATE/DELETE/TRUNCATE |
| caller_grants、destinations | SELECT，并受owner/caller政策约束 | INSERT/UPDATE/DELETE/TRUNCATE、自授scope或新增目标 |
| 四个public包装 | 明确签名的EXECUTE | ALL FUNCTIONS、任意动态RPC发布 |
| 私有函数 | 包装所需明确签名EXECUTE：caller()、authorize(text,text)、content_json(sill_private.contents)、event_json(sill_private.events)、validate_changes(jsonb,boolean)、write_v1(text,text,jsonb,text)、get_content(text)、get_event(text)、list_contents(text,text,integer) | 用SECURITY DEFINER或service_role绕过RLS |
| anon / PUBLIC | 无任何Sill表/schema/函数权限 | 匿名读写；默认继承EXECUTE |

不需要sequence grant（使用核心gen_random_uuid和显式bigint水位）。不申请service_role密钥。日常调用使用publishable key + 当前用户JWT；不要把用户refresh token放仓库、日志或服务器持久配置。迁移/初始授权是管理员变更，不能让用户JWT自行创建schema或给自己授权。

注意：私有表RLS主要是owner边界，业务scope/版本规则在函数内。因此schema必须保持非公开、应用不能持有authenticated的直连SQL登录；如果将来必须暴露表或引入可执行任意SQL的RPC，需要重新设计更细RLS，而不是照搬本权限表。

建议个人owner scopes：content:read、content:write、content:delete、event:submit、event:read，resources=['*']。不默认授event:result（结果由分派的外部助手写回）。MCP agent默认只给content:read/content:write/event:read/event:result及明确卡片集合，不给content:delete/event:submit；需要列表时应完成范围过滤，不能仅为列表把资源扩大为'*'。

## 最小用户确认事项

1. **个人账号与登录入口**：要使用的现有Supabase用户（UUID由受控读取核实，不要提供密码/token）、是否保持仅此账号/关闭公开注册、邮箱OTP或magic link、最终Web回调域名。先实现个人网页登录即可，OAuth/MCP不作为前置条件。
2. **数据与保留**：空库开始还是导入明确选定的本地导出；是否接受候选7天普通回执/1天游标，以及删除后残留回执/快照的清理规则。具体期限确认后写进正式迁移/清理策略。
3. **应用授权**：审阅最终迁移与上述权限差异后，明确允许对 `moeabktxrgidrdkplvac` 应用。当前PR仅准备，不默认获得真实安全配置更改许可。

外部MCP以后另确认OAuth beta启用、client_id/精确回调、资源audience、最小工具/卡片权限与外部Webhook目标；不创建内置AI。后台无人值守投递的身份仍未实现，不能声称用户JWT方案已经覆盖整个长期后台流程。
