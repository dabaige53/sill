# 测试与旧模板清理

删除前标签：`tests-before-cleanup-2026-10-22`，指向清理前 HEAD。标签不包含其他任务的未提交修改，不表示全部浏览器流程已通过。

- 删除 `apps/web/cards/templates.ts` 内的旧 `CardTemplates` 对象及字段测试对它的重复调用。当前页面使用 React 组件；保留静态 HTML 出口，供 Node 测试与设计画板使用。
- 删除 Apple 文案的固定数量与整组哈希测试。正常措辞变化不再要求更新哈希。
- e2e 合成正文改为 Markdown 字符串；媒体字段断言按当前组件更新。保留正文、身份、播放状态与写入保护检查。
- 本地能力说明的写入示例改为合法正文，并在已有 CLI 测试中校验示例。

恢复旧模板内容：`git show tests-before-cleanup-2026-10-22:apps/web/cards/templates.ts`。其他文件替换路径即可，不使用整仓回退。

未执行浏览器、e2e、原生窗口或线上检查。

## 本地检查

- 卡片字段、卡片渲染、文案、媒体播放和本地 HTTP/CLI：90 项非浏览器测试通过。
- 卡片字段浏览器脚本的 7 张合成卡片单独通过当前 Card 校验，未启动浏览器。
- `npm run typecheck`、`npm run files:check` 和 `git diff --check` 通过。
