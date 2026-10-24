# Sill 1.2.8 云端发布

2026-10-24。范围：合并近期 PR，发布现有云端 Web 与 MCP 页面。未分发 Mac 安装包，未更新插件包，未执行数据库迁移或配置外部备份密钥。

## 合并与源码

| PR | 内容 | 结果 |
| --- | --- | --- |
| [#66](https://github.com/dabaige53/sill/pull/66) | AI 对话界面及本轮组合验证 | 已合并 |
| [#67](https://github.com/dabaige53/sill/pull/67) | 手机启动、抽屉、阅读与媒体性能、手机字号 | 提交并入 #66 后已合并 |
| [#68](https://github.com/dabaige53/sill/pull/68) | Web/Mac 详情间距与 PR 信息行 | 提交并入 #66 后已合并 |

- 候选源码：`95d6908c6a6f0c41ebd8d1c8e7459fb9f8fa7fbe`，工作区干净。
- 主分支合并提交：`058c1f32e8a6f5354d5f43e8f5caecc19e9cffbd`。与候选的文件内容一致。
- 候选目录：`dist/release/candidate-tTKaZh/`，清单状态 `ready`；部署该目录的 `worker.mjs`。
- 产品版本从 1.2.7 更新为 1.2.8。保留普通 merge 历史，三个 PR 的提交均在主分支中。

合并时保留主分支已有的 AI 框拖动与缩小操作。第一轮远端回归发现 Tab 先到收起按钮；调整输入框与收起按钮的 DOM 顺序，并补充对应断言后通过。#68 修正 Swift 换行与缩进，将共用详情行移到 `DetailRows.swift`；重复的间距 ADR 编号改为 0069。文档索引保留全部链接，记录说明移入文档查阅指南。

## 验证

- 本地 `npm test`：共享定义 69、Web 核心 384、服务端 138、性能报告 3 项通过。
- 本地 Swift 后台测试：96 项、23 个测试组通过。
- 类型检查、Web 构建、Web 与 Swift 格式检查、design build/check、文件检查通过。Web lint 仍有既有警告，无错误。
- `npm run release:prepare`：六步检查与压缩构建全部通过。
- 最终候选提交的远端 CI 全部通过：[浏览器回归](https://github.com/dabaige53/sill/actions/runs/40055557142)、[集成测试](https://github.com/dabaige53/sill/actions/runs/40055557188)、[权限边界](https://github.com/dabaige53/sill/actions/runs/40055557308)、[Mac 格式与后台测试](https://github.com/dabaige53/sill/actions/runs/40055557178)、[授权策略](https://github.com/dabaige53/sill/actions/runs/40055557094)。Mac 安装包构建按工作流条件跳过。
- 未在本地执行浏览器、e2e、截图或真实 Mac 窗口检查。远端 CI 的浏览器回归不等于真实手机触摸或宿主页面视觉验收。

## 部署

沿用 Worker `sill-web-preview`、原 App 与插件身份。保留 7 项绑定、兼容日期和原设置；未增加权限或秘密。

| 项目 | 发布前 | 发布后 |
| --- | --- | --- |
| Deployment ID | `f4caaa4f-9069-4ff0-a798-55ec3f7bac5f` | `494c469e-d2a2-490a-b8a5-cfcbda7e6032` |
| Worker version | `a81b3dad-ff85-4ff0-bcea-4374eb097880` | `b49bb2d6-296f-48dd-ab47-6a857fe18097` |
| 新版本流量 | — | 100% |
| 发布时间 | — | 2026-10-24 10:55:06 +08:00 |

首次上传因连接器请求超过 4 MiB 被拒绝。重新读取后确认部署未变化；随后压缩传输同一候选，在连接器内解压并按既有 multipart 流程上传。上传返回 200，重新读取确认上表的新部署与版本。

## 部署后检查

入口：[云端 Sill](https://sill-web-preview.scs1213-temp-email.workers.dev/)。

| 检查 | 结果 |
| --- | --- |
| `GET /api/v1/health` | 200，`status: ready` |
| 未登录 `GET /api/v1/workspace` | 401 |
| 未登录 `GET /api/v1/contents` | 401 |
| `GET /` | 200，HTML 含手机字号变量与 AI 对话结构 |
| `GET /auth/login` | 200 |
| OAuth protected-resource 元数据 | 200 |
| 当前 Sill MCP 连接只读获取工作区 | 发布前后均为 30 张卡片，工作区版本均为 126 |

本轮没有写入、删除或修改卡片。HTTP 页面返回成功与 MCP 读取成功分别确认；未把它们写成宿主页面已显示或视觉验收通过。当前 MCP 页面 URI 为 `ui://sill/cloud-workspace-1.2.8.html`；旧版本地址的读取与撤权检查由已有服务端回归覆盖，本轮未在真实宿主重新打开页面或刷新工具。

## 边界与回退

- 内置 AI 尚未接入。正式构建不含示例会话，发送等动作保持禁用。
- 本轮发布云端代码，不代表外部备份迁移、密钥配置或其他外部服务已完成部署与验收。
- 真实手机触摸、媒体放大后的连续播放与 Mac 窗口未验收；本地 Swift 测试不代表 Mac 安装包已安装或分发。
- claude.ai 设计副本未发布本轮全部改动，仍需在 Claude Code 发布；已有 AI 设计与详情画板的发布记录保留。
- 回退时先确认当前部署仍为上表的新版本，再将流量切回旧 Worker version `a81b3dad-ff85-4ff0-bcea-4374eb097880`，重新检查健康、未登录访问限制和 MCP 读取。本轮没有数据库迁移，无需随 Worker 回退修改数据。
