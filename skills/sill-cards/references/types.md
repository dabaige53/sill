# 类型索引

按用途选择 12 种 `type`；视频、播客是 `media` 的两种 `media` 值。每种类型一个模板文件，写明卡面和详情显示什么、每个字段要不要填、怎么写，并附一张完整示例。字数与格式见[书写规范](writing.md)，字段格式见[字段字典](fields.md)和[传输规则](transport.md)。

| 类型 | 用途 | 模板 |
| --- | --- | --- |
| `article` | 以后要读的文章、资讯 | [文章](cards/article.md) |
| `pr` | 跟进一个 GitHub PR | [PR](cards/pr.md) |
| `mail` | 留存一封邮件 | [邮件](cards/mail.md) |
| `note` | 自己的想法、引文、帖子 | [笔记](cards/note.md) |
| `task` | 能拆成几步勾选的事 | [待办](cards/task.md) |
| `event` | 有起止时间的安排 | [日程](cards/event.md) |
| `reminder` | 到某个时刻提醒自己 | [提醒](cards/reminder.md) |
| `media` | 视频和播客 | [媒体](cards/media.md) |
| `photo` | 网上的一组照片 | [照片](cards/photo.md) |
| `file` | 网盘或文件夹里的文件 | [文件](cards/file.md) |
| `digest` | 汇总一组资料 | [摘要](cards/digest.md) |
| `suggestion` | 提出一个下一步 | [建议](cards/suggestion.md) |

## 通用要求

- 一张卡片表达一个独立主题。同一件事的步骤写进 `tasks`；同一篇内容从多个渠道进来时合并 `sources`，不重复建卡。
- **每张卡都写 `summary`。** 卡面靠标题和摘要让用户决定要不要点开；缺摘要时卡面只能截取正文开头，读起来像半句话。摘要 1–2 句，说结论、状态或要做的事，不重复标题，不写「本文介绍了」「这是一张……卡片」。
- 来源里有的信息都写进对应字段：作者、日期、链接、封面、时间、地点、附件。字段缺失时界面直接不显示，不会从正文里找。
- 作者与来源分开：`authors` 写原文作者、发布方或邮件发件人，`sources` 只记录内容从哪里进入 Sill。
- 字段集合是固定的。未知字段或已移除字段会被拒绝，不能用自定义字段补充信息。没出现在卡面上的字段仍会保存，供搜索、排序或助手读取。
- 阅读时长由客户端按正文计算，不另外传入。

## 保存后确认

按[传输规则](transport.md)创建并重新读取。逐项检查提交过的字段、正文换行、结构数组与状态，确认后再报告完成。改已有卡片的更新格式与冲突处理见 sill-operations 的[操作协议](../../sill-operations/references/operations.md)。
