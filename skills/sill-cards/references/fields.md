# 字段字典

与卡片约定 5.0.0 对齐。新建单卡必传 `type`、`title`；下表其余字段除类型要求外均可省略。字段不接受 null；未知字段或已移除字段会被拒绝。

## 内容与来源

| 字段 | 类型、单位与用途 |
| --- | --- |
| `id` | 单卡创建由服务端生成；批量新建才传。1–100 位字母、数字、下划线、连字符，禁用 __proto__/constructor/prototype |
| `type` | article/pr/mail/note/task/event/reminder/media/digest/suggestion/photo/file；不是 MIME |
| `title` | 1–1000 字的具体标题 |
| `summary` | 最多 10000 字，纯文本卡面摘要；照片卡显示为照片说明 |
| `body` | 一个 CommonMark Markdown 字符串，最多 500000 字；段落用空行分隔，不传数组。阅读时长由客户端按正文计算 |
| `url` | 原内容 HTTP(S) 地址，不是上传入口 |
| `sources` | 最多 11 个 {name,kind}；name 1–300 字，kind 1–100 字。kind 可用 rss/readwise/youtube/twitter/podcast/web/mail/calendar/reminders/photos/folder/linear/github/capture/markdown/local/agent；这里只记录来源 |
| `authors` | 最多 20 个 {name,url?}，name 1–300 字。原文作者、发布方或邮件发件人；第一项显示为邮件发件人。文章、笔记、邮件、媒体、摘要、建议、文件适用 |
| `publishedAt` | 所有类型可用。原文发布、邮件发送或照片拍摄日期；YYYY-MM-DD 或带时区 ISO 时间，保留来源的精度 |
| `tags` | 内容标签，最多 100 项，每项最多 100 字；用户编辑标签就是编辑卡片 |
| `related` | 最多 100 个 Sill 卡片 ID，不传 URL 或标题 |
| `priority` | 0–10 数字，按用户要求或明确依据填写 |
| `time` | 卡片时间线使用的 Unix 毫秒，不替代原文日期或服务端时间 |

## 专属结构

| 字段 | 类型、单位与用途 |
| --- | --- |
| `tasks` | 待办子任务，1–100 个 {id,text}；id 规则同卡片且唯一稳定，text 1–2000 字。完成情况写个人状态 `taskDone` |
| `project` | 待办、提醒所属项目 {name,url?}，name 1–300 字，URL 为 HTTP(S) |
| `start`、`end` | 日程 Unix 毫秒，必须 end > start > 0 |
| `due` | 待办/提醒到期时刻，Unix 毫秒 |
| `location` | 已知日程或照片地点，最多 300 字 |
| `meeting` | 现有会议 {name,url,code?}，name 1–100 字，url 为 HTTP(S)，code 最多 100 字；不得包含秘密 |
| `people` | 仅日程：已知参会人，最多 100 项，每项最多 100 字 |
| `media` | 媒体子类型 video/podcast，不写在 type 中 |
| `duration` | 媒体总秒数，0–86400 整数 |
| `audioUrl` | 仅 media=podcast：HTTP(S) 音频地址，播放时读取 |
| `chapters` | 仅媒体：章节，最多 10000 个 {start,title}；start 为 0–86400 秒，可含小数；title 1–500 字 |
| `transcript` | 仅媒体：带时间转录，最多 10000 个 {start,text}；start 同 chapters；text 1–20000 字 |
| `files` | 文件或邮件附件，最多 200 个 {name,mimeType?,sizeBytes?,modifiedAt?,url?}；name 1–300 字，MIME 最多 200 字，非负安全整数字节数，modifiedAt 为日期或带时区 ISO 时间，HTTP(S) URL。文件卡必须非空 |
| `pullRequest` | pr 必填快照，见下表；不能用于其他卡片类型 |

chapters 与 transcript 各自按 start 严格递增，不能超过已知 duration。普通正文不会自动变成章节或转录。文件只传描述和链接，不传二进制、base64、本机路径或带凭据地址。

## PR 快照

所有字段置于 `pullRequest` 内。必填 `repository`（owner/repo）、`number`（正安全整数）、`state`（draft/open/merged/closed）、`observedAt`（带时区 ISO 观察时刻）。可选字段如下：

| 字段 | 格式 |
| --- | --- |
| `headBranch`、`baseBranch` | 源/目标分支名，1–300 字 |
| `reviewers` | 最多 100 个 {login,url?,decision}；decision=pending/approved/changesRequested/commented/dismissed |
| `checks` | 最多 1000 个 {name,status,conclusion?,url?}；status=queued/inProgress/completed；仅 completed 可带 conclusion=success/failure/neutral/cancelled/skipped/timedOut/actionRequired/stale |
| `additions`、`deletions`、`changedFiles` | 非负安全整数 |
| `reviewRequested` | 是否确实请求当前用户审阅，布尔值 |

嵌套 URL 均为 HTTP(S)。

## 展示字段

| 字段 | 可用值与限制 |
| --- | --- |
| `form` | 仅笔记：quote 把标题显示为引文；其他情况省略。不生成 HTML/CSS/JS |
| `images` | 1–50 项，内置素材 ID（architecture/coast/mountain/botanical）或 HTTPS 图片地址。第一项为封面，照片卡显示全部；视频卡和照片卡必填。不能用来上传照片 |

类型与字段共同决定显示；不是每个字段都会出现在卡面。正文中的图片语法不加载图片，原始 HTML 按文字显示。

## 个人状态与服务端字段

`state` 用于单卡创建/更新；批量用 `item.patch.values`。完整状态和偏好见 sill-operations 的 [操作协议](../../sill-operations/references/operations.md)。`state.note` 为个人备注，`state.taskDone` 为已完成子任务 ID。`progress` 是 0–1 阅读比例，`playbackPosition` 是 0–86400 秒实际播放位置，两者互不替代；写播放位置不自动标记已读。

服务端 `revision`、`created_at`、`updated_at`、`deleted` 等只读，不放进新卡或 changes。
