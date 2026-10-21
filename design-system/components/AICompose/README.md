# AICompose

AI 输入框。颜色用 `ai-composer`、`ai-control`、`ai-ink`。

- 桌面：底部居中的 AI 框，高 `rail-row`，`glass` 材质；一行内为 +、输入、麦克风、发送。拖入卡片时描边 `accent`，松手后成为框上方的上下文卡，可点 × 移除，不会自动发送。
- 手机：AI 页底部的输入容器，跟随软键盘上沿。
- 内置 AI 接入前，发送、麦克风、历史、新对话禁用；不显示运行状态、会话或回复，不伪造结果。草稿只在当前页面会话内保留。

规则见手册[桌面顶栏与 AI 框](../../handbook/web-interaction.md#桌面顶栏与-ai-框)。实现：`apps/web/views/shell.tsx` 的 `AIDock`。示例由 `design-system/scripts/previews.ts` 从产品代码生成，不手改。
