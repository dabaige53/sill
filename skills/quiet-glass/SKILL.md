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

Codex、Hermes、Claude 共用上述本地命令与数据。仅在用户请求时使用宿主已授权能力获取资料，将结果写入卡片；Quiet Glass 不连接、授权或代理其他应用。数据留在本机，云端发布另行处理。

## 产品方向与当前边界

Agent 驱动内容与执行，外部工具通过实际宿主的 MCP 使用；不按按钮新增第三方直连接口，不在 Sill 保存秘密或自建 OAuth。MCP 的首次鉴权仍由宿主/上游完成。当前本技能仅操作本地卡片，没有意图队列/执行器；本地状态更新不等于外部执行成功。目标协议和候选见仓库 `docs/AGENT-MCP.md`，两个已知生产 P1 仍未修复。
