# 内容格式与传输

## 区分三种类型

- `type` 是卡片用途：article、pr、mail、note、task、event、reminder、media、digest、suggestion、photo、file。
- `media` 仅区分视频 video 与播客 podcast，卡片 `type` 仍为 media。
- `files[].mimeType` 是文件或附件 MIME，例如 application/pdf、audio/mpeg。它们不是卡片类型。

## 正文怎么写

标题、卡面摘要和正文的写法见 [书写规范](writing.md)。传输层只要求：`summary` 是纯文本，`body` 是一个 CommonMark 字符串，结构化数据放进专门字段。Markdown 复选框、列表或链接不会自动转换成 `tasks`、`files`、`chapters` 等结构。

## MCP 参数怎么传

通过宿主工具调用传原生 JSON 对象，不把整张卡片 JSON.stringify 后作为字符串传入。数字和布尔值不加引号；对象和数组保持结构。外层 `body` 是请求对象，内层 `body` 才是正文字符串。

调用 `sill_createContent` 的合成格式示例：

```json
{
  "idempotency_key": "7556b895-6584-4b29-950d-18c28c75ab44",
  "body": {
    "type": "note",
    "title": "评审结论",
    "summary": "先确认范围，再进入实现。",
    "body": "## 结论\n\n先确认范围。\n\n## 下一步\n\n补充验收示例。",
    "sources": [{"name": "用户记录", "kind": "capture"}],
    "state": {"bookmarked": true}
  }
}
```

JSON 文本中的 `\n` 经一次解码后是实际换行。不要再次转义为字面的反斜杠加 n；不要传正文数组、HTML 页面、base64 或旧 `points`/`meta`。调用工具时由宿主处理 MCP 协议、HTTP 和鉴权，不自行拼 JSON-RPC 或复制令牌。

同一个逻辑写入生成一个 UUID；示例 UUID 只说明格式，实际新请求重新生成。超时或回执不明先读取核对；仍需重试时原键、目标和参数完全不变。改变内容或合并冲突后才是新请求。

## 更新与批量

先读取卡片 ID 和 revision。调用 `sill_updateContent` 时使用下面的外层形状；示例 ID 与版本需替换为刚读到的值。

```json
{
  "id": "existing-card-id",
  "idempotency_key": "ad6a9eb8-9815-4912-a084-bc8f3dbe3dd5",
  "body": {
    "expectedRevision": 3,
    "changes": {
      "body": "## 结论\n\n范围已经确认。",
      "state": {"note": "下周讨论"}
    }
  }
}
```

省略的字段保留原值。`state` 按子字段合并；正文、数组、嵌套对象整体替换。改一项任务、附件或 PR 检查时，先保留原有其他项。字段不接受 null；要移除字段时用批量 `card.upsert` 整卡替换。空数组/空文本仍须满足卡片要求，例如不能清空待办全部 tasks 或文件卡全部 files。

批量使用 `sill_applyOperations` 的 `{idempotency_key,body:{operations,expectedRevision?}}`。新卡 `card.upsert` 传新 `card.id` 和 `before:null`；修改整卡带原始 `before` 或工作区版本。`card` 不带 state 和服务端字段，个人状态另用同批 `item.patch`；整卡替换须保留不改的事实；未知字段会被拒绝。示例和权限见 sill-operations 的 [操作协议](../../sill-operations/references/operations.md)。

单卡创建不自填 ID；更新不传服务端 `created_at`、`updated_at`、`revision`、`deleted` 到 changes。`expectedRevision` 是请求条件，不是卡片事实。

## 日期、单位与大小

- 日程 `start/end`、待办/提醒 `due`、卡片 `time` 及个人状态时间均为 Unix **毫秒**，按用户时区换算。当前时间附近的毫秒值是 13 位数字；10 位数字是秒，会被拒绝（`timestamp_not_unix_milliseconds`）。
- 换算先写出带时区的 ISO 时间，再转毫秒。例如北京时间 2026-10-19 10:00 写作 `2026-10-19T10:00:00+08:00`，对应 `1792375200000`。宿主能运行代码时用代码换算（JavaScript `Date.parse("2026-10-19T10:00:00+08:00")`），不要心算；写入后按[导入细节](import.md#核对与汇报)换算回来核对。
- 新建提醒必须有 `due`（`missing_reminder_due`），日程必须有 `start` 和 `end`。来源里的时间写进这些字段，不能只写在正文里。
- 原文、邮件或照片的 `publishedAt`、文件 `modifiedAt` 为 YYYY-MM-DD 或带时区 ISO 时间；只有日期就保留日期。PR `observedAt` 必须是带时区 ISO 时刻。
- `duration`、`chapters[].start`、`transcript[].start`、`state.playbackPosition` 和 `reading.add.seconds` 均为**秒**，用途彼此独立；`progress` 为 0–1 比例。
- `sizeBytes` 是非负安全整数字节数，不传 "2 MB"。MIME 使用标准类型字符串，不用扩展名代替。
- 单字段长度见 [字段字典](fields.md)；云端 HTTP/MCP 请求体还有 **512 KiB UTF-8 字节**上限，包含参数与 JSON 编码开销。多字节中文和转义会增加大小；500000 字的字段上限不保证一条请求能传完。
- 超限会被拒绝。可减少无关字段，或拆成几张主题独立的关联卡片。数组和正文整体替换，没有追加或分片上传，不能靠连续 update 拼接超限正文。必须一起成功的操作不能拆批。

## 写入前后检查

1. 读取当前工具定义。`images`、`publishedAt`、pr 类型或 playbackPosition 未出现，或仍出现 `sender`、`attachments`、`readingEstimate` 等旧字段时，说明当前宿主定义过旧，需要核对部署并刷新连接，不丢字段。
2. 检查类型必需结构、日期单位、来源、数组 ID 与状态。系统版本和时间由服务端生成。
3. 单卡成功后按返回 ID 重新读取；逐项比较本次提交的字段，允许服务端生成元字段和补齐默认状态。正文须保留换行，PR、媒体、文件等结构不得丢失。批量核对返回快照；需要最新状态时另读工作区。
4. 结果不明按 sill-operations 的操作协议处理；发生版本冲突先重读并合并。仅收到工具名、空响应或未检查的成功标记不算确认保存。
