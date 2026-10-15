---
name: sill-sidebar
description: 在 Codex 侧边栏打开 Sill 云端工作台，查看云端卡片。用户明确要求使用 Sill 侧边栏时使用。
---

# Sill · Codex 侧边栏

调用本插件 Sill 服务的 sill_open_workspace 打开全局工作台；需要在当前聊天旁展示卡片时调用 sill_open_cards。读取仍使用当前发现的 sill_listContents 和 sill_getContent。登录未完成时使用 Codex 正常插件授权入口，不能把入口安装成功当作账号已连接。

沿用用户现有的 Sill 云端账号和卡片。仅在用户明确要求写入时使用当前已授权的创建、更新和删除工具；更新、删除使用最新读取的 expectedRevision。结果未知时先核对，不盲目重复写入。

这是额外的 Codex 入口。保留原 Sill 产品插件，不卸载、不替换其身份或配置。秘密由宿主安全配置保管，不复制令牌、浏览器会话或本地卡片。
