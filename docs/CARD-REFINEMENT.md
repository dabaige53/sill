# 卡片体验优化 · V0.3

> 历史记录，已被新规范取代。当前规范见 [设计手册](../design-system/README.md)、[交互规范](INTERACTION-SPEC.md) 和 [设计决策](DESIGN-DECISIONS.md)。

## 目的

解决卡片视觉权重接近、操作与内容分离、展开缺乏来源关系的问题。沿用纯卡片信息流与按需工具，不增加导航、侧栏或欢迎区。

## 三类优先样板

| 卡片 | 静止时的重点 | 操作时的重点 |
| --- | --- | --- |
| 阅读 | 标题、摘要、来源和封面形成层级；宽屏重点卡获得更大版面 | 独立打开入口、展开与收回的来源关系、阅读进度与收藏 |
| 提醒行动 | 时间状态、要做的事、当前结果 | 卡内完成或延后，保留独立阅读状态、撤销和恢复 |
| AI 引用 | 缩略图、来源、标题、摘要 | 查看原卡、逐条移除；加入引用不会自动发送 |

主要动作与次要工具分区。桌面 hover/focus 显露辅助操作，触屏保留可见更多入口。全部按钮使用可访问名称与至少 44px 点击区域。正文不能因按过一次就视为读完。

## 视觉与动效

- 内容为实体纸面；玻璃局限在临时控制和悬浮工具。
- 标题、正文、元数据使用不同权重，统一图标和间距。重点卡跨列仍遵循原排序，不因装饰重新编排优先级。
- 动画用于说明展开来源、完成后的空间补位以及按下反馈，不引入持续发光或整页倾斜。
- 状态写入、关闭和路由不等待动画完成；减少动态效果时保留轻量反馈。
- 卡片标题是独立打开入口，卡片内部动作不会同时触发预览。更多操作可由键盘退出。

## 研究到实现的映射

以下是官方参考与本项目设计判断的对应关系；没有复制收费组件源码，也没有安装这些参考库。

| 参考 | 用于本轮的判断 |
| --- | --- |
| [Linear 的界面层次](https://linear.app/now/behind-the-latest-design-refresh) | 辅助元素退后，主内容更明确 |
| [Craft Cards](https://support.craft.do/en/write-and-edit/styling/cards) | 内容类型决定卡片内部结构，统一外部规则 |
| [Apple Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/) | 内容与控制的材质分层 |
| [Raycast 情境操作](https://www.raycast.com/blog/a-fresh-look-and-feel) | 操作随当前对象出现，状态反馈位置稳定 |
| [Aceternity Expandable Cards](https://ui.aceternity.com/components/expandable-card) | 卡片与详情保持连续关系 |
| [Motion Expand Card](https://motion.dev/ui/components/expand-card) | 研究共享元素与正文分阶段入场；该高级组件源码属于 Motion+ |
| [Motion Swipe Actions](https://motion.dev/ui/components/swipe-actions) | 后续横滑研究；本轮用显式动作按钮，未实现横滑 |
| [React Aria Sheet](https://react-aria.adobe.com/examples/sheet) | 后续手势抽屉研究；本轮未实现拖动抽屉 |

当前实现使用 CSS、Web Animations API 和原生 dialog。实时数据、真实模型、后台提醒仍未接入。验证结果见 tests/REPORT.md。
