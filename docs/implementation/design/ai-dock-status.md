# AI 栏实现状态

更新：2026-10-29。本文记录当前源码接入范围，界面效果需按授权另行验收。交互要求见[AI 栏规范](../../specs/design/ai-dock.md)。

## 跨端状态

桌面 AI 框缩小与左右拖动：Web 已接入；手机不适用。macOS 已接入引用独立布局、直接拖动、按实际宽度移动、60px气泡、分阶段折叠及键盘移动。入口为 `apps/web/interactions/ai-collapse.ts` 与 `apps/apple/macOS/Shell/AIDock.swift`。

