# 排障

先确认现象和证据，再判断原因。每条结论都要能对上一次工具回执或读取结果：不要因为「工具调用成功」就断定页面能打开，也不要因为「列表里没看到」就断定数据丢了。

## 第一步：核对连接

1. **看工具列表。** 工具清单已经按当前授权过滤过：

   | 看到的工具 | 说明 |
   | --- | --- |
   | `sill_open_workspace`、`sill_open_cards` | 能读取整个工作区，且服务端提供页面 |
   | `sill_getWorkspace`、`sill_listContents`、`sill_searchContents` | 能读取整个工作区（`content:read`） |
   | 只有 `sill_getContent` | 授权只覆盖指定的几张卡片 |
   | `sill_createContent`、`sill_updateContent` | 有写入权限；创建还需要整个工作区的写入权限 |
   | `sill_applyOperations` | 能读取整个工作区，并且有写入权限 |
   | `sill_deleteContent` | 有删除权限 |
   | `sill_submitEvent`、`sill_getEvent` | 有事件权限 |
   | `sill_*Backup*`、`sill_previewRestore` | 服务端已配置备份，且能读取整个工作区 |

2. **确认账号。** 调用 `sill_open_workspace` 或 `sill_open_cards`，结果里有 `userId`、`scopes`、`workspaceRead`、`workspaceWrite`。用户说「卡片不见了」时，先确认宿主连的是不是平时那个账号：宿主可能默认连到了另一个账号（例如测试账号）。
3. **看错误码**，对照下面两张表。

