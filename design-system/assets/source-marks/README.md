# 来源圆标

`marks.json` 是 Web 与 macOS 共用的单色来源图形和名称匹配表。Web 直接读取；Apple 构建插件导出同一份 JSON。只用于来源，不替换控件图标。

除 Readwise 和得到笔记外，图形取自 [Simple Icons 11.15.0](https://github.com/simple-icons/simple-icons/tree/11.15.0)，保留原始 24 × 24 路径。Readwise 和得到笔记按各自官网标志绘制为 24 × 24 单色路径，移除底色；不是官方提供的矢量文件。素材来源记录在 JSON 的 `source` 中。Simple Icons 许可见 [license.md](license.md)，不覆盖这两个官网品牌素材；图标库许可不替代各品牌的标志使用规则，发布前仍须逐项检查。

当前收录 12 个来源品牌：YouTube、Gmail、Google Calendar、Linear、Slack、Google Drive、GitHub、Apple Podcasts、X、Readwise、Todoist、得到笔记。后三者分别识别 `readwise`、`todoist`、`dedaobiji`，也支持表中的完整品牌名和「品牌 · 账户」。不把通用任务或笔记来源视为 Todoist 或得到笔记。

只按明确的品牌 kind、完整名称或「品牌 · 账户」匹配。`mail`、`calendar`、`podcast` 等通用类型不自动代表 Gmail、Google Calendar 或 Apple Podcasts。未识别的来源使用通用图标；不使用来源首字或远程图片。
