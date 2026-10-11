# 普通设置：同一份状态，多个入口

普通设置包含下列基础偏好，以及可选的 [推荐偏好](RECOMMENDATION-PREFERENCES.md) 分组；共用同一版本，不修改连接器、凭据、权限、网络或安全设置。

| 字段 | 允许值 | 默认值 |
| --- | --- | --- |
| `sort` | `priority` / `unread` / `time` | `priority` |
| `reduceTransparency` | `true` / `false` | `false` |
| `recommendation` | 完整的显式推荐偏好分组 | 省略时采用中性默认值 |

真实连接模式下，SQLite 中的服务设置是权威来源。网页保留原有筛选浮层和透明度开关；MCP、HTTP 和网页通过同一服务方法读写。离线演示继续仅使用浏览器本地偏好，不会上传或覆盖服务设置。

## 读取

MCP：`qg_read_settings({})`。

HTTP：已认证的 `GET /api/settings`。

```json
{
  "values": {"sort": "priority", "reduceTransparency": false},
  "revision": 0
}
```

尚未写入过时，读取逻辑默认值和版本 `0`，不会产生数据库写入。现有数据库无需迁移脚本。

## 修改

MCP：`qg_update_settings`。

HTTP：已认证的 `PATCH /api/settings`，使用 `application/json`。两种入口接收相同参数：

```json
{
  "set": {"sort": "unread"},
  "expectedRevision": 0
}
```

返回完整的 `values` 和新 `revision`。`set` 必须非空，只能包含上表字段；不接受额外字段、字符串布尔值、`null` 或非法排序值。`expectedRevision` 必须为非负安全整数，不能省略。

每次实际改变状态，版本加一。在同一 SQLite 事务内完成读取、版本比较、写入和审计。审计只保存变动字段名及前后版本，不保存来源内容、凭据或客户端声称的身份。版本匹配且值完全相同时返回原状态，不增加版本或审计事件。

## 冲突处理

旧版本更新返回 `SETTINGS_CONFLICT` 和最新的 `current`：HTTP 使用 `409`，MCP 使用 `isError: true`。不会悄悄覆盖另一入口刚保存的设置。

网页立即显示服务最新值和冲突说明，并丢弃此前排队的旧操作；用户再次操作后才会提交新的修改。对话工具调用也应先展示最新状态，再根据用户意图决定是否修改，不应直接把旧请求换一个版本自动重发。

其他网络失败会显示“设置未保存”，不把浏览器缓存冒充服务已保存状态。后续读取可以恢复服务中实际保存的值。

## 网页同步

- 首次连接和重新加载先读取服务设置，旧 localStorage 不会自动迁移或上传。设置接口暂时失败不阻止已有内容加载；恢复连接后重新读取。
- 用户修改后仅应用服务返回的值。快速连续操作顺序提交，避免同一网页覆盖自己。
- 窗口重新获得焦点、页面重新可见时重新读取；页面可见期间也复用现有短轮询检查更新，所以对话修改能回到已打开的网页。
- 旧的读取响应不会覆盖较新的版本。排序更新保留现有界面布局和阅读锚点；减少透明度同时更新开关状态。
- 仍是单用户服务：一个数据库对应一份工作区偏好，没有新增多租户身份系统。

本轮没有发布 ChatGPT 原生设置菜单、MCP App 上下文能力、模型配置或第三方授权设置。

## 验证

```sh
npm test
npm run check
npm run test:settings-browser
npm run test:live-browser
```

浏览器测试需要 Chromium：先运行 `npx playwright install chromium`，或用 `CHROMIUM_PATH` 指定已有浏览器。

- `tests/settings.test.mjs`：严格验证、默认值、无操作、跨连接持久化、过期版本、审计事务回滚、MCP/HTTP 一致性与访问保护。
- `tests/settings-browser.mjs`：服务覆盖旧缓存、界面保存、连续操作、MCP 修改回流、并发冲突不重放、重新加载和离线演示隔离。

F01 最初在 17 个工具上新增两个设置工具；后续功能继续保留这些名称。F08 复用设置工具，不再增加工具。
