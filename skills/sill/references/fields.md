# 字段字典

与卡片约定 4.1.0 对齐。新建单卡必传 `type`、`title`；下表其余字段除类型要求外均可省略。未知不写，已知为 0 才写 0。可空字段仅 `readingEstimate`；不要传字符串 "null"。

## 内容与来源

| 字段 | 类型、单位与用途 |
| --- | --- |
| `id` | 单卡创建由服务端生成；批量新建才传。1–100 位字母、数字、下划线、连字符，禁用 __proto__/constructor/prototype |
| `type` | article/pr/mail/note/task/event/reminder/media/digest/suggestion/photo/file；不是 MIME |
| `title` | 1–1000 字的具体标题 |
| `summary` | 最多 10000 字，一两句纯文本卡面摘要，不承载详情全文 |
| `body` | 一个 CommonMark Markdown 字符串，最多 500000 字；段落用空行分隔，不传数组 |
| `url` | 原内容 HTTP(S) 地址，不是上传入口 |
| `sources` | 最多 11 个 {name,kind}；name 1–300 字，kind 1–100 字。kind 可用 rss/readwise/youtube/twitter/podcast/web/mail/calendar/reminders/photos/folder/linear/github/capture/markdown/local/agent；这里只记录来源 |
| `authors` | 最多 20 个 {name,url?}，name 1–300 字；文章、笔记、邮件、媒体、摘要、建议、文件适用 |
| `publisher` | {name,url?}，同 authors 的适用类型；发布方不等于来源 |
| `publishedAt`、`modifiedAt`、`savedAt` | 所有类型可用。原文发布、原文修改、外部保存日期；YYYY-MM-DD 或带时区 ISO 时间，保留来源的精度 |
| `bodyCoverage` | 文章、笔记、邮件、摘要、建议、文件适用。full/excerpt/summary/none；none 时正文必须为空或省略 |
| `readingEstimate` | 同 bodyCoverage 适用类型；{seconds,origin,scope,method?} 或 null。seconds 为 1–31536000 整数；origin=provided/calculated，scope=full/available。calculated 必须有 method、非空正文和非 none 的 bodyCoverage；全文计算要求 full。变更正文/覆盖程度后更新已有计算估算，或传 null 清除 |
| `section` | 文章栏目，1–100 字 |
| `tags` | 内容标签，最多 100 项，每项最多 100 字；个人标签见 state |
| `related` | 最多 100 个真实且已读取的 Sill 卡片 ID，不传 URL 或标题 |
| `priority` | 0–10 数字，按用户要求或明确依据填写 |
| `time` | 卡片时间线使用的 Unix 毫秒，不替代原文日期或服务端时间 |

## 专属结构

| 字段 | 类型、单位与用途 |
| --- | --- |
| `sender` | 邮件真实发件人，最多 300 字 |
| `sentAt` | 邮件发送时刻，必须带时区 ISO 时间，不能只有日期 |
| `recipients` | 邮件实际收件人，最多 100 项，每项 1–300 字 |
| `attachments` | 邮件附件，最多 200 个 {name,url?,mimeType?,sizeBytes?}；name 1–300 字，HTTP(S) url，MIME 字符串，非负安全整数字节数。[] 明确清空且覆盖旧单项标签 |
| `attachment` | 旧邮件单项附件文字，最多 300 字；新卡优先 attachments，不把它作为文件上传字段 |
| `tasks` | 待办子任务，1–100 个 {id,text,done?}；id 规则同卡片且唯一稳定，text 1–2000 字，done 为布尔值 |
| `project` | 待办、提醒所属项目 {name,url?}，name 1–300 字，URL 为 HTTP(S) |
| `start`、`end` | 日程 Unix 毫秒，必须 end > start > 0 |
| `due` | 待办/提醒到期时刻，Unix 毫秒 |
| `timeZone` | 日程 IANA 时区名，如 Asia/Shanghai；不填 +08:00 |
| `location` | 已知日程地点，最多 300 字 |
| `meeting` | 现有会议 {name,url,code?}，name 1–100 字，url 为 HTTP(S)，code 最多 100 字；不得包含秘密 |
| `people` | 已知相关人员，最多 100 项，每项最多 100 字 |
| `media` | 媒体子类型 video/podcast，不写在 type 中 |
| `duration` | 媒体已知总秒数，0–86400 整数；未知省略 |
| `audioUrl` | 仅 media=podcast：真实 HTTP(S) 音频地址，播放时读取 |
| `chapterCount` | 媒体已知章节总数，1–10000 整数，不少于 chapters 条数 |
| `chapters` | 媒体章节，最多 10000 个 {start,title}；start 为 0–86400 秒，可含小数；title 1–500 字 |
| `transcript` | 媒体带时间转录，最多 10000 个 {start,text}；start 同 chapters；text 1–20000 字 |
| `files` | 文件卡非空文件列表，最多 200 个 {name,mimeType?,sizeBytes?,modifiedAt?,url?}；name 1–300 字，MIME 最多 200 字，非负安全整数字节数，modifiedAt 为日期或带时区 ISO 时间，HTTP(S) URL |
| `takenAt` | 照片实际拍摄日期或带时区 ISO 时间 |
| `caption` | 照片说明，最多 2000 字 |
| `coverageStart`、`coverageEnd` | 摘要覆盖时间，成对 Unix 毫秒，结束晚于开始 |
| `why` | 建议依据 {reason,basis?}；reason 1–300 字，basis 最多 5 项，每项最多 200 字 |
| `pullRequest` | pr 必填快照，见下表；不能用于其他卡片类型 |

