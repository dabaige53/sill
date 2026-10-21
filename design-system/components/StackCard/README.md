# StackCard

叠卡：同一来源一小时内超过 5 张时叠成一摞，只占一张卡的位置。

- 顶层是最新一张，右上角用 `figure` 圆体写位置与总数；后面露出两层边缘。
- 左右翻看移动整张卡，点按或回车在原地展开。规则见手册[量大与时间](../../handbook/interaction.md#量大与时间)。
- 阈值可以按来源在设置里修改或关闭。

实现：`apps/web/cards/components.tsx` 的 `StackView`。示例由 `design-system/scripts/previews.ts` 从产品代码生成，不手改。
