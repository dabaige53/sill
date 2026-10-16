# 原 Sill App 插件添加 Skill：发布与验证记录

日期：2026-10-16。结果：直接给当前已连接的 App 插件添加 Sill Skill，版本从1.0.0更新为1.0.1。平台接受更新，插件页面显示“应用1、技能1”，Skill 正文可打开，当前 Codex 聊天已发现新增 Skill。用户随后确认“可以了”。

本次采用原 App 插件直接增补 Skill 的方案，不切换到另外的1.1.3组合插件。1.1.3未更新、未卸载、未删除。此前“原 App 插件没有 Skill”的说明仅适用于1.0.0。

## 对象与版本

| 字段 | 本次值 |
| --- | --- |
| 插件 ID | `plugin_asdk_app_6ad0d805d3e88191a1c8902cf66af046` |
| App ID | `asdk_app_6ad0d805d3e88191a1c8902cf66af046` |
| 包名 | `dev-6ad0d805d3e88191a1c8902cf66af046` |
| 原版本 / 新版本 | `1.0.0` / `1.0.1` |
| 更新前 release | `PluginRelease_ecb8f90fb2388191afed905b91b472f1` |
| 更新后 release | `pluginrel_6ad16ef444088191a8dc2d8b39d8460f` |
| 范围 / 可见性 | `USER` / `PRIVATE`，保持不变 |
| 发布链接 | [sill](https://chatgpt.com/plugins/plugin_asdk_app_6ad0d805d3e88191a1c8902cf66af046) |

## 实际操作

1. 按准确插件 ID读取当前文件。原1.0.0仅有 `.app.json` 和 `.codex-plugin/plugin.json`；保存原清单、App绑定及release ID。
2. 从1.1.3组合插件读取 `skills/sill/SKILL.md`，原文复制到原 App 插件，不引入另一份 App、MCP连接或图标配置。
3. 按当前平台支持的 App-backed 插件更新规则，仅新增技能和所需清单声明、递增版本；保持原包名、App连接、标题、描述、提示词、展示及受众。
4. 将原兼容清单完整转换为根目录 Agent Plugins 1.0 `plugin.json`；原 `interface` 完整移至 `extensions.com.openai.interface`，原 `apps` 移至 `extensions.com.openai.apps`。保留空 capabilities 和 null defaultPrompt，不从1.1.3复制展示字段。
5. 同步兼容清单版本为1.0.1，增加 `skills:"./skills"`。Skill置于固定路径 `skills/sill/SKILL.md`，由便携格式自动发现。没有新增 `requires_local_executor` 等与本次无关的设置。
6. 将四个文件放在ZIP根目录，归档写到源目录之外。先检查JSON、版本、App ID、两份清单展示一致、Skill元数据与ZIP布局。
7. 调用 Plugin Creator `update_plugin`，参数为原插件 ID、归档绝对路径、更新前release作为 `expected_release_id`。未传 `delete_paths`，未改分享设置。平台返回 `status:updated`、版本1.0.1及新release。
8. 重新读取四个文件与文件清单，逐项比较展示、App绑定和Skill内容。确认绑定与原版本语义相同、展示对象完全相同、Skill与来源原文完全相同。
9. 使用现有 Sill 工具完成一次 `sill_listContents({limit:1})` 查询。只读成功，没有创建、修改或删除卡片，没有重新授权或修改生产权限。
10. 在Chrome打开原插件详情，确认版本1.0.1、“应用1、技能1”和“打开插件”。点击技能后正文可完整加载。导航仍显示全局 `Sill · 窗台` 入口。
11. 从“更多试用此插件的方式 → 在聊天中试用”发送只读Skill验收请求。用户确认时，该请求的最终回复未由自动化重新读取，不将其记为完整逐项执行证据。
12. 随后当前Codex宿主的可用技能列表出现 `dev-6ad0d805d3e88191a1c8902cf66af046:sill`，版本1.0.1；实际读取该宿主缓存内的 `SKILL.md` 成功。确认宿主已经发现技能，用户明确反馈可用。

## 文件与构建参数

发布后的完整文件列表：

```text
plugin.json
.codex-plugin/plugin.json
.app.json
skills/sill/SKILL.md
```

原清单映射与新声明：

| 文件 | 处理 |
| --- | --- |
| `plugin.json` | 新增根清单，schema=`https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`；保留原name、description、author、interface、apps；version=1.0.1 |
| `.codex-plugin/plugin.json` | 保留所有原字段，version=1.0.1，增加skills=`./skills` |
| `.app.json` | 保留原App引用；仅JSON结尾换行规范化，不改变绑定含义 |
| `skills/sill/SKILL.md` | 1733字节；name=`sill`；原文复制，含打开、读取、写入核对和权限边界 |

发布构建未运行仓库的旧 `npm run plugin:build`。使用项目约定的既有Python环境与标准库 `json`、`zipfile`、`hashlib`；ZIP压缩方式为 `ZIP_DEFLATED`，显式列入以上四个文件，不打入父目录或额外文件。

| 构建记录 | 值 |
| --- | --- |
| 本次临时源目录 | `/private/tmp/sill-app-skill-20261016/` |
| 本次上传归档 | `/private/tmp/sill-app-skill-1.0.1.zip` |
| SHA-256 | `eb5cc7490cdca2fbea749d39fc743701315cba324744930be567d7cb26d62037` |
| 发布源证据 | [1.0.1平台文件快照](validation/plugin-20261016/app-backed-1.0.1.json) |

临时文件可能被系统清理；后续以平台当前版本和已保存快照为准，不依赖临时路径存在。重新打包的ZIP可能因文件时间而有不同校验和，应比较文件内容并记录新归档校验和。

## 保留的行为与展示

App ID、OAuth连接、MCP地址及工具、侧边栏服务、标题和描述均未修改。没有新增直连MCP配置、图标资产或权限请求；原App托管图标继续由原App负责。原清单显示名、描述为 `sill`，category=`Other`，capabilities=`[]`，defaultPrompt=`null`，author/developerName=`App developer`，这些值保持不变。

图标本身不在原包内，不能把“没有PNG文件”误认为删除了托管图标。包名与App引用必须保留，不能为了显示名更友好改成另一个包。

## 验证结论与限制

已确认：平台支持对这个App-backed插件增加Skill；版本保存成功；平台文件、App绑定、展示及Skill正文比较通过；真实网页发现并加载Skill；当前Codex发现技能；原工具只读查询成功；用户确认可用。

未新增验收：生产写入删除、OAuth长期续期、重启和所有宿主的隐式触发。本次没有用写入测试修改用户卡片，也没有声称每次聊天都必然自动触发Skill。用户确认前发起的网页验收请求未重新取得最终回复，此限制与宿主已发现技能的证据分开记录。

## 后续维护规范

- 当前优先维护这个已连接、已加入Skill的原App插件；另一个1.1.3组合插件仅保留历史，退役或删除另行授权处理。
- 修改Skill时，先读取平台最新release，保留原App和展示，更新Skill及版本；以最新release保护更新，更新后重新读取并检查宿主技能发现。
- App行为、服务工具、OAuth和托管图标从其所属配置更新，不借Skill归档修改这些字段。App刷新后的Skill保留仍按平台支持范围执行，并检查实际结果。
- 不自动恢复已删除的MCP配置，不复制浏览器令牌，不新增OAuth客户端或扩大卡片权限。
- 仓库旧构建配置仍指向旧App，本次没有顺手修改；下一次从仓库自动发布前，应先将构建配置同步到本记录对象。本快照不是批准任何未来发布或权限变更。
