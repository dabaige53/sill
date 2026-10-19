# Toggle

设置「卡片操作」沿用名称与开关，名称下方用现有 small / muted 显示适用类型示例。示例通过 aria-describedby 关联开关，不并入名称，不改变点击范围、值或偏好存储；手机上增加行高并允许滚动，避免把长示例挤到开关旁（ADR 0042）。

偏好开关：设置面板中的二元偏好，点击立即生效。

- `button.toggle[role=switch][aria-checked]`，51×31，轨道 `toggle-off`，开启为 `toggle-on`（与 `accent-fill` 同一个蓝，不用系统绿），27px 白色滑块。
- 放在 `.setting-row` 右侧，左侧标题 14px + 说明 12px `muted`。设置页整页一层 `canvas` 底，白色分组。
