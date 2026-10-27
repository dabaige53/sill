# 抽屉滚轮与背景恢复研究

本记录对照 2026-10-27 的工作区源码、已安装的 Vaul 1.1.2 和浏览器标准。没有运行测试、构建或浏览器，也没有测量性能；以下建议尚未验证实际手感。

## 结论和推荐

保留 Vaul 的抽屉、指针拖动、遮罩、模态和滚动锁。根抽屉关闭 Vaul 的 `shouldScaleBackground`，由 Sill 的一个背景控制器统一处理打开、指针拖动、滚轮拖动、回位和关闭时的背景缩放、位移与圆角。这样根背景只有一处写入者，Vaul 关闭时就不会用它自己的旧样式覆盖滚轮状态。滚轮跟随仍需一份 Sill 的位移计算，但它应属于这个公共控制器，而不是继续在滚轮处理器中复制一套。

这是明确的取舍：产品仍使用 Vaul 的抽屉与指针能力，但根背景动画不再由 Vaul 自己绘制。Vaul 1.1.2 的公开接口提供 `onDrag`、`onRelease` 和状态回调，没有把滚轮进度送入内部拖动或控制内部背景的方法；只靠公开 API 无法让 Vaul 原生处理这种滚轮跟随。见 [Vaul API](https://vaul.emilkowal.ski/api) 与 [已安装包](../../../node_modules/vaul/dist/index.mjs#L879)。

嵌套抽屉继续使用 `NestedRoot`。滚轮跟随期间，Sill 暂时驱动父层；触发关闭时先停止滚轮写入，再让 Vaul 接管父层的关闭动画。指针释放不传自定义 `onRelease`，保留 Vaul 的内建回位。根背景是单一写入者；嵌套父层按阶段交接。若要求嵌套父层在整个生命周期也只有一个写入者，就需要自行接管 Vaul 的嵌套动效，或修改 Vaul，范围明显更大。

## 已确认的问题

1. **滚轮回位时的状态不等于画面。** 80ms 静默后，代码先把 `distance` 设为 0，再让抽屉和背景花 500ms 回位。回位途中，如果收到反向滚轮，代码在读取抽屉实际位置前就因 `distance` 为 0 而放行该事件；因此抽屉可能还在回位，内容已经开始滚动。同方向新输入会读一次前景的计算位置，但后景按公式重算，源码不能保证两层连续。见 [滚轮处理](../../../apps/web/interactions/phone-drawer.tsx#L163)。

2. **根背景有两个写入者。** Sill 在滚轮处理中写背景的 `transform`、`transition` 和圆角变量；同时 `shouldScaleBackground` 让 Vaul 在打开时保存背景的整段 `style.cssText`，并在关闭时恢复整段样式。后一次恢复会覆盖保存之后对同一元素做的样式修改。这是源码可确认的所有权冲突；它是否造成用户看到的那一次卡顿，不能仅凭源码断定。见 [Sill 的背景写入](../../../apps/web/interactions/phone-drawer.tsx#L143) 和 [Vaul 样式快照及恢复](../../../node_modules/vaul/dist/index.mjs#L416)、[Vaul 背景处理](../../../node_modules/vaul/dist/index.mjs#L715)。

3. **嵌套指针回位被覆盖。** Sill 对根抽屉和嵌套抽屉都传了 `onRelease`，但这个回调在嵌套时直接返回。Vaul 1.1.2 的 `NestedRoot` 在设置自己的 `onNestedRelease` 后展开其他属性，因此 Sill 传入的回调会覆盖 Vaul 的回调。子抽屉指针拖动但未关闭时，父抽屉不会通过 Vaul 的该回调回位。见 [Sill 回调](../../../apps/web/interactions/phone-drawer.tsx#L106) 和 [Vaul NestedRoot](../../../node_modules/vaul/dist/index.mjs#L1609)。

4. **打开动画期间存在明确的样式竞争。** Vaul 为前景和遮罩设置打开关键帧；正常动画规则优先于普通的内联样式。Sill 的滚轮处理没有与 Vaul 的指针拖动一样等待打开阶段结束，因此若在打开关键帧仍生效时输入，滚轮写入前景或遮罩的样式可能暂时不能决定实际画面，而后景已经被移动。见 [Vaul 样式](../../../node_modules/vaul/style.css#L1)、[指针的打开阶段限制](../../../node_modules/vaul/dist/index.mjs#L987) 和 [CSS Animations 规范](https://www.w3.org/TR/css-animations-1/#animations)。

5. **背景公式并非完全等同。** 根背景打开状态包含 `env(safe-area-inset-top)`，滚轮公式只使用 14px；安全区不为零时，两者目标不同。嵌套层的 Vaul 打开/拖动使用窗口宽度，而其指针回位实现使用窗口高度。见 [Vaul 根背景](../../../node_modules/vaul/dist/index.mjs#L735)、[Vaul 嵌套动画](../../../node_modules/vaul/dist/index.mjs#L1290) 和 [Sill 滚轮公式](../../../apps/web/interactions/phone-drawer.tsx#L143)。

## 如何修改

1. 根抽屉设置 `shouldScaleBackground={false}`。将现有背景缩放、位移和圆角集中到一个控制器，供 Vaul 的 `onDrag`、`onRelease`、关闭动作和滚轮共同使用。关闭原生背景缩放后，Vaul 也不再替根背景设置黑色底色；控制器应保留现有视觉效果，并在抽屉退出后恢复自己修改的背景样式。不要再让 Vaul 与 Sill 同时改根背景的相同样式。
2. 以抽屉**当前可见位置**为唯一滚轮进度。未达到关闭门槛时，用同一进度和同一时间线驱动前景、遮罩和根背景回位；回位期间收到任一方向的新输入时，先停止回位并接住当前进度，再决定继续移动抽屉还是交还内容滚动。不能在动画尚未结束时先将进度设为 0。80ms 保留为暂时无输入的判断，不称作真实松手。
3. 达到关闭门槛时，停止滚轮控制并保留当前位置，随后使用与按钮关闭相同的 `Drawer.Close` 路径。根背景从同一进度进入关闭；嵌套父层在停止滚轮写入后交给 Vaul。保持当前 500ms 和曲线作为一致性基线，不以调整时长代替修复。打开关键帧尚未结束时，应等待该动画结束或明确接管它，避免滚轮和关键帧同时控制前景。
4. 仅给非嵌套根抽屉传 Sill 的 `onRelease`，避免覆盖 `NestedRoot` 内部的父层回位。嵌套滚轮接管和交还时，要以可见位置开始，不先跳到预设的完整打开位置。

这些步骤以 [phone-drawer.tsx](../../../apps/web/interactions/phone-drawer.tsx) 为主；背景底色、圆角和固定视口可能涉及 [phone.css](../../../apps/web/styles/phone.css#L599) 与 [base.css](../../../apps/web/styles/base.css#L44)。保留当前路由、滚动锁和关闭后的内容刷新职责。这里没有实施方案，也没有验证代码或视觉效果。

## 关闭链路和证据边界

- 现有前景退出、Vaul 的背景恢复和嵌套父层恢复都使用约 500ms 和相同的缓动曲线。Vaul 的退出关键帧只指定终点，起点由当前计算值补齐；不能据此说它一定先回到打开位置，也不能把 500ms 本身认定为卡顿根因。按键、指针和滚轮的**开始时机及样式所有权**仍可能不同。见 [Vaul 退出关键帧](../../../node_modules/vaul/style.css#L207) 和 [CSS 关键帧起点](https://www.w3.org/TR/css-animations-1/#keyframes)。
- Vaul 的 `onAnimationEnd` 在状态变化后由 500ms 定时器调用，并非监听浏览器真实的动画完成事件。Sill 用它触发卸载与恢复页面；因此这个回调是时间约定，不能单独证明所有图层已完成绘制。见 [Vaul 定时器](../../../node_modules/vaul/dist/index.mjs#L881) 和 [Sill 回调](../../../apps/web/interactions/phone-drawer.tsx#L238)。
- 手机预览不走 Sill 的普通 `lockPageScroll`；Vaul/Radix 在模态遮罩上管理滚动。Sill 另将背景固定在视口内，关闭后卸载组件，恢复固定定位，再执行延迟的阅读内容刷新。Safari 中 Vaul 还会恢复 `body` 定位和滚动。源码能确定这些步骤存在，但不能证明它们是此处卡顿的原因。见 [打开和关闭](../../../apps/web/views/app-surfaces.ts#L110)、[背景恢复](../../../apps/web/interactions/phone-drawer.tsx#L59)、[刷新](../../../apps/web/interactions/reading-feedback.ts#L4)、[Vaul Safari 恢复](../../../node_modules/vaul/dist/index.mjs#L806) 和 [Radix 滚动锁](../../../node_modules/@radix-ui/react-dialog/dist/index.mjs#L112)。
- 浏览器 `wheel` 可以来自鼠标或触控板，增量的单位和数值随设备、系统与浏览器变化；某些事件不可取消。静默间隔不能可靠区分手指已离开、惯性仍在继续或下一次输入。较新的 [Pointer Events Level 4 工作草案](https://www.w3.org/TR/pointerevents4/) 定义了 `WheelEvent.momentum`，但本研究没有核实各浏览器的实现，不能将其当成跨浏览器可用的准确松手信号。另见 [MDN wheel 事件](https://developer.mozilla.org/en-US/docs/Web/API/Element/wheel_event)。
- 实际卡顿是否由样式覆盖、浏览器重排、滚动恢复、内容刷新或其他原因造成，以及修改后的手感是否符合要求，仍未验证。本记录不将源码推断写成设备上的测量结果。
