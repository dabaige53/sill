# CardMenu

卡片情境菜单：桌面右键或 Shift+F10 打开，放当前卡片的少量可逆动作：收藏、稍后读、标签、标为已读或未读、选择。

- `card` 实底，`line` 边框，阴影 `shadow-glass`；菜单项高 `hit-target`，图标 `muted`，悬停 `surface`。
- Web 在卡片右上角下方打开；macOS 在指针处打开，靠近窗口边缘时向内翻转。
- 卡面不放「更多」按钮。手机用长按进入多选。

实现：`apps/web/views/app-card-actions.ts` 的 `cardMenuHTML`。示例由 `design-system/scripts/previews.ts` 从产品代码生成，不手改。
