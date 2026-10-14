---
name: quiet-glass
description: 查看、创建、更新或整理本地 Quiet Glass 卡片，并确认页面同步。用户要求打开 Quiet Glass 或保存结果为卡片时使用。
---

# Quiet Glass

项目目录：`/Users/w/code/quiet-glass`。页面：`http://127.0.0.1:4318/#feed`。

1. 在项目目录运行 `node scripts/qg.mjs list`，按需使用关键词缩小结果。连接失败时运行 `npm start`，保留服务进程。
2. 修改前运行 `node scripts/qg.mjs capabilities` 查看当前操作及字段。用 `get <id>` 读取目标卡片及版本。
3. 将 JSON 操作写入临时文件，运行 `node scripts/qg.mjs apply --file <path>`。同批操作原子提交；修改已有内容时使用读取到的 `expectedRevision`。版本冲突后重新读取并合并用户要求，保留其他修改。
4. 用 `get <id>` 确认保存结果。打开页面使用宿主浏览器入口；`open <id>` 返回卡片预览、正文及来源链接。页面每秒同步，无需重新采集。

`card.upsert` 创建或替换卡片；替换前读取完整卡片，保留未要求修改的字段。`card.delete` 删除明确指定的卡片。
`item.patch` 管理已读、收藏、稍后读、备注、标签、任务完成、提醒状态和阅读进度。`preferences.patch` 管理排序及减少透明度。`reading.add` 累加阅读时间。

Codex、Hermes、Claude 共用上述本地命令与数据。仅在用户请求时使用宿主已授权能力获取资料，将结果写入卡片；当前默认运行路径不连接、授权或代理其他应用；此限制描述当前实现，不排除目标中的受限MCP桥接。数据留在本机，云端发布另行处理。

## 产品方向与当前边界

Agent 驱动内容与执行，外部工具通过实际宿主的 MCP 使用；不按按钮新增第三方直连接口，不在 Sill 保存秘密或自建 OAuth。MCP 的首次鉴权仍由宿主/上游完成。当前本技能仅操作本地卡片，没有意图队列/执行器；本地状态更新不等于外部执行成功。目标协议和候选见仓库 `docs/AGENT-MCP.md`，来源虚假成功 P1 仍未修复；本地并发保护已实现。

目标包含内置助手和对外MCP，共用能力层；外部agent可直调产品工具、委托内置助手或使用显式发布的上游tools。当前均未实现；不得仅凭安装上游就对外开放或借owner连接提权。秘密只供宿主/服务端使用；resources/prompts/订阅不默认桥接。

## 本地 MCP / V1 CLI

用户已授权的本地 MCP 实现见 `docs/LOCAL-MCP.md`。官方 SDK stdio 七工具与 HTTP/CLI 共用权限、版本、幂等和事件回写；不连接外部账号。使用 `node scripts/qg.mjs v1 <tool> --file <json>`，凭据由进程环境注入，不写入卡片。旧整卡和 item 写操作必须传读取起点版本/before。Webhook 未启用时明确不支持，不把人工事件记录当成已投递。
