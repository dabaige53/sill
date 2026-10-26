# Toggle

设置里的二元偏好开关，点击立即生效。

- `button.toggle[role=switch]`，关为 `toggle-off`，开为 `toggle-on`（与 `accent-fill` 同一个蓝）。
- 放在 `.setting-row` 右侧，左侧名称，下方 `muted` 小字说明。「卡片操作」的说明写适用类型，用 `aria-describedby` 关联（ADR 0042）。

实现：`apps/web/interactions/panel-settings.tsx`。示例由 `design-system/scripts/previews.ts` 从产品代码生成，不手改。

滑块为 `.toggle-knob`，平移 20px；使用 toggleSpring（visualDuration 0.32s、bounce 0.2），底色同步过渡，连续切换从当前状态接续。
