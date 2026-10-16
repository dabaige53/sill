## Summary

补齐文件管理规则与导航，让工程技能使用统一的事项、标签和领域文档配置。

```text
AGENTS.md                        项目约定、80% ASD-STE100 风格、技能入口
docs/
├── README.md                    文档导航
├── FILE-MANAGEMENT.md            文件职责、命名、归档与数据隔离
└── agents/
    ├── issue-tracker.md          dabaige53/sill 的 GitHub Issues
    ├── triage-labels.md          五个默认分类标签
    └── domain.md                 术语表与架构决策读取规则
scripts/
├── README.md                    构建输入与输出
└── check-files.mjs               文件管理检查，接入 npm test
tests/README.md                  测试与历史报告导航
.github/pull_request_template.md 后续 PR 的正文模板
pr.md                            本次 PR 正文
```

## Evidence

- **Before:** `npm test` 没有文件管理检查。
  **After:** 新增 `npm run files:check`，检查目录归属、文档导航、本地链接和 Git 文件隔离；检查通过。
- **Before:** 工程技能没有项目级配置。
  **After:** 三份配置已写入并检查链接；`dabaige53/sill` 的五个默认标签已重新读取确认。
- **Before:** PR 正文仅在对话中，仓库没有模板和 `pr.md`。
  **After:** 模板和本次正文已保存，纳入文件管理规则与导航。
- **Before:** 文件检查尚未接入测试入口。
  **After:** 接入后的 `npm test` 已完成构建、语法检查和四个本地测试，均通过。后续配置与模板补充使用文件检查、JavaScript 语法检查和 `git diff --check` 验证。

## Merge Danger

**Door:** two-way

文档与检查规则可通过 Git 回退。已创建的 GitHub 标签，以及本机已切换到 `dabaige53/sill` 的 `origin` 地址，属于代码外变更，回退代码不会撤销。

**Blast Radius:** 开发流程

`npm test` 会拒绝未登记的根目录文件、未索引文档、失效导航链接，以及误纳入 Git 的本地数据或缓存。新增文件时需同步导航和规则。PR 模板随仓库合并后供后续 PR 使用。
