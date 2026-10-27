# ADR 0082：Web/PWA 采用 ui-lab 交互效果

日期：2026-10-27。状态：已接受。

## 决定

用户选择 ui-lab 的卡片展开、分栏菜单、设置开关与叠卡效果，并要求补齐按钮点压，刷新仅参考视觉。接续 ADR 0081 的右侧文章目录和 PWA 底部导航。此次只修改 Web/PWA，Mac 留待后续。用户要求删除动画工作台，暂不重建。

- 按钮保留 120ms、0.97 按压反馈；移出、松手、取消和窗口失焦恢复。PWA 导航的普通图标与选中图标副本一起缩放。任务只动标记，开关用自身拉伸反馈。
- 卡片展开与收回按用户最新要求恢复此次适配之前的实现，使用原有 detailContentDelay、cardContentReturn 与外框弹簧，不采用 ui-lab 的交接时序。
- 用户后续要求预览与全屏放大/缩小对齐卡片动画：两方向共用 cardTransform、cardSpring 与正文 100ms 延迟/120ms 显示，移除旧正文固定快照和等待外框结束后交叉淡化的两段流程。卡片从桌面打开与返回桌面的原动画保持不变。
- Web 分栏菜单打开 180ms、关闭 100ms；进入 0.95 倍、退出 0.98 倍。焦点与菜单动作保留。
- 设置开关按压朝移动方向拉伸 7px，拖动超过 3px 后接管滑块。松手选择轨道中点所在侧，拖动后的 click 不重复提交；取消只恢复。滑块通过 transform 表现宽度，轨道与点击区域尺寸不变。落点使用 visualDuration 0.3、bounce 0.25，超出部分最多挤压 5px。
- Web/PWA 叠卡跟手倾斜，后卡由 12px 下移、0.95 倍补位；离场倾斜 22 度并下落 40px。保留有限卡组、前后导航、首尾边界和原有提交阈值。不是删除、归档或循环抽牌。
- 下拉刷新按用户最新要求恢复本轮之前的实现，不采用 ui-lab 的旋转展示。
- 用户后续选择 Sidebar highlight 替换目录的 Scroll spine：移除章节比例分段、填充和整行选中底色，改为单圆点滑动、文字右移与强调色从左向右揭示。运动参数采用参考源码的 0.35 秒/bounce 0.15、300ms 让位、450ms 揭示、200ms 收回；颜色沿用 Sill 强调色，不添加示例分组。目录按后续要求移到正文左侧，使用参考的 32px 紧凑行、零额外行间距、15px 字号与标题下 6px 间距；“目录”旁添加 16px Lucide List 图标。目录点击短章节时保留显式选择；继续滚动后恢复按阅读位置更新。PWA 底部导航仍使用双边弹簧，裁切每帧读取当前选中项纵向位置。

Web 专用参数位于 foundation.json 的 motion.webInteraction；产品直接读取该源配置。Mac 仍使用既有 AppleMetrics，不新增或修改原生动画。

## 来源与范围

交互参考：https://github.com/xevrion/ui-lab 。按钮与产品状态继续由 Sill 控制，不引入 ui-lab 网站、Next.js 或整套组件依赖。开关与目录是其交互算法的适配实现，许可见下方。目录源码：https://github.com/xevrion/ui-lab/blob/main/src/lab/components/sidebar-highlight.tsx 。

删除 design-system/motion/、motion-library 构建脚本、服务入口及工作区依赖声明。历史证据保存在 docs/archive/motion-library.md。产品共用组件与其他设计画板保留。

用户明确要求本轮仅修改源码，不运行测试、构建或验证；生成画板与兼容导出尚未刷新，所有实际观感均未验证。设计未发布到线上。

## ui-lab 许可

MIT License

Copyright (c) 2026 Yash Bavadiya

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
