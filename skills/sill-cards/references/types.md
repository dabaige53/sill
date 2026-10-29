# 类型配方

按用途选择 12 种 `type`；视频、播客是 `media` 的两种 `media` 值。每类先写「显示」：卡面和详情按顺序展示哪些内容，依据是设计系统的配方表。没有出现在显示里的字段仍会保存，供搜索、排序或助手读取。文字写法不限，字数与格式见 [书写规范](writing.md)，字段格式见 [字段字典](fields.md) 和 [传输规则](transport.md)。下列示例均为合成资料，只展示 `sill_createContent` 参数中外层 `body` 对象，不能直接保存为用户资料。

类型索引：[文章](#article文章)、[PR](#pr拉取请求)、[邮件](#mail邮件)、[笔记](#note笔记)、[待办](#task待办)、[日程](#event日程)、[提醒](#reminder提醒)、[媒体](#media视频和播客)、[照片](#photo照片)、[文件](#file文件)、[摘要](#digest摘要)、[建议](#suggestion建议)。

## 通用要求

- 一张卡片表达一个独立主题。`title`、`summary`、`body` 怎么写由助手决定，只守 [书写规范](writing.md) 的字数和格式。
- 阅读时长由客户端按正文计算，不另外传入。
- 作者与来源分开：`authors` 写原文作者、发布方或邮件发件人，`sources` 只记录内容从哪里进入 Sill。可操作或固定结构的信息写进任务、会议、文件、章节、关联等字段。
- 字段集合是固定的。未知字段或已移除字段会被拒绝，不能用自定义字段补充信息。

## article：文章

**显示**：卡面依次是封面、来源行（发布方或作者、日期、阅读进度）、标题、摘要。详情是来源、标题、封面、正文，可放大阅读；正文的小标题会生成目录。

保存阅读材料。有原文地址、发布方、作者、发布日期就写入 `url`、`authors`（来源行按数组顺序显示）与 `publishedAt`。

```json
{"type":"article","title":"庭院中的雨水利用","summary":"介绍雨水收集的三个步骤。","url":"https://example.com/garden","authors":[{"name":"庭院观察"},{"name":"林青"}],"publishedAt":"2026-10-20","body":"## 收集\n\n将雨水引入储水容器。\n\n> 本卡保存原文第一节。","sources":[{"name":"庭院观察网站","kind":"web"}]}
```

## pr：拉取请求

**显示**：卡面和详情都是 PR 专用视图，展示仓库与编号、状态、分支、审阅人、检查和增删统计。等用户审阅时才出现「审阅」按钮。

一张卡对应一个 PR。`pullRequest` 必须含 `repository`、`number`、`state`、`observedAt`；`url` 写 PR 地址。`observedAt` 是读取快照的时间，不是 PR 创建时间。

```json
{"type":"pr","title":"完善导出说明","summary":"导出结果增加字段说明，等待审阅。","url":"https://github.com/example/project/pull/42","body":"## 改动\n\n补充导出字段说明。\n\n## 验证\n\n文档检查通过。","sources":[{"name":"example/project","kind":"github"}],"pullRequest":{"repository":"example/project","number":42,"state":"open","observedAt":"2026-10-23T10:00:00+08:00","headBranch":"docs/export","baseBranch":"main","reviewRequested":true,"reviewers":[{"login":"wu","decision":"pending"}],"checks":[{"name":"docs","status":"completed","conclusion":"success"}],"additions":12,"deletions":0,"changedFiles":1}}
```

## mail：邮件

**显示**：卡面依次是发件人（第一个 `authors`）、主题、摘要、第一个附件。详情是发件人、主题、正文、全部附件。不显示收件人。

保存邮件资料。`authors` 第一项写发件人，`publishedAt` 写发送时刻。附件写进 `files`：名称、链接、MIME、字节数。

```json
{"type":"mail","title":"周五评审材料","summary":"请在评审前阅读附件。","authors":[{"name":"林青"}],"publishedAt":"2026-10-23T09:00:00+08:00","body":"请在下午评审前阅读材料。\n\n需要确认：\n- 范围\n- 验收条件","files":[{"name":"评审材料.pdf","url":"https://example.com/review.pdf","mimeType":"application/pdf","sizeBytes":2048}],"sources":[{"name":"工作邮箱","kind":"mail"}]}
```

## note：笔记

**显示**：卡面依次是来源行（日期、阅读进度）、标题、摘要。`form:"quote"` 时卡面把标题显示为金句。详情是来源、标题、正文，不显示封面。

保存用户想法、记录或引用；没有更明确用途时使用。引文可用 `form:"quote"`，其他笔记省略 `form`。针对已有卡片的个人评论写 `state.note`。

```json
{"type":"note","title":"评审时先展示实际结果","summary":"先演示结果，再讨论实现。","body":"先展示用户能完成什么，再解释必要的取舍。","tags":["评审"],"sources":[{"name":"用户记录","kind":"capture"}]}
```

## task：待办

**显示**：卡面依次是来源行（完成数）、标题、清单前三项（未完成的排前面）。详情是到期、项目等信息行，然后是完整清单和正文。

必须有非空 `tasks`，一项一个可执行动作。子任务 `id` 唯一且后续保持稳定；已完成的子任务写进个人状态 `state.taskDone`，不写在任务项上。正文的 Markdown 复选框不能勾选。

```json
{"type":"task","title":"准备产品评审","summary":"整理范围与验收条件。","body":"## 完成条件\n\n材料可供评审，未确认的问题已列出。","tasks":[{"id":"scope","text":"整理需求范围"},{"id":"acceptance","text":"列出验收条件"}],"project":{"name":"产品评审"},"state":{"taskDone":["scope"]},"sources":[{"name":"用户安排","kind":"capture"}]}
```

## event：日程

**显示**：卡面依次是日期行（相对时间）、时间段、标题、地点或会议、参会人。会议开始前 10 分钟才出现「加入」。详情是日期、时间段、标题、会议与地点、参会人，正文作为议程。

必须明确开始与结束，`end > start > 0`。按用户时区换算 Unix 毫秒。地点、参会人、会议链接分别填写。

示例为北京时间 2026-10-19 10:00–11:00，不是默认时间。

```json
{"type":"event","title":"产品评审","summary":"确认范围和验收条件。","start":1792375200000,"end":1792378800000,"location":"会议室 A","people":["林青"],"meeting":{"name":"线上会议","url":"https://example.com/meeting"},"body":"## 议程\n\n1. 确认范围\n2. 讨论验收条件","sources":[{"name":"用户安排","kind":"capture"}]}
```

## reminder：提醒

**显示**：卡面依次是来源行（提醒时刻）、完成圆圈加标题、摘要（没有摘要就不显示）。详情是圆圈加标题、标签、正文、所属项目。

`due` 写到期时刻，`project` 可记录所属项目。只想记录待办时用 task。

```json
{"type":"reminder","title":"提交评审材料","summary":"会议前提交最终材料。","due":1792375200000,"project":{"name":"产品评审"},"body":"提交已确认范围与验收条件。","sources":[{"name":"用户安排","kind":"capture"}]}
```

## media：视频和播客

**显示**：视频卡面是封面、来源行（剩余时长）、标题，详情是播放器和章节。播客卡面是来源行、标题、短摘要、节目条，详情是播客页，含章节和转录。

必须选择 `media:"video"` 或 `"podcast"`。`url` 是原节目或视频页面；播客可另填 `audioUrl`。视频需要 `images`，第一张作封面。

已有带时间的章节写 `chapters:[{start,title}]`，转录写 `transcript:[{start,text}]`，两者的 `start` 都是秒数、严格递增、不超过 `duration`。`state.playbackPosition` 记录播放位置。

```json
{"type":"media","media":"video","title":"雨水收集演示","summary":"演示容器连接方法。","url":"https://www.youtube.com/watch?v=example1234","images":["botanical"],"duration":120,"chapters":[{"start":0,"title":"准备"},{"start":60,"title":"连接"}],"body":"## 节目笔记\n\n连接前检查容器是否密封。","sources":[{"name":"演示频道","kind":"youtube"}]}
```

```json
{"type":"media","media":"podcast","title":"小庭院的雨水计划","summary":"讨论收集与储存雨水。","url":"https://example.com/episodes/1","audioUrl":"https://example.com/audio/1.mp3","duration":180,"authors":[{"name":"庭院电台"},{"name":"林青"}],"publishedAt":"2026-10-20","chapters":[{"start":0,"title":"收集"},{"start":90,"title":"储存"}],"transcript":[{"start":0,"text":"今天讨论小庭院如何收集雨水。"},{"start":90,"text":"接下来讨论储存容器。"}],"body":"## 节目笔记\n\n选择容器前确认庭院可用空间。","sources":[{"name":"庭院电台","kind":"podcast"}]}
```

## photo：照片

**显示**：卡面依次是图片拼贴、来源行（张数）、标题、摘要（照片说明）。详情是大图页。

`summary` 显示为照片说明，拍摄日期写 `publishedAt`。`images` 至少一项，接受内置素材 ID 或 HTTPS 图片地址，不能上传本机照片。

```json
{"type":"photo","title":"海岸示意素材","summary":"内置海岸示意素材，不是用户真实照片。","images":["coast"],"publishedAt":"2026-10-20","body":"比较海岸线与留白的关系。","sources":[{"name":"内置示意素材","kind":"local"}]}
```

## file：文件

**显示**：卡面依次是来源行（文件数）、标题、摘要、前三个文件。详情是正文和完整文件列表。

必须有非空 `files`。每项至少写名称；可填 `mimeType`、`sizeBytes`、`modifiedAt`、`url`。只记录信息和链接，不上传文件。

```json
{"type":"file","title":"产品评审材料","summary":"评审时使用的 PDF 材料。","files":[{"name":"评审材料.pdf","mimeType":"application/pdf","sizeBytes":2048,"modifiedAt":"2026-10-20","url":"https://example.com/review.pdf"}],"body":"材料包含已确认的范围与验收条件。","sources":[{"name":"用户提供的链接","kind":"capture"}]}
```

## digest：摘要

**显示**：卡面依次是来源行（关联卡数）、标题、摘要。详情是正文和引用卡（`related`）。

汇总一组资料或一个时段。关联已有卡片时写 `related` ID。

```json
{"type":"digest","title":"产品评审结论","summary":"本次确认范围，验收细节仍需补充。","body":"## 已确认\n\n- 本轮完成范围已明确。\n\n## 待处理\n\n- 补充验收细节。","sources":[{"name":"已读取的评审记录","kind":"capture"}]}
```

## suggestion：建议

**显示**：卡面依次是来源行、标题、摘要、最多两张引用卡。详情是正文和全部引用卡。

提出一个下一步。关联已有卡片时写 `related` ID。

```json
{"type":"suggestion","title":"先补充验收示例","summary":"用一个实际案例统一验收理解。","body":"## 建议\n\n为每项条件补充一个实际案例。\n\n## 理由\n\n当前验收条件仍有歧义：评审记录中有两项条件未形成一致解释。\n\n## 适用条件\n\n在进入实现前共同确认。","sources":[{"name":"已读取的评审记录","kind":"capture"}]}
```

## 保存后确认

按 [传输规则](transport.md) 创建并重新读取。逐项检查提交过的字段、正文换行、结构数组与状态，确认后再报告完成。改已有卡片的更新格式与冲突处理见 sill-operations 的 [操作协议](../../sill-operations/references/operations.md)。
