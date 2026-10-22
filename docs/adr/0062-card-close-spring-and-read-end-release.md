# 卡片收回改用弹簧，读完确认后松手即关闭

日期：2026-10-22。状态：已接受。部分取代 [ADR 0058](0058-mac-card-reveal-transition.md) 中「收回用定长曲线」一条。

## 原因

用户在真实窗口中反馈：

- 读完上推后出现白勾，停顿一段时间才关闭，整体不顺。用户要求白勾出现后等松手再关闭。
- 关闭时顶栏与 AI 框要和卡片一起恢复，不延迟，节奏与弹簧一致。
- 关闭用 320ms 定长曲线，手感不如展开的弹簧。用户要求收回也用弹簧。

## 决定

- 桌面卡片收回与展开使用同一个弹簧：mass 1、stiffness 274、damping 30（`motion.cardSpring`）。Web 与 Mac 相同。弹簧结束后才交回真实卡片并卸载浮层。
- 删除定长收回曲线：Mac 删除 `motionCardReturn` 与 `cardReturnX1`–`cardReturnY2`；Web `motion.cardReturn` 只保留 320ms 时长，用于遮罩与正文淡出。
- 读完上推达到 120px 时立即写入已读、显示白勾，不再固定停留；等松手才关闭。松手指：触摸抬起，或滚轮、触控板输入停止：Web 以停顿 120ms 或增量开始衰减为准，Mac 以结束或惯性阶段、鼠标滚轮停顿 `gestureWheelRest` 为准。Web 在松手后的下一帧重绘信息流中的这张卡片，再下一帧开始关闭；Mac 松手与写入回执都到才关闭。
- 顶栏与 AI 框随卡片关闭回来时，与卡片同一帧开始，用同一个卡片弹簧，不延迟。
- 白勾不单独先淡出，随详情一起收回：Web 用同一个卡片弹簧淡出，Mac 由收回的外框裁剪并随正文交接退场。工具胶囊与圆片仍在关闭开始时用 `motion.detailFade` 120ms 先淡出。
- 删除停留变量 `motion.finishHold` 与 `gestureFinishHold`。正文跟随上推距离的 60%（`motion.finishTravel`、`gestureFinishTravel`）。

## 影响

修改 foundation 设计变量；修改 Web `app-surfaces`、`card-transition`、`gesture-preview`，Mac `Motion`、`Reader`、`ReaderScroll`、`PreviewSheet`、`ReaderPage`；更新手册 motion 与界面对账表。弹簧尾段会让卸载晚于视觉结束，真实窗口中的手感仍需用户确认。
