# MCP 接口说明

更新：2026-10-29。依据当前服务端与共享定义整理。本文描述源码能力；部署版本和当次宿主发现以实际回执为准。

## 能力入口

| 能力 | 当前入口 |
| --- | --- |
| 卡片查询与读写 | `sill_listContents`、`sill_getContent`、`sill_createContent`、`sill_updateContent`、`sill_deleteContent` |
| 工作区与原子批量 | `sill_getWorkspace`、`sill_applyOperations` |
| 事件记录与结果查询 | `sill_submitEvent`、`sill_getEvent`；受限结果回写由内容更新处理 |
| 备份与恢复 | 按权限及服务配置开放；工具定义见[备份约定](../../contracts/backup.ts) |
| 工作区与卡片页面 | `sill_open_workspace`、`sill_open_cards` |

工具注册和发现条件见 [mcp.ts](../../server/cloud/mcp.ts)。HTTP 与 MCP 共用能力、身份、资源范围、版本和幂等检查；直接数据操作无需内置模型。

## 读写约定

完整工作区读取要求全工作区的 `content:read` 范围。批量返回完整快照，因此也要求该读取范围，并分别校验各操作的写入或删除权限。

批量支持卡片更新与删除、个人状态、偏好、阅读时长累加，整批成功或回滚。保存带读取时的卡片版本、原始字段或工作区版本；重试使用相同幂等键和请求内容。

字段、默认值和工具输入以[共享约定](../../contracts/README.md)及[操作协议](../../skills/sill/references/operations.md)为准。图片接受内置插图 ID 或无凭据 HTTPS URL；Markdown 内图片不加载，文件与附件仅记录元信息和链接，不提供上传。

备份工具发现同时检查工作区读取范围、对应权限与加密配置；恢复另行检查写入条件。操作方法见[备份与提醒](operations/backup-and-reminders.md)。

## 事件与助手

事件接口记录意图、状态及受限回写关系。源码尚无 Webhook 投递器、内置对话引擎或可靠任务执行器；事件创建不表示外部已接收或完成。后续方向见[路线图](../plans/roadmap.md)。

支持宿主消息的 MCP 页面提供当前卡片讨论：显式点击后重新读取卡片，发送必要引用；助手仍须经工具读取最新内容并按用户要求处理。回执未知时先在宿主核对，不自动重发。独立网页只提供其实际支持的入口。

## 实现与验收

Web 本地通道与云端账号工作区保持独立；Mac 连接云端时使用同一账号能力。各端支持见[功能矩阵](feature-matrix.md)。

上线按[部署规范](../agent/deployment.md)与[发布操作](operations/release-runbook.md)分别核对服务、工具、页面和账号。源码检查不代替当前宿主的发现、权限或实际界面验收。
