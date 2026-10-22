# 来源圆标

`marks.json` 是 Web 与 macOS 共用的单色来源图形和名称匹配表。Web 直接读取；Apple 构建插件导出同一份 JSON。只用于来源，不替换控件图标。

图形取自 [Simple Icons 11.15.0](https://github.com/simple-icons/simple-icons/tree/11.15.0)，保留原始 24 × 24 路径。项目许可见 [license.md](license.md)；每个图形的官方来源与品牌规则地址记录在 JSON 中。图标库许可不替代各品牌的标志使用规则，发布前仍须逐项检查。

只按明确的品牌 kind、完整名称或「品牌 · 账户」匹配。`mail`、`calendar`、`podcast` 等通用类型不自动代表 Gmail、Google Calendar 或 Apple Podcasts。未识别的来源使用通用图标；不使用来源首字或远程图片。
