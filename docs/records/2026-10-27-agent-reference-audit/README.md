# Agent 长期参考核对

核对范围：`docs/agents/` 全部 15 份文档，以及直接引用的产品边界、术语和动效手册。消息快照截至 2026-10-27 22:00（Asia/Shanghai）；源码最终复核到 22:07 的本机 `main`、HEAD `8002b44c`。核对开始时为 `970d4be5` 加未提交工作区；22:03:49 的新提交已包含文档迁移、本轮规则修正、保存缺陷修复和测试删减。已检查该提交的文件范围，相关结论未变；本记录与文档目录补充仍为未提交修改。后续维护须重新读取最新消息与相关代码。

## 最新决定与来源

| 来源 | 最新要求与适用范围 | 实现与验证状态 |
| --- | --- | --- |
| U1：本线程用户要求，2026-10-27 | 长期参考集中到 `docs/agents/`；维护前核对最新用户决定、相关线程消息与当前代码，分别记录目标、实现、验证 | 15 份长期文档已逐份读取；本轮修正旧规则，并在下表保存各自的依据与状态。目录集中本身不代表内容已通过检查。 |
| U2：**PWA抽屉动效｜1027｜优化**，`01a17c83-5fc5-78b2-a7ce-7bc74187054f`，20:30:22 用户消息 | “取消自写的滚轮拖动关闭”；随后要求直接提交 PR | [phone-drawer.tsx](../../../apps/web/interactions/phone-drawer.tsx) 使用 Vaul Root / NestedRoot；[gesture-pull.ts](../../../apps/web/interactions/gesture-pull.ts) 跳过 `data-phone-drawer`。该线程最终修改未测试；不能沿用更早试验的体验结果。 |
| U3：**Web/PWA视觉规范｜1027｜优化**，`01a17c47-bc85-7ff2-a3ee-efd09530a0ef`，16:24:07 用户比较请求及其后回复 | Inter 与字重调整仍是建议，未获实施确认；此前已撤销动效工作台，并保留原下拉刷新与普通卡片开合 | 当前字体仍用系统字体栈；目录与预览／全屏的已接入改动按源码和[动效复盘](../2026-10-27-codex-motion-retro/README.md)区分。没有把建议补成已实现。 |
| U4：**合并3个PR｜1027｜事务**，`01a17d63-9499-7f31-aba5-32a7475f652b`，20:57:42 用户确认及最终回复 | #76、#77、#78 合入 main，并切回 main | 线程报告合并完成；本机 HEAD 为 `970d4be5`。合并时报告 462 项核心测试、类型、构建与设计检查通过，设计未发布、未做真机验证。该结果不覆盖合并后的工作区修改。 |
| U5：**测试价值审计｜1027｜审查**，`01a17d72-0023-7c73-8ae3-0d73c2c02a3f`，21:58:58 最新用户消息 | 目标是减少测试；最新要求“如可以直接删除！无需再测！” | 已有[精简记录](../2026-10-27-test-reduction/README.md)与[过渡测试清理记录](../2026-10-27-transition-test-cleanup/README.md)。最新用户消息后的回合显示中断，不能把此前检查算作该消息后改动的验证。没有在本轮扩大测试范围。 |
| U6：**Sill代码审计缺陷清单｜1027｜审查**，`01a17d73-2bcf-7b73-aeda-ced19b8be7a1`，21:59:56 最终回复 | 获准本地修复 7 项缺陷；没有发布授权 | 代码和新迁移已纳入 `8002b44c`；线程报告专项检查通过，详见[修复记录](../2026-10-27-audit-fixes/README.md)。数据库迁移未上线，Mac 修复未发布；全仓 lint 仍有既有错误。 |

相关线程已重新读取最新消息；最新决定会替换原方案，但其他线程的最终回复属于报告证据，不等于本轮重新执行。10 月 25—27 日更早线程的覆盖、读取范围和消息位置保留在[动效复盘](../2026-10-27-codex-motion-retro/README.md)，不在此重复计数。

## 逐份核对：目标、实现、验证

“源码核对”表示已读取对应文件；不表示已启动产品或验收手感。

