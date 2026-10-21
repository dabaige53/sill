# Toast

撤销与失败提示：只在可以撤销的操作或失败时出现。

- `glass` 胶囊、`pill-radius`、`text-meta`；可撤销时右侧是「撤销」文字按钮。失败提示一直留着，右侧是关闭按钮。
- 停留时长与暂停条件见手册[两端共用](../../handbook/interaction.md#两端共用)。不叠在多选条或别的浮层上。
- 单张卡的收藏、稍后读、已读不弹提示。

实现：`apps/web/views/app-feedback.ts`。示例由 `design-system/scripts/previews.ts` 从产品代码生成，不手改。
