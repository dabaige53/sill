# 1.2.38 发布

## 范围

2026-11-08 发布云端 Web/PWA 与 MCP 页面，附内部 Mac 包。插件包当时未随本次发布；2026-11-09 已单独更新个人插件到 1.2.38，包含 PR [#114](https://github.com/dabaige53/sill/pull/114) 及后续技能文档，见下方补充记录。

1.2.37 没有上线，它的改动随本次一起发布：

- 详情正文表格放进独立横向滚动框，手机上列宽不塌缩（PR [#123](https://github.com/dabaige53/sill/pull/123)）。
- Mac 关闭卡片不露出白框，放大缩小不多出空白帧；Web 与 Mac 的概要标记和文字合成一个点击区域（PR [#121](https://github.com/dabaige53/sill/pull/121)）。
- Web 正文解析缓存、阅读写入改为离开时保存、卡片刷新去掉逐张扫描（PR [#125](https://github.com/dabaige53/sill/pull/125)）。
- Web 与 Mac 按变动记录处理并按修订号下载，页面去掉误打包的 zod（PR [#126](https://github.com/dabaige53/sill/pull/126)）。

## 合并取舍

#125 和 #126 各写了一套正文缓存。合并时只保留 #126 的 `textMemo`，因为阅读时长也在用它；同时删除 #125 的闲置 10 分钟淘汰策略及其测试，现在按总字符数淘汰最久未用的内容。`text-memo.test.ts` 的解析次数断言改为 1。

## 数据库

无迁移。`supabase/` 在 `v1.2.36` 到 `v1.2.38` 之间没有改动；`contracts/` 只移动校验规则和拆分枚举，规则与取值不变。这是源码比对，没有查询线上数据库。用户运行命令把 `production` 环境的 `SILL_DATABASE_VERIFIED_COMMIT` 设为本次 tag 对应的提交。

## 1.2.37 未发布

`v1.2.37`（提交 `9f6a5479`）的正式流程 `42374642239` 检查和打包都通过，publish 因 `SILL_DATABASE_VERIFIED_COMMIT` 不匹配而停止，没有部署，也没有生成 Release。按先例保留失败的 tag，版本升到 1.2.38。

## 发布结果

PR [#127](https://github.com/dabaige53/sill/pull/127) 合并后打 tag `v1.2.38`，提交 `1edf92dd`。正式流程 `42456718646` 运行三轮后成功：

| 轮次 | 结果 | 原因 |
| --- | --- | --- |
| 1 | `web / browser (motion)` 失败，打包和发布跳过 | [touchCancel 用例偶发失败](diagnosis-touch-cancel-flake.md) |
| 2 | 检查和打包通过，publish 在部署前停止 | [核对变量设错作用域](diagnosis-verified-commit-scope.md) |
| 3 | 全部成功 | 只重跑 publish |

| 项 | 值 |
| --- | --- |
| 旧部署（回退依据） | `c51872cf-bdd8-41d9-9d69-56db780f6bad`，版本 `a99dd851-befe-436b-b3c1-b52ad26e22dc`（1.2.36） |
| 新部署 | `833565ae-a56d-4ac2-b196-d08eb7f3d989`，版本 `ad86477a-aa00-4a17-a679-df121f554f83`，100% 流量，回执 `verified` |
| GitHub Release | [v1.2.38](https://github.com/dabaige53/sill/releases/tag/v1.2.38)，prerelease，附件 `Sill-1.2.38-macOS-arm64-internal.dmg` |

## 发布后复查

| 检查 | 结果 |
| --- | --- |
| `GET /api/v1/health` | 200 `ready` |
| 未登录 `GET /api/v1/contents` | 401 |
| 未登录 `GET /auth/session` | 401 |

未安装新 Mac 包，未做界面和实机验收，未在宿主内刷新工具。

状态：已部署，未验收。

## 个人插件补充更新 · 2026-11-09

- 现有个人插件从 1.2.21 更新到 1.2.38，保留插件 ID、App ID、连接、展示配置与私人可见范围。
- 更新 21 份技能文件，补齐摘要例外、长摘要与各类卡片示例、字段和传输说明；两份 manifest 只更新版本。
- 旧 release：`pluginrel_6ae570f34fe48191a9ed2d1bc9ed3a78`；新 release：`pluginrel_6af11ecde3f08191a663f8a5bdc6da2f`。使用旧 release 条件更新成功，随后回读确认当前 release。
- 完整包回读：25 份技能及支持文件逐文件与仓库一致；文件清单、App 绑定和原有展示配置保持一致。JSON/YAML、技能相对引用与 ZIP 完整性检查通过。
- [现有个人插件](https://chatgpt.com/plugins/plugin_asdk_app_6ad0d805d3e88191a1c8902cf66af046)已保存新技能。当前聊天的技能目录可能仍显示旧缓存，尚未完成宿主刷新与实际写卡验收。
- Web、MCP 服务和 Mac 包未因这次技能更新重新部署；上述真机与界面验收仍待执行。
