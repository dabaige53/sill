# 快速发布

更新：2026-10-29。沿用已有 Worker、App 和插件身份，统一执行入口；当前可用性与当次发布结果分别确认。发布范围默认是云端 Web 与 MCP 页面；插件技能、Mac 安装包和数据库迁移分别处理。

执行前读取[部署规范](../../agent/deployment.md)，确认发布范围、产物要求和完成标准；本文维护当前操作步骤。

## Tag 发布

正式版本由 `v<package.json version>` tag 固定源码。`.github/workflows/release.yml` 复用全部现行 CI：集成测试、Web 浏览器回归、Postgres 与云端浏览器、授权策略、Swift 后台测试。任一必需检查失败，不生成发布包、不部署。手动重跑也必须选择同一版本 tag，不能使用 main 代替。

通过后分别构建云端文件和 Mac `.app`，下载该次运行的产物再部署，不重新构建。Mac 当前按用户决定仅供内部测试：临时签名、未经公证，ZIP 文件名标注版本和构建 CPU 架构，GitHub Release 标为 prerelease；不宣称支持另一 CPU 架构。

发布 job 使用 `production` environment。需要 `CLOUDFLARE_API_TOKEN` secret、`SILL_RELEASE_URL` variable，以及 `SILL_DATABASE_VERIFIED_COMMIT` variable。后者必须等于 tag 的完整提交号，只能在核对线上迁移和存量卡片兼容性后填写，是人工检查回执，不是自动数据库验证。该流程不自动清空数据或运行数据库迁移。

`deploy-release.ts` 沿用现有 Worker，继承绑定，核对部署未被另一轮更新，上传已测试产物并重新读取部署，检查健康与匿名会话拒绝。成功后才创建同一 tag 的 GitHub Release，附云端文件、内部 Mac ZIP、部署回执及版本说明。上传结果未知时不自动重试；发布附件失败而云端已更新时，先核对 `deployment.json` 和线上版本，再补发 Release，不重复部署。GitHub artifact 是候选文件，不代表已正式发布。

## 1. 准备候选

```sh
npm run release:prepare
```

技能或插件文件有变化时加 `--plugin`；需要 Mac 候选包时加 `--macos`，两者可同时使用：

```sh
npm run release:prepare -- --plugin --macos
```

命令依次执行文件检查、共享定义检查、类型检查、Web 核心测试、服务端测试和压缩构建。每步记录结果和耗时；失败立即停止。Mac 模式另执行原生构建、后台测试和签名检查，不自动启动窗口。

输出在独立的 `dist/release/candidate-*/`。`manifest.json` 记录产品版本、提交、未提交文件、检查结果和产物。干净源码标为 `ready`；存在未提交内容标为 `review_required`，必须核对这些改动是否属于发布范围。不要把它当成对应提交的正式产物。失败候选标为 `failed`，不能发布。

始终部署该候选目录内的 `worker.mjs`，不要再使用可能被其他构建覆盖的 `dist/cloud/worker.mjs`。若源码改变，重新准备候选。插件及 Mac 只在指定选项时生成，不把未执行的检查记为通过。此快速检查不代替 PR 必需 CI、设计 build/check 或本次改动所需的专项验收。

## 2. 部署现有云端服务

由具备当前任务发布授权的助手，通过既有 Cloudflare 连接执行。沿用 [生产配置](../../../deploy/cloud/wrangler.production.jsonc) 的账号和 Worker；App 与插件身份读取 [发布身份](../../../deploy/sill/release.json)。

1. 读取 Worker 的 `/deployments` 和 `/settings`，记下当前部署、版本、绑定名称和类型，作为回退依据。不输出秘密值。
2. 上传前再次确认当前部署仍为刚读取的部署；若已变化，先核对另一轮发布，不覆盖未知变更。
3. 按现有 Cloudflare API 上传流程，保留 settings 和 bindings，以候选文件构造 multipart 请求。metadata 的 `main_module` 为 `worker.mjs`；代码部分必须同时提供 `name="worker.mjs"` 和 `filename="worker.mjs"`，类型为 `application/javascript+module`。已有秘密绑定用 `inherit` 保留。
4. 上传成功后重新读取部署，记录实际 version ID、deployment ID、流量和时间。请求超时或回执未知时先查部署，不盲目重复上传。

候选构建命令不持有部署凭据。部署使用已有平台连接或部署环境提供的通用凭据；不把秘密写入清单、发布记录或构建包。数据库迁移不隐含在 Worker 发布中；有迁移时单独记录兼容性、实际执行结果及回退限制。

## 3. 更新宿主发现

在原 Sill 插件设置执行“刷新工具”，再从原入口打开工作台。无需新建 App 或重新授权已有账号。只有连接本身失效时才执行原连接的登录流程。

页面 URI 随产品版本变化；服务端同时支持历史版本地址，均检查当前权限。必须区分工具调用成功、页面资源 HTTP 200 和页面真实显示。

只有技能或插件文件变动才发布插件包：先读取远端文件与 release，使用同一个 plugin ID 和 expected release 更新，随后回读受影响文件。保留 App 管理的连接与展示配置，不用本地候选整体覆盖未知远端改动。

## 4. 验收与完成条件

按 [测试授权](../../agent/test.md) 执行本次获准的场景；无界面验收授权时标记未验证。按下表逐项给出真实结果，助手完成操作，不把步骤留给用户补做。

| 发布层 | 必需证据 |
| --- | --- |
| 云端服务 | 实际部署 ID；健康接口 200；未登录私有接口仍拒绝 |
| 登录变更 | Chrome 密码登录、原授权回传、退出后状态；不靠手动刷新算首次成功 |
| MCP 变更 | 指定预期账号的只读调用；受影响的资源和工具；写入仅使用获准测试卡 |
| 页面变更 | 原宿主入口重新打开，页面实际显示；记录资源 URI 和截图 |
| 插件包变更 | 新 release 回读成功，App 身份、文件和可见范围正确 |
| Mac 变更 | 构建、签名及本次授权的真实窗口检查；本地 .app 不等于已安装或已分发 |

代码检查通过叫“候选就绪”，平台回读成功叫“已部署”，实际场景成功才叫“已验收”。当前只完成某端时明确列出其余端状态。

## 5. 留档与回退

发布确认后更新[产品变更日志](../../records/CHANGELOG.md)，将本次实际发布的 Unreleased 条目归入对应版本，写明日期与平台范围；未发布条目保留原处。产品摘要与具体发布证据分别维护。

每次在 `docs/records/YYYY-MM-DD-主题/README.md` 保存发布范围、源码提交及未提交内容、检查命令与结果、旧/新部署和版本、插件 release、界面证据、用户确认与未完成项，并更新 [文档目录](../../README.md)。失败结果也保留；不记录 Cookie、token、授权码或密码。

回退先核对当前部署和数据库兼容性，再把流量切回步骤 2 保存的旧 Worker version。回读确认后重做受影响的健康、权限和宿主页面检查。插件包单独回退，数据库不能因 Worker 回退而自动回退；不删除已保存数据。

流程来源：[原 App 接入](../../records/2026-10-15-app-connection-build/README.md)、[成功工作区发布](../../records/2026-10-16-cloud-operations/README.md)。
