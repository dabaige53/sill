# 001 — 关联卡片打开、关闭与阅读位置恢复

- **Status**: DONE
- **Commit**: d0a41d4
- **Severity**: HIGH
- **Category**: Interruptibility / Missed opportunities
- **Estimated scope**: Web 导航、详情控制器、Motion 与相关非浏览器测试；约 7–9 个文件
- **Repository**: `/Users/w/code/sill`
- **Date**: 2026-10-23

## Problem

用户需求：从卡片正文或关联卡列表打开另一张卡时有进入动画；关闭时有退出动画；回到父卡时保持原来的阅读位置。截图中的摘要卡包含多条正文卡片链接。按同一需求处理正文链接、关联卡按钮、全屏阅读中的卡片链接。

本计划已于 2026-10-23 在当前项目实施。关联卡片进入、退出、逐层位置恢复、同卡放大后的关闭和退出中重开均已接入。用户随后报告闪屏卡顿，已去掉逐正文节点复制 computed style，改为 Shadow DOM 中复用缓存的产品样式，保留原布局与伪元素，并暂停过渡中的工具条自动显隐。76 项相关非浏览器测试通过；浏览器及 Mac 真实窗口手感未验证。

| 优先级 | 严重性 | 位置 | 已确认的问题 | 修复方向 |
| --- | --- | --- | --- | --- |
| 1 | HIGH | `apps/web/views/preview-controller.ts:46`；`apps/web/views/react-renderer.ts:32` | 返回关系仅存卡片 ID；切换时卸载并重建详情，没有保存父卡的滚动位置 | 保存每层的卡片 ID、显示模式、精确 scrollTop 与焦点来源；恢复后再显示 |
| 2 | MEDIUM | `apps/web/views/app-surfaces.ts:342`；`apps/web/views/app-surfaces.ts:37` | 关闭子卡通过 history.back 返回父卡，再走 openCard；没有子卡退出阶段 | 区分进入子层与返回父层；退出完成才移除出场表面 |
| 3 | MEDIUM | `apps/web/views/preview-controller.ts:46` | 从 reader 打开另一张卡会清空 previewTrail，丢失父层模式 | 预览和全屏阅读共用层级返回记录 |

当前代码摘录：

```ts
// apps/web/views/preview-controller.ts:46
if (!this.dialog.open || this.modalKind !== "preview") this.previewTrail = [];
else if (!reading && this.currentId && this.currentId !== id) {
  const back = this.previewTrail.lastIndexOf(id);
  if (back >= 0) this.previewTrail = this.previewTrail.slice(0, back);
  else this.previewTrail.push(this.currentId);
}
```

```ts
// apps/web/views/react-renderer.ts:32 — renderContent 总是 replace=true
if (replace) {
  // Media cleanup saves its position; the next surface must read that saved value.
  flushSync(() => current.root.render(null));
  current.revision++;
}
```

```ts
// apps/web/views/app-surfaces.ts:346
if (history.state?.prev !== undefined && /^#(card|read)\//.test(location.hash))
  history.back();
```

## Target

### 阅读位置

- A 滚至某条链接，打开 B；关闭 B 后，A 保持同一条链接与同一屏幕位置。父卡首先恢复 scrollTop，再进入可见状态，不能先显示顶部再跳回。
- A → B → C 分别保留自己的位置；关闭 C 回 B，关闭 B 回 A。
- 每个返回记录保存 `{ id, kind: "preview" | "reader" | "lightbox", scrollTop, focus }`；焦点只在原节点仍连接时复用，否则按卡片链接目标找回，最后回到正文滚动区。所有 focus 使用 `preventScroll: true`。
- 同一卡片的放大、缩小是显示模式改变，不增加关联层。预览和 reader 各自的滚动容器分别为 `.preview-sheet .sheet-scroll` 与 `#reader-scroll`；照片返回保留已有 photoIndex。
- 不用 Store.item(id).progress 恢复关联导航位置：它只增不减，接近完成时 bindReader 还会从顶部开始，不代表刚才阅读的位置。
- 本次位置仅属于当前详情会话，完整退出、切换账号后清理。卡片内容被修改导致页面变短时，将位置限制到实际可滚动范围。

### 动效与加载

沿用 `design-system/handbook/motion.md` 和当前变量，不引入新库或另一套 CSS 动画：

