# 滚动、完成与回弹优化方案

更新：2026-10-27。

状态：Web/PWA第一轮已实施。当前Web主页与普通详情原生回弹手感已获用户确认，其余链路与PWA观感待复核；Mac尚未同步。用户最新明确：“全部优化”指本方案中滚动、完成与回弹链路涉及的全部动画组件。下文先按组件列出本次范围，第1至9节给出详细措施、参数、文件归属和构建路径；第10、11节的42项盘点保留为额外参考，不作为本次整套产品改造的执行范围。源码盘点不表示改进已经实现或用户已经确认观感。最初方案编写时的 HEAD 为 `c9c0c707`；当前实现和确认状态以最新提交及下方实施记录为准。

## 本次范围：链路中的全部动画组件

本次按“开始操作→跟手反馈→达标或取消→回位或关闭→页面更新”覆盖所有参与组件。不能只修改弹簧和释放计时器，而让圆环、工具栏、遮罩或背景更新仍按各自的等待运行。

### 首页下拉刷新

1. 首页内容承载层 `main`：使用ui-lab参考的480／0.7连续阻力，拉够64px可见位移后释放才刷新；释放后以0.35秒、bounce 0立即回位。重抓接续当前位移；不增加加载留白或独立1000ms悬停计时。[gesture-refresh.ts](../../apps/web/interactions/gesture-refresh.ts)
2. 刷新进度环 `#pull-ring .pull-progress`：进度共用内容的64px可见阈值，保留原标题区域位置与样式。真实请求开始才旋转，后续惯性不重发请求，不迁移到示例布局。
3. 刷新成功／失败图标 `.pull-check/.pull-retry`：圆环加载至少300ms、完成勾400ms后140ms退出，避免完成勾淡入与外层淡出同启。请求与结果合入不等待展示；错误立即保留可操作重试，不能当成功淡掉。
4. 顶部Sill标题 `.home-heading/.home-mark`：刷新时持续保持可见；圆环不替换或盖住品牌，定位在开始操作时测量，不逐帧重新排版。[overlay-gestures.css](../../apps/web/styles/overlay-gestures.css)

### 正文边缘回弹与读完完成

5. 正文滚动视口 `.sheet-scroll/#reader-scroll`：保持尺寸与裁切边界稳定，普通滚动继续原生处理。接近边缘不等于确认新手势，惯性抵达底部不能自动标记完成。
6. 正文内部运动层：Web桌面普通详情改试浏览器原生边缘反馈，取消该处自定义输入和位移；PWA继续600／48／1回位、160／0.15阻力与100ms速度窗口，停住后速度归零。读完上推独立处理，不与原生或普通回位叠加。[gesture-preview.ts](../../apps/web/interactions/gesture-preview.ts)、[gesture-rebound.ts](../../apps/web/interactions/gesture-rebound.ts)、[previews-components.tsx](../../apps/web/interactions/previews-components.tsx)
7. 读完进度／勾选圆片 `.push-ring`：120阈值、正文0.6跟随；进度转勾选不重播透明度，不先回位再关闭；取消、提交失败、关闭、切换详情都只有一个收尾路径。wheel达标何时关闭仍按第2节的待选输入约定处理。
8. 详情工具栏 `.float-bar/.reader-head/.reader-edge/.sheet-head-tools`：上推期间按既定规则退出，完成后保持退出，不被650ms自动恢复唤回；取消时从当前帧恢复。工具栏不自行等待另一个固定毫秒数。[preview-controller.ts](../../apps/web/views/preview-controller.ts)、[chrome.ts](../../apps/web/interactions/chrome.ts)

### 抽屉、关闭和返回卡片

9. 详情外框 `.preview-sheet`及阅读表面：下拉、取消复位、半屏／全屏和关闭按同一操作状态交接；只在实际离场完成后卸载。保留已认可的cardSpring 1／274／30，普通边缘弹簧不能覆盖卡片回收。[gesture-pull.ts](../../apps/web/interactions/gesture-pull.ts)、[motion-sheet.ts](../../apps/web/interactions/motion-sheet.ts)、[app-surfaces.ts](../../apps/web/views/app-surfaces.ts)
10. 手机抽屉把手 `.sheet-handle`：真实pointer释放立即决定复位、展开或关闭，取消与丢失捕获恢复当前状态；后续接入用户已指定的Vaul时，统一移交把手与正文手势，删除被替代的自定义控制，不叠加第二次弹跳。
11. 遮罩 `dialog::backdrop`与抽屉背后页面：拖动时跟随，回位或关闭时与外框同步；从当前透明度接续，失败／取消恢复。Vaul的背景联动与现有遮罩必须归同一抽屉生命周期，不能各自定时恢复。[motion-playback.ts](../../apps/web/interactions/motion-playback.ts)
12. 来源卡片及返回快照 `matchedSources/[data-return-face]`：在关闭前保留目标几何，收藏或已读过滤不在动画中途删掉目标。没有有效目标时明确淡出，避免飞向失效卡片。[card-transition.ts](../../apps/web/interactions/card-transition.ts)、[motion-panels.ts](../../apps/web/interactions/motion-panels.ts)
13. 跟随详情回收的工具胶囊：使用同一cardSpring进度跟随外框，保持图标大小；关闭取消后清除cardFlight与补偿变换，不再叠加一条自动恢复动画。它与第8项是同一工具栏在回收阶段的交接职责。

### 点击完成与背景列表

14. 任务／提醒圆圈、任务行及完成计数：局部更新勾选、划线、颜色和计数，保持当前按钮、焦点、滚动位置及手势监听；不重建整个详情、不触发整层淡入，提醒抽屉继续打开。[app-card-actions.ts](../../apps/web/views/app-card-actions.ts)、[app-feed-updates.ts](../../apps/web/views/app-feed-updates.ts)
15. 背景卡片网格、搜索背景结果和叠放层返回位置：刷新只合入实际变化，完成关闭后再执行必要列表更新；Web/PWA共用同一收尾规则。只局部改变时不整网格重画，不能用两个固定rAF间隔替代对重绘工作的控制。[reading-feedback.ts](../../apps/web/interactions/reading-feedback.ts)、[app-feed.ts](../../apps/web/views/app-feed.ts)

### 随滚动显示或隐藏的页面组件

16. 首页顶部栏 `#home-top`：初始保持原位；只在滚动规则下收起／恢复。与完成关闭带回顶部栏时同帧开始，不再等650ms停顿恢复。
17. 底部AI栏与手机导航所在轨道 `#dock`：本次只处理随滚动、详情打开／关闭的退出与恢复；冻结当前状态后交接，避免先出现再淡掉。AI折叠、多选切AI的新设计不属于此范围。
18. 顶部滚动边缘材料 `#scroll-edge`及阅读边缘：与所在工具栏共用位移与显示阶段，不额外排队。实际测得绘制成本后再优化模糊区域，保留用户原有材料设计。
19. 新内容提示 `#new-count`：刷新和任务／提醒状态变化可能改变数量；状态不变不重播，随顶栏位置变化保持连续。保留已有220ms显示、240ms隐藏与4px位移，不将其当成待取消Toast一起删除。[app-card-actions.ts](../../apps/web/views/app-card-actions.ts)、[chrome.ts](../../apps/web/interactions/chrome.ts)

### 共享释放规则影响的叠卡组件

20. 叠卡当前张、前后相邻张 `.deck`：保留已认可的35%阈值与260ms落定；此次仅接入一致的wheel序列、取消及新输入接手，处理140ms回位等待与160ms不断续期的锁，不重做翻卡效果。[app-stacks.ts](../../apps/web/views/app-stacks.ts)

以上20条按组件或同一组件的交接阶段列出，不表示新增20个产品功能。公共输入换算、意图判断、动画取消、惯性屏蔽、数据写入与延后刷新是共同支撑层，不再额外制造一套产品动画编号。

### 本次的参数和执行边界

- Web桌面普通详情用浏览器原生回弹，无产品自定弹簧或回位计时；PWA普通回位保留600／48／1、阻力0.15、尺度160和±750px/s上限。其他手势的300／34／0.9不整体替换，见4.1及ADR 0075。
- 首页刷新使用motion.pullRefresh独立参数：64px可见阈值、480／0.7连续阻力、0.35秒无弹跳回位；120完成阈值、正文0.6跟随保持。
- 刷新wheel使用连续3次衰减且幅度降至峰值50%，或80ms静默估计释放；其他回弹的40ms、共享80ms序列判断与240ms尾段保护保持。真实pointer／touch释放不套这些等待，观感仍待实测。
- 650ms工具栏停顿恢复是独立显示规则；当前240ms收起、320／420ms恢复先保留，统一恢复节奏另按用户确认选择。完成或关闭时的同步恢复不走650ms。
- 平台顺序保持先Web，再PWA触摸与安装条件，Mac逐组件对齐；Mac保留明确的系统手势阶段。原生iOS无这些界面，记录缺失，不编造入口。
- 搜索伸缩、AI折叠／高度／上下文、多选交接、照片轮播、播客改版、Toast迁移、首屏重设计、其他全屏与目录改版保留既有独立待办；它们不会因第10节参考盘点而自动加入本次实施。
- 本次文件路径、构建命令沿第6至8节；20条中涉及卡片回收、胶囊跟随和随滚动恢复的文件一并纳入审查，不只改gesture-preview.ts。

### 按整条链路验收

1. 首页下拉：内容、圆环、结果图标和Sill一起看；检查达标到实际请求、手指松开到回位两个时间点。
2. 正文边缘与完成：滚动视口、内部内容、圆片、工具栏一起看；检查取消、达标、继续惯性、反向和第二次操作。
3. 详情回收：外框、遮罩、来源卡片、回收快照、工具胶囊和页面导航一起看；检查目标消失、关闭打断和叠放返回。
4. 点击勾选：圆圈、当前行、计数、抽屉和背景列表一起看；确保不会整层闪白或滚动跳动。
5. 横向叠卡：当前张和相邻张一起看；普通滚动、惯性尾段和新主动操作分别确认。

上述链路全部纳入方案，但不会将已有勾选或代码检查自动等同于真实观感通过。本次只修正文档范围，没有实施代码改造。

## 1. 目标与边界

优先解决三种具体体验：下拉圆环已满却迟迟不开始刷新；读完上推已经打勾却停住才关闭；松手回弹与手势之间不连贯。

