# AI 对话：同一个框的三种高度与结果行

日期：2026-10-23。状态：设计草稿，待用户确认。Web、手机 Web 与 macOS 已实现界面与交互（三种高度、结果行、手机对话页与历史抽屉）；内置 AI 未接入，产品中没有会话，框停在一行。开发服务 `?ai-preview` 与 macOS 调试构建 `SILL_AI_PREVIEW=1` 加载设计样例会话。真实窗口未验证。内置助手仍是远期可选，V1 范围不变（见 [Agent 驱动与 MCP 连接](../product/agent-mcp.md)）。

## 原因

内置 AI 接入后的会话只画了一块画板「网页 · AI 会话（接入后）」：会话列表从 AI 框上方弹出，收起、展开和完整视图之间怎样切换没有画，对话内容和助手的写入结果也没有画。手机 AI 页只有未接入时的空页面。用户要求参考成熟的聊天框方案，补齐展开、缩小、对话和手机对话页。

参考了 Linear、Voicenotes、ChatGPT、Manus、Bevel 等产品（来源见[设计参考](../../design-system/references/README.md)）。共同点：对话从输入框原地长出，不另开页面；回复不加头像；助手的动作以可点开的结果行列在回复下方；生成中把发送键换成停止。

## 决定

- 桌面 AI 框是一个对象，有三种高度：一行、展开、完整。展开时底边不动，向上长高，宽度仍为 640；完整视图居中，1040 宽，沿用原有尺寸。三者之间用卡片弹簧切换，不加遮罩，卡片仍可拖入。
- 对话是内容，展开和完整时用 `card` 实底；只有一行时保留玻璃，符合「内容在实底上，玻璃只给工具」。
- 一行时，有会话就在最左多一个会话按钮，显示执行中、有新结果或需要核对；没有会话时不占位。原有控件顺序不变。
- 会话列表在面板内从顶部展开，不再从 AI 框上方弹出。
- 你的话靠右成 `ai-composer` 气泡，AI 的话靠左，不加头像和名字。生成中句尾一个圆点，发送键换成停止；不写「思考中」之类的状态句。
- 结果行：每张被改动的卡一行，五种状态为待处理、执行中、已写入、没有写入、不确定是否写入。只有 Sill 回执写入成功才画对勾；不确定时先核对，不自动重发。点一行打开那张卡。
- 手机：有对话后顶行变小，显示会话标题，右侧仍是历史、新对话；消息与结果行和网页相同；历史从底部抽屉拉起。

## 影响

- 手册：新增 [AI 对话](../../design-system/handbook/ai-conversation.md)，收入桌面三种高度、结果行和手机 AI 页；[网页交互](../../design-system/handbook/web-interaction.md)与[页面与交互](../../design-system/handbook/interaction.md)只留入口。
- 画板：新增 49 网页 AI 对话规则、网页 AI 展开、网页 AI 完整视图、50 手机 AI 对话；`ScreenWebSession` 移到历史。
- 组件说明 AICompose、设计参考、[界面对账表](../product/ui-alignment.md) B09 与 M06。
- 新增设计变量：`ai-dock-width`、`ai-panel-inset`、`ai-full-width`、`ai-full-inset`、`ai-sessions-width`、`ai-bubble-radius`；macOS 专用尺寸移到 `tokens/apple.json`。
- 代码：Web `apps/web/views/app-ai.ts`、`ai-dock.tsx`、`ai-thread.tsx`、`interactions/panel-ai.tsx`、`styles/ai-conversation.css`；macOS `Shell/AIDock.swift`、`AIConversationViews.swift`、`Model/AIConversation.swift`。未接入时的禁用规则不变：发送、停止、重试、新对话都不可用。
