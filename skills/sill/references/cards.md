# 卡片制作

按用途选择 12 种 `type`；视频、播客是 `media` 的两种 `media` 值。先读本页对应类型，再查 [字段字典](fields.md) 和 [传输规则](transport.md)。下列示例均为合成资料，只展示 `sill_createContent` 参数中外层 `body` 对象，不能直接保存为用户资料。

类型索引：[文章](#article文章)、[PR](#pr拉取请求)、[邮件](#mail邮件)、[笔记](#note笔记)、[待办](#task待办)、[日程](#event日程)、[提醒](#reminder提醒)、[媒体](#media视频和播客)、[照片](#photo照片)、[文件](#file文件)、[摘要](#digest摘要)、[建议](#suggestion建议)。

## 通用要求

- 一张卡片表达一个独立主题。使用具体标题；`summary` 写一两句纯文本卡面摘要；`body` 写一个 Markdown 字符串，承载详情全文。
- 保留用户要求的正文完整度。保存原文时不擅自缩成摘要；只有摘录或概述时在正文中说明。阅读时长由客户端按正文计算，不另外传入。
- 来源中能读到的适用字段逐项提取；没有的信息省略。正文缺失、时间含糊或没有访问权限时说明缺口，只询问影响用途的关键问题，不为填满表格补造内容。
- 作者与来源分开：`authors` 写原文作者、发布方或邮件发件人，`sources` 只记录内容从哪里进入 Sill。标题、卡面摘要和正文不重复堆放元数据。可操作或固定结构的信息写进任务、会议、文件、章节、关联等字段。
- 字段集合是固定的。未知字段或已移除字段会被拒绝，不能用自定义字段补充信息。
- 制作要求表示一张有用卡片需要的信息，不把接口为旧卡片保留的宽松输入当作推荐格式。若缺少对应类型的必要素材，先取得资料或澄清，不假造任务、时间或图片。

## article：文章

保存阅读材料。标题和原文地址应明确；有作者、发布方、发布日期就写入 `authors` 与 `publishedAt`。`body` 保留文章层级和引用，不把原文事实与助手结论混写；只保存摘录时在正文中说明。

```json
{"type":"article","title":"庭院中的雨水利用","summary":"介绍雨水收集的三个步骤。","url":"https://example.com/garden","authors":[{"name":"林青"},{"name":"庭院观察"}],"publishedAt":"2026-10-20","body":"## 收集\n\n将雨水引入储水容器。\n\n> 本卡保存原文第一节。","sources":[{"name":"庭院观察网站","kind":"web"}]}
```

## pr：拉取请求

一张卡对应一个 PR。`pullRequest` 必须含 `repository`、`number`、`state`、`observedAt`；`url` 写真实 PR 地址。正文说明改动目的、影响、验证和待处理事项。分支、审阅人、检查与统计从已读取证据填写。`observedAt` 是本次读取快照的时间，不是 PR 创建时间；卡片不是实时 GitHub 状态，也不执行审阅或合并。

```json
{"type":"pr","title":"完善导出说明","summary":"导出结果增加字段说明，等待审阅。","url":"https://github.com/example/project/pull/42","body":"## 改动\n\n补充导出字段说明。\n\n## 验证\n\n文档检查通过。","sources":[{"name":"example/project","kind":"github"}],"pullRequest":{"repository":"example/project","number":42,"state":"open","observedAt":"2026-10-23T10:00:00+08:00","headBranch":"docs/export","baseBranch":"main","reviewRequested":true,"reviewers":[{"login":"wu","decision":"pending"}],"checks":[{"name":"docs","status":"completed","conclusion":"success"}],"additions":12,"deletions":0,"changedFiles":1}}
```

## mail：邮件

保存邮件资料。主题作标题，`authors` 第一项写真实发件人，`publishedAt` 写发送时刻。正文保留请求、结论和上下文；附件写进 `files`，只记录附件名和已取得的安全链接、MIME、字节数；不声称上传或发送邮件。

```json
{"type":"mail","title":"周五评审材料","summary":"请在评审前阅读附件。","authors":[{"name":"林青"}],"publishedAt":"2026-10-23T09:00:00+08:00","body":"请在下午评审前阅读材料。\n\n需要确认：\n- 范围\n- 验收条件","files":[{"name":"评审材料.pdf","url":"https://example.com/review.pdf","mimeType":"application/pdf","sizeBytes":2048}],"sources":[{"name":"工作邮箱","kind":"mail"}]}
```

## note：笔记

保存用户想法、记录或引用；没有更明确用途时使用。正文区分原话、观察和个人结论，保留原意。真实引文可用 `form:"quote"`，其他笔记省略 `form`。针对已有卡片的个人评论使用 `state.note`，不另造事实字段。

```json
{"type":"note","title":"评审时先展示实际结果","summary":"先演示结果，再讨论实现。","body":"先展示用户能完成什么，再解释必要的取舍。","tags":["评审"],"sources":[{"name":"用户记录","kind":"capture"}]}
```

## task：待办

用动作命名标题，写清完成条件；必须有非空 `tasks`，一项一个可执行动作。子任务 `id` 唯一且后续保持稳定；已完成的子任务写进个人状态 `state.taskDone`，不写在任务项上。截止时间和项目有依据才写。不要只用正文 Markdown 复选框代替可勾选的任务。

```json
{"type":"task","title":"准备产品评审","summary":"整理范围与验收条件。","body":"## 完成条件\n\n材料可供评审，未确认的问题已列出。","tasks":[{"id":"scope","text":"整理需求范围"},{"id":"acceptance","text":"列出验收条件"}],"project":{"name":"产品评审"},"state":{"taskDone":["scope"]},"sources":[{"name":"用户安排","kind":"capture"}]}
```

## event：日程

必须明确开始与结束，`end > start > 0`。按用户时区换算 Unix 毫秒。正文写议程与准备事项；地点、参会人、现有会议链接分别填写。只知道日期却不知道起止时间时先澄清，不擅自设成全天。保存不代表创建外部日历事件。

示例为北京时间 2026-10-19 10:00–11:00，不是默认时间。

```json
{"type":"event","title":"产品评审","summary":"确认范围和验收条件。","start":1792375200000,"end":1792378800000,"location":"会议室 A","people":["林青"],"meeting":{"name":"线上会议","url":"https://example.com/meeting"},"body":"## 议程\n\n1. 确认范围\n2. 讨论验收条件","sources":[{"name":"用户安排","kind":"capture"}]}
```

## reminder：提醒

标题说明届时做什么，`due` 写明确到期时刻，正文保留必要上下文。没有确定时间时先澄清；如果用户只想记录待办，按其用途使用 task。`project` 可记录所属项目。保存提醒时间不表示系统会发送通知。

```json
{"type":"reminder","title":"提交评审材料","summary":"会议前提交最终材料。","due":1792375200000,"project":{"name":"产品评审"},"body":"提交已确认范围与验收条件。","sources":[{"name":"用户安排","kind":"capture"}]}
```

## media：视频和播客

必须选择 `media:"video"` 或 `"podcast"`。`url` 是原节目/视频页面；播客可另填实际可访问的 `audioUrl`。视频需要 `images`，第一张作封面；使用内置素材时必须说明它是示意封面；无合适素材时不要冒充真实封面。未知时长省略，不写 0。

`body` 写节目笔记、概述或引用。已有带时间的章节写 `chapters:[{start,title}]`，转录写 `transcript:[{start,text}]`，两者的 `start` 都是秒数、严格递增、不超过已知时长。不能从普通正文编造章节或时间轴。无章节或转录就省略对应字段。`state.playbackPosition` 仅记录实际播放位置。

```json
{"type":"media","media":"video","title":"雨水收集演示","summary":"演示容器连接方法。","url":"https://www.youtube.com/watch?v=example1234","images":["botanical"],"duration":120,"chapters":[{"start":0,"title":"准备"},{"start":60,"title":"连接"}],"body":"示意封面采用内置植物素材。\n\n## 节目笔记\n\n连接前检查容器是否密封。","sources":[{"name":"演示频道","kind":"youtube"}]}
```

```json
{"type":"media","media":"podcast","title":"小庭院的雨水计划","summary":"讨论收集与储存雨水。","url":"https://example.com/episodes/1","audioUrl":"https://example.com/audio/1.mp3","duration":180,"authors":[{"name":"林青"},{"name":"庭院电台"}],"publishedAt":"2026-10-20","chapters":[{"start":0,"title":"收集"},{"start":90,"title":"储存"}],"transcript":[{"start":0,"text":"今天讨论小庭院如何收集雨水。"},{"start":90,"text":"接下来讨论储存容器。"}],"body":"## 节目笔记\n\n选择容器前确认庭院可用空间。","sources":[{"name":"庭院电台","kind":"podcast"}]}
```

## photo：照片

照片的事实说明写 `summary`，拍摄日期写 `publishedAt`，正文写背景。`images` 至少一项，只能传内置素材 ID 或已有的 HTTPS 图片地址，不能上传真实照片。用户要保存本机照片时报告这个限制，不用内置图替换；下面示例仅适用于用户明确要求示意素材的情况。

```json
{"type":"photo","title":"海岸示意素材","summary":"内置海岸示意素材，不是用户真实照片。","images":["coast"],"publishedAt":"2026-10-20","body":"比较海岸线与留白的关系。","sources":[{"name":"内置示意素材","kind":"local"}]}
```

## file：文件

必须有非空 `files`。每项至少写真实名称；可填 `mimeType`、`sizeBytes`、`modifiedAt`、`url`。正文说明用途或已读到的内容，未打开文件就不声称完整读过。文件记录不等于上传附件；不用旧 `meta`/`time` 拼接类型、大小与日期。

```json
{"type":"file","title":"产品评审材料","summary":"评审时使用的 PDF 材料。","files":[{"name":"评审材料.pdf","mimeType":"application/pdf","sizeBytes":2048,"modifiedAt":"2026-10-20","url":"https://example.com/review.pdf"}],"body":"材料包含已确认的范围与验收条件。","sources":[{"name":"用户提供的链接","kind":"capture"}]}
```

## digest：摘要

汇总已经读取的一组资料或一个时段；正文按主题写事实、结论和未解决事项，说明覆盖范围，不宣称覆盖未读分页。已有卡片关联用真实 `related` ID，没有对应卡片就省略。覆盖的时段写在正文中。

```json
{"type":"digest","title":"产品评审结论","summary":"本次确认范围，验收细节仍需补充。","body":"## 已确认\n\n- 本轮完成范围已明确。\n\n## 待处理\n\n- 补充验收细节。","sources":[{"name":"已读取的评审记录","kind":"capture"}]}
```

## suggestion：建议

提出一个具体下一步。正文分别写建议、理由、依据与适用条件，依据只列已读取的事实。关联仅使用真实 `related` ID；没有依据就先补资料，不把建议描述为已发生事实或自动执行。

```json
{"type":"suggestion","title":"先补充验收示例","summary":"用一个实际案例统一验收理解。","body":"## 建议\n\n为每项条件补充一个实际案例。\n\n## 理由\n\n当前验收条件仍有歧义：评审记录中有两项条件未形成一致解释。\n\n## 适用条件\n\n在进入实现前共同确认。","sources":[{"name":"已读取的评审记录","kind":"capture"}]}
```

## 保存后确认

按 [传输规则](transport.md) 创建并重新读取。逐项检查提交过的事实字段、正文换行、结构数组与状态。类型、时间单位、原文覆盖程度、实际保存结果都确认后再报告完成；同时说明无法取得的关键资料和未执行的外部动作。
