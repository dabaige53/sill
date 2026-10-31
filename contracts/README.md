# 跨端数据约定

更新：2026-10-28。现行约定为 5.0.0；产品版本独立管理。5.0.0 按 [ADR 0086](../docs/adr/0086-card-fields-and-block-recipes.md) 精简为 30 个字段，不兼容旧字段，也不转换旧数据。详情文字只有一个 Markdown `body`（[ADR 0063](../docs/adr/0063-markdown-body.md)）。

- `card.ts`：已实现的本地卡片结构。结构严格，拒绝未知字段和已删除字段，不修改原输入。
- `local.ts`：已实现的本地状态和批量操作。
- `backup.ts`：已实现的账号备份快照、WebDAV/R2 配置、恢复确认及 8 个 MCP 输入；秘密设置只用于本人 HTTP，不注册成 MCP 输入。
- `reminders-worker.ts`：Web 与本地服务共用的通知点击脚本；只联系已打开页面，不缓存内容或订阅推送。
- `cloud.ts`：已实现的云端写入与 MCP 输入，从 `Card.shape` 复用任务、时间、来源及展示字段；外部 `/contents` 路径、工具名与权限名保持兼容。云端局部更新保留未修改字段，`state` 合并子字段，数组和嵌套对象整体替换；整卡更新替换整张卡片。每次写入都按类型检查合并后的整张卡片。数据库校验见 `supabase/migrations/20261028120000_sill_card_fields_v5.sql`。
- `mcp-guidance.ts`：每个 MCP 工具的用途与传输规则；运行时工具发现和导出目录共用，版本取自 card.ts。导出响应只携带该工具用到的定义。
- `schema.json`：从 zod 导出的本地卡片 JSON Schema，提交到 Git；`npm run contracts:check` 检查是否过期。
- `fixtures.json` 与 `media-fixtures.json`：按核心字段、媒体与图片拆分的合法和非法合成样例；Node 通过 `card-fixtures.ts` 合并，Swift 读取两份文件，每个写入端执行同一批样例。
- `design/`：接口设计材料，不表示未实现的接口已上线。
- `design/openapi-source.json` 保存人工维护的接口说明与路由；Schema 仍来自 `cloud.ts`。`scripts/export-design.ts` 合成原路径的 `design/openapi.json`，不要直接修改生成文件。

JSON Schema 不能表达日程起止顺序、待办 ID 唯一等规则。业务校验在 TypeScript 和 Swift 中执行，不能仅用结构检查代替。

构建不会读取或改写 `.sill/` 或用户的 Mac 数据。旧结构的数据不再读取；需要时清空后重建。

## 明确字段字典

所有可选字段缺失表示未知，不用空文案或 0 代替。除 `state` 外，字段不接受 null。所有数据写入仍由已有能力层与 MCP 完成；不新增表单、外部同步或采集。卡片只有下表字段。authors、project、people、form 只能用于所列类型；其他字段的「适用卡片」列出主要使用它的类型，必填项由卡片类型校验。

