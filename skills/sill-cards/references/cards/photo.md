# photo：照片

一组已在网上的照片（在线相册、图片链接）。本机照片不能上传。

示例是合成资料，只展示 `sill_createContent` 参数里外层的 `body` 对象，不能当作用户资料保存。通用要求见[类型索引](../types.md)，字段格式见[字段字典](../fields.md)。

## 显示

卡面：图片拼贴 → 来源行（张数）→ 标题 → 摘要（照片说明）。详情是大图页。

## 填写清单

| 字段 | 要求 | 怎么写 |
| --- | --- | --- |
| `images` | 必填 | HTTPS 图片地址，第一张作封面 |
| `title` | 必填 | 这组照片拍的是什么 |
| `summary` | 必写 | 照片说明：时间、地点、内容的客观描述 |
| `publishedAt` | 有就写 | 拍摄日期 |
| `location` | 有就写 | 拍摄地点 |
| `sources` | 必写 | 在线相册写 `photos` |

## 写法

说明只写照片里能看到的，不编造人物和事件。

正文结构：

```markdown
补充背景。
```

## 示例

```json
{
  "type": "photo",
  "title": "十月的海岸线",
  "summary": "傍晚退潮后的海岸，三张从北往南拍，礁石露出水面。",
  "images": [
    "https://example.com/photos/coast-1.jpg",
    "https://example.com/photos/coast-2.jpg",
    "https://example.com/photos/coast-3.jpg"
  ],
  "publishedAt": "2026-10-12",
  "location": "东海岸步道",
  "body": "退潮在 17:40 左右，礁石能走到第二块。",
  "sources": [
    {
      "name": "家庭相册",
      "kind": "photos"
    }
  ]
}
```

## 写入前自检

- 图片都是 HTTPS 地址，不含账号或令牌
- 说明只描述能看到的内容
