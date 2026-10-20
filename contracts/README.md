# 跨端数据约定

更新：2026-10-20。现行约定为 3.0.0；产品版本独立管理。字段升级不兼容旧 `meta`，不自动迁移存量数据。

- `card.ts`：已实现的本地卡片结构和旧来源字段的纯内存转换；保留未知字段、未知卡片类型，不修改原输入。
- `local.ts`：已实现的本地状态和批量操作。
- `cloud.ts`：已实现的云端写入与 MCP 输入，从 `Card.shape` 复用任务、时间、来源及展示字段；外部 `/contents` 路径、工具名与权限名保持兼容。云端局部更新保留未修改字段，`state` 合并子字段，数组和嵌套对象整体替换。云端旧版最小卡片仍可编辑；新提交的结构字段按类型检查。数据库校验与返回规则见 `supabase/migrations/20261016052843_sill_rich_cards.sql`。
- `schema.json`：从 zod 导出的本地卡片 JSON Schema，提交到 Git；`npm run contracts:check` 检查是否过期。
- `migration-fixtures.json`：两端共用的旧来源迁移边界；保留 300 字发件人、10+1 个来源、显式空发件人与未知字段。
- `fixtures.json`：合法与非法合成样例；每个写入端都必须执行同一批样例。
- `design/`：从原 `docs/examples/v1/` 迁入的接口设计材料。类型名改为 Card，不表示未实现的接口已上线。
- `design/openapi-source.json` 保存人工维护的接口说明与路由；Schema 仍来自 `cloud.ts`。`scripts/export-design.ts` 合成原路径的 `design/openapi.json`，不要直接修改生成文件。

JSON Schema 不能表达日程起止顺序、待办 ID 唯一等规则。业务校验在 TypeScript 和 Swift 中执行，不能仅用结构检查代替。

构建不会读取或改写 `.sill/` 或用户的 Mac 数据。旧来源只在读取副本中转换；后续用户保存才写入新结构。邮件发件人保留在 `sender`，不会成为来源。

## 明确字段字典

所有可选字段缺失表示未知，不用空文案或 0 代替。所有数据写入仍由已有能力层与 MCP 完成；不新增表单、外部同步或采集。新字段是公共卡片结构上的具名属性，专属属性由卡片类型校验。未知扩展仍保留；卡片和文件的 `meta` 明确拒绝，不作为备注展示。

| 字段 | 类型与职责 | 适用卡片 |
| --- | --- | --- |
| authors | 最多 20 个 {name, url?}；作者不是来源 | 文章、笔记、邮件、媒体、摘要、建议、文件 |
| publisher | {name, url?}；原文发布方 | 同 authors |
| publishedAt / modifiedAt / savedAt | 日期 YYYY-MM-DD 或带时区的 ISO 时间；依次为原文发布、原文修改、外部保存，非 Sill 系统时间 | 所有类型 |
| bodyCoverage | full / excerpt / summary / none；正文覆盖程度 | 文章、笔记、邮件、摘要、建议、文件 |
| readingEstimate | {seconds, origin, scope, method?}；seconds 为 1–31536000 整数，origin 为 provided / calculated，scope 为 full / available；计算时 method 必填 | 同 bodyCoverage |
| section | 最多 100 字栏目名，不替代标签或备注 | 文章 |
| sentAt / recipients | 带时区 ISO 时间；最多 100 个收件人名称字符串 | 邮件 |
| project | {name, url?}；所属项目 | 待办、提醒 |
| timeZone | IANA 时区名称 | 日程 |
| chapterCount | 1–10000 整数；duration 继续表示秒数，不再混入文字 | 媒体 |
| files[].mimeType / sizeBytes / modifiedAt / url | MIME、非负安全整数字节数、带精度日期、HTTP(S)地址；原 files[].meta 与 time 不再使用 | 文件 |
| takenAt / caption | 带精度拍摄时间、最多 2000 字图片说明 | 照片 |
| coverageStart / coverageEnd | 毫秒时间戳，须成对，结束晚于开始 | 摘要 |
| state.note / items[id].note | 沿用个人状态中的备注，不写入卡片事实 | 所有类型 |

计算全文阅读时长要求 bodyCoverage=full。bodyCoverage=none 不允许 calculated；available 仅针对已保存正文，不得称为全文。provided 不依赖本机是否保存全文；未知时长省略；`readingEstimate:null` 是唯一明确清除估算的写法，表示当前没有估算。其他新字段不接受 null。所有视图使用同一格式化规则，秒数仅在展示时转为分钟。计算结果须随正文变更更新，不构建自动抓取或按未知语言速度估算的引擎。

Card 的 created_at / updated_at / revision 等仍由服务端控制，不接受写入。个人阅读计时 seconds、progress 和 readingEstimate 相互独立。外部保存日期 savedAt 不与个人状态 addedAt 混用。
