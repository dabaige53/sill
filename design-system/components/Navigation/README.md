# Navigation

手机底部导航胶囊，固定三项：主页、AI、搜索。设置从右上头像进入，不是第四项。

- 高 `rail-row`，每格 `nav-tab`，`glass` 材质。只显示图标，当前项用 `ink` 并保留透明镜片（ADR 0039）。
- 切换立即更新，不拉伸、不弹跳。随主页滚动收起与恢复，见[动效](../../handbook/motion.md)。
- 多选时多选条占用同一轨道，胶囊隐藏；软键盘出现时让开。
- 桌面（宽于 650px）不显示：底部轨道只放 AI 框。

规则见手册[底部导航与反馈](../../handbook/interaction.md#底部导航与反馈)。实现：`apps/web/views/shell.tsx` 的 `Navigation`。示例由 `design-system/scripts/previews.ts` 从产品代码生成，不手改。
