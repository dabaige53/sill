# 导入缺时间、正文不完整与新卡沉底

## 问题与状态

已修复待验证。最近检查 2026-10-30。

1. 助手经 MCP 导入时，日程和提醒常缺时间或时间错误；文章正文被精简、只导入一部分，广告等页面杂项没有删净。
2. 浏览时有新卡写入，不提示新内容，新卡出现在信息流底部；整体顺序不按写入时间。

## 环境与触发

云端 Web/PWA 与 Mac，外部助手通过 Sill MCP 写入。浏览信息流时让助手新建卡片，等待轮询刷新。预期新卡在顶部或出现「新内容」提示，实际追加在底部。

## 定位依据

- `contracts/card.ts` 的 `timestamp` 只要求 0 到 8.64e15 的数字，秒级时间（10 位数字，换算后落在 1970 年）能写入；提醒卡不要求 `due`。
- `skills/sill-cards/references/writing.md` 写明正文「长短不设限」，导入规则没有要求完整原文，也没有列出要删的页面杂项。
- 服务端 `sill_get_workspace` 按 `created_at` 升序返回卡片。Web `FeedPolicy.sort` 与 Mac `FeedPolicy.sort` 在分数相同时按这个顺序排列，默认「priority」排序因此旧卡在前。
- Web `filtered()` 与 Mac `Feed.rebuild` 把新出现的卡追加到已固定顺序的末尾。
- Web 云端卡片没有 `time` 时用 `updated_at` 补齐，修改卡片会改变它的位置；Mac 解析快照时丢弃 `created_at`，这类卡的时间为 0。
- Web 已有「新内容」胶囊，但只接在示例数据流程上，云端快照没有使用。

## 处理情况

- 契约写入校验（`contracts/cloud.ts` 的 `writeIssues`）：新建、更新和批量写入里新传或改动的 `start/end/due/time` 必须是 1973–2099 年范围的 Unix 毫秒，否则返回 `timestamp_not_unix_milliseconds`；新建提醒缺 `due` 返回 `missing_reminder_due`。未改动的已存值不检查，旧卡仍可保存。
- MCP 工具说明补充毫秒示例、日程和提醒的必填时间、导入文章写完整原文和来源字段。
- sill-cards skill：导入正文完整与清理规则、字段完整清单、时间换算方法和写入后的完整性与时间核对；sill-operations 诊断表加入两个新代码。
- 排序：Web 与 Mac 各排序模式在主条件相同时都按 `time` 新到旧，再按存储顺序。新到的卡排到已固定顺序的最上面。
- 时间回退：Web 云端卡片没有 `time` 时用 `created_at`（工作区内同时进行的另一处改动）；Mac 快照保留每张卡的 `created_at` 作为回退时间。
- 新内容提示（Web）：云端快照带来新卡且读者已离开顶部或正在看详情时，新卡先留在「新内容」胶囊里，点击后回到顶部显示；在顶部或关闭了提示设置时直接显示在顶部。

## 验证与后续

- 本地：契约测试 `tests/contracts/card.test.ts` 全部通过，新增用例覆盖秒级时间、缺 `due` 的提醒和旧值原样保存；直接调用 `FeedPolicy.sort` 确认三种排序结果；修改的 Swift 文件通过语法解析。
- 未在本地运行：Web 核心测试（工作区内另一处未完成的 `about-settings.tsx` 让测试打包失败）、服务端数据库测试、Mac 编译与测试、浏览器体验。由 GitHub Actions 与实际使用验证。
- Mac 尚未接入新卡胶囊：新卡直接出现在顶部，不经提示。
- 提交 36c86c72 漏改了 `contracts/fixtures.json` 里日程与提醒的示例时间（`1000`、`2000`），`tests/server/rich-card.test.ts` 用新校验解析时失败。后续提交把它们改成真实毫秒时间，该测试与 `tests/server/supabase-mcp.test.ts`、`tests/server/explicit-card-fields.test.ts` 本地通过。