chapters 与 transcript 各自按 start 严格递增，不能超过已知 duration。普通正文不会自动变成章节或转录。文件与附件只传描述和链接，不传二进制、base64、本机路径或带凭据地址。

## PR 快照

所有字段置于 `pullRequest` 内。必填 `repository`（owner/repo）、`number`（正安全整数）、`state`（draft/open/merged/closed）、`observedAt`（带时区 ISO 观察时刻）。可选字段如下：

| 字段 | 格式 |
| --- | --- |
| `headBranch`、`baseBranch` | 源/目标分支名，1–300 字 |
| `author` | {login,url?}，login 1–300 字 |
| `reviewers` | 最多 100 个 {login,url?,decision}；decision=pending/approved/changesRequested/commented/dismissed |
| `checks` | 最多 1000 个 {name,status,conclusion?,url?}；status=queued/inProgress/completed；仅 completed 可带 conclusion=success/failure/neutral/cancelled/skipped/timedOut/actionRequired/stale |
| `additions`、`deletions`、`changedFiles`、`comments` | 非负安全整数；未知省略，真实零值保留 |
| `reviewRequested` | 是否确实请求当前用户审阅，布尔值 |
| `files` | 最多 3000 个 {path,additions?,deletions?}；path 1–2000 字；允许部分列表，但条数不能超过已知 changedFiles |

嵌套 URL 均为 HTTP(S)。PR 作者使用 `pullRequest.author`，不用顶层 authors。读取快照时间不能冒充持续同步。

## 展示字段

| 字段 | 可用值与限制 |
| --- | --- |
| `form` | standard/image/quote/compact/data；只选择已有布局，不生成 HTML/CSS/JS |
| `image` | architecture/coast/mountain/botanical 内置素材 ID，视频需提供；不是图片 URL |
| `photos` | 最多 50 个上述素材 ID；照片卡至少有一个 photos 或 image。不能作为用户真实照片上传接口 |

类型与字段共同决定显示；不是每个字段都会出现在卡面。正文中的图片语法不加载图片，原始 HTML 按文字显示。

## 个人状态与服务端字段

`state` 用于单卡创建/更新；批量用 `item.patch.values`。完整状态和偏好见 [操作协议](operations.md)。`state.note` 为个人备注，`state.tags` 为个人标签（配合 `tagsEdited:true`），`state.taskDone` 为已完成子任务 ID。`progress` 是 0–1 阅读比例，`playbackPosition` 是 0–86400 秒实际播放位置，两者互不替代；写播放位置不自动标记已读。

服务端 `revision`、`created_at`、`updated_at`、`deleted` 等只读，不放进新卡或 changes。没有 `points`、`meta`、`files[].meta`、`files[].time` 新写入字段。
