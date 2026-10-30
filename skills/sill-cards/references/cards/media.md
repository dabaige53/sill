# media：视频和播客

视频（`media:"video"`）和播客单集（`media:"podcast"`）。`type` 都是 `media`。

示例是合成资料，只展示 `sill_createContent` 参数里外层的 `body` 对象，不能当作用户资料保存。通用要求见[类型索引](../types.md)，字段格式见[字段字典](../fields.md)。

## 显示

视频：卡面是封面 → 来源行（剩余时长）→ 标题，详情是播放器和章节。播客：卡面是来源行 → 标题 → 短摘要 → 节目条，详情是播客页，含章节和转录。

## 填写清单

| 字段 | 要求 | 怎么写 |
| --- | --- | --- |
| `media` | 必填 | `video` 或 `podcast` |
| `title` | 必填 | 节目或视频标题 |
| `summary` | 必写 | 这期讲了什么、值不值得看，一两句 |
| `url` | 必写 | 原视频或节目页面 |
| `images` | 视频必填 | 缩略图 HTTPS 地址 |
| `audioUrl` | 播客有就写 | 音频文件地址 |
| `duration` | 有就写 | 总秒数整数；不知道就省略，不写 0 |
| `chapters` | 有就写 | 原描述里的时间戳章节，秒数严格递增 |
| `transcript` | 有就写 | 带时间的转录 |
| `authors`、`publishedAt` | 有就写 | 频道或主播、发布日期 |
| `body` | 建议 | 节目笔记：要点、提到的资料 |
| `sources` | 必写 | `youtube`、`podcast` 等 |

## 写法

章节和转录的 `start` 是秒，不是毫秒，也不能超过 `duration`。

正文结构：

```markdown
## 节目笔记

- 要点

## 提到的资料

- [名称](https://…)
```

正文不会自动变成章节或转录，时间戳要写进结构字段。

## 示例

视频：

```json
{
  "type": "media",
  "media": "video",
  "title": "雨水收集桶的安装演示",
  "summary": "12 分钟看完从落水管分流到储水桶的完整安装，适合第一次动手的人。",
  "url": "https://www.youtube.com/watch?v=example1234",
  "images": [
    "https://example.com/video/rainwater-thumb.jpg"
  ],
  "duration": 720,
  "authors": [
    {
      "name": "庭院手作"
    }
  ],
  "publishedAt": "2026-10-18",
  "chapters": [
    {
      "start": 0,
      "title": "需要的材料"
    },
    {
      "start": 95,
      "title": "安装分流器"
    },
    {
      "start": 410,
      "title": "连接储水桶"
    },
    {
      "start": 640,
      "title": "试水和检查"
    }
  ],
  "body": "## 节目笔记\n\n- 分流器装在离地 1 米处\n- 储水桶要留溢流口\n\n## 提到的资料\n\n- [分流器安装说明](https://example.com/manual/diverter)",
  "sources": [
    {
      "name": "庭院手作",
      "kind": "youtube"
    }
  ]
}
```

播客：

```json
{
  "type": "media",
  "media": "podcast",
  "title": "小庭院的雨水计划",
  "summary": "两位主持人聊城市小庭院怎么收集和储存雨水，后半段讨论了冬季防冻。",
  "url": "https://example.com/episodes/12",
  "audioUrl": "https://example.com/audio/12.mp3",
  "duration": 1860,
  "authors": [
    {
      "name": "庭院电台"
    },
    {
      "name": "林青"
    }
  ],
  "publishedAt": "2026-10-20",
  "chapters": [
    {
      "start": 0,
      "title": "开场"
    },
    {
      "start": 240,
      "title": "收集"
    },
    {
      "start": 960,
      "title": "储存"
    },
    {
      "start": 1500,
      "title": "冬季防冻"
    }
  ],
  "transcript": [
    {
      "start": 0,
      "text": "欢迎收听庭院电台，今天聊小庭院的雨水。"
    },
    {
      "start": 240,
      "text": "先说收集，关键是落水管的分流。"
    }
  ],
  "body": "## 节目笔记\n\n- 储水桶放在背阴处可以减少藻类\n- 气温低于 0 度前要排空水管",
  "sources": [
    {
      "name": "庭院电台",
      "kind": "podcast"
    }
  ]
}
```

## 写入前自检

- 视频有 `images`
- `duration` 是秒，章节不超过时长
- 摘要说了这期的看点
