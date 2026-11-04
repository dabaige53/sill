# Resend 发信与 Supabase SMTP 配置

日期：2026-11-04。范围：Sill 的发信域名、Supabase Auth 配置和现有 Worker 的邮件开关。未发布新的应用代码，未修改数据库或 Mac 安装包。

## 已完成

- 用户选择 `wwyyycloud.com`，发件地址为 `noreply@sill.wwyyycloud.com`，显示名称为 `Sill`。
- 通过 Resend CLI 创建 `sill.wwyyycloud.com`，域名 ID 为 `59bd132e-41a4-488a-87cf-73145543be3b`。
- 在 Cloudflare 添加 DKIM TXT、发信返回地址的 MX 与 SPF TXT、`rsend.sill` CNAME，共四条记录。Resend 重新读取结果全部为 `verified`。
- Supabase 项目 `moeabktxrgidrdkplvac` 的 SMTP 配置为 `smtp.resend.com:465`，用户名为 `resend`。密码已配置，不记录其内容。
- 保留 Web 回调，并补充 Mac 回调：
  - `https://sill-web-preview.scs1213-temp-email.workers.dev/auth/callback`
  - `https://sill-web-preview.scs1213-temp-email.workers.dev/auth/callback?client=macos`
- 发信上限由默认服务的每小时 2 封调整为每小时 30 封。保留 `disable_signup=true`，未修改邮件模板或其他登录策略。
- 在 `sill-web-preview` 添加普通变量 `EMAIL_LOGIN_ENABLE=true`。重新读取确认原有七个绑定全部保留。

Supabase 写入后已重新读取，SMTP 非秘密字段、回调地址与发信上限均与目标一致。

## Worker 配置部署

这次只更新设置，沿用线上 1.2.33 的代码。操作时本地 HEAD 为 `5ac8837e63386ba2a93493940e8d72c6afbabfec`，未上传该提交的构建产物。

| 项目 | 标识 |
| --- | --- |
| 原 deployment | `5ef69dc9-ded9-4139-8be5-a9bb0183f336` |
| 原 version | `abe6c9ef-36e1-49a3-9d9a-2eee14e09948` |
| 新 deployment | `ec60fcaf-4b03-4bf6-8852-9821dd2a1292` |
| 新 version | `28603ec7-ef9a-4eb4-b6a4-932c171fff46` |
| 新 version 流量 | 100% |

需要撤回 Worker 配置时，可按发布操作手册核对当前部署后切回原 version。该操作不撤回 Resend DNS 或 Supabase SMTP 配置。

## 检查与限制

- `GET /api/v1/health` 返回 200，状态为 `ready`。
- 未登录 `GET /api/v1/contents` 返回 401。
- `GET /auth/login` 返回 200。
- `GET /auth/options` 返回 404。通过 Cloudflare API 只读检查线上代码，未发现 `EMAIL_LOGIN_ENABLE` 或 `/auth/options`，说明线上尚未包含读取开关的实现。
- 旧登录页包含邮件表单，但没有新版「忘记密码或首次登录？」文案；不能据此认定新版密码找回流程已可用。
- 本机直接连接 SMTP 的检查在 TLS 阶段中断，未验证 SMTP 认证；这不等于 Supabase 发信失败。
- 未发送测试邮件，未执行收信、设置密码、重新登录或 Mac 界面验收。

发信配置已就绪。完整密码找回流程仍需发布包含该功能的代码，再按获准范围验收。
