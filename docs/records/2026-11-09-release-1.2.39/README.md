# 1.2.39 发布

## 状态与范围

2026-11-09，云端 Web/PWA、MCP 页面与内部 Mac 包已发布。用户在明确询问完整发布检查范围后确认继续发布；全部正式检查通过后使用同一次运行的产物部署。

个人插件在此前已单独更新到 1.2.38，本次未另发插件；数据库无迁移改动。状态：已部署，未做真实设备与宿主界面验收。

## 发布内容

- Web/PWA 与 Mac 支持 Markdown 正文 HTTPS 图片、加载与失败反馈和大图查看，见[图片修复记录](../2026-10-31-inline-images/README.md)。
- 整合本地分支、工作区和暂存内容，整理文档措辞，见[整合记录](../2026-11-08-local-task-consolidation/README.md)。
- 测试改用明确的事件或保存结果判断，减少按固定时长猜测完成状态。本轮及此前共改写 64 项，仍有 198 项待整理，见[测试整理记录](../2026-11-08-local-task-consolidation/test-debt.md)。本次运行检查已通过，剩余整理数量不表示新增运行失败。
- 修正候选检查发现的格式、类型和过期断言，并补回原文链接的原生跳转分支。内嵌宿主继续通过现有接口打开完整网址。失败、定位与复查见[诊断记录](diagnosis.md)。

## 源码与数据库

PR [#130](https://github.com/dabaige53/sill/pull/130) 合并到 main，tag `v1.2.39` 固定提交 `915f6023d108055e127ddebebf06ab2fb2c6d43e`。合并提交与通过候选检查的 `62e3c098` 文件内容一致。

与已发布的 `v1.2.38` 比较，`supabase/`、`server/cloud/` 无改动，`contracts/` 只修改 README。已读取线上 22 项迁移记录；`check_card`、`content_json` 和 `validate_card_changes` 函数正文与仓库对应迁移一致。对 82 张未删除卡片执行只读验证，82 张均通过当前校验，序列化正文均为字符串；没有修改卡片。已将 `production` 环境的 `SILL_DATABASE_VERIFIED_COMMIT` 设为上述完整提交号，并回读确认。

## 发布前线上状态

2026-11-09 通过 Cloudflare 连接读取现有 Worker `sill-web-preview` 的部署：

| 项 | 值 |
| --- | --- |
| 旧部署 | `833565ae-a56d-4ac2-b196-d08eb7f3d989` |
| 旧版本 | `ad86477a-aa00-4a17-a679-df121f554f83` |
| 流量 | 100% |
| 创建时间 | `2026-11-08T07:16:58.412816Z` |
| 已发布产品版本 | 1.2.38 |

上述部署与版本保留为本次回退依据。正式打包期间再次读取，部署仍为该版本；部署回执中的 previous 也与其一致。

## 检查结果

版本元数据用 `npm version 1.2.39 --no-git-tag-version --ignore-scripts` 更新，再以最终合并提交创建 tag。本地未运行完整测试或发布构建。

轻量检查通过：`npm run files:check`、`git diff --check`，以及 `package.json` 与 `package-lock.json` 两处版本值的一致性检查，退出码均为 0。

候选检查第三轮 `42568391559` 全部通过。正式 tag 运行 [42569123906](https://github.com/dabaige53/sill/actions/runs/42569123906) 的版本、集成、Web 静态及布局/导航/动效浏览器、PostgreSQL 与云端浏览器、授权策略、Swift、云端打包、Mac 打包和 publish 全部成功。

按原诊断报告的 recheck.command 对当前 20 个文件执行 LSP 复查：20 个 status 均为 passed，0 个错误、0 个未完成检查，另有 29 条非阻塞警告。整库类型检查与运行测试由上述 CI 提供证据。

## 发布结果

| 项 | 值 |
| --- | --- |
| 新部署 | `51ac355d-d16f-48a3-a520-8220d938d2b1` |
| 新 Worker 版本 | `eac7ec32-ea06-412b-b3ea-0aa371b06342`，100% 流量 |
| 部署时间 | `2026-11-09T05:57:42.72511Z` |
| 部署回执 | `verified`，tag 和完整提交号与本次源码一致 |
| GitHub Release | [v1.2.39](https://github.com/dabaige53/sill/releases/tag/v1.2.39)，prerelease，发布于 `2026-11-09T05:57:46Z` |
| Mac 附件 | `Sill-1.2.39-macOS-arm64-internal.dmg`，6,673,192 bytes |
| 附件一致性 | 下载同次 CI 的 DMG，其 SHA-256 与 Release 附件摘要一致 |

Cloudflare 回读确认现有 8 个绑定的名称和类型、兼容日期 `2026-10-14` 及 `nodejs_compat` 保持一致。云端文件保留在 `release-cloud`，Mac 包及检查回执在 `release-macos`，部署回执在 `release-receipt`。

Mac [打包回执](macos-package.json)确认版本、源码、arm64 架构、固定自签证书，以及磁盘映像、App 签名、应用程序快捷方式与 Finder 布局检查。未经 Apple 公证，未进行视觉验收。Release 正文已按实际回执写明固定自签证书。

## 发布后复查与未验证范围

| 检查 | 结果 |
| --- | --- |
| `GET /api/v1/health` | 200，`status: ready` |
| 未登录 `GET /api/v1/contents` | 401 |
| 未登录 `GET /auth/session` | 401 |
| 平台版本标识 | `v1.2.39` 与完整提交号匹配 |

以上 HTTP 结果使用与发布脚本一致的 Node fetch 复查。首次本机 Python 请求被 Cloudflare 以 `error code: 1010` 拒绝；同一地址的 Node 请求正常，未据此修改线上配置。

未安装新 Mac 包，未执行真实窗口、设备或宿主页面验收，未在宿主刷新工具。touchCancel 偶发失败的根因仍未证明；本次通过不替代根因结论。
