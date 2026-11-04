# 1.2.34 发布

## 范围

云端 Web/PWA 与 MCP 页面，附内部 Mac 包；插件包保持 1.2.21。内容：

- 邀请制账号流程：登录页说明仅限受邀使用；邮件开关开启时提供「忘记密码或首次登录？」与邮件登录；修改密码须输入当前密码；退出所有设备；设置中的插件授权入口，授权列表显示应用名。Web 与 Mac 同步。
- 未登录访问授权确认、插件授权管理、修改密码页时，直接跳转登录页，登录后回到原页面。
- Mac 关闭窗口（⌘W）不退出应用；点 Dock 或通知重新打开并刷新内容；关窗时释放阅读层和面板。

## 数据库

无迁移。`supabase/` 自 1.2.33（`77add1b4`）起无改动；`SILL_DATABASE_VERIFIED_COMMIT` 设为本次 tag 提交。

## 发布结果

PR [#116](https://github.com/dabaige53/sill/pull/116) 合并，tag `v1.2.34`，提交 `9ff63bdd`。正式流程 `41754553270` 全部检查、云端包、Mac 包与发布均成功。

| 项 | 值 |
| --- | --- |
| 旧部署（回退依据） | `ec60fcaf-4b03-4bf6-8852-9821dd2a1292`，版本 `28603ec7-ef9a-4eb4-b6a4-932c171fff46`（1.2.33 代码 + 邮件开关） |
| 新部署 | `97c3578a-9fd7-425c-9110-30697f898242`，版本 `48ba2063-e5f1-4433-86d0-9aa67d7d48d5`，100% 流量，回执 `verified` |
| GitHub Release | [v1.2.34](https://github.com/dabaige53/sill/releases/tag/v1.2.34)，prerelease，附件 `Sill-1.2.34-macOS-arm64-internal.dmg` |

## 发布后复查

| 检查 | 结果 |
| --- | --- |
| `GET /api/v1/health` | 200 `ready` |
| 未登录 `GET /api/v1/contents` | 401 |
| `GET /auth/options` | 200 `{"emailLogin":true}` |
| 未登录 `/oauth/consent`、`/oauth/grants`、`/auth/password/new` | 303 到 `/auth/login` |
| `GET /auth/login` | 含「忘记密码或首次登录？」与邀请制说明 |

未发送测试邮件，未做收信、设置密码、重新登录、浏览器或 Mac 窗口验收。

状态：已部署，未验收。
