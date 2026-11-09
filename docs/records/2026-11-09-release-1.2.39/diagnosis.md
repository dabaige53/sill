# 1.2.39 候选检查失败

状态：已修复待验证。最近检查：2026-11-09。

## 环境与触发

PR #130，候选 `f992dc2c5e33acd76bd84b6d1263634359230b06`。GitHub Actions `42567327493` 的文件检查、导航浏览器、授权策略和数据库检查通过，其他五项失败。

## 定位与处理

| 失败项 | 定位依据 | 处理 |
| --- | --- | --- |
| Web 静态检查 | Biome 报 4 个测试文件格式错误，`markdown.ts` 引用顺序错误 | 统一这 4 个文件的格式，调整 Markdown 引用顺序 |
| 集成测试 | `agent-handoff.test.ts` 的旧 `agentAction` 模拟字段不符合 `PreviewApp` 类型；`detail-motion-performance.test.ts` 缺少 `readFileSync` 引用 | 删除无用旧字段，补回读取文件的引用 |
| 布局浏览器 | 6 种屏幕与主题组合均报 `browser chrome follows the selected app theme` | 测试将自己设置为主屏幕 App，却仍要求存在 `theme-color`。当前引导脚本和状态栏约定明确移除该标签；改为检查实际主题、CSS color-scheme，以及标签不存在 |
| 动效浏览器 | `completed task must return focus to its title`，27 个场景中 1 个失败 | 当前完成状态原位更新并保留复选框。改为真实聚焦、按空格完成最后一项，检查勾选状态与焦点仍在该复选框 |
| Mac | `SelectionTests.swift` 的额外空行与空白触发格式错误 | 使用 Swift formatter 统一该文件格式；本轮 47 项共享测试和 108 项桌面测试实际均通过，任务失败来自格式检查 |

本轮未修改产品交互以迎合旧测试。导航与数据库检查已通过，不能据此认定尚未运行成功的项目也通过。

## 验证与后续

修正后推送同一 PR，由 GitHub Actions 重新检查。正式版本尚未打 tag；需所有发布必需检查通过后再部署。
