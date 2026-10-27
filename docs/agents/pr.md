# PR 编写指南

更新：2026-10-27。

本文说明如何编写 PR 正文。具体变更的正文写在对应 PR 中，不覆盖本指南。仅在用户要求编写或更新 PR 正文时使用。

正文采用 [PR 模板](../../.github/pull_request_template.md) 的三个部分：Summary、Evidence、Merge Danger。省略开场说明，文字简短，业务术语遵循 [GLOSSARY.md](../../GLOSSARY.md)。

## Summary

用最小的图、树或差异说明关键变化。只保留审阅者需要的调用、文件、状态和边界，图与对应说明放在一起。

| 要说明的内容 | 适合的表达 |
| --- | --- |
| 逻辑或算法 | 伪代码 |
| 运行时调用顺序 | 调用树 |
| 界面结构和模块归属 | 组件树 |
| 文件职责或目录调整 | 浅层目录树 |
| 组件交互、控制流或数据流 | Mermaid |
| 已有结构中的局部变化 | `diff` |
| 大部分内容为新增，或省略上下文会隐藏顺序与归属 | 完整代码块 |

通常选一种即可，不为凑格式重复表达。例如：

```diff
 on(save)
+  if content is unchanged
+    return cached result
   write content
+  invalidate cache
```

## Evidence

提供可检查的前后证据：

- **Before:** 改前截图、命令输出或失败测试。
  **After:** 对应的改后截图、命令输出或通过测试。

界面变化优先用截图；行为变化提供具体测试或运行结果。写明检查命令和结果，不将待完成检查写成通过。缺少改前实测时直接说明，不编造失败结果。

截图偏好不构成界面测试授权；执行范围按 [测试与验证](test.md)。说明证据对应的提交或工作区，以及它来自本轮执行、其他线程报告还是历史记录。

## Merge Danger

**Door:** 用 `one-way` 或 `two-way` 判断变更是否容易回退。

容易撤回的代码变化通常属于 `two-way`；破坏性操作或难以撤回的决定属于 `one-way`。必要时说明回退条件，以及代码回退无法撤销的外部变化。

**Blast Radius:** 用一个词概括影响范围，再按需说明后果。

考虑使用方兼容性、布局、移动端适配、数据与外部配置等实际影响。线上设计与仓库存在差异时，在此明确说明。

依据：[pr skill（show-me）](https://github.com/humanlayer/skills/blob/main/plugins/show-me/skills/show-me/SKILL.md)，作者 Dex Horthy，Humanlayer。
