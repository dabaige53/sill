# 1.2.32 发布

## 范围

云端 Web/PWA 与 MCP 页面，附内部 Mac 包（首次使用固定自签证书 `Sill Self-Signed`）。内容：短卡片可省略摘要、备份页精简、播客内容优先布局、视频概要位置、概要留白与文字色、Mac 固定签名。插件包保持 1.2.21。

## 数据库

发版前在生产执行 `20261103032753_shared_oauth_applications`。执行前生产 `sill_private.oauth_gateway` 源码 md5 为 `54cc85ac…`，与仓库上一版（`20261015012954`）一致；`oauth_applications` 不存在。执行后函数 md5 为 `0d16c2b5…`，与仓库新版一致，属主 `sill_consent_executor`；`oauth_applications` 开启 RLS，`anon`、`authenticated` 无读取权限，写入 2 条已启用的共享应用；`oauth_clients` 4 条、OAuth 授权 3 条保持不变。线上 Worker 不依赖该表。

## 1.2.31 未发布

`v1.2.31` 正式流程检查失败，未生成 Release、未部署。修复合并后，重新指向该 tag 需要强制推送，未执行；版本改为 1.2.32 重新发布，旧 tag 保留在失败提交 `f3b884e5`。诊断见[发布检查失败](diagnosis.md)。

## 发布结果

tag `v1.2.32`，提交 `a34c7cbc`。正式流程 `41593058066` 全部检查、云端包、Mac 包与发布均成功。

| 项 | 值 |
| --- | --- |
| 旧部署（回退依据） | `d016ea6f-ecbb-408a-aec9-52720aa39944`，版本 `d34e3a1e-260a-46dd-8b5a-4eaac92cff08` |
| 新部署 | `29c94987-9508-438f-91f2-8faaf2395cc1`，版本 `c763c6d6-8993-4316-9813-800cc1694d34`，100% 流量，回执 `verified` |
| GitHub Release | [v1.2.32](https://github.com/dabaige53/sill/releases/tag/v1.2.32)，prerelease，附件 `Sill-1.2.32-macOS-arm64-internal.dmg` |

发布后复查：`/api/v1/health` 返回 200 `ready`；未登录 `POST /mcp` 返回 401。插件包未变。未做浏览器、MCP 宿主页面、Mac 窗口或钥匙串真机验收；固定签名对钥匙串询问的效果待用户安装后确认。

状态：已部署，未验收。