| 场景 | 目标 |
| --- | --- |
| 桌面打开关联卡 | 子卡 opacity 0 → 1，transform `translateY(10px)` → `translateY(0)`；`dur-open` 280ms，`ease` = `cubic-bezier(0.23,1,0.32,1)` |
| 桌面关闭关联卡 | 子卡从当前绘制值过渡到 opacity 0、`translateY(10px)`；`dur-close` 220ms，同一 ease；下面的父卡已恢复位置并保持不透明 |
| 手机关联卡抽屉 | 保留现有 `dur-sheet` 260ms、`ease-sheet` = `cubic-bezier(0.32,0.72,0,1)`；进入 `translateY(100%)` → 0，退出反向；只移动子卡 |
| 键盘打开、关闭 | 按现有规则立即完成，位置照常恢复；不增加等待 |
| 真实内容等待 | 当前 Store.card 已包含正文，直接播放进入动画，不插入假的网络等待或强制转圈。若接入点已经有真实 pending 请求，超过 `delay-loading` 300ms 才显示既有加载反馈，结束即取消；本次不新增读取接口 |

关闭不显示加载圆环。它使用退出动画反馈操作。父卡不重播从主页卡面展开的动画；遮罩保持当前不透明度，主页导航和 AI 栏在整个关联导航过程中保持原状态。

## Repo conventions to follow

- `apps/web/interactions/motion.ts:457` 的 queuePanel 在下一帧接管表面；恢复位置必须先于此帧。
- `apps/web/interactions/motion.ts:441` 的 cancelPanel 统一取消动画；新关联过渡也纳入 panelAnimations / panelTasks。
- `apps/web/views/app-surfaces.ts:265` 使用 modalToken 与动画 finished 回调处理退出；取消不执行旧完成操作。
- `apps/web/views/app-panels.ts:91` 已保存搜索背景位置；关联返回不得破坏 searchBackground、searchScroll 或锁定主页的位置。
- `apps/apple/macOS/Reader/ReaderOverlay.swift:29` 用稳定 Layer.id 保留下层，只有最上层响应输入；`apps/apple/macOS/Model/Reader.swift:13` 保存 full 模式。这是跨端行为参照，不要求重写 Mac。
- 保留手册已确定的系统偏好策略：Web 不新增减少动态效果分支；Mac 已有 reduceMotion 分支保留。AUDIT.md 的通用建议不能覆盖此已确定的项目决定。

## Steps

1. 在 `apps/web/views/app.ts` 定义详情返回记录及会话内位置记录。保留 `previewTrail` 的已有调用约定，或一次更新其全部引用；用 `rg -n 'previewTrail' apps/web tests/web` 列出实际引用，不只修改声明。
2. 在 `apps/web/views/preview-controller.ts` 的 openCard 开头、任何 renderContent 前，保存当前卡片的显示模式、scrollTop 与焦点来源。判断 fresh / child / return / resize 四种情况。已有记录中的目标是 return；新目标是 child；同 ID 放大或缩小是 resize。reader 与 lightbox 不再无条件丢弃父层。
3. 在 openCard 和 `apps/web/views/app-panels.ts` 的 bindReader 中，让显式的会话恢复位置优先于持久 progress。将父层 DOM 完成渲染、恢复 scrollTop、设置焦点、绑定当前层阅读与手势的顺序固定下来。旧 modalToken 的定时器不得在父层重开后修改位置或状态。
4. 在 `apps/web/interactions/motion.ts` 增加关联进入与退出的受控过渡入口。捕获离开的表面后再更换内容，保留父卡的视觉连续性。副本只用于过渡，不保留播放器、事件监听或活动的 React root。副本的宿主必须 inert、aria-hidden，内部使用 Shadow DOM 隔离原样式所需的 ID 与控件标记，不进入文档级查询或操作委派。缓存并复用产品 CSS，不逐正文节点采集样式。只读取表面、直接子表面及媒体占位几何，保留原 scrollTop；动画取消或结束都要移除，不触发回到主页卡面的流程。
5. 返回父层时，先让父卡在其原有位置就绪，再让出场子卡播放退出。父层不能重播 enter；也不能对父卡正文缩放。进入子层时保留父卡展示副本，直到子卡进入结束，避免透出主页。展示副本置于同一 dialog 内，避免另开原生 dialog 改变顶层遮罩。
6. 在 `apps/web/views/app-surfaces.ts` 的 route、closeModal、closeNative 中明确关联返回与完整退出的分工：浏览器后退、关闭按钮、遮罩、露出的父卡顶边都进入同一返回流程。存在父层时不 unlockPageScroll、不恢复主页工具条、不按 cardRect 找主页落点。只有最后一层退出才执行现有完整关闭。
7. 所有过渡捕获当时的 modalToken；动画 finished 后核对 token 与目标层。快速打开 B 后关闭、关闭 B 中打开 C，都由最后一次操作决定。history 已改变但动画未完成时，不重复 history.back；popstate 与 hashchange 仍由 lastRouteHash 去重。浏览器前进再次进入子卡时按当前层级恢复，不能把父层重复压栈。
8. 在 `tests/web/search-state.test.ts`、`tests/web/app.test.ts` 和 `tests/web/visibility-motion.test.ts` 的现有 JSDOM / Motion 模拟中添加下方必要用例；不要另建浏览器测试框架。
9. 实施后在 `docs/product/ui-alignment.md` 更新 D07：Web 的关联进入、退出与位置恢复写实际结果，Mac 写已检查的代码行为；未在真实窗口确认的列保留「未验证」。如果调整现行规则，同步对应手册；不修改 claude.ai 发布副本。

