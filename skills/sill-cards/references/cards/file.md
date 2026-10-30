# file：文件

记录一份或一组网盘、文件夹里的文件：名称、类型、大小和链接。不上传文件本身。

示例是合成资料，只展示 `sill_createContent` 参数里外层的 `body` 对象，不能当作用户资料保存。通用要求见[类型索引](../types.md)，字段格式见[字段字典](../fields.md)。

## 显示

卡面：来源行（文件数）→ 标题 → 摘要 → 前三个文件。详情：正文和完整文件列表。

## 填写清单

| 字段 | 要求 | 怎么写 |
| --- | --- | --- |
| `files` | 必填 | 每项至少有名称；MIME、字节数、修改时间、HTTPS 链接有就写 |
| `title` | 必填 | 这组文件是什么 |
| `summary` | 必写 | 用途和最重要的那份文件 |
| `body` | 建议 | 每份文件的说明、版本关系 |
| `sources` | 必写 | 网盘或文件夹写 `folder` |

## 写法

`sizeBytes` 是整数字节数，不写「2 MB」；不写本机路径和带令牌的分享链接。

正文结构：

```markdown
## 文件说明

- 文件名：用途
```

## 示例

```json
{
  "type": "file",
  "title": "产品评审材料",
  "summary": "评审用的 3 份文件，以 PDF 定稿为准。",
  "files": [
    {
      "name": "产品评审材料-定稿.pdf",
      "mimeType": "application/pdf",
      "sizeBytes": 482304,
      "modifiedAt": "2026-10-30T17:20:00+08:00",
      "url": "https://example.com/files/review-final.pdf"
    },
    {
      "name": "验收条件.xlsx",
      "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "sizeBytes": 18944,
      "modifiedAt": "2026-10-29",
      "url": "https://example.com/files/acceptance.xlsx"
    },
    {
      "name": "流程演示.mp4",
      "mimeType": "video/mp4",
      "sizeBytes": 36700160,
      "url": "https://example.com/files/demo.mp4"
    }
  ],
  "body": "## 文件说明\n\n- 产品评审材料-定稿.pdf：会上讲的版本\n- 验收条件.xlsx：每项条件和例子\n- 流程演示.mp4：3 分钟操作录屏",
  "sources": [
    {
      "name": "团队网盘",
      "kind": "folder"
    }
  ]
}
```

## 写入前自检

- `files` 非空，字节数是整数
- 链接不含令牌
