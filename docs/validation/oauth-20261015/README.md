# Sill 授权测试结果

2026-10-15。测试代码位于 tests/oauth-consent.test.mjs、tests/consent-policy.test.mjs、tests/supabase-http-session.test.mjs、tests/supabase-http-worker.test.mjs 和 tests/oauth-browser.mjs。合成身份提供方与隔离数据库，不代替生产真实账号验收。

## 结果

- 策略测试22项、授权流程测试18项、会话测试5项通过，共45项不同测试。
- 桌面1440px、手机390px两组浏览器测试通过：确认页、键盘操作、拒绝、批准、撤销及网页登录保留。该浏览器套件从预置登录态开始，未覆盖真实邮件投递与客户端令牌续期。
- 新增HTTP集成案例覆盖未登录进入、SDK登录回调、回到确认页，确认登录本身不授予权限；另覆盖不同浏览器、过期返回记录、宿主默认五项scope。

## 已复现的问题

1. 表单默认请求 openid profile email phone offline_access，而现有Sill策略仅接受openid，确认页返回403，阶段review。当前错误文案没有明确说明权限不匹配。拒绝未授权scope符合访问限制；问题在创建表单与服务策略不一致及提示不足，不应通过放宽所有权限处理。
2. 返回授权记录有效期10分钟。超时后完成登录，回调303到工作台根路径，丢失授权流程的可见状态，未提示“请重新发起授权”。这会让用户以为登录后没有继续或又需重试。
3. 在另一个浏览器打开登录回调时，缺少PKCE verifier，303回到 ?login_error=1；这不能证明用户实际曾跨浏览器，只确认该场景会失败。

## 尚未证明

用户真实账号登录成功后为何再次遇到登录页，仍需要同一浏览器完成邮件登录后的实际结果；不能从截图判断Cookie是缺失、过期、撤销还是被浏览器隔离。当前测试没有读取真实令牌、发送登录邮件、批准实际插件权限或修改生产配置。

本轮只增加复现测试和记录，未部署修复，也不声称授权问题已经全部解决。

## Password login deployment (2026-10-15 12:32 UTC)

- Standalone `/auth/login`: email/password via Supabase `signInWithPassword`; existing authenticated sessions resume without another prompt.
- Email fallback verifies an existing account, then opens `/auth/password/new`; authenticated password update requires same-origin POST and workspace access. No registration or automatic consent.
- Consent login link now opens standalone login. Valid pending requests resume confirmation; expired retained requests open `/oauth/expired` with restart instructions.
- Password login errors are uniform; credentials do not enter URLs, logs or browser storage. Sessions retain HttpOnly/Secure cookies and existing refresh handling.
- Review rejection now explains OAuth configuration mismatch. Existing client still permits only `openid`; the host's default five scopes must be reduced in setup. No permission expansion was deployed.
- Tests: 50 passing tests covering password login/setup, consent policy and flow, session renewal, App and Worker. Desktop1440 and mobile390 browser tests passed for password login→review→deny/approve/revoke. Two password tests rerun after adding existing-session redirect, passed.
- Browser evidence: `tests/artifacts/password-desktop.png`, `tests/artifacts/password-iphone12.png`.
- Uploaded SHA256: `54229545d415a6ce59ae5e78224217d285d8e63a2057e99afaaf5440aeec1002`.
- Worker version: `a4f54b35-5dd8-44fa-8b13-630b0d2bc82a`; deployment: `356ea12a-7496-42d5-b2f5-276603bcc763`; readback confirms 100%.
- Rollback version: `5679e191-8833-4703-b250-c04b280a5641`.
- Tests use synthetic Supabase accounts. Real user password login, email delivery, and final ChatGPT connection remain user acceptance checks. No account password or plugin installation was changed by the assistant.
- Public checks after deployment propagation: health200; `/auth/login`200 with password form; consent using a synthetic valid-format UUID401 with `/auth/login` link and return-context cookie; light/dark SVG200; protected-resource discovery200. First immediate probes briefly hit the previous version during propagation; repeat checks confirmed new routes. No real authorization ID or credentials used.

## 2026-10-15 21:03 CST — observed authorization scope failure fixed

Latest observed failed authorization at 20:59:53 CST requested `openid email offline_access`; owner and callback matched, while the client policy allowed only `openid`. The exact runtime regression reproduced HTTP403 before the fix and HTTP200 review after it. 41 consent/policy tests pass; six login/session tests also pass.

User explicitly approved adding email and offline_access and deploying. Updated only client `5caffdc3-f450-4664-bd81-a65a16eace73` identityScopes to those three scopes. Existing card scopes remain read/write/delete. Added offline_access support to the consent validator; requests still must be within the per-client allowlist. No automatic grants or approval performed.

Worker version `56001e2c-4bc7-4a7c-b2b0-b093261a476c`, deployment `509f67ec-4162-4bf1-89f8-5af4a256d19a`, 100% confirmed by readback. SHA256 `fe4708049044d0f43261b0d0ffb3f97356b8ff61c6add5223dd7e39637fe60e0`. Rollback Worker version `a4f54b35-5dd8-44fa-8b13-630b0d2bc82a`; rollback would also require restoring identityScopes to openid.

Updated same new plugin `Plugin_4d11050446608191815ac3be9ec53209` to1.1.1, release `pluginrel_6ad0cf1607808191a344ad7deb492fdd`. Cloud readback confirms base/default/OIDC scopes contain openid,email,offline_access. Old plugin objects not modified or removed. Earlier instructions saying only openid are superseded. Final real-account approval/token exchange and host App/sidebar visibility are not yet verified.
