# Sill 图标、插件与网页登录续期验收

> 更正：下文是此前操作记录，其中“唯一插件”“原云端插件”判断不准确。0.1.3 发布对象是独立侧边栏包装插件，原 App 插件仍为1.0.1，另有旧 quiet-glass 0.5.3。当前状态与未关闭障碍以 [现状盘点](../2026-10-15-status/README.md) 为准；本地安装步骤已停止。

2026-10-15。已按用户确认先发布 Worker，再更新原云端插件至0.1.3。本次发布未执行本地插件安装。

## 图标与文案

产品全名为 Sill · 窗台，侧边栏短名称为 Sill。品牌句为“东西在光里，安放一会儿。”，功能说明为“查看、整理和管理你的云端卡片。”

产品主图继续使用 assets/sill-icon.png。小图标使用 assets/sill-line.svg 和 sill-line-dark.svg：透明背景，24 单位画布，1.65 单位圆角线条，两张卡片直接落在窗台上。主图配置为 logo，线条版配置为 composerIcon；这些字段不保证宿主的所有入口都采用相同图标。

[图标渲染检查](icons.png)包含24px及放大预览；背景和邻近图形为本地比较样例，并非宿主截图。

## 唯一插件

本机已安装 sill-codex-sidebar@quiet-glass-local 0.1.3；安装清单与缓存检查只发现这一份 Sill 包。已逐文件确认安装后的清单、App绑定、图标和技能与源文件一致。

保留现有 App asdk_app_6ad03f09b6048191a8826a236ac9097d。删除旧 plugins/quiet-glass、旧技能目录、重复发布包草稿和旧直连 MCP 清单；marketplace 及构建脚本只生成一个入口。历史发布记录和线上回滚产物保留，云端账号插件没有删除或发布。

配置源文件为根目录 plugin.json、.app.json、assets/、skills/sill-sidebar/。npm run plugin:build 生成 plugins/sill-codex-sidebar；旧包不会因再次构建而恢复。

## 网页会话

网页登录保存 access 和 refresh 两个 HttpOnly、Secure、SameSite=Lax Cookie，采用30天滚动浏览器有效期。网页、API和授权页在访问令牌失效时共用 SDK 刷新流程。只有明确失效才清理凭据；网络或临时提供方错误保留凭据并返回503。退出时清理两个 Cookie，并报告上游撤销是否确认。

Worker 在配置不变时复用运行实例，只合并进行中的刷新请求，完成后删除 Promise；不缓存用户客户端或完成的会话结果。跨实例刷新依赖 Supabase 的标准复用窗口和 parent-token 规则。

原先只有 access Cookie 的用户需登录一次取得 refresh。30天为滚动 Cookie 期限，不是服务端强制重新登录期限；已签发 JWT 仍受其本身的有效期约束。ChatGPT/Codex 的 OAuth 连接由宿主管理，不由网页登录 Cookie 代替。

## 已通过

- Supabase 数据与认证回归27项；运行时使用项目约定的 Python 环境满足 jsonschema 依赖。
- HTTP与OAuth专项回归、真实Worker入口并发与用户隔离检查。
- 插件打包检查、安装文件一致性检查、JavaScript检查及 git diff --check。
- 隔离浏览器通过真实 HTTP、SDK和测试SQL验证登录、Cookie持久化、令牌到期后自动续期、CRUD、冲突草稿及退出。
- 授权页桌面及390px视口：允许、拒绝、撤销、键盘焦点与登录状态保留。
- 云端 Worker 构建成功。

浏览器测试使用合成身份提供方，不代表生产账号已完成长时间续期验收。

## 发布与剩余验收

发布归档在 dist/sill-release-0.1.3/：worker.mjs、sill-codex-sidebar-0.1.3.zip、SHA-256 manifest.json。发布前核对线上版本及账号插件 current_release_id，再沿用原身份发布，不新建 App 或插件。

发布会修改线上网页登录行为及工作空间插件。已取得发布确认并完成发布。云端 App 托管头像仍需通过其拥有的配置入口更新与验收，不能用本地logo成功代替。发布后检查真实账号令牌到期、重启后侧边栏图标、浅深主题及应用长期连接；这些检查尚未完成。

## 线上发布结果

Worker版本5679e191-8833-4703-b250-c04b280a5641，部署4a770182-a143-4115-8290-f8013625e081，100%流量。回滚版本f2bffcf9-bd2f-4f92-8526-5bd3751f972e。通过Cloudflare已授权连接发布，继承现有绑定。

云端插件仍为Plugin_301de19f75548191bd869f43e4739e99，版本0.1.3，release为pluginrel_6ad0b544cdf48191a04742aa5a0ba3a1。重新读取确认图标、文案及原App绑定保留。

公开健康接口正常。真实账号长期续期及宿主图标视觉显示未验收，不以发布成功代替。
