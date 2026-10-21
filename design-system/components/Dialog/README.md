# Dialog

对话框与面板：预览、阅读、设置、确认共用同一个 `dialog` 外壳。示例是桌面设置弹窗。

- `card` 底、`panel-radius`、`shadow-sheet`；遮罩 `dim` 只压暗、不模糊。
- 设置：桌面在窗口中央打开，头部「设置」与关闭钮，左侧分组「添加、桌面、外观、快捷键、数据与隐私」；手机为整页。不做设置搜索。见[设置弹窗](../../handbook/web-interaction.md#设置弹窗)。
- 预览与阅读：操作都在底部玻璃胶囊里，规则见手册[预览与叠放](../../handbook/interaction.md#预览与叠放)；资讯卡用[资讯阅读](../../handbook/web-interaction.md#资讯阅读)排版。
- 关闭后恢复原阅读位置和焦点。

实现：`apps/web/interactions/panels.ts`、`apps/web/interactions/panel-settings.tsx`。示例由 `design-system/scripts/previews.ts` 从产品代码生成，不手改。
