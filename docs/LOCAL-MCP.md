# Sill 本地 MCP（已实现）

2026-10-13。本实现基于 PR #17 的 `428c04bcccdc9b25ddfe22969111408b8ddcc7dd`，属于独立功能分支；没有推送、部署或启用真实账号。当前能力以本页为准，V1-HANDOFF 的完整三端与 Webhook 流程仍是目标。

## 启动与信任边界

Node 24+；`npm ci && npm run build`。官方 SDK `@modelcontextprotocol/server` / `client` 固定 2.3.1，核验了 [官方主文档](https://github.com/modelcontextprotocol/typescript-sdk) 与安装包的 stdio / Server / Client 接口。旧 v1 SDK 仅保留给未启用的 legacy，不加载旧平台或 McpAgent。

MCP 仅实现 **stdio**，JSON-RPC 初始化、工具发现和调用由官方 SDK 处理。`npm run mcp` 连接已有本机服务；不直接读写数据文件。没有 Streamable HTTP `/mcp`，该路径仍返回 404。不要把内部 `/api/v1/tools/*` 适配器当成 MCP 协议。

默认 `npm start` 不配置任何 MCP 身份，所有 V1 内容和事件接口拒绝匿名请求。仅 `/api/v1/health` 无需凭据。服务器只监听 `127.0.0.1`，拒绝不匹配的 Host、Origin 和跨站请求。

以下是**仅供隔离开发测试**的已知合成凭据，不是长期秘密或生产部署配置；不得用于公开服务。默认个人目录中的真实数据不用于验收；实际测试通过 `startLocal({port:0,file:<临时文件>})` 隔离存储。

服务终端：

```sh
export SILL_MCP_CONFIG='{"principals":[{"id":"local-agent","owner":"local","token":"synthetic-development-only-0001","scopes":["content:read","content:write"],"cards":"*"}]}'
npm start
```

宿主通过进程环境注入配置，不把 token 放在卡片或工具参数里。另一个终端（或宿主 stdio 命令配置）：

```sh
export SILL_MCP_TOKEN=synthetic-development-only-0001
npm run mcp
```

stdio 的 stdout 只输出协议数据；宿主应直接执行 `node /ABS/PATH/server/local-mcp.mjs`，不要通过会输出 npm banner 的 `npm` 包装器连接协议管道。`QG_LOCAL_PORT` 默认 4318，只接受合法端口，不能指定远程 URL。服务端与宿主必须使用相同的临时测试 token；本实现不生成或持久保存凭据。

身份由服务端 `principals` 配置决定：`id`、固定工作区 `owner:"local"`、`scopes`、`cards`（ID 数组或显式 `"*"`）、可选工具名 `tools` 允许列表。工具发现和调用都检查 scope/允许列表，内容和事件查询检查资源范围；创建新资源需要 `cards:"*"`。默认不授予删除、事件提交或结果权限。单个文件代表一个本机用户空间；**不是多租户托管服务**。

旧 `/api/local/*` 和旧 CLI 是本机用户自己的可信通道，仍共用同一仓库。MCP scope 约束该接口的调用身份，但不能隔离同一 OS 用户的恶意进程访问旧通道或本机文件；不能把 loopback token 当作本机沙箱。远程鉴权/OAuth、issuer/audience/expiry、TLS 和公网部署未实现，不能开放到公网。

## 七个工具与共用适配器

| 工具 | 已实现行为 | scope |
| --- | --- | --- |
| `sill_listContents` | 稳定快照分页、增量与删除墓碑 | content:read |
| `sill_getContent` | 单条内容及每卡 revision | content:read |
| `sill_createContent` | 创建、生成 ID、持久幂等 | content:write |
| `sill_updateContent` | 字段更新、合并 state、结果 metadata 回写 | content:write；结果另需 event:result |
| `sill_deleteContent` | 有版本条件的删除与墓碑 | content:delete |
| `sill_submitEvent` | 仅显式配置的人工交付目标；默认 not_supported | event:submit |
| `sill_getEvent` | 查询自己提交或分派给自己的事件 | event:read |

HTTP `/api/v1/contents`、`/contents/{id}`、`/events`、`/events/{id}` 按 V1 文档方法映射到同一个 `V1Capabilities.call`；需 Bearer 凭据与写入的 `Idempotency-Key`。CLI 新增：

```sh
printf '%s' '{"limit":20}' | node scripts/qg.mjs v1 sill_listContents
node scripts/qg.mjs v1 sill_updateContent --file /tmp/synthetic-update.json
```

CLI V1、HTTP 与 MCP 的校验、身份权限、版本、幂等和结果处理相同。旧 CLI 参数保留，但替换已有卡片和更新已有 item 不再接受盲写：须提供读取到的全局 `expectedRevision`，或对应操作的 `before` 起点。删除已有卡片必须提供全局 `expectedRevision`，仅卡片 before 无法保护并发备注，故不接受。旧协议可传 `idempotencyKey`；网页每批自动生成并持久保存该键。V1 使用每条卡片的 revision，**不能混用**两套版本号。

### 内容类型支持矩阵

七个工具名称不代表所有类型具备完整内容操作。所有类型的读取只返回 V1 通用字段（id/title/body/type/url/state/revision/时间/删除标记）；任务列表、日程时间、附件、媒体详情等专属字段目前不通过 V1 返回，也不能通过 V1 编辑，但服务端更新通用字段时保留它们。

| 内容类型 | V1 创建 | V1 读取 | 更新/删除已有卡片 |
| --- | --- | --- | --- |
| article、mail、note、reminder、insight、digest、suggestion | 支持通用字段 | 通用字段 | 支持，版本条件与权限检查 |
| task、event、media、photo、file | 不支持，明确返回 not_supported | 通用字段 | 支持通用字段；专属字段保留且继续校验 |

类型切换只有在保留的专属字段满足目标类型校验时才允许；同时提交 done 时按切换后的类型映射。删除必须具备 content:delete，不能根据可读或可写推断可删除。

最小契约修正与限制：

- 通用 create schema 缺少 task/event/media/photo/file 的专属必填字段，本轮对这些类型创建明确返回 `not_supported`；其现有卡片可以读取/更新，专属字段完整保留，并继续通过已有 Card 校验。不会伪造日期、任务、文件或图片。后续需单独扩展创建 schema。
- Error code 增加 `not_supported`。默认未配置事件交付返回 501，不虚报队列或 Webhook 成功。health 返回 local-v1、stdio、webhook=false；不宣称完整 `sill-v1-draft1` 就绪。
- 列表提供分页/增量而非全文搜索。游标绑定完整身份策略，10 分钟有效、最多 512 个，重启后失效并返回 410，须全量重建。分页固定快照；期间的更新进入下一轮增量。没有持久游标或自动清理墓碑策略。
- 本地归档状态增加显式 archived；放回桌面会清除它。done 是本地状态，任务与提醒映射至原有完成字段，其他类型保留通用本地标志；不代表外部任务完成。
- MCP 不公开 source capability；原来源 UI 的占位成功/RSS 未持久化问题仍存在，不因本轮而声称已接入。

## 事件回写与幂等

可选服务端 `destinations` 配置示例（仍是本地人工/测试交付）：

```json
{"manual":{"mode":"manual","submitters":["owner"],"assignee":"local-agent","actions":["summarize","complete"]}}
```

提交方须有 event:submit、可见 card 和目标允许范围。相同 event_id 与相同请求只产生一个事件；不同请求冲突。返回 queued/pending 表示持久保存，**未发送 Webhook**。人工把 event_id 交给已授权 agent，agent 用 getEvent/getContent 获取数据；本轮不新增事件自动发现/调度器。

更新内容时带 `expectedRevision` 与 `metadata:{event_id,outcome,summary}`。只有分派身份可回写目标卡片；事件 card_version 和当前内容版本也必须一致。失败/unknown 可仅回写 metadata，不改内容或提升内容 revision。成功内容、事件状态、幂等回执在同一文件事务落库；收到结果才记 delivery=accepted 和实际 outcome。冲突拒绝修改，调用方保留结果/草稿待人工核对。终态不能被新的矛盾结果覆盖；回写不会派发任何事件，故无回写触发循环。

V1 写入幂等键绑定身份与完整规范化请求；重放先于版本检查；同键不同请求 409。记录跨进程重启保留。为避免无界增长，最多 10000 条回执，满后拒绝新写并需维护；本轮没有自动过期/清理和无限容量承诺。回执保存原始成功结果，可能含历史内容；删除墓碑不等同安全擦除历史回执或备份。未知写入结果必须复用原请求与原键核对，不换键盲写。

## 存储与网页并发

唯一写入者是 `server/local.mjs` 的 LocalRepository。`.lock` 文件阻止第二个服务对同一路径写入；stdio 客户端通过 HTTP 复用该实例。启动迁移在取得锁后执行，为旧内容补 revision/时间元数据，保留原卡片与 item。文件写入使用临时文件、fsync 与原子 rename；内容/事件/回执共同提交。意外崩溃留下锁时，**先确认没有存活写入进程、备份文件后人工清理锁**；不自动删锁或覆盖别人的文件。

网页编辑携带原卡片 before；行内与弹窗编辑期间不吸收远端轮询为编辑起点，避免用新 revision 包装旧 DOM。每批首次发出时冻结完整请求、before 条件和幂等键；恢复草稿与删除额外冻结 expectedRevision，响应丢失后的重试保持完全相同。409 保留本机草稿、提供导出/显式采用服务端版本，重试不强制覆盖。轮询拒绝比已确认状态更旧的响应；编辑期间跳过的服务端状态在退出编辑后补充读取。放弃草稿时不允许与进行中的写入竞争，读取期间出现的新修改需重新确认。恢复/删除的全局条件可能因无关更新产生保守冲突，尚无自动字段级合并 UI。

## 验证

```sh
npm test
npm run test:core
CHROMIUM_PATH=/usr/bin/chromium npm run test:mcp
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
CHROMIUM_PATH=/usr/bin/chromium npm run test:accessibility
CHROMIUM_PATH=/usr/bin/chromium npm run test:local-browser
npm run plugin:build
python3 scripts/check-v1-contracts.py
```

test:mcp 启动真实官方 SDK Client → 子进程 stdio Server → 隔离 loopback HTTP → 临时数据文件；不是把领域函数直接调用当协议测试。包括逐工具参数/输出、拒绝路径、CRUD/版本、幂等、事件关联、分页增量、重启，以及实际 Chromium 双向并发和响应丢失恢复。常规浏览器/axe 回归不等于真实读屏器验证。

未验收：真实 OpenClaw/Hermes、外部 Webhook、Streamable HTTP、远程身份系统、iOS/macOS、生产数据迁移/恢复、负载/磁盘故障/断电演练、Windows 文件锁/目录 fsync、无限期数据保留。旧本地技能插件仍不自动注册 MCP；只增加显式手动启动入口。
