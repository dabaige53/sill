# 设计参考

更新：2026-10-23。此目录保存已采用的来源和原图；具体参数以[页面与交互](../handbook/interaction.md)、[基础与组件](../handbook/foundation.md)和[动效](../handbook/motion.md)为准。

## 主要参考

| 页面 | 来源 | 采用范围 | 本地原图 |
| --- | --- | --- | --- |
| 主页 | [Apple Music](https://mobbin.com/screens/8c345080-d9bd-4ad5-a6c7-8e5b32445b20) | 大标题、右上头像、内容层级；Sill 左上标题，头像进入设置 | [查看原图](apple-music-home.webp) |
| 搜索 | [Apple Music 顶部搜索栏](https://mobbin.com/screens/0fdc7e6a-e4aa-4c5a-8879-84396df1a589) | 顶部搜索栏、浅灰输入表面、分类卡片 | [查看原图](apple-music-search.webp) |
| AI 对话 | [X 应用内 AI 对话](https://mobbin.com/screens/cc84d28a-3220-439b-ac7a-18f7778642e4) | 留白内容区、圆角输入容器、附件与发送按钮、黑色语音胶囊 | [查看原图](x-ai-conversation.webp) |

AI 参考属于 **X 应用内页面**，不是独立 Grok 应用。原图展示生成中的状态，Sill 当前没有对话后端；附件、发送和语音控件禁用，不生成示例回复。页面不加入实现说明或设计备注。

主页和搜索保留 Sill 的卡片内容；不引入音乐广告或播放器。底部导航按用户确定的顺序显示「主页 / AI / 搜索」，设置从右上头像进入。搜索栏固定在顶部。

## 补充参考

以下保存来源链接，尚未归档本地原图。

| 来源 | 采用范围 |
| --- | --- |
| [Apple Music 分类网格](https://mobbin.com/screens/38013fe5-6e15-4038-9c0f-039bf66715c7) | 两列分类卡片；不采用该图的底部搜索栏位置 |
| [Apple Music 结果分类](https://mobbin.com/screens/6e9cc18e-6337-481f-91c5-d7ab3f09c247) | 搜索结果类型选项与列表层级 |
| [Medium 阅读页](https://mobbin.com/screens/9659e74b-ceec-4bb5-a80d-5e975a5bdb4e) | 简洁日期行；具体位置与来源备注规则见页面与交互手册 |
| [Linear 浮动 AI 面板](https://mobbin.com/screens/51c2bd60-f22d-4879-8c28-c5800ac1f4b6) | AI 面板浮在页面上、不加遮罩，可放大成完整视图；Sill 改为从底部 AI 框原地长高 |
| [Voicenotes 问 AI 面板](https://mobbin.com/screens/67d70fbc-5b27-4bf4-ad71-57642585c132) | 上下文以小标签放在对话上方，你的话靠右成灰色气泡，回复不加头像 |
| [ChatGPT 手机对话](https://mobbin.com/screens/10f190d9-afcf-456a-b86b-ceadedcc14ab) | 手机对话不加头像，AI 的话直接排在白底上；生成时发送键换成停止 |
| [Manus 任务步骤](https://mobbin.com/screens/a122d298-fe12-4027-a567-a7ec866c8c01)、[Bevel 结果卡](https://mobbin.com/screens/190268cc-f8d8-4ad6-aa2f-af64e5fd7177) | 助手的动作和结果在回复下方逐条列出，可点开；Sill 只列被改动的卡与真实写入状态 |

## 对应组件

- [GlassDock](../components/GlassDock/README.md)：底部三项胶囊。
- [SearchField](../components/SearchField/README.md)：Apple Music 搜索栏与分类。
- [AICompose](../components/AICompose/README.md)：X 对话输入框。

原图保持参考产品的原始内容，用于内部设计比对，不作为 Sill 的产品素材。
