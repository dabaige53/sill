# 删除速记专属流程

日期：2026-10-29。

用户明确授权删除速记／记一笔相关功能。已移除 Web 内联标题与正文编辑、自动保存计时器、焦点和 Escape 收尾处理、云端覆盖方法、本地同步的内联草稿分支，以及专属样式与文案。旧卡片统一进入普通阅读；示例和来源类型显示为“笔记”。


恢复点：已有 tag `v1.2.8` 包含移除前实现，可通过 Git 查看 `apps/web/views/app-capture.ts`、`apps/web/views/app-input.ts`、`apps/web/services/local-sync.ts` 等路径。此次没有另建备份分支或复制旧代码。