## 症状对照

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| 完全没有 Sill 工具 | 连接未授权、已断开，或宿主没启用插件 | 请用户在宿主里重新连接 Sill。不要自己拼 OAuth 或复制令牌 |
| 少了某些工具 | 授权范围不够，或宿主缓存了旧的工具定义 | 先按上表判断缺的是哪项权限；授权没问题时，请用户在插件设置里「刷新工具」后重新打开 |
| 参数里缺新字段，或仍有 `sender`、`attachments`、`readingEstimate` 等旧字段 | 宿主缓存了旧的工具定义 | 请用户刷新工具。不要丢掉字段改写成纯文本，再声称完整保存 |
| 每次调用都是 `unavailable`，或 HTTP 503 `mcp_not_enabled` | 服务端未开启 MCP 或暂时故障 | 告诉用户服务暂不可用。写操作按回执不明处理，不要换键重试 |
| `unauthenticated` | 授权过期或被撤销 | 请用户在宿主里重新连接。Sill 只支持账号密码登录 |
| `forbidden` | 权限不够、卡片不在授权范围内，或 `expected_owner` 与当前账号不符 | 停下并报告缺少的权限。不要换账号或换接口绕过 |
| 列表为空，或「卡片不见了」 | 连的是别的账号；`sill_listContents` 没读完所有分页；卡片已归档（主页不显示，但仍在工作区快照里）；卡片已删除；授权只覆盖部分卡片 | 先确认 `userId`，读完全部分页或读取整个工作区，再查 `items[id].archived`。确认之前不要下结论，也不要重建卡片 |
| 内嵌页面显示「未能显示 Sill」或 Resource unavailable | 宿主请求的是旧版本页面，或页面资源没加载成功 | 请用户在插件设置里「刷新工具」，再重新打开；仍不行就强制刷新宿主页面。工具成功不代表页面能打开 |
| 卡片写进去了，卡面却没显示某个字段 | 这类卡片不在卡面显示这个字段，或字段不适用于这个类型 | 对照 sill-cards 的[类型索引](../../sill-cards/references/types.md)里对应的模板。字段仍保存着，详情或搜索里可能用得上 |
| 图片不显示 | 不是 HTTPS 地址、地址带了凭据、图片写在正文 Markdown 里（正文图片不加载），或内嵌页面在新增图片域名前就已打开 | 用 `images` 字段传 HTTPS 地址或内置素材 ID；新增域名后请用户重新打开内嵌页面 |
| 视频在内嵌页面里放不了 | 宿主不允许嵌入视频框架 | 请用户点开原链接观看，这不是数据问题 |
| 很多卡叠成一摞 | 同一来源一小时内超过 5 张未读的文章或媒体卡，且开启了 `stack` | 这是设计行为。用户不想要时，把偏好 `stack` 设为 `false` |
| 改了设置却没效果 | 改的是旧字段：`archiveAfter`、`hiddenActions`、`reduceMotion`、`reduceTransparency`、`aiLocal` | 见[设置与备份](settings.md#偏好)，告诉用户这一项已不生效 |
| 读完或完成的卡片没有消失 | 设计如此：读过或完成只改颜色 | 用户想移走就归档：`state.archived:true` |
| 任务勾选状态不对 | `done` 与 `taskDone` 冲突，或 `taskDone` 里有不存在的任务 ID | 只改 `taskDone`，让 `done` 跟随；ID 必须来自卡片的 `tasks` |

### 提醒没有通知

逐项核对，前一项不满足就不用往下查：

1. 卡片有没有到期时间：日程看 `start`，待办和提醒看 `due`，单位是 Unix 毫秒，按用户时区换算。
2. 个人状态里是不是 `dismissed`、`reminderDone`，或者 `snoozedUntil` 还没到。
3. 用户有没有在**这台设备**的设置里打开「系统提醒」，并授予了通知权限。
4. 网页需要保持打开；助手宿主的内嵌页面不发通知。Mac 端需要应用还在运行（关掉主窗口没关系，退出应用就不行了）。

前三项助手能读，第四项只能请用户自己确认。不要承诺「一定会提醒」。

## 错误码

| 代码 | 含义与处理 |
| --- | --- |
| `invalid_request` | 参数不合法。读 `error.issues`：`path` 指出哪个字段，`message` 说明原因（例如 `Unrecognized key: "sender"` 表示这是已移除的字段）。按下表修正后，用新的幂等键提交 |
| `revision_conflict` | 读取之后卡片或工作区被改过。重新读取，在新版本上重新应用用户的要求。不要拿新版本号硬覆盖旧草稿 |
| `idempotency_conflict` | 同一个幂等键配了不同的参数。检查是不是误用了旧键；新请求换新键 |
| `cursor_expired` | 分页游标过期。去掉 `since`，从第一页重新读 |
| `not_found` | 卡片不存在、已删除，或不在授权范围内。不要自动新建一张替代 |
| `rate_limited` | 请求太频繁。等一会儿再试，写操作沿用原幂等键 |
| `backup_auth_failed` | 备份位置的凭据失效。请用户在设置里更新 |
| `backup_unknown` | 备份结果不明。先用 `sill_listBackups` 核对，再用原键重试 |
| `unavailable` | 服务暂时不可用，或出现未归类的错误。读操作可以稍后重试；写操作按回执不明处理 |

报告错误时附上 `request_id`，方便用户反馈给开发者。

### 卡片规则代码

`invalid_request` 的 `issues` 里可能出现这些卡片规则代码：

| 代码 | 修正 |
| --- | --- |
| `invalid_event_range` | 日程需要 `end > start > 0`，单位是毫秒 |
| `timestamp_not_unix_milliseconds` | `start`、`end`、`due`、`time` 传成了秒或其他单位。改成 13 位 Unix 毫秒，按用户时区换算 |
| `missing_reminder_due` | 新建提醒要有 `due`。没有具体时刻的事项改用 task |
| `invalid_task_ids` | 待办至少要有一项 `tasks`，且每项 `id` 不重复 |
| `missing_video_image` | 视频要有 `images`。没有真实封面时，可用内置素材并在正文里注明是示意图 |
| `missing_images` | 照片要有 `images` |
| `missing_files` | 文件卡要有 `files` |
| `missing_pullRequest` | PR 卡要有 `pullRequest` |
| `invalid_pullRequest_type` | `pullRequest` 只能用在 `pr` 卡 |
| `invalid_authors_type` | `authors` 不能用在 task、event、reminder、photo、pr |
| `invalid_project_type` | `project` 只能用在 task、reminder |
| `invalid_people_type` | `people` 只能用在 event |
| `invalid_form_type` | `form` 只能用在 note |
| `invalid_audioUrl_type` | `audioUrl` 只能用在 `media:"podcast"` |
| `invalid_chapters_type`、`invalid_transcript_type` | 章节和转录只能用在 media |
| `invalid_chapters_time`、`invalid_transcript_time` | `start` 必须严格递增，且不超过 `duration` |
| `invalid_check_conclusion` | 只有 `status:"completed"` 的检查才能带 `conclusion` |
| `invalid_publishedAt`、`invalid_file_modifiedAt` | 用 `YYYY-MM-DD`，或带时区的 ISO 时间 |
| `invalid_id` | ID 不能是 `__proto__`、`constructor`、`prototype` |

## 报告

说明看到的现象、对应的回执证据、判断的原因、已经做了什么、还要用户做什么。用户能做的只有刷新工具、重新连接、在设置里改凭据或开通知这类操作；服务端故障请用户转告开发者，并附上 `request_id`。
