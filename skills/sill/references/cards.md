# 卡片构建

## 类型与内容

| type | 用途 | 结构字段与写法 |
| --- | --- | --- |
| `article` | 文章、阅读材料 | `summary` 概述，`body` 正文段落，`url` 原文地址 |
| `mail` | 邮件资料 | `sender` 发件人，`body` 内容；保存不等于发送邮件 |
| `note` | 个人记录、想法 | `summary`、`body`；没有更明确用途时选用 |
| `task` | 一个事项及其子任务 | `tasks: [{id,text,done}]`；ID 唯一且更新时稳定，可加 `due`、`people` |
| `event` | 有开始和结束的日程 | `start`、`end`，结束晚于开始；可加 `location`、`meeting`、`people` |
| `reminder` | 有到期时间的提醒记录 | `due`，正文说明需要做什么；不承诺后台通知 |
| `media` | 视频、播客 | `media: video/podcast`，`duration` 秒数，`url`；视频需要支持的 `image` |
| `photo` | 图片主题卡片 | `photos` 素材标识数组或 `image`；当前不是任意图片上传接口 |
| `file` | 文件描述与引用 | `files: [{name,meta?,time?}]`，`url` 可放已存在的安全访问地址；记录不代表上传附件 |
| `digest` | 一组卡片或一段时间的汇总 | `summary`、最多 3 条 `points`、`body`、`sources`、`related` |
| `suggestion` | 基于资料提出下一步 | `why: {reason,basis?}`、`related`，区分事实与建议，不自动执行 |

摘要与建议是卡片类型；已读、完成、归档是状态。只汇总已读取的资料，`related` 使用真实卡片 ID；没有匹配卡片就省略，不能凭标题生成 ID。

## 字段与布局

云端创建接收平铺卡片字段；更新放进 `changes`。服务端生成卡片 ID、版本、创建/更新时间，创建时不要自填。

- `title` 必填，1–1000 字；使用短而具体的标题。`summary` 最多 10000 字，但适合一两句话。`body` 是字符串数组，每个元素一段，最多 100 段，每段最多 50000 字；不是单个 Markdown 字符串。
- `form` 可选 `standard / image / quote / compact / data`。默认省略；短笔记可用 `compact`，真实引文可用 `quote`，数据摘要可用 `data`，有支持的图片素材时可用 `image`。不同类型由既有模板决定哪些组合生效，不靠设置 form 强行套布局。
- `image` 以及 `photos` 每项只接受 `architecture / coast / mountain / botanical`。这些是内置示意素材，不是用户真实照片。用户要保存真实照片时说明当前素材限制，不能替换成示意图冒充原图。
- `sources: [{name,kind}]` 最多 11 个；常用 kind 为 `agent / web / rss / mail / calendar / github / readwise / capture / markdown / local`。来源名写真实助手或渠道，不把作者当渠道；不要再写顶层 `source` 或 `kind`。
- `tags`、`people` 最多 100 项，每项最多 100 字；`meta` 最多 300 字；`priority` 为 0–10，仅在用户需要时填写。
- `tasks` 最多 100 项；`id` 使用 1–100 位字母、数字、下划线或连字符，不能为 `__proto__ / constructor / prototype`；`text` 1–2000 字。修改某项时保留其 ID 和其他任务。
- `start / end / due / time` 及文件 `time` 使用 Unix 毫秒；`duration` 使用秒，0–86400。按用户时区解析日期，写入前检查日期与时区；相对日期以当前会话日期换算。不确定到期时间就省略；日程缺少起止信息时先澄清。
- `meeting: {name,url,code?}` 是已有会议的引用；`url` 只接受 HTTP/HTTPS。不要写含密钥、会话或签名凭据的链接。
- `points` 最多 3 项，每项 1–200 字；`why.reason` 1–300 字，`why.basis` 最多 5 项、每项最多 200 字。
- `files` 最多 200 项；`name` 1–300 字，`meta` 最多 200 字；`photos` 最多 50 项；`related` 最多 100 个有效卡片 ID。
- `state` 支持阅读、收藏、稍后读、标签、备注、任务、提醒和归档等字段，完整定义见 [操作协议](operations.md)。`tasks[].done` 是子任务记录；任务的 `state.done` 与 `state.taskDone` 由服务端保持一致，提醒的 `done` 与 `reminderDone` 同步。修改前先读取最新状态。

## 示例

以下是 `sill_createContent` 的 `body` 示例，调用时另生成 `idempotency_key`。示例只展示结构，不自动写入。日期、来源与文本须按实际请求填写。

一个事项和两个子任务：

```json
{
  "type": "task",
  "title": "准备产品评审",
  "summary": "整理本次评审需要的材料。",
  "sources": [{"name": "用户记录", "kind": "capture"}],
  "tasks": [
    {"id": "requirements", "text": "整理需求和验收标准", "done": false},
    {"id": "questions", "text": "列出需要确认的问题", "done": false}
  ],
  "state": {"done": false}
}
```

带明确时区的日程：示例时间为北京时间 2026-10-19 10:00–11:00；这些毫秒数只用于此示例，不作为默认时间。

```json
{
  "type": "event",
  "title": "产品评审",
  "start": 1792375200000,
  "end": 1792378800000,
  "location": "线上",
  "body": ["确认需求范围和待解决问题。"],
  "sources": [{"name": "用户安排", "kind": "capture"}]
}
```

汇总已读取资料后形成摘要：真实来源和 related ID 在找到对应资料后再添加。

```json
{
  "type": "digest",
  "title": "产品评审要点",
  "summary": "汇总已确认的范围和待确认事项。",
  "points": ["先确认卡片字段", "保留已有来源", "区分保存与外部执行"],
  "body": ["按已读取的评审资料填写结论。", "列出尚未解决的问题及其依据。"]
}
```
