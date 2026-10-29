# 设置与备份

本页说明助手能通过 MCP 改的账号设置、外部备份与提醒。写入方式与冲突处理见 [操作协议](operations.md)。

## 偏好

偏好按账号保存，Web、PWA 和 Mac 共用。先用 `sill_getWorkspace` 读取 `state.preferences`，再用 `sill_applyOperations` 的 `preferences.patch` 写入；修改的字段要带原值 `before`，或者整批带工作区 `expectedRevision`。只接受下表字段，不接受 `null`。

| 字段 | 取值 | 设置里的名称与效果 |
| --- | --- | --- |
| `theme` | `system / light / dark` | 主题：跟随系统、浅色、深色 |
| `sort` | `priority / unread / time` | 信息流排序：优先级、未读优先、时间 |
| `density` | `compact / standard / roomy` | 卡片宽度：紧凑、标准、宽松 |
| `cardTextSize` | `small / standard / large` | 卡片文字大小，默认 `standard` |
| `cardSpacing` | `compact / standard / roomy` | 卡片间距，默认 `standard` |
| `cardPadding` | `compact / standard / roomy` | 卡片内部留白，默认 `standard` |
| `readerTextSize` | `small / standard / large` | 阅读文字大小，默认 `standard` |
| `readerSpacing` | `compact / standard / roomy` | 阅读行段间距，默认 `standard` |
| `readerWidth` | `narrow / standard / full` | 阅读正文宽度，默认 `full`（铺满） |
| `textWeight` | `standard / strong` | 文字加重，作用于卡片和阅读内容 |
| `stack` | boolean | 同一来源刷屏时叠起来：一小时内同一来源超过 5 张未读文章或媒体卡时叠成一摞 |
| `fadeRead` | boolean | 读过的卡片慢慢变淡 |
| `floatTimely` | boolean | 会议和提醒到点浮上来 |
| `collapseOnFinish` | boolean | 读完上推收起详情 |
| `newHint` | `away / off` | 新内容提示：离开顶部时提示，或不提示 |
| `singleKeyShortcuts` | boolean | 单键快捷键 N / R / T |
| `onboarded` | boolean | 是否已完成首次引导；用户没要求时不要改 |

以下字段仍能读写，但不再改变界面。不要用它们向用户承诺效果：

| 字段 | 现状 |
| --- | --- |
| `archiveAfter` | `3d / 7d / never`。旧的自动收起设置。现在读过或完成的卡片一直留在主页，只有明确归档才移走 |
| `hiddenActions` | 卡片动作 ID 数组，取值 `bookmark / tag / later / reply / open / join / snooze / download / dismiss`。Web/PWA 不再按它隐藏动作；Mac 端尚未同步，可能仍按旧值隐藏 |
| `reduceMotion`、`reduceTransparency` | boolean。旧设置，客户端不再展示或应用 |
| `aiLocal` | boolean。保留字段，不代表存在内置助手 |

设备上的设置不在账号偏好里，助手改不了：系统提醒开关、通知权限、存放位置。

## 外部备份

只有服务端配置了备份密钥，且当前授权能读取整个工作区时，才会出现备份工具。创建备份还需要写入权限；恢复还需要删除权限。

**备份位置只能由用户在 Sill 设置的数据区域配置。** 支持 WebDAV（例如坚果云，填 HTTPS 文件夹地址、用户名、应用密码）和 Cloudflare R2（填 Account ID、Bucket、Access Key）。助手不能新增位置、修改凭据或索要密码，工具参数和结果里也都没有凭据。

| 用户想要 | 操作 |
| --- | --- |
| 看有哪些位置和备份 | `sill_listBackups`：返回 `targets` 和最近 200 条 `backups`（状态、digest） |
| 检查位置能不能连上 | `sill_checkBackupTarget({targetId})`；`backup_auth_failed` 表示凭据失效，请用户到设置里更新 |
| 立即备份 | `sill_createBackup({targetId, idempotencyKey})`；每次新备份用新键（8–128 位字母、数字、下划线、连字符），回执不明时同键重试 |
| 核对某份备份是否完好 | `sill_checkBackup({backupId})`：重新读取、核对 digest，并标记为可恢复 |
| 读取备份内容或导出 | `sill_getBackup({backupId})`：返回完整快照，可能很大 |
| 恢复 | 见下方流程 |

恢复流程：

1. `sill_previewRestore({backupId})`，把卡片总数、新增数、移除数告诉用户。
2. 讲清楚后果：恢复会**替换**当前账号的全部卡片、个人状态、偏好、阅读秒数和播放位置。备份位置配置、登录会话、通知权限不受影响。
3. 用户明确确认后，调用 `sill_restoreBackup`，传入预览返回的 `backupId`、`digest`、`expectedRevision`，加上 `confirmed:true` 和新的 `idempotencyKey`。
4. 返回 `revision_conflict` 表示预览之后工作区变了，回到第 1 步重新预览。回执不明时，用完全相同的参数调用 `sill_getRestoreStatus` 查询，不要换键重来。

限制：单份快照最多 32 MiB；图片、音频和附件只保存 URL，不复制文件；没有自动定时备份，也不能从网盘里扫描、导入任意文件。

## 提醒与通知

- 卡片上的时间是账号共用的事实：日程 `start`/`end`，待办和提醒的 `due`。个人状态 `snoozedUntil`（在 Sill 内再提醒）、`dismissed`（忽略）、`reminderDone`（提醒完成）也由账号共用。这些都只改 Sill 里的记录，不改来源日历或提醒事项。
- 系统通知按设备开启：用户要在每台设备的设置里打开「系统提醒」并授予通知权限。
- 网页只在页面开着时检查到期提醒，后台标签可能延迟。助手宿主里的内嵌页面不申请通知权限。Mac 端在主窗口关闭后仍会继续安排提醒；退出应用后不会再补排新提醒。
- 所以写入提醒时间不等于一定会收到通知。用户问「为什么没提醒」时，按[排障](diagnosis.md#提醒没有通知)逐项核对。

## 导出

用户要求导出时，读取 `sill_getWorkspace` 的完整快照，按用户要的格式整理。界面设置里也有「导出全部卡片」。导出文件不能再作为文件导入 Sill；需要时按 sill-cards 的导入流程重新写入。