- 去掉业务动作前可被惯性尾段反复延长的等待。
- 真实拖动沿用用户提供的 `motion-rebound-demo.html`「原生质感」预设，保留实际释放速度。
- 滚动容器保持固定，只有内部内容层参与普通边缘位移。
- 当前手势、复位、关闭各有明确的控制对象；同一属性同一时间只有一个动画控制。
- 状态变化尽量局部更新，不因打勾重新打开、重建或淡入整个详情。
- 手机抽屉的释放、回位和背景联动属于本次链路，沿用用户指定Vaul方向；首屏、照片轮播、AI面板等独立改版只在第10节保留参考，不进入本次范围。手机抽屉不重做另一套自定义物理动画。
- 保留原有 ✅、问题记录和待确认状态。本方案未实施，不新增通过标记。

“等待动作发生”与“动画掉帧”分别验收。源码已确认多处人为等待；是否存在长任务、绘制过重及其耗时，需要获准后录制实际操作，不能用单元测试推断帧率。

## 2. 必须先明确的交互选择

项目 package.json、当前安装依赖与参考案例均为 Motion `12.23.24`。本轮已确认的差异在输入路径、速度传递、动画对象和等待规则，不需要先升级库。

案例输入是按住把手拖动，使用 pointerdown / pointermove / pointerup；项目当前操作是触控板滚动，使用 wheel。标准 WheelEvent 提供增量和单位，没有系统级手指结束及惯性阶段字段。因此只能保证复用视觉物理，不能把 wheel 适配称为案例输入的完全1:1还原。[W3C UI Events](https://www.w3.org/TR/uievents/#interface-wheelevent)

本轮Web/PWA按用户启动优化的要求采用以下输入约定，Mac仍单独沿用原生事件阶段：

1. 鼠标拖动与手机触摸：真实松手立即释放；达标的刷新在松手事件中开始，不追加计时。
2. wheel 下拉刷新：首个主动边缘事件只建立起点，后续完整累计后走480／0.7阻力，可见位移64px才就绪。连续3次衰减且幅度不大于峰值50%，或80ms静默时估计释放；不再单次减速就提交。未拉够、反向或打断不刷新，普通滚动抵达边缘的惯性不作为新下拉。
3. wheel 读完上推：达到现有120阈值即记录完成并显示勾选，下一个可绘制帧开始关闭，不再等120ms或三次衰减。取消当前“wheel 达标后还等估计松手”的行为。
4. 触摸或鼠标拖动的读完上推：保持“达标完成、实际松手关闭”，不用固定毫秒停留。
5. wheel仍需估计输入结束。刷新使用独立80ms静默及连续衰减判断，普通边缘回弹保留40ms；刷新在释放时判断是否拉够，读完完成保留达标执行，不给真实请求追加展示停留。

2026-10-27用户反馈「一下拉就刷新」后，下拉刷新已修正为第2项的拉够后释放规则；读完上推仍采用第3项。wheel释放是估计，不承诺与pointerup一样精确；不以调整弹簧代替输入判定。

## 3. 实现结构

保留现有 Gestures 与 MotionEngine，不引入新的状态库或滚动接管库。

数据路径：

```text
pointer / touch / wheel
→ 输入换算、方向与边缘意图判断
→ 当前操作状态
→ 位移反馈 / 达标动作 / 释放
→ 唯一的动画控制器
→ 关闭完成后处理列表更新
```

建议只增加两个职责明确的模块：

- `apps/web/interactions/gesture-input.ts`：wheel 单位换算、输入序列与边缘意图。它不写卡片数据，不操作动画，不把 wheel 猜测成确定的“鼠标”或“触控板”。
- `apps/web/interactions/gesture-rebound.ts`：参考案例的阻力公式、当前位移、释放速度及单次回弹。它不决定刷新或已读业务，不接管整页滚动。

沿用当前控制器分别承载刷新、读完和抽屉逻辑。状态只保留执行所需的 idle、tracking、armed、running、settling；没有异步动作的回弹不需要全部状态。每次打开详情建立当前操作实例，关闭或替换时销毁监听与动画，不积累旧回调。

各状态的动作：

- idle：普通浏览器滚动，不写位移，不拦截事件。
- tracking：确认由当前组件接手后直接跟随；每帧最多一次视觉写入。
- armed：达到业务阈值；刷新等待释放，wheel以连续衰减或80ms静默估计，pointer/touch等实际释放；读完wheel按选定方案立即执行。
- running：刷新请求或完成写入仅执行一次；后续惯性不重启请求、完成或动画。
- settling：唯一的复位或关闭动画；新主动输入从当前绘制位置接手。

## 4. 参数源与完整建议值

实施时把参数写入 `design-system/tokens/foundation.json` 的 motion 节，再通过现有导出生成 `design-system/tokens.json`；不要手改生成文件。当前只有部分参数存在。下列新增名称为建议名称，不表示已经导出。

### 4.1 普通边缘回弹：桌面原生反馈与手机参数

Web桌面大于650px时，普通滚动根html／body使用auto；进入下拉刷新后恢复wheel接手、main随动和原回位方案。body.is-pulling覆盖拉动和回位，期间根部暂为none，避免原生与自定义位移叠加，结束后恢复auto。此前只观察圆环而停用main随动的方案已因用户反馈撤回。普通详情无push-ring时，sheet-scroll／reader-scroll仍使用scroll与contain；读完上推、PWA根部none和抽屉不变。原生效果由浏览器与系统决定，以下物理参数只用于手机普通正文回位。

```ts
const edgeRebound = {
  type: "spring",
  stiffness: 600,
  damping: 48,
  mass: 1,
  restSpeed: 2,
  restDelta: 0.5,
};

const edgeDrag = {
  resistance: 0.15,
  displacementScale: 160,
  minSampleSeconds: 0.008,
  maxReleaseVelocity: 750,
  zeroDistance: 0.25,
};
```

- 位移公式：`y = sign × 160 × (1 − exp(−abs(d) × 0.15 / 160))`。下拉 sign 为正，底部上推反馈为负。
- 160是阻力曲线的渐近尺度，不是“拖动到160px后突然停止”的硬阈值。拖动100px约位移14.3px；拖动300px约39.2px。
- 速度按最近100ms可见位移计算：`velocity = (窗口末位移 − 窗口首位移) / max(0.008, 窗口间隔秒数)`，单位px/s，再限制到±750。超过100ms没有新样本则归零，避免停住后仍使用旧速度。
- 动画从当前绘制位移回到0，传入测得的释放速度；只有模拟释放或确实没有有效速度时使用0。
- 物理弹簧不同时设置固定 duration、visualDuration、bounce 或另一条 CSS 位移过渡。
- restSpeed / restDelta 是停止条件，不是额外等待。

Motion 官方支持物理弹簧与初速度；设置刚度、阻尼、质量的弹簧能接续速度。[Motion animate](https://motion.dev/docs/animate#velocity)、[Motion spring](https://motion.dev/docs/spring)

参考的 pointer 输入可逐行对齐上述案例。wheel 的 d 是事件增量累计，不能当成手指真实移动距离；估计的位移速度只用于视觉连续性，不对外声称恢复了原生手指速度。

手机保留的弹簧起点参考[dabaige53/ui-lab的stacked-drawer](https://github.com/dabaige53/ui-lab/blob/main/src/lab/components/stacked-drawer.tsx)的380／38／1，随后调为600／48／1；用户仍反馈偏慢，不能视为通过，约快20%只是参数推算。Web当前试用参考改为[ui-lab网站](https://lab.xevrion.dev/)整页原生边缘反馈，不继续提高刚度。原motion.edgeSpring继续用于其他手势。详见[ADR 0075](../adr/0075-content-edge-rebound.md)。

### 4.2 wheel 适配：需真实设备验证的起始参数

```ts
const wheelInput = {
  linePixels: 16,
  releaseIdleMs: 40,
  sessionGapMs: 80,
  rearmGain: 1.25,
  rearmDeltaPixels: 2,
};

const wheelTail = {
  idleMs: 40,
  maxShieldMs: 240,
};
```

这些值是建议试验值，不是从案例复制而来，也不是已验证最佳值。

- deltaMode=0直接使用像素；=1按16px/行换算，先保留项目既有换算；=2按当前滚动视口尺寸换算。轴向判断先于拦截，水平区域不抢纵向、纵向区域不抢水平。
- 40ms只用于未达标回位与旧尾段结束判断，不加到请求开始或完成关闭前。
- 80ms只用于识别新的事件序列，不是开始操作前必须等80ms。
- 在普通滚动中也记录最近增量。惯性抵达边缘后，不立即启动完成或刷新；用户在边缘开始新序列，或出现明确重新发力时，才由当前组件接手。
- 重新发力候选：同方向增量同时超过上次的1.25倍、且增加至少2px；方向反转立即交还或重判。不能仅凭一次微小数值抖动触发完成。
- 删掉当前通用的“四次稳定增长才能接手”门槛；以新的边缘意图判断替代，保留防惯性误完成的目的。
- 删除无所属操作的全局2.5秒屏蔽。确需防关闭后滚动传到背景时，只针对当前关闭操作，且仅拦截已识别的同方向衰减尾段，最长240ms；40ms无事件即结束。
- 新 pointerdown、touchstart、键盘输入、方向反转或重新发力应立即结束旧屏蔽。不能因上一个操作屏蔽新窗口或新详情。
- wheel 无可靠阶段字段，这些规则仍可能误判；必须用不同设备确认。240ms保护上限也可能让更长尾段剩余部分传到背景，这是要观察的取舍，不以无限延长屏蔽解决。

### 4.3 刷新、完成与退出

```ts
const actionTiming = {
  pointerReleaseDelayMs: 0,
  touchReleaseDelayMs: 0,
  wheelCommitDelayMs: 0,       // 估计释放后，不再追加提交等待
  requestDelayMs: 0,
  resultApplyDelayMs: 0,
  contentHoldMs: 0,
};

const refreshFeedback = {
  threshold: 64,              // 内容可见位移
  rubberDimension: 480,
  rubber: 0.7,
  settle: { visualDuration: 0.35, bounce: 0 },
  feedback: { loadingMinMs: 300, successHoldMs: 400 },
  wheel: { releaseIdleMs: 80, decaySamples: 3, decayRatio: 0.5 },
  ringFadeMs: 140,
};

const readFinish = {
  threshold: 120,
  contentTravel: 0.6,
  closeDelayMs: 0,
};
```

- 刷新采用上列独立参数，取消48／72／0.75旧映射。读完完成保留120与0.6，不受刷新曲线调整影响。
- 去掉请求开始前的等待和1000ms内容悬停；请求立即发起、数据结果立即合入。圆环展示独立使用300ms最短加载与400ms完成勾，避免真实请求过快时看不清反馈。
- 实际请求未结束时圆环继续旋转；请求已完成则补足最短反馈时间，再显示完成勾，400ms后以既有fast 140ms淡出。新操作可中断旧反馈，展示不阻塞数据生效。
- 如果请求在手指仍按住时已经完成，不强行把跟手内容拉回；真实松手后立即复位。这是等待用户输入，不是定时等待。
- 展示计时只控制圆环，不锁住已完成的请求，也不把失败当成功。刷新仅操作 Sill 当前工作区，不声称外部来源已同步。
- 读完勾选至少获得一次可绘制机会，再开始关闭；不设置额外固定展示毫秒数。数据写入或确认失败不得显示完成并关闭。
- 卡片关闭保持 `motion.cardSpring`：mass=1、stiffness=274、damping=30；放大切换保持 `motion.expandedSpring`：1 / 274 / 27。回弹预设只控制普通边缘回位，不覆盖所有卡片动画。
- 不动设置开关的0.32s / bounce 0.2，不把物理回弹参数应用到开关。

### 4.4 叠卡与工具栏

- 叠卡切换阈值保留宽度35%，落定保留260ms `dur-deck`，无弹跳。未达标采用共享40ms释放判断，删除单独140ms等待。
- 叠卡删除单独160ms不断续期的同向锁，改用当前序列只切一次及共享尾段识别；新主动操作能接手。
- 当前收起240ms、普通详情恢复320ms、桌面顶栏／AI栏独立恢复420ms。全量盘点建议将普通恢复以420ms试验，详见第10节12／35；这是待验方案，不是已确认参数。停顿恢复650ms保留为独立规则，不阻塞刷新、完成、关闭，也不与业务等待串联。
- 如果后续用户反馈650ms恢复本身偏慢，再单独调整，不借本轮一并修改。

## 5. 各链路的目标行为

### 5.1 首页下拉刷新

当前位置：[gesture-refresh.ts](../../apps/web/interactions/gesture-refresh.ts) bindRefresh、[refresh-input.ts](../../apps/web/interactions/refresh-input.ts)、[app.ts](../../apps/web/views/app.ts) refresh；gesture-pull.ts保留抽屉下拉关闭。

旧链路：圆环达标 → 反复重置180ms → 输入流结束 → 调用刷新 → 至少300ms反馈 → 成功保持480ms。

当前链路：边缘主动下拉 → 连续阻力与原位置圆环进度 → 可见位移64px只就绪 → 释放后请求、内容以0.35秒立即回位 → 数据结果立即合入，圆环补足300ms加载 → 完成勾400ms → 圆环140ms退出。wheel以连续3次衰减至峰值50%或80ms静默估计释放，pointer/touch在实际松手调用；单次大wheel事件只建立起点。不改变原UI或增加加载留白。

实施步骤：

1. 分离 setPull、startRefresh、releaseVisual 三个动作，不在 paint 中决定何时请求。
2. running期间只持有一个请求与当前视觉状态；不因惯性尾段再次请求。
3. 仅在确认接手的边缘事件上 preventDefault，字段、水平滚动和正常页面滚动保持原生。
4. PWA 下拉时保留 Sill 与主页结构，移除 `.home-heading.has-refresh .home-mark` 的隐藏规则或将圆环放到不替换标题的位置；不把品牌隐藏当成加载反馈。
5. 取消180ms提交计时与上述三个展示停留；按钮、快捷键刷新独立核对，不让手势代码重复套用另一层等待。
6. 无数据变化时不重新渲染全列表或重播首屏入场；有变化只合入实际变更并保留阅读位置。

### 5.2 读完上推与完成勾选

当前位置：gesture-preview.ts bindPush、[reading-feedback.ts](../../apps/web/interactions/reading-feedback.ts)、[app-surfaces.ts](../../apps/web/views/app-surfaces.ts)。

建议链路：边缘主动上推 → 进度 → 达标记录已读、勾选 → 按输入约定释放或立即关闭 → 唯一关闭动画 → 结束后更新列表。

实施步骤：

1. 使用共享输入判断，删除当前 letGo 中独立的三次衰减与120ms动作等待。
2. 未达标不提交已读，释放时只做一个回位；达标后不先回位再关闭。
3. 完成状态必须及时显示；业务写入仍保持现有的可靠结果语义，不伪造远端成功。
4. Web与PWA统一延后列表更新，复用现有 deferReadingRefresh / flushReadingRefresh；按整个详情关闭或叠放层返回完成的时机刷新，不能遗漏仍有父层的情况。
5. 关闭目标需要返回原卡片时，冻结当前原卡片几何与外观，关闭前不移除它、不重排背景。关闭完成后再应用过滤或位置变化。
6. 删除“先完整刷新列表、下一帧再开始关闭”的固定链路；显示勾选所需的绘制帧保留，不以连续两个 rAF 当作性能优化保证。
7. 勾选、正文和工具栏按同一个完成状态退出；已完成后不允许工具栏自动恢复并闪现。

### 5.3 点击任务与提醒完成

当前位置：[app-card-actions.ts](../../apps/web/views/app-card-actions.ts) toggleTask、[app-feed-updates.ts](../../apps/web/views/app-feed-updates.ts) changeReminder、[app-capture.ts](../../apps/web/views/app-capture.ts) replacePanelContent。

实施步骤：

1. 打勾只更新当前任务行的勾选、颜色、划线与卡片计数；保留现有行和滚动容器节点。
2. 不调用 renderContent 重建整个详情，不因一行任务状态变化触发 MotionEngine.fade(surface)。
3. 提醒完成沿用当前已实现的局部圆圈更新及保持抽屉打开；把背后列表更新限制到当前卡片或关闭后处理。
4. 不通过重建详情恢复焦点、滚动位置；节点不变时这些状态自然保留。原有手势监听继续有效。
5. 已读、收藏、待办筛选导致当前卡片离开列表时，先维护已打开详情，再在合适的关闭节点应用列表变化；不让关闭目标在动画中途消失。
6. 本批不重做 Store 持久化。先减少绘制工作；如实际记录证明同步 localStorage 写入过慢，再单独设计可靠的保存方案，不能为流畅擅自延迟或丢弃写入。

### 5.4 普通回弹、抽屉与叠卡

1. 在 previews-components.tsx 的 `.sheet-scroll` 内建立独立内容层，滚动视口及其裁切边界不移动；保留原内容和尺寸。
2. 原来依赖 `.sheet-scroll > .preview-cover` 等直接子节点的CSS与查询需同步调整，尤其 preview-controller.ts 的标题定位，不允许只加一层 div 后忽略布局变化。
3. 拖动与回弹都写这个内容层同一个变换属性；关闭由外层详情控制，接手时明确冻结并转交当前位移。
4. 管理到现有动画取消生命周期中。不要继续保留一个绕过 MotionEngine 管理、面板关闭时仍可能运行的局部 animate。
5. pointer 精确使用参考案例的速度、松手与单次弹簧；wheel只适配输入，不宣称手感数学上等同pointer。
6. 手机抽屉继续按用户指定的Vaul后续方案。当前轮次只修已有释放等待，不新增第二套抽屉动画。手机实际touch路径不加入wheel的40ms。
7. wheel模拟半屏展开优先明确的展开意图；如用“首次原生滚动开始就扩展”的方案，应取消120ms静默等待，同时验证正文位置稳定。该项是手机布局的wheel适配，不等于真实触摸已有120ms延迟。
8. 叠卡使用当前手势序列一次提交与共享尾段识别，继续支持水平原生滚动区，不影响纵向信息流。

## 6. 文件路径与执行批次

所有路径相对项目根目录 `/Users/w/.codex/worktrees/6b13/sill`。

### 批次0：参数和输入约定

- 修改：`design-system/tokens/foundation.json`；确认 motion.edgeSpring、motion.edgeDrag、motion.wheelInput、motion.wheelTail 等建议字段。
- 修改：`design-system/handbook/motion.md`，只在方案被选择并实施时更新正式规则。
- 生成：`design-system/tokens.json`及现有设计产物，通过原脚本生成。
- 同步：`docs/product/animation-checklist.md`、`docs/product/ui-alignment.md`，保留每端未验证状态。
- 输入约定：刷新达标只就绪、释放提交；读完完成达标执行。二者不能共用“达标即提交”的业务判断。

### 批次1：共享输入与参考回弹

- 新增：`apps/web/interactions/gesture-input.ts`、`gesture-rebound.ts`及对应 `tests/web/gesture-input.test.ts`、`gesture-rebound.test.ts`。
- 修改：`apps/web/interactions/gesture-preview.ts`、`gestures.ts`、`motion-playback.ts`中相关接手与取消路径。
- 修改：`apps/web/interactions/previews-components.tsx`、`apps/web/views/preview-controller.ts`、`apps/web/styles/overlays.css`、`overlay-gestures.css`中内容层与定位。
- 验收：普通滚动不被接管；参考拖动与速度一致；松手只有一次回弹；新输入能从当前帧接手；关闭后没有残留动画。

### 批次2：刷新与读完完成

- 修改：`apps/web/interactions/gesture-pull.ts`、`gesture-preview.ts`。
- 修改：`apps/web/views/app.ts`、`app-surfaces.ts`、`apps/web/interactions/reading-feedback.ts`中必要的调用和刷新时机。
- 核对：`apps/web/services/local-sync.ts`与云端 refresh 回调，保留并发、失败和未知结果规则；无证据不改传输层。
- 验收：圆环达标但仍在下拉时不请求，释放后不再追加等待；读完完成只一次；关闭期间背景不重排、不闪工具栏。

### 批次3：局部完成更新与横向手势

- 修改：`apps/web/views/app-card-actions.ts`、`app-feed-updates.ts`、`app-feed.ts`、`app-stacks.ts`及必要的任务行组件。
- 限制：不用统一重写 renderContent 生命周期；只让当前任务/提醒状态更新绕开整层替换。
- 验收：打勾后抽屉仍在原位置；不会重播详情淡入；连续任务操作、继续滚动与关闭仍可用。

### 批次4：跨端核对和收尾

- Mac：`apps/apple/macOS/Reader/ReaderScroll.swift`、`Model/FeedRefresh.swift`及 `design-system/tokens/apple.json`。保留明确 ended/momentum 阶段，不把Web估算器复制进AppKit；按选定产品规则核对300ms、1000ms、480ms反馈停留。
- PWA：与Web共用构建代码，单独验收真实触摸、窄屏wheel、独立安装三种情况；不能以桌面缩窄窗口替代真机。
- 原生iOS：当前缺少对应完整界面，本轮登记缺失，不编造可验收入口。
- 第一批共享输入完成后再接业务链路；共享 gesture-preview.ts、gestures.ts、tokens 由单个执行者修改，不让并行线程同时改同一文件。

## 7. 检查与验收

### 非浏览器检查

需要新增或调整的有意义场景：

1. 正常滚动到边缘的惯性，不自动刷新、不自动完成。
2. 在边缘主动操作达到48／120，只发起一次请求或完成。
3. 刷新达标后等待释放；衰减尾段不继续增加进度或反复续期请求。读完完成不被后续16ms连续惯性延后。
4. 刷新wheel以连续衰减或80ms静默估计释放，普通边缘回弹保留40ms；刷新达标才提交，未达标、单次大滚动、反向和打断不刷新。
5. pointer/touch释放不走wheel计时器；释放速度单位为px/s，测得值进入同一次弹簧。
6. 新方向或新主动输入立即解除旧屏蔽；保护不超过240ms，不能影响新详情。
7. 当前任务完成时，详情滚动节点、任务按钮和焦点保持，未触发整层淡入。
8. 完成后的列表更新在关闭后执行且只执行一次；叠放返回、搜索背景、筛选移除当前卡片都能完成收尾。
9. 失败不显示完成；刷新并发保持单次；短请求不被最短展示时间拖住。
10. 重复打开、关闭与打断不会积累监听、计时器、动画或重复请求。

建议检查命令，实施时按批次选择；本次编写方案没有执行这些产品测试：

```sh
node --import tsx --test tests/web/gesture-input.test.ts tests/web/gesture-rebound.test.ts
node --import tsx --test tests/web/gesture-refresh.test.ts tests/web/gesture-release.test.ts tests/web/gesture-preview.test.ts tests/web/gesture-surfaces.test.ts tests/web/gestures.test.ts
node --import tsx --test tests/web/reading-feedback.test.ts tests/web/app.test.ts tests/web/chrome.test.ts
npm run typecheck
```

新测试文件必须在对应实施批次创建后才能运行第一条。相关检查通过后，不反复全量跑测试来代替观感确认。

### 实际操作与性能记录

仅在用户明确授权浏览器／性能检查后执行；也可以由用户手工体验。不能以构建、JSDOM或mock动画通过代替。

- 先对照参考HTML的真实拖动，确认位移曲线、松手速度、回位和再次接手。
- 再分别检查触控板、普通鼠标滚轮、鼠标按住拖动、真实手机触摸；包括慢拉、快拉、临界点、反向、连续第二次操作。
- 记录输入达标、请求开始、结果、勾选可见、关闭首帧、列表更新的时间，直接验证等待是否删除。
- 目标：刷新确认释放后、读完完成达标后，在同一事件轮次启动调用；视觉变化在下一个可绘制帧开始；没有额外180ms/120ms延迟。时间线须区分浏览器调度和主线程工作，不能声称绝对0ms端到端延迟。
- 目标：输入控制器自身耗时不超过2ms作为初始检查线；60Hz一帧16.7ms、120Hz约8.3ms，记录是否有重复布局、整层渲染或超过50ms长任务。它们是待验证目标，不是已达标性能承诺。
- 成功标准：无“满环后等一段才请求”，无“勾选出现后因惯性反复延后关闭”，无整层闪白／重复淡入；新主动操作不会被旧操作挡住。

## 8. 构建、产物与页面路径

本节为实施时的完整顺序，不表示本次已执行构建。

### 8.1 Web 与PWA本地产品

在项目根目录执行，每条成功后再执行下一条：

```sh
cd /Users/w/.codex/worktrees/6b13/sill
bash scripts/design-init.sh build
bash scripts/design-init.sh check
npm run typecheck
npm run build
node scripts/build.ts --check
npm run files:check
```

- 参数源：`design-system/tokens/foundation.json`。
- 导出入口：`design-system/scripts/export-data.ts`，由design build调用。
- 前端入口：`apps/web/index.ts`及其引用的React视图、交互模块。
- 构建入口：`scripts/build.ts`调用Vite，输出 `dist/web/index.html`。
- 常驻产品入口：`http://127.0.0.1:4318/#feed`；Web/PWA共用这份本地构建，按设备、尺寸、独立显示模式走不同输入路径。
- 4318不监听源码。已有服务时无需重启，刷新网页即可读取新构建；只有服务没启动时才执行 `npm start`，不要再占同一个端口。
- 此轮不新增另一个演示工作台，不用5173页面替代4318验收，不修改用户数据。

### 8.2 云端构建

只有本地路径检查完成后，核对同一改动是否影响云端产物；构建不部署：

```sh
npm run build:cloud
npm run files:check
```

- 页面：`dist/cloud/index.html`。
- Worker：`dist/cloud/worker.mjs`；脚本还会构建MCP App相关产物。
- 由现有云端脚本消费相同Web代码。构建不证明真实宿主或安装PWA已经更新。

### 8.3 Mac

仅当相应Mac实现已修改时使用，不启动窗口：

```sh
npm run build:macos
node tests/apple/run.ts
```

- Swift工程：`apps/apple/Package.swift`。
- 产物：`dist/macos/Sill.app`。
- 参数通过现有生成流程进入AppleMetrics；不在Swift中复制Web估算器或另写一组毫秒值。
- 窗口体验按另行授权处理；当前方案不操作claude.ai、不发布设计、不部署或推送。

## 9. 交付与状态维护

每批交付必须说明：改了哪个入口、动作什么时候开始、剩余哪些计时器及其用途、运行过哪些检查、哪些平台仍未看过。

- checklist分别记录“已实施”“代码检查通过”“用户确认通过”，不能混用。
- 界面对账表记录Web、PWA、Mac、原生iOS的实际状态；没看过真实窗口保持未验证。
- 每项动作触发时机的改变都写清，区分刷新释放提交与读完完成达标执行，不能将所有wheel动作统一处理。
- 设计发布由后续Claude Code流程处理；Codex只改仓库。后续如创建PR，Merge Danger写明设计未发布到线上。

## 10. 额外参考：原42项的当前实现与改进措施

本节是前轮扩展盘点的留存，不是用户最新明确的本次实施范围。执行范围以上文“本次范围：链路中的全部动画组件”为准。本节按原编号逐项覆盖，不另编一套产品编号；当前事实来自代码，“措施”为候选，除明确已实现部分外均未实施。已有确认、附带问题与历史记录全部保留。

共用平台说明：Web指桌面产品；PWA须同时核对手机布局、真实触摸和独立安装条件，不能只按窗口宽度推断。原生iOS的 [SillMobile.swift](../../apps/apple/iOS/SillMobile.swift) 只有 localStore 入口，没有这42项界面，所有条目均为缺失，不安排虚假的iOS验收。以下每项单列Mac差异；Mac均未在真实窗口验证。

### 01 · 按压反馈

- 当前：Web/PWA使用120ms、scale 0.97，任务只缩放圆圈，手机导航只缩放图标；头像已接入。输入在pointerdown切到指针模式，修复键盘操作后第一次按压丢失。位置：[motion.ts 的 bind](../../apps/web/interactions/motion.ts#L125)。
- 措施：保留参数与效果，检查按下后拖走、取消、失焦、面板卸载和连续操作的释放；按压不能覆盖同一节点的布局变换。优先通过独立视觉子节点隔离，避免再给整张卡添加变换。
- Mac：通用按钮同为120ms、0.97，头像仍plain；补齐头像接入后单独确认。位置：[TopBar.swift](../../apps/apple/macOS/Shell/TopBar.swift#L144)。

### 02 · 任务勾选与提醒完成

- 当前：任务点击后更新存储、刷新列表，再用 renderContent 卸载并重建详情；正文变化触发整个surface淡入。提醒完成已保留抽屉并局部更新圆圈，但仍刷新列表。位置：[app-card-actions.ts](../../apps/web/views/app-card-actions.ts#L37)、[app-capture.ts](../../apps/web/views/app-capture.ts#L81)、[app-feed-updates.ts](../../apps/web/views/app-feed-updates.ts#L114)。
- 措施：任务只更新当前行、计数与状态；保留按钮、焦点、滚动容器及手势监听，不再整层淡入。提醒沿用局部更新，抽屉不自动关闭；背景卡片局部更新或关闭后处理。参数保持当前勾选反馈，不新增庆祝或整卡弹跳。详见5.3。
- Mac：圆圈完成用220ms、按压120ms；检查任务与提醒完成后的详情状态，不直接套用Web重建结论。[CardParts.swift](../../apps/apple/macOS/Feed/CardParts.swift#L163)。

### 03 · 设置开关

- 当前：主要设置滑块20px，visualDuration 0.32s、bounce 0.2，底色同步；未变化的开关不会因设置重绘中断。设备系统提醒开关使用独立React状态与伪元素，未接入同一动画。位置：[toggle-motion.ts](../../apps/web/interactions/toggle-motion.ts)、[system-reminder-settings.tsx](../../apps/web/interactions/system-reminder-settings.tsx)。
- 措施：复用同一滑块组件和动画入口，变化从当前绘制位置接续；设置立即生效，不等动画。系统权限请求的busy只控制重复请求，不能当成滑块动画等待。已有0.32s／0.2待用户复核，不继续盲调。
- Mac：仍是20px、120ms ease，底色直接变化；明确列为与最新Web弹簧规则不同，后续同步时使用Mac物理实现。[SettingsControls.swift](../../apps/apple/macOS/Settings/SettingsControls.swift#L60)。

### 04 · 分栏菜单

- 当前：Web打开200ms、关闭160ms，位移−4px、缩放0.95；已有动画身份检查与反向接续。灰色底色改为上下各内缩1px，相邻行合计2px白色间隔。[motion.ts](../../apps/web/interactions/motion.ts#L159)、[form-controls.css](../../apps/web/styles/form-controls.css#L453)。
- 措施：保留已确认动画，核对选中与相邻悬停同时存在时仍留白，以及键盘关闭后焦点恢复；不为灰底调整增加动画。手机不提供同一桌面菜单时标不适用。
- Mac：200ms／160ms菜单保留核对，灰底高度和间隔另验，不推定已与Web同步。[ScopeMenu.swift](../../apps/apple/macOS/Shell/ScopeMenu.swift)。

### 05 · 卡片菜单

- 当前：Web/PWA产品卡片右键菜单和更多菜单已移除；拖动期间抑制系统contextmenu属于拖动处理，不能视为旧产品菜单残留。
- 措施：复核右键与手机入口均不再弹产品菜单；直接收藏、稍后读、任务等操作保留。完成删除后不为此项设计替代动画。
- Mac：CardMenuLayer仍在，应列为对应取消要求的待办，不能标已删除。[CardMenuView.swift](../../apps/apple/macOS/Feed/CardMenuView.swift)、[DesktopView.swift](../../apps/apple/macOS/Shell/DesktopView.swift#L413)。

### 06 · 搜索交互与动画

- 当前：Web仍按聚焦与标签状态改变搜索宽度，背景scaleX、内容translateX，220ms。查询有140ms防抖并重新渲染结果，部分入口还先重复计算数量。[app-feed.ts](../../apps/web/views/app-feed.ts#L268)、[app-input.ts](../../apps/web/views/app-input.ts#L206)、[motion.ts](../../apps/web/interactions/motion.ts#L231)。
- 措施：Web固定较宽搜索栏，删除聚焦伸缩，聚焦即时显示搜索历史与推荐标签；不要等140ms才显示空查询内容。查询防抖与视觉反馈分开，先去掉重复查询，再据数据量决定是否保留防抖。固定宽度随整体布局约束，具体尺寸在页面设计中确认，不虚构一个已经通过的像素值。
- PWA：按用户要求，搜索栏上移，右侧为“取消”，同时显示历史并在真实点击链路内聚焦以唤起键盘；不能等过渡结束才请求键盘。上移建议先复用base 220ms、ease曲线作为待验值；键盘高度由真实视口变化驱动，不设置假定键盘高度或固定等待。
- Mac：仍随状态做220ms宽度变化；按桌面固定宽度、历史和推荐目标单独同步。[SearchField.swift](../../apps/apple/macOS/Shell/SearchField.swift#L127)。

### 07 · 卡片位置变化

- 当前：Web布局220ms，按宽度计算列和卡片位置；手机已禁用FLIP位移动画，但仍要做必要排版。[layout.ts](../../apps/web/interactions/layout.ts#L55)。
- 措施：桌面保留待确认效果，读取尺寸后集中写位置；无布局变化不重播。手机保持直接排版，不将“取消动画”误作取消布局。修复列表更新时优先局部处理，避免多次排版。
- Mac：列表与列数变化也用220ms layout；桌面适用，独立确认。[FeedView.swift](../../apps/apple/macOS/Feed/FeedView.swift#L44)。

### 08 · 首屏进入

- 当前：框架先显示，读取超过300ms后静态占位；首屏先排版再入场，280ms、10px上移、前10张30ms错峰；后续同步不重播。初屏图片不额外淡入。[local-launch.ts](../../apps/web/services/local-launch.ts#L7)、[app-feed.ts](../../apps/web/views/app-feed.ts#L168)。
- 措施：保留用户认可的错峰参数；统一主题、偏好、首份数据和图片占位的稳定顺序，排查闪屏与布局跳变。超过10张的可视卡片当前无错峰，真实密集布局后再判断，不自动增加整个列表等待。网页刷新与下拉刷新始终分开。
- Mac：前10张30ms、10px，实际280ms；注释仍有220ms说法，需纠正并核对初次数据到达和列表插入是否重复过渡。[FeedView.swift](../../apps/apple/macOS/Feed/FeedView.swift#L106)。

### 09 · 接收卡片

- 当前：新卡片220ms、−10px到0淡入；只有无详情与无拖动时主动显示新内容。来源身份决定是否新增，详情离场条件下存在140ms延迟。[app-feed-updates.ts](../../apps/web/views/app-feed-updates.ts#L68)、[motion.ts](../../apps/web/interactions/motion.ts#L353)。
- 措施：保留Web/PWA已有确认；减少重绘时保持卡片key与新增判定，不能让旧卡片被误当新卡片。140ms只属于指定交接条件，不能套给普通接收。
- Mac：插入透明度与10px位移，叠加列表220ms布局；只核对是否重复入场，不重做已认可方向。[FeedView.swift](../../apps/apple/macOS/Feed/FeedView.swift#L99)。

### 10 · 移出卡片

- 当前：通用列表移出路径有140ms快照淡出；但取消收藏调用 refreshCard 直接重新渲染列表，没有经过retire。详情关闭又依赖来源卡片仍存在，存在“取消后来源消失”的链路缺口。[app-card-actions.ts](../../apps/web/views/app-card-actions.ts#L14)、[app-feed.ts](../../apps/web/views/app-feed.ts#L218)、[app-surfaces.ts](../../apps/web/views/app-surfaces.ts#L187)。
- 措施：统一“记录来源位置、更新局部状态、列表移出、详情关闭”的顺序；已打开详情不因取消收藏消失。返回目标不存在时明确淡出返回列表，不飞向失效卡片。保留140ms离场，不靠延长时长遮住整层更新。
- Mac：移出140ms、其余位置220ms；检查收藏详情与原卡片移出交接，不能把Web重绘缺陷直接写成Mac已复现。[FeedView.swift](../../apps/apple/macOS/Feed/FeedView.swift#L99)。

### 11 · 内容更新

- 当前：列表以整卡textContent变化判定正文140ms淡入；详情比较innerHTML，变化后重建并淡入整个surface。云同步也可能走详情重建。[app-feed-updates.ts](../../apps/web/views/app-feed-updates.ts#L78)、[app-capture.ts](../../apps/web/views/app-capture.ts#L81)、[cloud-workspace.ts](../../apps/web/cloud-workspace.ts#L226)。
- 措施：保留已确认正文淡入；按真正变化的正文或版本触发，不把任务、收藏、标签、播放位置当成整个详情需要重开。媒体组件、滚动容器和焦点保留，缩小实际渲染范围。
- Mac：正文fingerprint和列宽变化都可能触发ContentFade，核对是否重复淡入；尚未证明掉帧。[CardTile.swift](../../apps/apple/macOS/Feed/CardTile.swift#L71)、[Motion.swift](../../apps/apple/macOS/Design/Motion.swift#L77)。

### 12 · 阅读工具栏收起与恢复

- 当前：下滚28px隐藏，上滚14px、停顿650ms、到边缘恢复；隐藏240ms，普通详情恢复320ms，桌面主页部分恢复420ms。[chrome.ts](../../apps/web/interactions/chrome.ts#L9)、[preview-controller.ts](../../apps/web/views/preview-controller.ts#L202)。
- 措施：与35的顶栏、AI栏共同整理出现／退出角色。建议用户能观察到的普通恢复统一参考420ms，退出保留240ms作为待验方案；卡片关闭带回的工具仍跟随cardSpring，不再独立启动一次恢复。650ms只控制停顿后恢复，不挡完成和刷新。
- PWA：“偏快”是未解决反馈，需实际触摸确认420ms建议；不因参数统一而恢复已取消的页面入场。
- Mac：当前详情320ms、首页420ms，同样核对角色；按选择后的规则同步，先保留现有650ms恢复条件。[ReaderScroll.swift](../../apps/apple/macOS/Reader/ReaderScroll.swift#L124)、[Chrome.swift](../../apps/apple/macOS/Shell/Chrome.swift)。

### 13 · 卡片展开与收回

- 当前：cardSpring为mass1、stiffness274、damping30；普通来源开合正文100ms延后再120ms淡入，工具120ms；取消、来源隐藏恢复和胶囊补偿已有管理。[motion-panels.ts](../../apps/web/interactions/motion-panels.ts#L329)、[card-transition.ts](../../apps/web/interactions/card-transition.ts#L38)。
- 措施：保留Web已确认效果。优先修10／11的来源失效与整层更新，不统一删除这些已选定的内容揭示编排。核对快速打开关闭、反向接手及工具不闪回；不能把所有延迟都解释为滚轮问题。
- PWA：归15的Vaul方案。Mac已有卡片几何过渡，按指定参考独立确认，不重新发明一套开合参数。[Reader.swift](../../apps/apple/macOS/Model/Reader.swift#L87)。

### 14 · 关联详情进入与返回

- 当前：Web进入280ms、返回220ms、10px与透明度；手机260ms页面滑动。实现先克隆当前详情作为过渡层，媒体替为空壳。关联行hover已透明无阴影。[motion-panels.ts](../../apps/web/interactions/motion-panels.ts#L152)、[detail-content.css](../../apps/web/styles/detail-content.css#L407)。
- 措施：保留待确认效果与返回位置。检查大正文快照开销、媒体空白及取消清理；先只捕获必要过渡外观，不为每次进入复制无关内容。手机关联导航复用同一抽屉状态，不保留两套独立滑动控制。悬停修改等待用户复核。
- Mac：280ms／220ms、10px，下层保留；核对返回滚动与焦点，关联行样式另验。[ReaderOverlay.swift](../../apps/apple/macOS/Reader/ReaderOverlay.swift#L23)。

### 15 · 手机详情抽屉

- 当前：已有自定义把手、正文下拉、滚动扩展与轮输入路径；resizeSheet通过clipPath和transform保持文字几何，但每次转换仍有布局读取与控制层补偿。手机布局wheel还在等120ms。[gesture-preview.ts](../../apps/web/interactions/gesture-preview.ts#L100)、[gesture-pull.ts](../../apps/web/interactions/gesture-pull.ts#L322)、[motion-sheet.ts](../../apps/web/interactions/motion-sheet.ts#L21)。
- 措施：按用户指定Vaul接管抽屉拖动、回位和半屏／全屏吸附，删除被替代的自定义监听与弹簧，避免同一手势被两套逻辑控制。正文原生滚动和背景联动一并接入；长内容上读时连续扩展，返回半屏不跳正文。用户提及的其他底部页面按同一方案逐个登记，不擅改主页导航。
- 参数：半屏／全屏保留现有产品含义，具体吸附点和Vaul配置在接入时对照版本及设备视口确定；本轮没有假定一个已测试的库默认值。Mac无手机半屏抽屉，不引入Vaul。

### 16 · 阅读右滑与读完上推

- 当前：上推120阈值、正文0.6跟随；wheel完成后用三次衰减或120ms估计释放，未达标180ms复位；Web关闭前还刷新列表。触摸有真实touchend。[gesture-preview.ts](../../apps/web/interactions/gesture-preview.ts#L360)。
- 措施：保留已确认上推方向，按第2节选择wheel执行时机；完成只一次，勾选与关闭连续，列表延后更新。未达标用唯一复位；已达标不先回弹再关闭。手机没有放大阅读正式入口时不安排右滑验收，不以源码存在为产品支持。
- Mac：有明确ended／momentum阶段，并等待写入成功与释放都满足；离散鼠标轮才用120ms。保留明确阶段，分别检查真实写入与视觉交接，不复制Web估算器。[ReaderScroll.swift](../../apps/apple/macOS/Reader/ReaderScroll.swift#L169)。

### 17 · 通用短提示

- 当前：Web/PWA仍有ToastSurface、showToast及淡入200ms、淡出140ms、8px、3.2秒停留；部分错误持续显示。[app-feedback.ts](../../apps/web/views/app-feedback.ts#L79)、[shell.tsx](../../apps/web/views/shell.tsx#L352)。
- 措施：按用户决定迁到通知中心／提醒承接，去掉浮动Toast和动画。当前不能声称通知中心已完整承接；先列明保存、同步、草稿、错误、权限和未知结果的去向，再移除入口、计时和暂停监听，不丢错误状态。
- Mac：ToastLayer仍存在，200ms／140ms、8px、3.2秒；同步承接后取消浮动层。[Toast.swift](../../apps/apple/macOS/Shell/Toast.swift)。

### 18 · 离线提示

- 当前：Web仍挂载OfflineNotice，本地通过visibility切换，云端直接显隐；它不是网络请求本身的等待。[app-card-actions.ts](../../apps/web/views/app-card-actions.ts#L51)、[cloud-workspace.ts](../../apps/web/cloud-workspace.ts#L142)。
- 措施：与17共用消息承接方案，取消独立浮动提示和动画，保留通知中的错误状态及可用重试操作。不得仅hidden界面而让异常无处可查。
- Mac：未定位独立离线胶囊，顶栏有FailureNotice；核对失败入口的归并去向，不冒充同一个元素。[TopBar.swift](../../apps/apple/macOS/Shell/TopBar.swift#L72)。

### 19 · 新内容提示

- 当前：显示220ms、隐藏240ms、4px；状态签名不变不重画，反向接续有身份检查；点击立即处理，没有额外动作计时。[app-card-actions.ts](../../apps/web/views/app-card-actions.ts#L78)、[motion.ts](../../apps/web/interactions/motion.ts#L255)。
- 措施：保留该入口，它不属于已取消Toast。核对多选隐藏／恢复、顶部栏收起时位置稳定，有真实新内容才验收；暂未发现需要删除的阻塞等待。
- Mac：NewHint有对应新内容／到期提醒显隐，保留待确认，不随Toast一起删。[NewHint.swift](../../apps/apple/macOS/Shell/NewHint.swift#L63)。

### 20 · 长按选择与拖动

- 当前：长按380ms、移动门槛8px；真正起拖才克隆最多3张卡片，之后直接写translate3d。松手即时清理。每次移动仍读取接收区尺寸。[drag.ts](../../apps/web/interactions/drag.ts#L122)。
- 措施：380ms是长按识别，不统一改0。保留桌面移动、触摸长按与滚动区分；只在实际测得起拖成本过高时简化副本和缓存接收区几何。失焦、取消、离开页面、尺寸变化均要释放当前拖动。用户保留拖入操作，不因取消多选静态接收区而删除。
- Mac：同为380ms、8px，释放140ms淡出缩小；核对首次起拖和取消。[CardTile.swift](../../apps/apple/macOS/Feed/CardTile.swift#L156)、[CardDrag.swift](../../apps/apple/macOS/Model/CardDrag.swift)。

### 21 · 卡片拖入AI上下文

- 当前：真正拖动才在底部原位置显示接收框，140ms淡入；Web沿用AI框。携带scale1.02、就绪1.05，扩散环1200ms、spread14px、opacity0.45到0，但通过inset扩张尺寸。[drag.ts](../../apps/web/interactions/drag.ts#L248)、[motion.ts](../../apps/web/interactions/motion.ts#L193)。
- 措施：保持已有接收位置和“不自动发送请求”。扩散环改为固定尺寸的transform与opacity，按实际宽高换算扩张14px的比例，不逐帧改变inset。取消时移除环；接收命中几何与实际可见范围保持一致，交接复用27。
- PWA：多选时不静态展示接收区，实际拖入保留；接收框不必机械复制Web环。Mac保留已有拖入与弹簧反馈，按同一意图核对。[AIDock.swift](../../apps/apple/macOS/Shell/AIDock.swift#L138)。

### 22 · 下拉刷新

- 当前：wheel最后一个事件后180ms才释放；手势刷新还有300ms最短反馈、480ms成功停留、慢请求1秒内容悬停上限；PWA有隐藏Sill的样式。touchend／pointerup本身可直接释放。[gesture-pull.ts](../../apps/web/interactions/gesture-pull.ts#L122)、[overlay-gestures.css](../../apps/web/styles/overlay-gestures.css#L14)。
- 措施：按5.1实施；请求调用不被惯性尾段反复延长，展示时间与真实业务完成分开。取消品牌隐藏；只在实际请求期间显示进度。wheel达标立即开始仍属待选择方案，不能暗改松手语义。
- Mac：触控板按ended释放，离散轮120ms；300／1000／480ms反馈规则仍在，单独按选定产品目标调整。[FeedRefresh.swift](../../apps/apple/macOS/Model/FeedRefresh.swift#L20)。

### 23 · 叠卡翻动

- 当前：Web/PWA已确认效果；260ms落定，wheel达宽35%立即切换，未达等140ms，同向惯性锁160ms且可续期。[app-stacks.ts](../../apps/web/views/app-stacks.ts#L70)。
- 措施：保留视觉、方向和阈值；只统一未达标释放和旧尾段管理。新主动输入能接手，不因为旧惯性连续延长锁定。原生水平滚动与纵向信息流先判方向，不抢输入。
- Mac：也有140ms离散等待和260mssettling期间拒绝新输入；检查快速第二次操作是否被挡住，保留已认可效果。[FeedView.swift](../../apps/apple/macOS/Feed/FeedView.swift#L302)。

### 24 · 播客播放区收合

- 当前：旧播放器、紧凑吸顶播放器、Tab、背景跟随与scroll时间轴仍在，四条暂停时间轴跟随滚动；播放位置还有保存与卡片刷新。[media-detail.tsx](../../apps/web/cards/media-detail.tsx#L81)。
- 措施：按checklist记录的PR72介绍页意图，移除整条播放器及附属动画、监听、观察器、紧凑状态和旧CSS；保留封面、介绍、章节只读、底部轻操作与共用详情开合。先明确收听记录与playbackPosition只读规则，不新增播放能力；不是把旧收合调快。
- Mac：同样仍有播放器、pinned section、紧凑控件和Tab，需同步清理。[MediaDetail.swift](../../apps/apple/macOS/Reader/MediaDetail.swift#L302)。本次仅依据已记录需求，没有重新核对外部PR状态。

### 25 · 预览与放大切换

- 当前：文章／视频新布局先挂载，只有背景外框用expandedSpring 1／274／27变形；正文revealDetail(body,0)同帧开始120ms淡入，工具与目录未统一等待。这是内部组件早于外框的直接代码条件。[motion-panels.ts](../../apps/web/interactions/motion-panels.ts#L370)。
- 措施：旧内容保持过渡外观，先让新外框运动；在实际动画完成或选定进度节点揭示新工具、目录和媒体控件，不用sleep猜弹簧时长。可先采用完成回调后120ms内部淡入作为待验方案；快速反向从当前帧接手。视频全屏UI另需设计，不能靠延迟替代。
- PWA手机／独立安装不支持该放大入口时标不适用；播客全屏按24移除。Mac已有几何独立过渡，核对内部出现时序，不能说已复现Web缺陷。[Reader.swift](../../apps/apple/macOS/Model/Reader.swift#L110)。

### 26 · 阅读目录

- 当前：Web点击已直接写scrollTop，指示条普通阅读时220ms移动；目录和正文使用各自absolute定位，仍需解决重叠。PWA窄屏主要靠CSS隐藏，不能推定所有standalone都不生成目录。[reader-layout.tsx](../../apps/web/interactions/reader-layout.tsx#L58)、[reader-layout.css](../../apps/web/styles/reader-layout.css#L24)。
- 措施：保留点击即时定位和删除目录切换图标的决定；正文、目录使用明确双列与同一顶部基线，纳入25的全屏揭示。按产品平台条件不挂载PWA目录，不只藏按钮；不恢复平滑滚动。指示条可保留220ms待确认，不影响正文立即跳转。
- Mac：目录切换按钮仍在，章节点击仍用220ms平滑动画；应同步删除切换按钮与即时定位。[ReaderPage.swift](../../apps/apple/macOS/Reader/ReaderPage.swift#L81)。

### 27 · 多选条与AI／导航交接

- 当前：多选条180ms、8px并可反向接续；Web AI框和PWA导航仍用display直接替换。进入AI固定等200ms聚焦。Web批量收藏、稍后读、标签已保留选择，全部收藏可批量取消。[app-selection.ts](../../apps/web/views/app-selection.ts#L14)、[controls.css](../../apps/web/styles/controls.css#L464)、[phone.css](../../apps/web/styles/phone.css#L174)。
- 措施：同一个底部位置保留容器，由旧区域退出、新区域进入共同交接；取消display硬切和固定200ms聚焦。先以base220ms、8px、ease为待验值，焦点与可交互状态由真实完成信号控制；触摸要唤键盘时在用户动作链内提前处理。不要动画未完就清空选择或让两个区域同时可点。
- Mac：仍在收藏／稍后读／标签后清空选择，无全部收藏蓝态，toAI也等200ms；同步行为与交接，保留直接批量按钮。[DesktopView.swift](../../apps/apple/macOS/Shell/DesktopView.swift#L417)、[SelectionBar.swift](../../apps/apple/macOS/Shell/SelectionBar.swift#L29)。

### 28 · AI输入框折叠

- 当前：220ms背景横向移动和scaleX，子内容淡入横移，CSS即时切display。手动toggle与sill:expand-ai自动恢复不共用尺寸捕获入口；快速切换会重新从透明开始。[shell.tsx](../../apps/web/views/shell.tsx#L115)。
- 措施：用户明确不认可当前变形，先统一手动、拖入、多选恢复的状态入口与当前帧接续。替代方向建议用原位淡出缩小到0.97、恢复入口淡入，不再把长输入框横向压成气泡；建议140ms退出／220ms进入，仅作待选方案，不宣称设计已确认。新方案仍需保留恢复入口与输入内容。
- Mac：无同一侧边恢复气泡，只有高度状态；不强行补一个新功能。[AIDock.swift](../../apps/apple/macOS/Shell/AIDock.swift#L20)。

### 29 · AI面板高度切换

- 当前：line／panel／full先改内部布局，再动画width、height、transform，cardSpring 1／274／30；背景220ms。正式会话入口受限，开发样例不能替代验收。[app-ai.ts](../../apps/web/views/app-ai.ts#L112)。
- 措施：保留待确认。将内容固定布局与外框裁切过渡分开，内部显示纳入同一个切换状态；不要每帧让复杂会话重新排版，也不要在动画途中强制滚到底。先实测width／height成本再决定是否使用固定外框与clip过渡，不仅凭属性名称判掉帧。
- Mac：高度用card弹簧、键盘即时，正式sessions为空；同样无正式会话验收入口，不用DEBUG状态打勾。[AIDock.swift](../../apps/apple/macOS/Shell/AIDock.swift#L41)。

### 30 · AI上下文条目进入与删除

- 当前：新增140ms、4px；当前代码已加入删除120ms、4px淡出，不能再写“没有删除动画”。删除后其他条目仍直接重排；删除被取消的回调没有完成数据更新。[app-selection.ts](../../apps/web/views/app-selection.ts#L37)、[actions/selection.ts](../../apps/web/views/actions/selection.ts#L43)。
- 措施：与27一起做连贯交接，条目离开同时让空间收合或邻居平移；以当前测量尺寸处理换行，不用固定条目高度。语义删除与视觉离场明确归属，取消或重画后不留下inert条目、旧数据或重复焦点。保留140／120ms作为起点，不延长整批操作。
- PWA没有同一独立删除条目入口时标不适用。Mac已有140ms进入、120ms退出，但父事务也有动画，核对叠加归属。[AIDock.swift](../../apps/apple/macOS/Shell/AIDock.swift#L30)。

### 31 · 图片加载后淡入

- 当前：首屏图片直接显示，后续新src加载后140ms淡入；已有缓存与complete判断，图片到达会调布局。[app-feed.ts](../../apps/web/views/app-feed.ts#L194)。
- 措施：保持用户跳过状态，不自动新增动画。先确保封面尺寸预留，慢图不引起卡片高度突跳；卸载或重复渲染不积累load监听，不让旧图片回调触发当前布局。实际成本和观感仍未确认。
- Mac：AsyncImage成功直接出现，未定位独立加载淡入；不据此补一个新动画。[CardParts.swift](../../apps/apple/macOS/Feed/CardParts.swift#L223)。

### 32 · 照片轮播

- 当前：按钮、缩略图、方向键可切换，但每次重建lightbox，图片立即播放140ms淡入，未等load/decode；没有定位到拖动轮播。[panel-card.tsx](../../apps/web/interactions/panel-card.tsx#L386)、[actions/media-reminders.ts](../../apps/web/views/actions/media-reminders.ts#L6)。
- 措施：按用户指定Motion Carousel参考建设固定舞台和图片轨道，横向拖动跟手、松手切换或回位；先判横向意图，纵向浏览仍可滚。图片准备好后交接，保留标题、缩略图、键盘和索引，不重建整个弹窗。背景随页面布局为白或黑。具体切换阈值与轨道弹簧在参考接入时记录，不用当前140ms淡入冒充轮播。
- Mac：有140ms图片切换与按钮／键盘，尚无拖动轮播；同步拖动和背景目标后独立体验。[PhotoLightbox.swift](../../apps/apple/macOS/Reader/PhotoLightbox.swift#L93)。

### 33 · 普通弹窗进入与退出

- 当前：无来源Web弹窗280ms、10px淡入，关闭220ms、10px淡出；手机设置为页面，不重播普通入场。[app-surfaces.ts](../../apps/web/views/app-surfaces.ts#L131)、[motion-panels.ts](../../apps/web/interactions/motion-panels.ts#L479)。
- 措施：Web设置与PWA设置已有确认，保留；标签等其他弹窗继续待确认。重用公共层但不批量替换所有弹窗，保留键盘即时、焦点圈定和返回原控件；Toast取消时清理面板内迁移Toast的残留分支。
- Mac：普通弹窗280ms／220ms，对应设置尚未真实窗口确认；旧CapturePanel需与用户取消记一笔要求核对入口，不顺带删共享编辑能力。[Panel.swift](../../apps/apple/macOS/Shell/Panel.swift#L25)。

### 34 · 顶部栏首次入场

- 当前：Web本地框架直接显示，首屏卡片单独入场，未见重新给home-top做首次enter；主题、字体仍需真实网页刷新检查。[app-lifecycle.ts](../../apps/web/views/app-lifecycle.ts#L111)。
- 措施：保留Sill与搜索栏初始原位，首次不等待数据、不随卡片向下加载；与35滚动收起恢复独立。不能为消除闪屏又把整个body隐藏。
- Mac：仍entered=false，yield后420ms出现；取消首次隐藏与入场的同步待办，保留后续滚动显隐。[TopBar.swift](../../apps/apple/macOS/Shell/TopBar.swift#L95)。

### 35 · 主页导航与工具栏收起恢复

- 当前：与12共用28／14px、650ms，收起240ms；桌面独立恢复420ms，手机普通恢复320ms。PWA顶部还有28px背景模糊，是否造成绘制成本未测量。[chrome.ts](../../apps/web/interactions/chrome.ts)、[phone.css](../../apps/web/styles/phone.css#L25)。
- 措施：与12统一出现角色和取消接续；建议手机普通恢复以420ms试验，退出仍240ms。多选和打开详情时暂停背景自动显隐，关闭时跟同一card弹簧恢复，不额外排队。模糊层保留设计，只有实测证明成本过高才缩小区域或调整材料，不以添加will-change代替诊断。
- Mac：首页420ms恢复、240ms隐藏，卡片交接另用card；核对与详情工具的对应节奏。[Chrome.swift](../../apps/apple/macOS/Shell/Chrome.swift#L22)。

### 36 · 云端启动等待

- 当前：会话／首份数据超过300ms才显示静态占位，完成后只一次卡片首屏入场；不是历史清单所写的140ms占位淡入。[cloud-entry.ts](../../apps/web/cloud-entry.ts#L440)、[cloud-workspace.ts](../../apps/web/cloud-workspace.ts#L178)、[feed-boot.tsx](../../apps/web/atoms/feed-boot.tsx)。
- 措施：保留300ms延迟出现和静态骨架，不设最短加载停留，不恢复旧淡入。核对快速登录失败、慢会话、慢数据和宿主恢复，真实结果到达即可换内容；本地4318不能代验云端入口。
- Mac：connecting主要画canvas，无同一骨架淡入；记录差异，不能伪造对应完成。[SillApp.swift](../../apps/apple/macOS/App/SillApp.swift#L134)。

### 37 · AI等待圆环

- 当前：running状态有1100ms线性循环；每次paint会取消并重开循环，状态未变也可能重置相位。[app-ai.ts](../../apps/web/views/app-ai.ts#L189)、[motion.ts](../../apps/web/interactions/motion.ts#L65)。
- 措施：用户指定待定，保留待定。若后续保留，按running状态进入／离开启动和停止，状态不变不重启，卸载时取消；不增加最短等待。正式运行入口不足，不以开发示例验收。
- Mac：存在AISpinner但受空sessions限制，同样待定。[AIConversationViews.swift](../../apps/apple/macOS/Shell/AIConversationViews.swift#L8)。

### 38 · 多选操作菜单

- 当前：Web/PWA已移除自定义多选右键菜单，保留直接操作条；拖动contextmenu抑制仍有明确用途。[selection.tsx](../../apps/web/atoms/selection.tsx#L33)。
- 措施：仅复核删除结果，不为已取消交互设计动画，不误删直接批量按钮与拖动保护。
- Mac：SelectionBar仍有contextMenu，登记对应取消待办。[SelectionBar.swift](../../apps/apple/macOS/Shell/SelectionBar.swift#L45)。

### 39 · 提示下滑关闭

- 当前：Web/PWA仍绑定Toast触摸拖动，超过24px向下60px退出，并维护Toast时钟与序号。[gesture-surfaces.ts](../../apps/web/interactions/gesture-surfaces.ts#L200)。
- 措施：随17一起移除浮动Toast、下滑监听、计时与样式；不保留一个已经没有展示面的手势。通知中心内部的消息处理另按其设计，不移植Toast下滑动画。
- Mac：未见同一下滑入口，Toast浮动层随17取消，不补触摸功能。[Toast.swift](../../apps/apple/macOS/Shell/Toast.swift#L48)。

### 40 · AI框横向移动

- 当前：Web指针位移超过4px开始，直接写translate，松手无等待；取消、丢失捕获有清理。每次move还测量可移动范围。[shell.tsx](../../apps/web/views/shell.tsx#L188)。
- 措施：用户已确认，保留效果。必要时缓存起拖范围、resize后更新；核对折叠动画中开始横移是否因强制finish产生跳变，不重做横移本身。
- PWA手机不适用；Mac没有对应左右停靠拖动，不擅自补功能。[AIDock.swift](../../apps/apple/macOS/Shell/AIDock.swift#L81)。

### 41 · 手机阅读页顶部下拉

- 当前：reader路径存在手机触摸下拉关闭代码，但用户已明确手机不支持放大阅读，尚无确认可达入口。[gesture-pull.ts](../../apps/web/interactions/gesture-pull.ts#L434)。
- 措施：标记无正式入口，不安排用户在不存在的全屏阅读页操作；确认可达性后才决定保留或清理旧路径。不能为凑齐42项新增手机放大入口；实际详情抽屉仍归15。
- Mac无同一顶部下拉入口，右边缘与底部手势归16／42。[ReaderScroll.swift](../../apps/apple/macOS/Reader/ReaderScroll.swift#L193)。

### 42 · 普通边缘阻尼与回弹

- 当前：Web新增指数阻力160／0.15、弹簧300／34／0.9，但仍以wheel增量估计释放、零初速度并移动整个滚动容器；用户仍反馈不对，未通过。PWA旧普通阻尼14px随Vaul另处理。[gesture-preview.ts](../../apps/web/interactions/gesture-preview.ts#L13)。
- 措施：按4.1／5.4实施案例的内容层、真实拖动与速度接续；wheel输入适配单列，不再声称输入完全1:1。整合到公共动画取消生命周期，关闭、替换或新手势都能停止旧回弹。先还原结构和交接，再调参数。
- Mac：底部为14px有理阻尼、弹簧1／600／45；速度计算有单位与归一化问题需要专项核对，不能直接把Web px/s抄为Swift初速度。系统明确阶段保留。[ReaderScroll.swift](../../apps/apple/macOS/Reader/ReaderScroll.swift#L247)。

## 11. 额外参考：42项跨任务工作顺序

本节仅保留前轮提出的跨任务工作顺序，不作为本次全部执行的清单。当前只推进滚动、完成、回弹链路及其参与组件。搜索、AI新设计、照片、播客和消息迁移仍按其原独立任务处理；不能因为本节列出就视为本次实施授权。

### 第一组：解除等待和错误交接

- 覆盖02、10、11、16、22、42，以及23／41中的共享输入部分。
- 先确定第2节wheel达标执行的产品选择；然后建立输入与动画归属，减少完成时的整层重建，修复失效来源和背景提前重排。
- 主要文件：gesture-input.ts、gesture-rebound.ts、gestures.ts、gesture-preview.ts、gesture-pull.ts、motion-playback.ts、reading-feedback.ts、app-card-actions.ts、app-feed-updates.ts、app-feed.ts、app-surfaces.ts、app-capture.ts、previews-components.tsx及相关样式。
- 参数详见第4节，构建与检查沿第7／8节；本组不改已认可普通卡片开合参数。

### 第二组：删除已明确取消的能力与残留

- 覆盖05、17、18、24、38、39，以及25的播客全屏部分。
- Web/PWA已删的菜单只复核；Mac同步对应取消。消息先有可查的承接，再删Toast／离线浮层与相关时钟。播客按介绍页清理播放器、Tab、滚动吸顶、全屏及播放状态写入，先确认只读收听记录边界。
- 主要文件：app-feedback.ts、atoms/feedback.tsx、shell.tsx、gesture-surfaces.ts、cloud-workspace.ts、media-detail.tsx及对应Mac菜单、Toast、MediaDetail文件。删除共享函数前按实际引用逐个迁移，不能误删新内容提示19和直接批量操作。

### 第三组：搜索与底部区域交接

- 覆盖06、21、27、28、29、30、37；20／40保留效果只核对交接。
- 先统一底部容器与状态入口，再处理搜索、AI折叠和上下文空间变化，取消200ms焦点等待；不在三个不同文件各写一次恢复逻辑。
- 明确未定参数：搜索最终宽度、AI折叠替代方案、无正式会话的29／37。记录待选，不把建议自动变成需求。
- 主要文件：app-input.ts、app-selection.ts、app-ai.ts、actions/selection.ts、shell.tsx、drag.ts、form-controls.css、controls.css、phone.css及对应Mac SearchField／SelectionBar／AIDock。

### 第四组：阅读、媒体和手机抽屉

- 覆盖14、15、25、26、32；13保留已认可开合，41按正式入口处理。
- 先统一预览／全屏编排与目录布局，再接照片轨道；手机抽屉单独采用Vaul，移除被替代的自定义物理控制，不能让Vaul与原监听叠加。
- 主要文件：motion-panels.ts、motion-sheet.ts、card-transition.ts、reader-layout.tsx、preview-controller.ts、panel-card.tsx、actions/media-reminders.ts、gesture-preview.ts及相应布局／媒体样式；Mac reader相关对应文件单独实现。
- 参数：cardSpring 1／274／30、expandedSpring 1／274／27保留；工具揭示120ms为待验编排，Vaul吸附和轮播释放阈值在接入参考后记录，不凭空写通过值。

### 第五组：统一控件与工具条，复核已确认项

- 覆盖01、03、04、07、08、09、12、19、23、31、33、34、35、36、40。
- 补系统提醒开关，Mac同步明确差异；保留首屏错峰、接收卡片、设置弹窗、AI横移已确认效果。统一工具条恢复角色，不把650ms恢复规则当成刷新等待。
- 页面刷新、真机PWA和云端首次加载分别确认，源码静态检查不能替代第一帧观感。

### 跨所有组的四项要求

1. 动画生命周期：同一属性一个控制者，所有直接animate都要在面板卸载或替换时取消；状态没变不重启动画，回调核对当前操作。特别核对AI圆环、条目删除、折叠背景与内容、普通边缘回弹。
2. 布局与绘制：尺寸读取集中在手势开始、内容确实变化或resize；每帧只写必要变换。仅实测开销高的快照、克隆、模糊和列表布局才做针对优化，不把所有CSS属性差异当成已复现掉帧。
3. 参数归属：控件按压、卡片开合、全屏、轮播、手势回位、工具恢复各用对应token；统一角色与生命周期，不把42项机械改成同一时长。所有新增候选参数都有“待实测”说明。
4. 验收归属：每项保留Web／PWA／Mac状态、取消项和无入口项；原生iOS标缺失。代码实现、检查通过与用户认可分别记录，每批只对受影响路径做检查，实际观感仍由真实入口确认。

本轮全量盘点和文档补全完成；没有执行以上产品改造，没有构建、浏览器自动化、真机检查或性能录制。


## 12. 本轮实施记录

- 优化前快照：cca98cd。后续用户要求优化上述五条链路，当前实施覆盖Web/PWA的释放、回弹、关闭交接、局部完成和滚动显隐。
- 共享输入新增gesture-input.ts；普通回弹新增gesture-rebound.ts，并接入MotionEngine管理。edgeSpring、edgeDrag、wheelInput已进入foundation参数源。
- 第一轮曾将刷新wheel改为达标直接请求，2026-10-27已按用户反馈撤回该判定，见第13节；pointer／touch仍松手请求。移除300ms／480ms／1000ms手势反馈停留，Sill不再隐藏，结果淡出可被新手势取消。
- 正文增加gesture-content内部层，配套预览封面、手机正文与阅读正文的选择器同步调整；普通回弹采用参考阻力和释放速度。
- 已读上推和普通阅读完成的背景更新均延后到最终关闭；关闭时遮罩与卡片使用相同cardSpring。任务／提醒原位更新，通用React重绘前恢复其管理的图标节点，防止重复SVG。
- 叠卡保留35%阈值与260ms落定，改用共享输入序列和40ms未达标释放；旧160ms续期锁删除。工具栏暂停时清方向累计，保留650ms独立恢复规则。
- 手机普通边缘触摸也接入同一回弹；手机抽屉现有把手／尺寸过渡继续工作，Vaul整体替换与背景缩放联动尚未接入。Mac参数及实现未改，原生iOS无对应界面。
- 本轮不运行浏览器、e2e或真机自动化；代码检查不等于用户验收。

本轮检查：Web全量421项通过；最后清理展开逻辑后，受影响20项复测通过。类型检查、设计build/check、本地及云端构建、文件规范与差异空白检查通过。手势刷新未变化的本地读取不再额外重画列表，由LocalSync合入实际变化。未运行浏览器／真机／e2e；不得据此追加用户验收✅。

## 13. 下拉刷新判定修正

2026-10-27用户反馈「现在一下拉就刷新」。原因是第一轮将达标直接作为提交条件，且单次较大wheel增量即可达到48阈值。

当前规则：拉够只就绪，释放后提交；wheel每次最多计入40px输入、以0.5倍率累计，单次大滚动不能独自达标。输入开始衰减时估计释放，否则以40ms静默判断；未达标、反向、失焦、详情打开或进入多选取消。touch／pointer仍使用真实松手事件。已移除的180ms等待、最短展示与结果停留不恢复；其他完成和关闭手势不变。

本次修正仍待用户在产品页面确认，不新增验收标记。

## 14. ui-lab参考后的实施

用户要求研究ui-lab参考后继续优化。本轮首页刷新以[ADR 0074](../adr/0074-pull-refresh-resistance-and-release.md)及第4.3节参数为准，第13节48阈值与逐事件截断规则已被替代。

- gesture-refresh.ts独立负责首页反馈、请求与输入归属；refresh-input.ts负责连续阻力、可见位移反算与wheel阶段。gesture-pull.ts保留抽屉下拉关闭，不重设其他手势参数。
- MotionEngine.move支持视觉弹簧与位移跟随回调；内容是进度源，圆环保留原标题区域锚点、样式及尺寸。原物理弹簧调用保持有效。
- 采用64px可见阈值、480／0.7阻力、0.35秒无弹跳回位及100ms速度窗口。按用户纠正仅借鉴参数，撤回圆环迁移与64px加载留白；释放后立即回位，原位置圆环表示真实请求。不复制演示布局、延迟和模糊入场。
- wheel连续3次衰减且幅度不大于峰值50%，或80ms静默估计释放；首个主动事件只建立起点，后续不截断增量。真实触控板阶段仍未验收。

本轮相关20项与Web全量429项非浏览器测试、类型检查通过；产品页面已重新构建。Mac未同步、原生iOS无界面，用户观感待确认。

后续反馈时长修正：用户表示加载与完成勾过快。仅将圆环加载设为至少300ms、完成勾400ms后140ms淡出，请求与结果合入仍立即执行；内容、位置和手感不变。新下拉可取消旧反馈计时。相关22项与Web全量431项、类型检查通过，观感待确认。
