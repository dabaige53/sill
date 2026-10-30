# pr：拉取请求

跟进一个 GitHub PR：等你审阅的、你提交的、要关注合并结果的。一张卡对应一个 PR，状态变化时更新同一张卡。

示例是合成资料，只展示 `sill_createContent` 参数里外层的 `body` 对象，不能当作用户资料保存。通用要求见[类型索引](../types.md)，字段格式见[字段字典](../fields.md)。

## 显示

卡面和详情都是 PR 专用视图：仓库与编号、状态、分支、审阅人、检查、增删统计。只有等你审阅时才出现「审阅」按钮。

## 填写清单

| 字段 | 要求 | 怎么写 |
| --- | --- | --- |
| `title` | 必填 | PR 标题 |
| `summary` | 必写 | 一句话说改了什么、现在卡在哪，例如「等你审阅，CI 全部通过」 |
| `pullRequest` | 必填 | `repository`、`number`、`state`、`observedAt` 必填；分支、审阅人、检查、增删数有就写 |
| `url` | 必写 | PR 地址 |
| `body` | 建议 | 改动要点、验证方式、需要你看的地方 |
| `sources` | 必写 | `{name:"owner/repo",kind:"github"}` |

## 写法

`observedAt` 是你读取 PR 的时刻，不是 PR 创建时间。`reviewRequested` 只在确实请求了当前用户审阅时写 `true`。

正文结构：

```markdown
## 改动

- 要点

## 验证

检查方式和结果

## 需要关注

审阅时重点看的地方
```

正文写给要审阅的人看，不复制整段 diff。

## 示例

```json
{
  "type": "pr",
  "title": "导出结果增加字段说明",
  "summary": "等你审阅：导出文件新增字段说明表，3 项检查全部通过。",
  "url": "https://github.com/example/project/pull/42",
  "body": "## 改动\n\n- 导出的 CSV 首行后增加字段说明\n- 说明文字与界面文案共用一份来源\n\n## 验证\n\n导出 3 种类型的卡片，用表格软件打开核对表头。\n\n## 需要关注\n\n字段说明的顺序是否和界面一致。",
  "sources": [
    {
      "name": "example/project",
      "kind": "github"
    }
  ],
  "pullRequest": {
    "repository": "example/project",
    "number": 42,
    "state": "open",
    "observedAt": "2026-10-30T10:00:00+08:00",
    "headBranch": "docs/export-fields",
    "baseBranch": "main",
    "reviewRequested": true,
    "reviewers": [
      {
        "login": "wu",
        "decision": "pending"
      }
    ],
    "checks": [
      {
        "name": "lint",
        "status": "completed",
        "conclusion": "success"
      },
      {
        "name": "test",
        "status": "completed",
        "conclusion": "success"
      },
      {
        "name": "build",
        "status": "completed",
        "conclusion": "success"
      }
    ],
    "additions": 48,
    "deletions": 6,
    "changedFiles": 3
  }
}
```

## 写入前自检

- `pullRequest` 四个必填项齐全，`observedAt` 带时区
- 同一个 PR 已有卡片时更新原卡，不新建
- 摘要写清当前状态和下一步
