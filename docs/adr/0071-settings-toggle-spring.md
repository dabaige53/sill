# 设置开关使用轻弹簧

日期：2026-10-26。状态：已接受。

用户在动画清单第03项要求参考 [Motion Toggle](https://motion.dev/examples/react-animate-view-toggle) 优化开关。

新增共享变量 `motion.toggleSpring`：visualDuration 0.2秒、bounce 0.2。Web/PWA滑块行程保留20px，底色同步过渡，连续切换从当前绘制状态接续。保留尺寸、文案、设置数据和键盘即时行为。

使用已安装 Motion 的 spring 与现有播放层，不为示例升级依赖或引入未导出的 AnimateView。此实现复用参考弹簧参数，不声明与 View Transition 实现完全相同。Mac仍用原120ms按压曲线，新效果登记为缺失、待同步；本次不改原生代码。

影响：设计变量、动效手册、Web播放适配与设置开关；设置画板尺寸和颜色不变。真实效果由用户复看，设计未发布到线上。
