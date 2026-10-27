# 设计材料精简与 design-init 工具

本轮在 Claude Code 中完成，已发布到线上 Design System 与设计画布，仓库改动尚未提交。用于交接给下一位接手者（Claude Code 或 Codex 等其他 AI 产品）。

## 现状

| 项目 | 状态 |
| --- | --- |
| 线上 Design System | 第 54 版（1792548354-a1f1），与仓库一致 |
| 线上设计画布 | 第 73 版（1792548350-75c2），与仓库一致 |
| 版本记录 | [设计版本记录](../../design/versions.md) 已记三行 |
| 仓库 | 约 270 个文件改动，全部未提交；分支 `main` |

运行 `scripts/design-init.sh status`，两边都应显示「0 个改动，0 个删除」。

## 做了什么

1. **工具**：新增 `scripts/design-init.sh`（`npm run design -- <命令>`），命令有 `status`、`trace`、`build`、`check`、`retire`、`layout`、`stage`、`record`。逻辑在 `design-system/scripts/` 的 `previews.ts`、`check.ts`、`canvas.ts`、`stage.ts`、`fixed-clock.ts`。发布步骤见 [.claude/skills/design-publish](../../../.claude/skills/design-publish/SKILL.md)。
2. **设计印记**：产品代码里 18 处 `@design <编号>`（Web 与 macOS），9 个编号登记在 `design-system/marks.json`。`trace <编号或变量名>` 反查规则、变量、ADR、画板和代码。
3. **组件**：30 个合并为 18 个（另有封面）。示例由 `previews.ts` 从产品代码渲染；FeedCard 示例的 5 类摘要使用 50–60 字设计样例文字，产品演示数据未改。删除 AIMessages、InsightCard、SourceRow、AIContext、CardMeta、Attachment、KeyPoints、QuoteCard、ReminderCard、TaskCard、CardBlocks；GlassDock 改名 Navigation。
4. **手册**：去掉重复的跳转小节、日期叙述和画板编号引用；零散规则移回所属主题；手机卡片字号改为 A 字号。README 改为入口表。
5. **画板**：9 块与产品不一致的画板移到历史（CardBlocks、CardRecipes、TextLimits、Settings、MobileProto、NavCapsule、NavigationState、SearchFilters、MobileHome），现行画板 23 块。13 块现行画板的卡片摘要补到 50–60 字；页面稿摘要按网页 3 行、手机 2 行截断；资讯阅读画板在标题与正文之间补上摘要。
6. **线上变量**：`stage` 从 `tokens.json` 编译 `tokens.css` 一起发布，不再需要在页面里保存。
7. **规则**：AGENTS.md 与 [设计约束](../../agents/design.md)「两种工作环境」改为：仓库是来源，线上是发布副本；Claude Code 改完同一次任务内发布；其他 AI 产品只改仓库，在 PR 的 Merge Danger 写「设计未发布到线上」。
8. **产品代码**：只做两处不改行为的抽取，供示例复用：`cardMenuHTML`（`apps/web/views/app-card-actions.ts`）、`pushRingHTML`（`apps/web/interactions/gesture-preview.ts`）。另将有封面卡片的摘要改为与无封面相同的 3 行（Web 与 macOS）。

## 验证

| 检查 | 结果 |
| --- | --- |
| `scripts/design-init.sh check`（设计检查、契约检查、文件规范） | 通过 |
| `npx tsc --noEmit` | 通过 |
| `npm run test:core` | 256 项通过 |
| `npm run lint:apple` | 通过 |
| Biome（apps、design-system、scripts、tests、contracts、server） | 无错误，只有原有警告 |
| `npm run lint` | 未通过：`.claude/worktrees/macos-rebuild-36a2cd/biome.json` 与根配置冲突，与本轮改动无关 |

未运行浏览器测试、视觉自动化或 e2e；线上组件示例和画板没有在浏览器里查看。Swift 只改注释，未重新编译。

## 接手时

- 提交前先读 `git status`；本轮改动与之前未提交的 macOS、Web 改动混在同一个工作区。
- 在 Codex 等其他 AI 产品中：改设计只改仓库，运行 `scripts/design-init.sh build` 与 `check`，PR 写 Merge Danger。
- 在 Claude Code 中：说「发布设计」会按 `dist/design/plan.json` 发布，再 `record`；线上有人直接改过时先说「同步设计」。
- 产品演示数据（`apps/web/data/cards.ts`）的摘要仍是 5–32 字，用户选择不改。
- 手机摘要仍为 2 行，未再讨论。
