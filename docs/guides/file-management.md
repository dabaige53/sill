# 文件管理规范

更新：2026-10-16。文档与代码目录已按第 9 节迁移。当前路径为新增文件的位置依据；旧实现可从 Git 标签 `legacy-final` 查阅。

本规范管理仓库中的文档、目录、命名、证据和产物。代码写法见 [代码规范](code-standards.md)。决策依据见 ADR [0022](../adr/0022-docs-location-shows-validity.md)、[0023](../adr/0023-three-clients-repo-layout.md)、[0025](../adr/0025-single-product-version.md)。

## 1. 顶层目录

| 路径 | 放什么 |
| --- | --- |
| `apps/web/` | 浏览器端 |
| `apps/apple/` | iOS 与 Mac：一个 Swift Package；`SillKit/` 放两端共享代码，`macOS/`、`iOS/` 放平台专属代码 |
| `server/local/` | 本地服务，供 Web 本地开发与项目内 agent 技能使用 |
| `server/cloud/` | 云端 Worker |
| `contracts/` | 卡片结构、HTTP 接口、MCP tools、合法与非法样例、契约版本 |
| `design-system/` | tokens、组件、画板、界面文案 `copy/zh-Hans.json` |
| `docs/` | 文档，结构见第 2 节 |
| `scripts/` | 构建、检查、代码生成脚本 |
| `tests/` | `web/`、`apple/`、`server/`、`contracts/`、`e2e/` |
| `deploy/` | 部署配置、App 身份、发布快照 |
| `supabase/` | 数据库迁移 |
| `skills/` | 随产品交付的 agent 技能 |
| `assets/` | 品牌图标 |
| `.github/` | CI 与 PR 模板 |

根目录只放约定俗成的入口和配置：`README.md`、`AGENTS.md`、`GLOSSARY.md`、`pr.md`、`package.json`、`package-lock.json`、`tsconfig.json`、`biome.json`、`.swift-format`、`.git-blame-ignore-revs`、`.gitignore`、`.env.example`、`plugin.json`、`.app.json`。环境类型声明放在 `contracts/`，不新增根目录声明文件。新增顶层目录或根文件时，先写 ADR，再更新本表和 `files:check` 的允许列表。

依赖方向：`apps/*` 和 `server/*` 只引用 `contracts/` 与 `design-system/`；各端之间互不引用。

## 2. 文档按是否有效分目录

| 位置 | 含义 | 文件开头必须写 |
| --- | --- | --- |
| `docs/product/` | 现行：产品规则、交互规范、功能矩阵 | `更新：YYYY-MM-DD` |
| `docs/design/` | 现行：设计决策（ADR-01 至 ADR-21）、设计系统映射 | `更新：YYYY-MM-DD` |
| `docs/guides/` | 现行：操作、排查、规范 | `更新：YYYY-MM-DD` |
| `docs/adr/` | 架构决策，ADR-22 起 | 日期与状态 |
| `docs/records/` | 记录：某天发生的一件事，写完不改 | 无；日期在目录名中 |
| `docs/archive/` | 归档：已被替代或不再适用 | `已被 <替代文档链接> 替代` 或 `不再适用：<原因>` |
| `docs/agents/` | 工程技能配置，路径由技能约定 | `更新：YYYY-MM-DD` |

- 现行文档之间有冲突时，不按更新日期判断哪篇正确；先对照代码和实际检查结果，再在同一个 PR 中修正错误的一篇。
- 记录只对当时的环境、版本和日期成立。记录中仍然有效的规则，必须合并进现行文档；不能让规则只存在于记录中。
- 归档文档不作为依据。归档前检查入链，更新引用后再移动。
- 草案只存在于分支和 PR 中。合并到 `main` 即生效，`main` 上不放「草案」状态的文档。
- `docs/README.md` 是唯一的文档导航。每篇现行文档和每个记录目录都必须列在其中。
- 文档不按产品版本号划分。某个版本做什么由 GitHub milestones 管理；实际发生了什么写入 `docs/records/`。
- 根目录 `README.md` 只写项目说明、启动方式和文档入口，不写按日期排列的进展。

## 3. 命名

- 新路径一律使用小写 kebab-case，例如 `docs/guides/plugin-runbook.md`。目录名已表达类别时，文件名不重复前缀。
- 例外：`README.md`、`AGENTS.md`、`GLOSSARY.md`、`SKILL.md` 等约定文件名；归档文档保留原文件名。
- 记录：`docs/records/YYYY-MM-DD-topic/README.md`，一件事一个目录；同一天的多件事各用一个目录。
- ADR：`docs/adr/NNNN-topic.md`，编号从 0022 起递增；分配前检查 `docs/adr/` 中的最大编号。
- 发布快照：`deploy/releases/YYYY-MM-DD-<端>/`，清单中写明产品版本；已有快照保持原样。
- 路径和文件名中不出现产品版本号，也不使用 `final`、`latest`、`new`、`副本` 等词。
- 代码文件命名见 [代码规范](code-standards.md)。

## 4. 术语

业务术语只在根目录 [GLOSSARY](../../GLOSSARY.md) 定义。文档、Issue、代码和界面文案使用 GLOSSARY 中的称呼。「现行」「记录」「归档」「证据」「发布快照」等文件管理用语只在本规范中使用，不进 GLOSSARY。

