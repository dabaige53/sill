# 1.2.31 发布

## 范围

云端 Web/PWA 与 MCP 页面，附内部 Mac 包（首次使用固定自签证书 `Sill Self-Signed`）。内容：短卡片可省略摘要、备份页精简、播客内容优先布局、视频概要位置、概要留白与文字色、Mac 固定签名。插件包保持 1.2.21。

## 数据库

发版前在生产执行 `20261103032753_shared_oauth_applications`。执行前生产 `sill_private.oauth_gateway` 源码 md5 为 `54cc85ac…`，与仓库上一版（`20261015012954`）一致；`oauth_applications` 不存在。执行后函数 md5 为 `0d16c2b5…`，与仓库新版一致，属主 `sill_consent_executor`；`oauth_applications` 开启 RLS，`anon`、`authenticated` 无读取权限，写入 2 条已启用的共享应用；`oauth_clients` 4 条、OAuth 授权 3 条保持不变。线上 Worker 不依赖该表。

## 首次正式流程失败

诊断见[发布检查失败](diagnosis.md)。
