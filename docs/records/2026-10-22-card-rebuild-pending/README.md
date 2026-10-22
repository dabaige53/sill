# 卡片重建与 Markdown 正文：暂停时的待办

2026-10-22，用户要求先暂停相关开发，先提交并发布卡片与详情的设计稿。本记录列出暂停时已完成和未完成的事项，供以后接着做。

## 一、Markdown 正文（ADR 0063）

决定见 [ADR 0063](https://github.com/dabaige53/sill/blob/contract/markdown-body/docs/adr/0063-markdown-body.md)：详情文字只有一个 Markdown `body`，删除 `points`，`summary` 改为卡面摘要，用开源渲染器显示。

代码在分支 `contract/markdown-body`（worktree `../sill-markdown`，提交 `1dcd8a9`，标为 WIP），基于设计分支 `design/card-rebuild-by-type`。未合并，未部署。

### 已完成

- ADR 0063、术语表「正文」「卡面摘要」、界面对账表 D17。
- 约定升到 4.0.0：`body` 改为 Markdown 字符串，删除 `points`，`summary` 加说明；导出的 Schema、OpenAPI、MCP 工具说明已重新生成。
- 旧数据读取时转换（Web `normalizeCard` 与 Swift `Card.normalize`）：正文数组按空行拼接、跳过空段落，要点转为正文开头的有序列表；两端共用迁移样例已加一条。
- 云端迁移文件 `supabase/migrations/20261022120000_sill_markdown_body.sql`：正文改为字符串校验，读取时转换旧数据，不再接受 `points`。
- Web 接入 markdown-it 14.1.0：不渲染原始 HTML，不加载图片，链接只放行 http、https、mailto；预览、全屏阅读、卡面摘要回退、搜索、编辑框、速记都改为单个正文；补了 Markdown 元素样式。
- 技能文档 `skills/sill` 的字段说明与示例。
- 通过的检查：`npm run test:contracts`（53 项）、`npm run test:server`（110 项）、`npm run typecheck`、`npm run build`、`npm run check`、`npm run files:check`、`tests/web/markdown.test.ts`（4 项）。

### 未完成

1. Web 在浏览器中实测：往本地存储写入测试卡片后刷新，卡片没有出现（演示数据可能在加载时重置）。改用开发服务和真实写入路径，核对预览、全屏阅读、卡面摘要回退和搜索。
2. `npm run test:core` 在该分支上 251 项通过、29 项失败。设计分支对照为 278/279，唯一失败项（Apple 文案快照）已在 PR #60 修正，因此其余 28 项由 Markdown 改动引起。失败集中在：搜索保留与恢复（搜索详情里的提醒操作、`#` 条件、类型标签、切换时保留结果）、退出登录与会话过期清理、`digest` 预览要点、媒体无正文、`tests/web/cloud-session-view.test.ts`，另有登录页主题色、独立页元数据各一项。合并 main 后逐项修复。
3. macOS：`npm run test:macos` 中途停止，编译未验证。CardModel 暂把正文按段落原样显示；之后选定渲染器（Apple swift-markdown，或系统解析加自绘版式），去掉要点组件，更新界面对账表 D17。
4. 设计画板：汇总卡面的要点改为卡面摘要，详情里的要点改为正文中的列表样式（画板 38、39、40）。
5. 浏览器端到端测试（`test:browser` 等）尚未运行。
6. 云端迁移部署前，按发布流程在独立数据库核对；本地 PGlite 已验证。
7. 合并时检查 `docs/README.md` 的 ADR 索引：主目录另有一份未提交的 ADR 0062（卡片收回弹簧）。

## 二、卡片与详情重建（ADR 0060、0061）实现前的事项

1. 手册：更新 foundation 中「不用品牌标志」一条、motion 中播客无内置播放一条、界面对账表 D14、功能矩阵「不提供内置播放」。
2. 约定：PR 类型及字段、媒体音频地址、章节时间、带时间点的文字稿、播放位置、多个附件。
3. Web 与 macOS 按画板实现 13 类卡面与详情、视频与播客播放页。
4. ADR 0061 待定：关闭详情后音频是否继续播放；播放到哪里算看完或听完；PR 字段名与校验规则。

## 三、需要用户决定

1. 全屏阅读页的正文是否设最大宽度。手册现行规则是不设，1440 宽时每行很长。
2. 「建议」类型与 `why` 字段：用户说已经删除，但约定、Web 示例数据和术语表中仍然保留。是否删除；删除需要修改约定。
