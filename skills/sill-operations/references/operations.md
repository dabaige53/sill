# 云端操作协议

只使用当前连接发现的工具，以本次发现的 inputSchema 为准。实际部署与宿主缓存可能落后于本文；没有发现工具时报告缺少能力，不声称已经执行。

目录：[查询](#查询筛选与导出)、[更新](#单卡更新)、[批量](#原子批量操作)、[状态](#完整卡片状态)、[阅读记录](#阅读记录)、[账号](#账号条件)、[错误](#冲突权限与未知结果)。偏好、备份与提醒见 [设置与备份](settings.md)；字段类型与制作格式见 sill-cards 的 [字段字典](../../sill-cards/references/fields.md)、[传输规则](../../sill-cards/references/transport.md)。

## 查询、筛选与导出

有 ID 时调用 `sill_getContent({"id":"实际ID"})`。

按标题、链接或内容里的词查找时，调用 `sill_searchContents({"query":"雨水 储水","limit":20})`：

- 空格分开的每个词都要出现，不分大小写；查标题、摘要、正文、标签、来源、作者、链接和个人备注，包括已归档的卡片。
- 返回 `total` 和最多 `limit`（默认 20，最多 50）条精简结果：ID、类型、标题、摘要、命中处的正文片段、链接、来源、标签、日期、`archived` 和 `revision`，不含正文。
- 标题、摘要、标签命中的排前面，其余按写入时间从新到旧。`total` 大于返回条数时，换更具体的词再搜。
- 结果为空只说明这些词都不在卡片里；换同义词或更短的词再搜一次，再下「没有」的结论。

需要逐张遍历时分页调用 `sill_listContents`；它只有 `cursor / since / limit`，limit 为 1–100，没有关键词、类型或归档筛选参数。按 `next_cursor` 读完相关分页，再判断是否存在或全部完成。`since` 只能使用服务端返回的 `sync_cursor`；游标过期后重做全量。

有整个工作区读取权限时，调用 `sill_getWorkspace({})`，返回：

```json
{
  "revision": 12,
  "state": {
    "cards": [],
    "items": {},
    "preferences": {},
    "seconds": 0
  }
}
```

实际 `cards` 是完整云端卡片记录，含归档卡片，不含已删除卡片；`items` 以卡片 ID 为键，包含完整状态及默认值；`preferences` 包含偏好及默认值。示例空对象只说明结构，不代表实际默认值为空。`revision` 是整个工作区的版本，与卡片的 `revision` 不同。

卡片多、只需要找卡或统计时，调用 `sill_getWorkspace({"compact":true})`：返回同样的结构，加上 `"compact": true`；每张卡去掉 `body`、`chapters`、`transcript`，多一个 `bodyChars`（正文字数）。精简卡片只能用来读：不能作为批量写入的 `card` 或 `before`，服务端会拒绝；要改哪张卡，先按 ID 读取完整卡片。

在返回快照中按标题、正文、类型、标签、状态或 URL 筛选。用户要求导出时，用完整快照生成所需文件；不把导出文件当成 Sill 支持文件导入的承诺。只有单卡权限时不能读取整个工作区；不得换接口绕过范围限制。同名卡片应比较来源、URL、正文与日期；无法唯一确定时询问。相同标题不足以判定重复。

已有内容由助手通过 MCP 编辑；用户只速记或新增，不需要打开结构化编辑界面。页面的轻量阅读、收藏和任务状态动作不属于内容编写。

## 单卡更新

先调用 `sill_getContent`，再把该卡片的 `revision` 用于 `sill_updateContent`：

```json
{
  "id": "existing-card-id",
  "idempotency_key": "4e0ebdb4-4903-46b9-b10a-dddb71eb50f7",
  "body": {
    "expectedRevision": 3,
    "changes": {"summary": "更新后的摘要", "state": {"read": true}}
  }
}
```

示例 ID、版本、幂等键须换成实际值。`changes` 只发送修改字段；`state` 合并子字段。数组整体替换，先保留不需改动的元素；嵌套对象也整体替换，例如改 `pullRequest.checks` 时保留其他快照字段。没有变化就不写入。字段不接受 `null`；要移除字段时用 `card.upsert` 整卡替换。空数组、空文本还须满足卡片规则。

不要把读取结果中的 `id`、`revision`、`created_at`、`updated_at`、`deleted` 等服务端字段塞进 `changes`。未知卡片字段会被拒绝。

## 原子批量操作

`sill_applyOperations` 的参数为 `{idempotency_key, body:{operations, expectedRevision?}}`。一次最多 5000 项，整个请求最多 512 KiB；超过限制先报告，不能把要求一起完成的清空操作拆成可能只完成一半的多个请求。所有项一起成功或一起回滚。调用方须能读取整个工作区，每项还须有相应写入或删除权限。

| 操作 | 参数与条件 |
| --- | --- |
| `card.upsert` | `card` 是包含 ID 的卡片字段；新建必须提供 `before:null`，ID 由调用方生成且不能复用。修改带读取时的原卡片 `before`，或提供工作区 `expectedRevision` |
| `card.delete` | `id` 加原卡片 `before`，或提供工作区 `expectedRevision`；按用户明确指定的集合删除 |
| `item.patch` | `id`、`values` 加原状态 `before`，或提供工作区 `expectedRevision`；没有全局版本时，`before` 必须覆盖每个修改字段 |
| `preferences.patch` | `values` 加原偏好 `before`，或提供工作区 `expectedRevision`；没有全局版本时，`before` 必须覆盖每个修改字段 |
| `reading.add` | `seconds` 为 0–86400 的整数；原子累加，可不带 `before` 或全局版本，仍须幂等键 |

整卡 `before` 可保留读取时的云端元字段；比较内容时不使用这些元字段。写入的 `card` 必须去掉 `state`、`revision`、`created_at`、`updated_at`、`deleted`，不能提交 `owner_id`、`change_version`。卡片 ID 保留在 `card.id`。卡片、状态与偏好都只接受已定义字段，未知字段会被拒绝。不要用刚刷新的基准包装旧草稿来强制覆盖冲突。

以下示例将收藏、备注和主题一起保存；`before` 必须来自实际读取：

```json
{
  "idempotency_key": "c5017f49-7226-4485-8122-e176528429c9",
  "body": {
    "operations": [
      {"op":"item.patch", "id":"existing-card-id", "values":{"bookmarked":true,"note":"下周讨论"}, "before":{"bookmarked":false,"note":""}},
      {"op":"preferences.patch", "values":{"theme":"dark"}, "before":{"theme":"system"}}
    ]
  }
}
```

新建整卡示例：

```json
{
  "idempotency_key": "d6b99679-978f-4576-896c-4eb2fef6f398",
  "body": {
    "operations": [
      {"op":"card.upsert", "card":{"id":"note-20261016-review","type":"note","title":"评审结论","body":"按已确认的计划推进。"}, "before":null}
    ]
  }
}
```

已读取工作区版本后，可用同一 `expectedRevision` 保护偏好修改和阅读记录：

```json
{
  "idempotency_key": "de537c53-8731-44f3-bac4-c40247a3c4a5",
  "body": {
    "expectedRevision": 12,
    "operations": [
      {"op":"preferences.patch", "values":{"sort":"unread","density":"compact"}},
      {"op":"reading.add", "seconds":60}
    ]
  }
}
```

批量删除先读取并确定目标，构造每张卡片的 `{op:"card.delete",id,before}`，或用已读取的工作区版本保护整批。清空只表示删除这次明确读取的全部卡片；并发新增内容会使全局版本保护失败。没有无条件 `delete all`。归档用 `item.patch` 的 `archived:true`；恢复设为 `false`，不能用删除代替归档。

## 完整卡片状态

状态放在 `item.patch.values` 或单卡 `changes.state`，不混进 `card`。以下字段均可由 AI 按用户要求操作；它们只记录 Sill 状态。

| 字段 | 类型与范围 | 含义 |
| --- | --- | --- |
| `seen` | boolean | 已看见 |
| `read` | boolean | 已读 |
| `bookmarked` | boolean | 收藏 |
| `later` | boolean | 稍后看 |
| `playbackPosition` | number，0–86400 秒，可含小数 | 实际播放位置；独立于阅读进度，保存位置不自动标记已读 |
| `progress` | number，0–1 | 阅读进度 |
| `note` | string，最多 4000 字符 | 备注 |
| `taskDone` | ID[]，最多 100 项 | 已完成子任务；每个 ID 必须属于该卡片的 `tasks` |
| `addedAt` | number，0–8.64e15 | 加入时间，毫秒时间戳；0 表示未设置 |
| `snoozedUntil` | 同上 | 稍后显示的截止时间 |
| `dismissed` | boolean | 隐藏提醒或时效提示 |
| `reminderDone` | boolean | 提醒完成 |
| `lastReminderKey` | string，最多 200 字符 | 上次提醒标识 |
| `lastNotifiedAt` | number，0–8.64e15 | 上次通知时间；记录不代表通知执行器存在 |
| `readAt` | 同上 | 阅读时间 |
| `restoredAt` | 同上 | 恢复时间 |
| `done` | boolean | 兼容完成状态；任务卡与 `taskDone` 同步，提醒卡与 `reminderDone` 同步 |
| `archived` | boolean | 已归档；工作区快照仍包含卡片 |
| `lessLike` | boolean | 减少同类内容偏好，供当前页面排序和助手读取 |

任务卡设 `done:true` 会完成所有子任务；设 `false` 会清空完成列表。修改 `taskDone` 时，`done` 随全部任务是否完成变化。不要同时提交互相矛盾的完成字段。缺失状态采用服务端默认值：布尔值为 false，数字为 0，文本为空；未设置 `taskDone` 时为空列表。标签是卡片字段 `tags`，用户或助手编辑标签就是修改卡片。

## 阅读记录

`reading.add` 原子累加工作区阅读秒数，单次 0–86400 的整数，总值不能超过 10000000。读取快照核对结果；回执不明时同键同参数重试，不换键重复累加。偏好字段与 `preferences.patch` 的取值见 [设置与备份](settings.md)。

## 账号条件

宿主页面从 `sill_open_workspace` / `sill_open_cards` 的结果取得稳定 `userId`；浏览器可从 `/auth/session` 取得账号与有效 scopes、工作区读取/写入标志。数据工具可选传 `expected_owner`，HTTP 可选带 `X-Sill-Owner`。条件必须等于实际鉴权账号，否则返回 forbidden，读取与写入均不执行。普通 AI 调用可不传，仍须正常授权。

该条件只防账号切换，不代表身份声明或额外授权。重试旧请求时保留原账号条件；当前账号不同就停止，保留内容供原账号恢复或复制，不把草稿、阅读累加或未知结果重放到新账号。账号一致也仍需检查工具、资源、版本及幂等条件。

## 冲突、权限与未知结果

| 结果 | 处理 |
| --- | --- |
| 明确成功 | 核对返回快照；单卡写入后按 ID 重读，确认实际字段 |
| `revision_conflict` | 重读，保留他人更新，仅重新应用用户要求；合并后使用新幂等键 |
| 超时、断线、回执不明 | 保留原键、目标及完整参数；可读取核对，仍不确定时同键同参数重试，不换键重复创建或累加 |
| `idempotency_conflict` | 检查是否误用旧键配不同请求；不要盲目重试 |
| `not_found` | 区分不存在、已删除或当前范围不可见；不自动另建替代卡 |
| `invalid_request` | 读 `error.issues` 中的 `path` 与 `message`，按提示修正对应字段后用新幂等键提交；不删字段凑通过。卡片规则代码见 [排障](diagnosis.md#卡片规则代码) |
| `cursor_expired` | 去掉 `since`，从第一页重新全量读取 |
| `unauthenticated / forbidden` | 停止受阻操作，使用正常连接入口处理；不换账号、不扩大权限 |
| `rate_limited` | 遵循等待提示；同一写入重试保留原键 |
| `unavailable` | 服务暂时不可用；读操作可稍后重试，写操作按「回执不明」处理 |
| 工具缺失或参数不接受字段 | 检查部署与当前连接定义；不静默丢字段并声称完整保存。见 [排障](diagnosis.md) |

每次新写入使用新 UUID 作为幂等键。批量成功回放返回原快照，可能早于后续编辑；需要最新状态时另读 `sill_getWorkspace`。删除由明确回执确认；一次列表未出现或权限错误不能证明删除成功。单卡删除仍支持 `{id,idempotency_key,body:{expectedRevision}}`。

事件工具只用于已配置且已授权的事件。`queued / accepted` 不表示外部执行完成。当前没有 Webhook 投递器、内置助手或可靠执行器；批量操作不接受事件 `metadata`，不能用它伪造事件结果。外部执行使用助手宿主的工具，并核对真实回执。

## 卡片字段

完整字段、适用类型与日期/时长规则见 sill-cards 的 [字段字典](../../sill-cards/references/fields.md)；正文与结构化内容按 [传输规则](../../sill-cards/references/transport.md) 传递。
