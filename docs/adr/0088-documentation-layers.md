# 按职责与更新方式分层管理文档

2026-10-29，已采纳。调整 [ADR 0022](0022-docs-location-shows-validity.md) 的现行目录划分，并替代 [ADR 0087](0087-product-context-single-source.md) 对产品文档位置的安排；历史正文保留。

项目准则放 docs/agent/，设计规范放 docs/specs/，实现说明放 docs/implementation/。决策、专项计划和事件结果分别保留在 docs/adr/、docs/plans/、docs/records/，不统一套在 tasks/ 下。稳定期用于分类，不按时间自动迁移。

前三层原位维护，Git 保存历史，不保留规范备份或链接壳；ADR 按决定新增并说明替代关系，任务计划结束后原位标记完成。文件类型使用已有通用名称，适配工具时整合已有正文。第四层按材料用途归入决策、计划或事件；清理重复旧规范时由 Git 保存历史，保留独有的决策与验收证据。
