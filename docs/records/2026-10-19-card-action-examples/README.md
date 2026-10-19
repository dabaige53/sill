# 卡片操作设置的类型示例（U4.5）

2026-10-19。用户比较 A 保留现状、B 名称下方灰字、C 开关左侧灰字后，选择「B：名称下方灰字」。先写 [ADR 0042](../../adr/0042-card-action-type-examples.md)、手册与 Toggle 说明，再补回归和实现。只加适用类型示例，不改开关含义、顺序、状态或存储。Mac 未改。

候选来自隔离 localhost 的真实设置页，320 / 390 / 1440、浅色与深色三套共 18 张，均无横向溢出；B/C 仅注入临时灰字 DOM，不改产品源文件。最终另截实际实现。

公开参考：[Apple 设置](https://support.apple.com/en-mide/guide/iphone/iph7c3d96bab/27/ios/27)、[X 通知设置](https://help.x.com/en/managing-your-account/understanding-the-notifications-timeline)、[Things 设置](https://culturedcode.com/things/support/articles/2803567/)。参考轻设置的说明层次，不复制资产。

新增文案统一放在 zh-Hans.json。真机与 Safari 未检查；本地画板和未同步文件随原 PR #55 补齐，不访问线上设计或改变线上资产记录。