| 长期文件 | 目标与决定 | 当前实现或对应来源 | 验证状态与差异 |
| --- | --- | --- | --- |
| [README](../../agent/README.md) | 按 U1 集中入口，维护时记录三种状态 | [根 AGENTS](../../../AGENTS.md) 指向本目录；已增加状态表字段和本记录入口 | 已逐份核对 15 份；本轮文件和链接检查见后文。后续不能仅改更新日期。 |
| [设计](../../agent/DESIGN.md) | 保留用户已确认的效果；产品规则、设计来源和发布状态分开 | [design-init.sh](../../../scripts/design-init.sh)、[设计变量](../../../design-system/tokens)、[设计手册](../../../design-system/README.md)；U2–U4 的后续确认优先于早期试验 | 源码入口已核对。Mac 专用变量、既有 reduceMotion 与 Web 保留差异；Inter 未实施。没有重新检查 claude.ai 发布副本或真实界面。 |
| [动效开发](../../agent/motion-development.md) | 先固定平台、输入和入口，先查控制冲突，再调参数 | Vaul 入口见 U2；[AI 收起定位](../../../apps/web/views/shell.tsx)、[搜索接续](../../../apps/web/views/home-search-list.ts)、[动效参数](../../../design-system/tokens/foundation.json)已读取 | 本轮为源码核对；修正手册里旧 wheel 关闭、普通正文回弹与 AI 气泡锚点。无浏览器、手机或 PWA 实测。 |
| [测试](../../agent/test.md) | 按影响选检查；U5 的精简任务不扩充范围，明确不测时记录未测 | [package.json](../../../package.json)、[测试目录](../../../tests/README.md)与 [.github 工作流](../../../.github/workflows)已有检查入口；本地 UI 授权与 CI 触发分别处理 | 增加测试精简规则；历史隐藏面板问题改为有范围的排查经验。U6 的通过数字不代替 U5 后续删减验证。 |
| [代码规范](../../agent/code-standards.md) | 定义新改动标准；不把规范目标写成存量已全部符合 | [tsconfig](../../../tsconfig.json) 仍 `strict: false`；[package.json](../../../package.json) 中两项 Tailwind 依赖仍是范围版本；已有 `contents` / `item.patch` 为兼容名称 | 修正“每批完整测试”和旧命名绝对禁令。显式 any、Biome 警告和依赖范围是存量差异；本轮未改类型、依赖或新增全仓检查。 |
| [原开发说明（现部署规范）](../../agent/deployment.md) | 区分源码、构建预览、本地 API、云端与 MCP 页面 | [Vite 配置](../../../apps/web/vite.config.ts)、[本地服务](../../../server/local/index.ts)、[云端 Worker](../../../server/cloud/worker.ts)、Vaul 与搜索模块均对应当前路径 | 源码核对；没有启动服务或确认这些端口当前可达。U6 保存修复已提交但未发布，不能写为线上行为。 |
| [跨端检查](../../specs/cross-platform-checklist.md) | 检查范围按改动选择，各端证据分别记录 | [界面对账表](../../implementation/design/ui-alignment.md)、[功能矩阵](../../implementation/feature-matrix.md)；[iOS 入口](../../../apps/apple/iOS/SillMobile.swift) 当前仅有共享数据层入口 | 清单是检查标准，不是全项通过报告。独立 worktree 的 iPhone 结果不代表当前 main 已有原生 iOS 界面；Web 叠卡与 Mac 平移差异保留。 |
| [桌面交互](../../implementation/engineering/desktop-interaction.md) | Mac 系统阶段与 Web wheel 分开，当前层处理输入 | [DesktopInteraction / WheelPhase](../../../apps/apple/macOS/Shell/DesktopInteraction.swift)、[相关测试](../../../apps/apple/DesktopTests/DesktopInteractionTests.swift)已读取 | 本轮未执行 Swift 或窗口测试；将原固定命令清单改为按影响选择的入口，不默认全部运行。 |
| [Mac 性能](../../implementation/operations/macos-performance.md) | 区分后台计算成本与真实窗口流畅度 | [性能脚本](../../../scripts/performance-macos.ts)、[八项后台基准](../../../apps/apple/DesktopTests/PerformanceBenchmarks.swift)、[Mac CI](../../../.github/workflows/macos.yml)对应文档 | 后台基准入口与八项内容已核对；本轮未采集性能，不能判定不卡顿。窗口与 Instruments 结果仍需对应环境证据。 |
| [发布](../../implementation/operations/release-runbook.md) | 准备候选、部署、宿主发现和验收分别确认 | [prepare-release.ts](../../../scripts/prepare-release.ts) 会按步骤停止失败、保存候选清单；未提交源码标记 `review_required`，部署与宿主验证不由候选构建完成 | 源码核对；本轮未构建发布候选、部署或刷新宿主。改掉“已经验证的 Worker、App 和插件”这一无时间范围的表述。 |
| [文件管理](../../agent/file-management.md) | U1 的长期目录、历史证据与当前规则分开 | [check-files.ts](../../../scripts/check-files.ts)已覆盖 agents 日期、导航及入口链接；[Mac Workspace](../../../apps/apple/macOS/Model/Workspace.swift)包含云端账号路径 | 修正“Apple 与云端仍独立”为“本地数据独立、账号模式共用工作区”；没有迁移用户数据或修改历史发布快照。 |
| [PR](../../agent/pr.md) | 按 Summary / Evidence / Merge Danger 写具体交付与真实证据 | [.github PR 模板](../../../.github/pull_request_template.md)与指南一致；U4 合并记录有版本范围 | 增加证据来源与版本要求；截图偏好不构成 UI 测试授权。本轮没有创建或修改 PR。 |
| [事项管理](../../agent/issue-tracker.md) | GitHub Issues 保存任务与规格，PR 用于审阅与交付 | 仓库身份为 `dabaige53/sill`；先读最新正文、评论与标签，再按授权修改 | 改为优先使用可用连接，CLI 显式指定仓库。未重新查询线上 Issue，未做外部写入。 |
| [事项标签](../../agent/triage-labels.md) | 保留五类角色映射及其他现有标签 | 文档定义 needs-triage、needs-info、ready-for-agent、ready-for-human、wontfix | 线上实际标签列表本轮未查询；已明确映射不证明标签存在，缺失不能自动创建或改名。 |
| [领域文档](../../agent/domain.md) | 共用术语表和 ADR，保留历史决定 | [GLOSSARY](../../../GLOSSARY.md)、[ADR 目录](../../adr)实际存在；目录已有重复编号前缀 | 修正助手定义中旧的人工速记／编辑说法和内置助手的完成暗示；要求引用完整 ADR 文件名，不重编号历史文件。 |