## Boundaries

- 仅处理关联卡片导航和直接受影响的模式切换，不重做卡面、详情排版或其他动画。
- 保留本地 seen、read、progress 与媒体清理的真实含义；位置恢复本身不能写入已读。
- 不改服务端、MCP、连接器、鉴权或云端数据；不读取凭据。
- 不修改通用 renderContent 的重置行为来强留所有面板，否则会影响设置与输入框生命周期。
- 当前工作区已有鉴权与设计文件修改。不要覆盖、回退或纳入本次提交；ui-alignment.md 按现有内容增量更新。
- 若提交后代码已变化，先重新定位上述入口并更新计划；关键导航结构不同则报告差异，不能照行号机械修改。

## Verification

### Mechanical

实施后按顺序执行，预期均通过：

```sh
cd /Users/w/code/sill
npm run typecheck
node --import tsx --test tests/web/search-state.test.ts tests/web/app.test.ts tests/web/visibility-motion.test.ts tests/web/reading-feedback.test.ts
npm run build
sh scripts/design-init.sh build
sh scripts/design-init.sh check
npm run files:check
git status --short
```

实施记录：四组相关非浏览器测试 76/76 通过；typecheck、Web build、设计 build/check 与 files:check 通过。新增长正文用例确认 1000 个段落的样式采集次数只取决于表面数量，并保留缓存样式中的伪元素规则；这不等于真实设备帧率验证。设计预览生成有 React 列表 key 提示，不影响命令退出结果；本次未发布设计副本。

必要非浏览器断言：

- A scrollTop=480 → B → 关闭，A 第一帧即为 480；A → B(260) → C，逐层返回分别为 260、480。
- 父卡 progress=1、实际 scrollTop=480 时仍回到 480；reader 的默认进度恢复不能覆盖。
- 父卡为 #read/A 时，B 关闭后回到 #read/A；A 自身预览与放大不增加层数。
- 关闭子卡确实创建退出动画；出场完成前仍保留其展示表面；完成回调后才移除；父层不新增入场动画。
- 动画取消后旧 finished 回调不改变新 currentId、路由、位置、遮罩与主页滚动锁。
- 从搜索进入 A → B → A → 搜索，原查询、结果位置、焦点与节点保持原有约定。
- 键盘路径不创建导航动画但仍恢复位置；临时副本不产生重复 DOM ID 或可操作按钮。

### Feel check

当前用户未明确授权浏览器测试或窗口自动化。实施者不得自行运行浏览器、e2e 或 Mac 窗口测试；以下为取得授权后的局部验收清单，未执行时标「未验证」。

- 使用产品入口 `http://127.0.0.1:4318/#feed`，打开截图同类的长摘要卡，向下滚动后逐项打开、关闭正文链接。
- 正常速度下应看到子卡进入、退出；父卡原链接保持同一屏幕位置，无顶部闪现、主页闪现或工具条闪现。
- 用 10% 播放速度观察：子卡退出全程下面都有父卡，父卡正文不缩放；返回没有第二次进入动作。
- 测试快速开关和退出中打开另一张卡；退出中的旧副本不会盖住新卡，也不会吞掉新操作。
- 桌面 1440px、手机 390px 分别检查；键盘 Esc 返回立即完成且焦点不引发滚动。
- Mac 仅核对同一关联路径的阅读位置与层级含义；如未获窗口验证授权，继续记「未验证」。

### Done when

用户指定的打开、关闭、保留父卡位置三项均实现；必要非浏览器检查通过。视觉手感检查另按授权记录，不以构建通过代替。计划状态只有在产品实现完成并记录真实验证范围后才改为 DONE。
