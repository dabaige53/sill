# 文档位置表示是否有效

2026-10-16，已确认，迁移尚未执行。`docs/` 不再平铺，按文档是否有效分到三类目录：现行文档放 `product/`、`design/`、`guides/`，冲突时以它为准；记录放 `records/YYYY-MM-DD-topic/`，只对当时的环境和日期成立，写完不改；归档放 `archive/`，写明替代文档或不再适用的原因。原因：37 篇文档中只有 6 篇写了状态行，历史说明、阶段记录和现行规则混在一起，读者只能靠导航表判断哪篇可信；目录位置不会漏写，也能由 `files:check` 检查。

## Considered Options

- 每篇写状态行（原规则）：已证明执行不到位，状态值还混合了文档类型和有效性。
- 状态行拆成「类型 + 有效性」两个字段：仍然依赖每篇手写，没有解决漏写问题。

## Consequences

- 迁移需要更新所有 Markdown 互链，以及 `scripts/check-files.mjs`、`design-system/scripts/`、`contracts/design/openapi.json` 中的路径。
- `docs/validation/` 的证据并入对应日期的记录目录；`tests/*-REPORT.md` 移入归档，`tests/` 只保留可运行的检查。
- 本记录的编号接在 [已有设计决策](0001-0021-design-decisions.md) ADR-21 之后。已有决策保留原文和编号，不迁入本目录。