| 字段 | 类型与职责 | 适用卡片 |
| --- | --- | --- |
| id / type / title | 标识、12 种类型之一、最多 1000 字标题 | 所有类型 |
| summary | 最多 10000 字纯文本；卡面摘要和照片说明，只用于信息流卡面和搜索结果 | 所有类型 |
| body | 最多 500000 字的 Markdown（CommonMark）字符串；详情里唯一的文字内容，要点写成列表；原始 HTML 按文字显示，图片不加载，链接只接受 http、https、mailto | 所有类型 |
| url / time / tags / related / priority | 原文地址、卡片时间（毫秒）、最多 100 个标签、最多 100 个关联卡片 ID、0–10 优先级 | 所有类型 |
| sources | 最多 11 个 {name, kind}；只记录内容从哪里来，不表示连接 | 所有类型 |
| authors | 最多 20 个 {name, url?}；原文作者、发布方或邮件发件人，第一个作者显示为发件人；作者不是来源 | 文章、笔记、邮件、媒体、摘要、建议、文件 |
| publishedAt | 日期 YYYY-MM-DD 或带时区的 ISO 时间；原文发布、邮件发送或照片拍摄时间，非 Sill 系统时间 | 所有类型 |
| form | 只有 `quote`；按金句展示 | 笔记 |
| images | 1–50 个图片；4 个内置图片标识或最长 8192 字符的 HTTPS URL，不允许 URL 内带用户名密码；第一张为封面 | 所有类型；照片和视频必填 |
| tasks | 最多 100 个 {id, text}；完成状态只在个人状态 `taskDone` | 待办 |
| due / project | 截止时间；{name, url?} 所属项目 | 待办、提醒 |
| start / end / location / meeting / people | 起止时间、地点、{name, url, code?} 会议、最多 100 个参与者 | 日程 |
| files | 最多 200 个 {name, mimeType?, sizeBytes?, modifiedAt?, url?}；邮件附件也写在这里 | 文件必填；邮件 |
| media / duration / audioUrl | video 或 podcast、0–86400 秒总时长、HTTP(S) 音频地址；音频只在播放时读取，不采集或同步 | 媒体 |
| chapters | 最多 10000 个 {start, title}；start 为 0–86400 秒，严格递增，不超过已知 duration | 媒体 |
| transcript | 最多 10000 个 {start, text}；start 规则同章节；text 最多 20000 字 | 媒体 |
| pullRequest | 必填 PR 快照对象，字段见下文；不连接 GitHub，不代表实时状态 | pr |
| state | 只用于写入个人状态，例如 note 和 playbackPosition；不属于卡片内容 | 所有类型 |

PR 必填字段为 `repository`（owner/repo）、`number`（正安全整数）、`state`（draft/open/merged/closed）与 `observedAt`（带时区的 ISO 记录时间）。可选字段为 `headBranch`、`baseBranch`、`reviewRequested` 和 `additions/deletions/changedFiles`。未知统计省略；已知为零才写 0。

`pullRequest.reviewers` 最多 100 个 `{login,url?,decision}`，decision 为 pending/approved/changesRequested/commented/dismissed。`checks` 最多 1000 个 `{name,status,conclusion?,url?}`，status 为 queued/inProgress/completed；只有 completed 可带 conclusion，其值为 success/failure/neutral/cancelled/skipped/timedOut/actionRequired/stale。嵌套 URL 均为 HTTP(S)。

关闭媒体详情时停止播放并保存位置。除待办外，客户端打开详情即写入已读；播放器只保存位置，数据层不会按位置或比例自动写入已读。视频使用卡片原有 `url`，客户端只对支持的平台生成官方嵌入地址。

阅读时长不存入卡片。文章、笔记、邮件、摘要、建议和文件由客户端按 `body` 计算：中文每分钟 400 字，英文每分钟 200 词，向上取整，显示为「约 N 分钟阅读」。正文为空时不显示。

Card 的 created_at / updated_at / revision 等仍由服务端控制，不接受写入。标签只在卡片上，修改标签就是整卡更新。个人阅读计时 seconds、progress 和 playbackPosition 相互独立。

## 内容排版偏好

`appearance.ts` 定义由 `local.ts` 和 `cloud.ts` 共用的偏好字段。通过 `preferences.patch` 更新，沿用工作区版本、原始值与幂等检查，不改变卡片内容。

- `cardTextSize / readerTextSize`：small、standard、large，默认 standard。
- `cardSpacing / cardPadding / readerSpacing`：compact、standard、roomy，默认 standard。
- `readerWidth`：narrow、standard、full，默认 full。
- `textWeight`：standard、strong，默认 standard。

部署云端前先应用 `20261023111147_sill_layout_preferences.sql`，再发布支持新字段的 API 和客户端。迁移只扩展偏好校验，不改写现有卡片、偏好或权限。界面与 AI 使用同一组值。

## 助手制作与传输

随插件交付两个 skill。`sill-cards` 负责卡片制作：[类型配方](../skills/sill-cards/references/types.md) 覆盖 12 种类型及其卡面与详情展示；[字段字典](../skills/sill-cards/references/fields.md) 说明所有顶层字段与专属结构；[传输规则](../skills/sill-cards/references/transport.md) 说明 Markdown、JSON、时间单位、请求大小和确认方式。`sill-operations` 负责读写协议、偏好、备份与排障，见[操作协议](../skills/sill-operations/references/operations.md)。MCP 参数直接复用本目录字段，不维护另一套数据结构。512 KiB 请求体上限与字段字数上限同时适用。