## 5. 证据

- 证据放在对应的 `docs/records/<事件>/` 目录中，与记录正文放在一起。
- 不提交 ZIP 等打包文件；需要发送时临时打包。
- 单个文件不超过 2 MB。录像超出时压缩，或改用截图加文字步骤。不使用 Git LFS。
- 提交前去除 token、授权码、个人内容和浏览器存储。
- 自动测试输出留在被忽略的 `tests/artifacts/`；需要长期保留时，审阅后复制到对应记录目录。

## 6. 源文件与产物

- 产物统一放在 `dist/<端>/`，不纳入 Git，可随时重建。不在产物、发布快照或生成文件中修改实现。
- 生成文件按用途区分：`contracts/` 导出的 JSON Schema 提交到仓库，并由 CI 检查与来源一致；Swift 生成的类型和 String Catalog 不提交。
- 产品版本只写在根目录 `package.json`；其他位置的版本号由构建脚本写入。已发布的版本写在发布记录中，不写在配置文件中。

## 7. 数据、秘密与清理

- 项目本地卡片在 `.sill/local/`；Mac 数据在 `~/Library/Application Support/Sill/`。两份数据相互独立，Git 与发布包不能代替数据备份。
- 秘密只放在宿主或 MCP 的安全配置、`.env`（不提交）或部署平台的 secret 中；不进入仓库、卡片、日志、模型上下文和浏览器持久化存储。`.env.example` 只写变量名。
- 迁移本地数据前，先停止写入并在仓库外保留副本；先在临时目录验证能读取，再在授权下替换。
- 不按时间自动删除用户数据、历史证据、数据库迁移和发布快照。
- 不再使用的代码直接删除，不移入保留目录。删除前在最后一次可运行的提交上打 tag，并写一份删除记录，说明删除的内容和取回方法。完全重复的证据文件在确认后可以删除。
- 空间不足时，先清理 `dist/`、`tests/artifacts/` 和依赖缓存，这些都可以重建。

## 8. 自动检查

`npm run files:check` 只读取仓库文件名、文档正文、代码中的导入路径和 Git 索引，不读取私有配置或卡片内容，不联网、不写入。检查项目：

- 根目录只包含第 1 节列出的目录和文件。
- `docs/product/`、`docs/design/`、`docs/guides/` 中的文档开头有更新日期；`docs/archive/` 中的文档开头有替代说明。
- `docs/records/` 下的目录名以 `YYYY-MM-DD-` 开头，并包含 `README.md`。
- 现行文档与记录目录都列在 `docs/README.md` 中；管理入口中的本地链接都能打开。
- `docs/` 下没有打包文件，没有超过 2 MB 的文件。
- 本地数据、缓存和产物没有被 Git 跟踪。
- 代码没有违反依赖方向：`apps/*` 和 `server/*` 之间互不引用。

每次交付前运行 `npm run files:check`，并查看 `git status --short`。

## 9. 迁移进度

| 批次 | 内容 | 状态 |
| --- | --- | --- |
| 1 | 文档迁入 `product/`、`design/`、`guides/`、`records/`、`archive/`；证据并入记录；展开 ZIP 独有报告后删除两个重复 ZIP；更新 `files:check` | 已完成 |
| 2 | 建立 `contracts/`；合并本地与云端 zod 定义；导出 JSON Schema | 已完成，2026-10-16；本地、约定、云端授权测试及云端构建通过 |
| 3 | 删除旧代码与旧测试，打 tag `legacy-final`，写删除记录；同时删除 `sill.config.example.json`、`requirements-sandbox.txt` 及 `.env.example` 中旧连接器的变量 | 已完成，2026-10-16；完整本地、约定、云端授权测试通过；保留现行 cloud bridge 依赖 |
| 4 | Web 与服务端迁入 `apps/web/`、`server/local/`、`server/cloud/`，改为 TypeScript | 已完成，2026-10-16；26 项约定、45 项 Web、78 项服务端检查及云端构建通过 |
| 5 | Apple 端迁入 `apps/apple/`，Swift 原生数据层，Mac 不再打包 Node | 已完成，2026-10-16；16 项 Swift 测试、原生包构建与严格验签通过；视觉和 iOS 设备未验收 |
| 6 | 统一版本号为 1.2.0；文案集中；整体格式化 | 收尾中；最终证据见清理记录 |

## 10. 已确定的边界

- 根目录不再提交 `index.html`；本地页面只生成到 `dist/web/`。
- `supabase/drafts/` 是未应用的 SQL 准备脚本，不是现行规则文档。文件名中的 `v1` 表示数据库准备批次，不是产品版本；为保留测试和既有执行引用，本次不改文件名、SQL 对象或迁移顺序。
- 品牌与插件验收证据已归入 `docs/records/2026-10-15-brand-session/`；本地验收正文仅记录 2026-10-12 一次事件，整体归入该日期的记录，不拆分。
- 旧发布状态转入 `docs/records/2026-10-16-code-cleanup/`；现行配置不再保存发布版本或候选版本。
- Apple 端与云端仍独立，不新增同步协议或自动上传。
