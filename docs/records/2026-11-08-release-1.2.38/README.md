# 1.2.38 发布

## 范围

发布云端 Web/PWA 与 MCP 页面，附内部 Mac 包。插件包未随本次发布，PR [#114](https://github.com/dabaige53/sill/pull/114) 修改的 `skills/sill-cards` 文档要单独发布插件包才会生效。

1.2.37 没有上线，它的改动随本次一起发布：

- 详情正文表格放进独立横向滚动框，手机上列宽不再塌缩（PR [#123](https://github.com/dabaige53/sill/pull/123)）。
- Mac 关闭卡片不再露出白框，放大缩小不再多出空白帧；Web 与 Mac 的概要标记和文字合成一个点击区域（PR [#121](https://github.com/dabaige53/sill/pull/121)）。
- Web 正文解析缓存、阅读写入改为离开时保存、卡片刷新去掉逐张扫描（PR [#125](https://github.com/dabaige53/sill/pull/125)）。
- Web 与 Mac 不再整库处理与下载，页面去掉误打包的 zod（PR [#126](https://github.com/dabaige53/sill/pull/126)）。

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
