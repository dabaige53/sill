# 事项管理：GitHub

状态：现行规则。更新：2026-10-16。

事项与规格保存在 [dabaige53/sill 的 GitHub Issues](https://github.com/dabaige53/sill/issues)。使用 `gh` CLI，并显式指定 `--repo dabaige53/sill`。

- 创建：`gh issue create`；多行正文通过 `--body-file` 传入。
- 读取：`gh issue view <number>`，检查正文、标签和评论。
- 查询：`gh issue list`，按状态和标签筛选。
- 修改标签：`gh issue edit <number>`；标签映射见 [事项分类标签](triage-labels.md)。
- 发布规格：创建 Issue，或更新已确认的对应 Issue。
- 获取任务：读取 Issue 正文、标签和评论。
- 子任务优先使用 GitHub 子事项；不支持时用父事项任务列表关联，并在子事项注明 `Part of #<number>`。
- 阻塞关系优先使用原生依赖；不支持时在正文注明 `Blocked by: #<number>`。所有阻塞事项关闭后才视为可执行。
- 评论、关闭和指派按当前任务授权执行。

PRs as a request surface: no.
