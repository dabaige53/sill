# 设计规范

更新：2026-10-29。修改界面、样式、文案或交互前读取。产品范围见 [PRODUCT.md](PRODUCT.md)，本文件规定设计工作的依据与完成标准。

## 设计依据

| 修改内容 | 唯一正文 |
| --- | --- |
| 产品表达、颜色、材质、字体、图标 | [基础与组件](../../design-system/handbook/foundation.md) |
| 页面、导航和跨端交互 | [页面与交互](../../design-system/handbook/interaction.md)、[网页交互](../../design-system/handbook/web-interaction.md) |
| 卡片、叠放与预览 | [卡片交互](../../design-system/handbook/card-interaction.md) |
| 阅读、媒体与登录 | [阅读与系统页面](../../design-system/handbook/web-reading.md) |
| 间距和排版偏好 | [内容布局](../../design-system/handbook/content-layout.md) |
| 动效与手势 | [动效手册](../../design-system/handbook/motion.md) |
| 卡片正文与字段表达 | [内容规范](../specs/design/card-content.md) |
| 桌面 AI 栏 | [AI 栏交互](../specs/design/ai-dock.md) |

设计变量维护在 `design-system/tokens/`，界面文案维护在 `design-system/copy/zh-Hans/`。组件和画板复用产品实现；目录与生成方式见[设计系统说明](../implementation/design-system.md)。

## 改动顺序

1. 确认受影响的平台、入口、用户目标和修改范围，阅读对应规范与当前实现。
2. 需要改变设计规则时，先明确取舍并更新对应正文和变量；涉及重要决定时记录 ADR。
3. 修改实现与受影响的现行画板。参数使用已有语义变量；新增数值先判断是否需要独立规则。
4. 按[验证标准](../specs/cross-platform-checklist.md)检查内容、行为和平台差异。
5. 交付时同步实现说明，分别报告源码、生成产物、设计发布与实际验收结果。

交付说明受影响的入口、对应设计规则和未验证项。

## 跨端规则

平台差异在[跨端实现说明](../implementation/design/ui-alignment.md)记录。

共同界面以现行 Web 实现和设计手册为对照；不使用原生默认控件外观、SF Symbols 或单层阴影替换 Sill 的共同视觉；平台专属尺寸维护于 Apple 变量。保留键盘操作、焦点恢复、VoiceOver 语义及已有系统偏好分支。新增动效不另加“减少动态效果”分支。

## 交互与状态

保持信息结构、阅读位置和动作含义一致。状态反馈依据真实操作结果，外部完成语义遵循 PRODUCT.md。设计验证需要覆盖连续操作、取消和返回后的内容状态。

设计材料在仓库内维护，发布单独执行。当前工具无法更新线上设计副本时，交付明确列出待发布范围；执行步骤见[设计系统说明](../implementation/design-system.md)。
