# 日程专属操作优先级（U4.1）

2026-10-19。用户查看 320 / 390 / 1440、浅色与深色实际页面临时效果后，选择「B：换成忽略此提醒」。显示「加入」时，第三个专属操作优先忽略提醒；下载保留为隐藏其他操作后的补位项。没有显示加入时保持原顺序。先写 [ADR 0040](../../adr/0040-event-reminder-priority.md)、手册和 Dialog 说明，再补回归与实现。

公开参考：[Apple 日历](https://support.apple.com/en-ca/guide/iphone/iphdafdf98a1/27/ios/27)、[Google Meet / Calendar](https://support.google.com/meet/answer/9303069?hl=en-IN)、[Fantastical](https://flexibits.com/fantastical/help/settings)。这些链接作为成熟产品的入口与提醒取舍参考，不复制产品资产。

方案 A 保留加入、再提醒、下载；方案 B 用既有忽略图标替代第三位下载。临时方案仅修改隔离页面 DOM，不改产品源文件。实现后另截实际页面，不能把临时方案当成改后证据。只用合成卡片，不包含账号、token 或浏览器存储。最终截图、检查与线上未同步清单随本包 PR 补齐。Mac 未改；真机与 Safari 未检查。
