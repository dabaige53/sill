# 卡片重建设计稿合并与版本标记

2026-10-22，用户要求提交并推送全部工作，合并到 `main`，打标签作为版本发布记录。本次合并设计稿和已完成的界面改动。Web/PWA 没有部署，线上仍是 1.2.6；Mac 没有构建或发布。

## 范围

- 合并：[PR #60](https://github.com/dabaige53/sill/pull/60)，分支 `design/card-rebuild-by-type` 合并到 `main`。其中包括本地 `main` 原先未推送的 14 个提交。
- 标签：`design-2026-10-22-card-rebuild`，指向合并后的 `main`。
- 不合并：`contract/markdown-body`（Markdown 正文，已暂停）只推送到远端备份。其他会话和 Codex 的分支保持原样，不在本次处理。

## 内容

| 部分 | 内容 | 依据 |
| --- | --- | --- |
| 设计稿 | 13 类卡面与详情、手机 390、全屏阅读与深色、视频与播客播放页（CardTypeDetails、CardTypeMobile、CardTypeReading） | [ADR 0060](../../adr/0060-card-rebuild-by-type-and-source-marks.md)、[ADR 0061](../../adr/0061-in-app-media-playback-and-pr-cards.md) |
| 动效 | 卡片收回改用展开的同一个弹簧；读完上推达到阈值后显示白勾，松手才关闭（Web 与 Mac） | [ADR 0062](../../adr/0062-card-close-spring-and-read-end-release.md) |
| Mac | 打开关联卡片时下层保持绘制，只有最上层可操作，整叠只用一层遮罩 | 界面对账表 D07 |
| 桌面 | 搜索类型标签与 `#` 条件；打开卡片时收起顶栏；信息流顺序保持到手动刷新；去掉撤销提示 | 界面对账表 |
| 测试与格式 | Mac 速记测试去掉已删除的撤销提示；Apple 文案快照从 126 改为 134（刷新与性能追踪 8 个键）；4 个文件按 Biome 格式化，性能报告脚本去掉表达式中的赋值 | — |

## 线上设计

| 部分 | 版本 |
| --- | --- |
| [Design System](https://claude.ai/artifact/8zZhgYs53aRF6Rbk5GtuBb) | `1792640295-b21d` |
| [设计画布](https://claude.ai/artifact/487W43yaF9D3Kno8c3ej6b) | `1792640301-08a9` |

完整记录见 [设计版本](../design-changelog.md)。

## 检查

- 合并前 `origin/main`（fafaaaf）的 Verify Sill 和 Sill integration 两项 CI 失败。本机复现到三类问题：Apple 文案快照、Mac 速记测试、Biome 格式与 lint 6 项错误。都已修正。
- 本机 Biome 遇到 `.claude/worktrees` 里的嵌套配置会直接退出，`npm run check` 因此没有报出格式错误。本次改为对 git 跟踪的 263 个文件单独运行，0 个错误。
- 本机通过：`files:check`、`build`、`check`、`typecheck`、`design check`、`test:contracts` 51/51、`test:core` 279/279、`test:server` 110/110、`test:performance-report`、`test:macos` 38 + 61 项。
- CI 结果以 PR #60 为准。
- 未检查：浏览器端到端测试、真实窗口手感、真机与 Safari。界面对账表中相关行保持「未验证」或「待确认」。

## 未完成

见 [卡片重建与 Markdown 正文暂停时的待办](../2026-10-22-card-rebuild-pending/README.md)。
