# 账号开通与找回

更新：2026-11-03。Sill 采用邀请制：不开放自助注册，账号由管理员开通。

## 用户可用的账号操作

| 操作 | Web | Mac | 依赖 |
| --- | --- | --- | --- |
| 密码登录 | 登录页 | 登录页 | 账号已开通 |
| 忘记密码 / 首次设置密码 | 登录页「忘记密码或首次登录？」→ 邮件链接 → 设置新密码 | 同一入口，邮件链接回到 Mac 应用 | `EMAIL_LOGIN_ENABLE=true` 且发信服务可用 |
| 邮件链接登录 | 登录页 | 登录页 | 同上 |
| 修改密码 | 设置 → 数据 → 修改密码，须输入当前密码 | 设置 → 数据 → 修改密码 | 已登录 |
| 管理插件授权 | 设置 → 数据 → 管理插件授权（`/oauth/grants`） | 同一入口，在浏览器打开 | OAuth 同意页已启用 |
| 退出登录 | 退出当前浏览器；同浏览器其他标签页随之退出 | 退出本机应用 | — |
| 退出所有设备 | 设置 → 数据 → 退出所有设备 | 同左 | 插件授权不受影响 |

邮件功能关闭时，登录页不显示邮件入口，改为提示联系管理员重置密码。两端登录页都说明仅限受邀使用。

## 开启邮件功能

1. 在 Supabase 控制台 Authentication → Emails 配置自定义 SMTP。默认发信服务只发给项目成员且有严格频率限制。
   发件地址必须是已在发信服务验证过的自有域名。配置后在 Authentication → Rate Limits 按需调整每小时发信上限。
   找回和登录都使用 Magic Link 模板；可改成中文，但须保留 `{{ .ConfirmationURL }}`。
2. 在 Authentication → URL Configuration 的允许回调中保留 `<APP_ORIGIN>/auth/callback` 与 `<APP_ORIGIN>/auth/callback?client=macos`。
3. 在 Worker 设置中新增普通变量 `EMAIL_LOGIN_ENABLE=true`，按[快速发布](release-runbook.md)的方式保留其他绑定。
4. 用测试账号走一次「忘记密码」，确认收信、设置新密码和重新登录；Web 与 Mac 分别记录。

## 邀请开通账号

需要管理员权限，在 Supabase SQL 编辑器或已授权的数据库连接中执行。

1. 在 Authentication → Users 选择 Add user → Create new user，填写邮箱，勾选自动确认，不需要设置密码。
2. 为该账号建立工作区和 Web 访问权限：

```sql
insert into sill_private.workspaces(owner_id)
select id from auth.users where email = lower('<邮箱>')
on conflict (owner_id) do nothing;

insert into sill_private.caller_grants(owner_id, caller_id, scopes, resources, audience)
select id, 'user:' || id, array['content:read','content:write','content:delete'], array['*'], 'authenticated'
from auth.users where email = lower('<邮箱>')
on conflict (owner_id, caller_id) do nothing;
```

3. 通知用户打开登录页，点「忘记密码或首次登录？」设置密码。邮件功能未开启时，由管理员在控制台为其设置初始密码并通过安全渠道告知。

停用账号时，在 Authentication → Users 封禁或删除该用户；删除前先确认是否需要导出或备份其工作区。
