# 项目准则

更新：2026-10-29。按当前任务读取对应正文；文件只维护其职责范围内的一份规则。

## 通用执行要求

开发、优化、授权与交付的通用要求直接维护在根目录 [AGENTS.md](../../AGENTS.md)。下列文件补充专题规则。

## 按任务读取

| 任务 | 读取 |
| --- | --- |
| 判断产品范围 | [PRODUCT.md](PRODUCT.md)；实际支持另看[功能矩阵](../implementation/feature-matrix.md) |
| 修改或审查代码 | [代码规范](code-standards.md) |
| 部署或回退 | [部署规范](deployment.md)，执行步骤见[发布操作手册](../implementation/operations/release-runbook.md) |
| 选择检查或报告验证结果 | [测试规范](test.md)；具体工具见[测试操作说明](../implementation/testing.md) |
| 新增、修改、移动或清理文档 | [文件管理规范](file-management.md) |
| 改界面、样式或交互 | [设计规范](../specs/DESIGN.md) |
| 记录和复查调试问题 | [错误记录规范](error.md)、[错误索引](../records/errors.md) |
| 排查动效、滚动或手势 | [动效开发与排查](motion-development.md) |
| 编写 PR | [PR 编写指南](pr.md) |
| 管理事项与标签 | [事项管理](issue-tracker.md)、[分类标签](triage-labels.md) |
| 定义术语或记录决策 | [领域文档](domain.md) |

## 维护完成条件

每条要求有唯一正文；读取入口能找到它；目标、实现和验证状态可以分别追溯。修改规则时更新相关引用；具体任务进度和当次结果放进第四层，不持续追加到准则正文。

全部文档见[总目录](../README.md)。
