# ReadEndRing

读完圆环：读到底继续上推时浮出，代替「读完了」这类文字。

- 圆弧随推的距离填满；填满后变成 `accent` 底加白勾，随后收起，卡片转为已读色。
- 推一半松手或系统取消触摸：圆环消失、正文回弹，卡片状态不变。
- 设置「读完上推收起」关闭时不出现。时长见[动效](../../handbook/motion.md)。

实现：`apps/web/interactions/gesture-preview.ts` 的 `pushRingHTML`。示例由 `design-system/scripts/previews.ts` 从产品代码生成，不手改。