## 产品状态的重点修正

- **目标：**卡片新增和内容修改交给助手，界面保留轻操作。**实现：**Web/PWA 已取消手动速记，Mac 仍有入口差异；内置助手和 Webhook 仍未实现。**验证：**本轮按源码与产品入口交叉检查，未做产品操作验收。对应修正在[术语表](../../../GLOSSARY.md)和 [Agent 与 MCP](../../implementation/agent-mcp.md)，没有据此扩展业务实现。
- **目标：**使用当前已确认的手机抽屉。**实现：**Vaul 管理拖动与生命周期，自写 wheel 关闭已取消；非 Vaul 旧表面的代码不能写成手机详情的当前效果。**验证：**U2 最终修改未测，U4 合并检查不等于触摸或流畅度验收。
- **目标：**媒体规则按端说明。**实现：**[Web 预览](../../../apps/web/interactions/previews-components.tsx)区分播客与视频；Web 播客只有介绍和外部记录，[Mac 播放器](../../../apps/apple/macOS/Reader/MediaPlayback.swift)仍使用 AVPlayer。**验证：**功能矩阵仍保留真实窗口未验证；不能把旧 ADR 的播放器范围写成全端已完成。
- **目标：**保存与未知结果遵守原基准。**实现：**[Web CloudSync](../../../apps/web/services/cloud-sync.ts)、[Mac WriteQueue](../../../apps/apple/macOS/Model/WriteQueue.swift)与[新 SQL 迁移](../../../supabase/migrations/20261027132655_workspace_save_consistency.sql)包含 U6 修复。**验证：**U6 报告服务端 146、Web 469、数据约定 71、Swift 专项 70 项通过，构建和类型通过；全仓 lint 仍有 32 个既有错误，迁移未上线。后续 U5 将数据约定测试减至 64 项并有局部检查记录；这些是不同改动时点的数字，不能合成一次“当前全部通过”。

## 本轮文档检查

| 检查 | 结果与范围 |
| --- | --- |
| `npm run files:check` | 通过：目录、日期、导航、入口链接、证据和依赖方向。 |
| `sh scripts/design-init.sh check` | 通过：23 个设计印记、52 处引用、19 个组件、75 块画板；10 项 HTTP 设计、9 项 MCP 映射及 11 项合成响应检查通过。没有发布线上设计。 |
| 本地链接逐项检查 | 19 份相关文件的 270 个本地路径均存在；已修正一处新记录中的搜索模块路径。 |
| `git diff --check`、`sh -n scripts/design-init.sh` | 通过。 |

本轮未改产品代码或设计变量，未重新运行 Web、服务端、Swift、性能或浏览器测试，也未执行生产检查。上文 U4–U6 的测试数字均来自对应线程与记录，不计为本轮检查。没有查询当前远端 CI、线上标签或 claude.ai 发布状态。

## 后续维护边界

长期规则在 `docs/agents/` 维护；产品当前能力在产品文档与设计手册维护；带日期的通过、失败、未测和未发布结果留在对应记录。新消息、实现或验证改变时更新相应现行入口，再新建事件记录；本记录不作为未来版本的自动通过依据。
