# 手机下拉刷新惯性后失灵

## 问题与状态

上下滑动后回到顶部再下拉，约1～2秒内识别不到下拉，像断触；需要松手重来才能刷新。状态：2026-10-29 修复后，v1.2.19 的 PWA 上用户仍反馈滑回顶部后刷新异常、下拉断触；2026-10-30 再次修复，待真机验证。

## 环境与触发

- 平台：Web/PWA手机布局（≤650px），iPhone Safari／PWA与Android Chrome均适用。
- 触发：向下浏览后快速上滑，页面靠惯性回到顶部；惯性尚未停稳时按下并下拉。
- 预期：同一次触摸到顶后进入下拉刷新。实际：整次触摸被忽略。

## 定位依据

- 已证实：`apps/web/interactions/gesture-refresh.ts` 的 touchstart 经 `unavailable()` 检查 `scrollY > 0`。惯性尾段看起来已到顶，`scrollY` 仍大于0，此次触摸不记录起点。
- 已证实：touchmove 遇到 `event.cancelable === false` 时直接取消。浏览器把打断惯性或已开始滚动的触摸标为不可拦截，同一次触摸后续无法再进入下拉。
- 两者叠加形成惯性尾段的失灵窗口；时长取决于系统惯性，约1～2秒为用户观察值。
- 不可拦截保护来自提交 `db3b75a2`，用于防止浏览器原生顶部效果与Sill位移叠加；同一提交给根节点加了 `overscroll-behavior-y: none`。
- 已证实（2026-10-30）：触摸路径开始下拉前用 `dx > dy` 比较单次 touchmove 的位移，没有鼠标路径的4px门槛。起手或滑回顶部后停顿再拉时，单次位移只有1～2px，拇指稍带弧线即横向大于纵向，`cancel()` 清空起点，这次触摸后续都被忽略。这是10-29修复后仍断触的主因。
- 已证实（2026-10-30）：touchstart 经 `fromHorizontalContent` 排除 `button,a`，从卡片内任务勾选、链接等位置起手的下拉整次被忽略，表现为有时拉得动、有时拉不动。

## 处理情况

- touchstart 只检查弹窗、多选、拖动和刷新进行中，不再检查是否在顶部。
- 页面未到顶时，下拉起点随手指更新；到顶后同一次触摸按原阻力与64px阈值接续。手机布局下不可拦截的移动也可接续；宽屏保留原生顶部回弹，仍不接管。
- 曾考虑iOS改用系统原生回弹并读取负 `scrollY`；会改变标题栏不动、卡片下移的观感与ADR 0078阻力，用户选择两端统一接续，未实施。
- 2026-10-30：触摸与鼠标一样按4px门槛判断方向，累计横向位移超过 max(4px, 纵向) 才放弃；门槛内的可拦截移动阻止默认行为，保持与原先首次下移即拦截一致。下拉触摸不再排除按钮和链接，越过门槛后其点按自然失效；输入框、滑块、媒体、iframe 与横向滚动区仍归原控件。
- 规则更新见[ADR 0078](../../adr/0078-pull-refresh-resistance-and-release.md)。

## 验证与后续

- 新增回归：`tests/web/gesture-refresh.test.ts` 中“a phone touch that stopped momentum mid-page takes over at the top without lifting”，撤掉修复时会因起点未记录而失败。本地未运行，由 GitHub Actions 执行。
- 新增回归（2026-10-30）：同文件“a phone pull that eases in slightly sideways keeps the same touch”撤掉门槛会因首个1px斜向移动取消而失败；“a phone pull may start on a card's button”撤掉按钮放行会因起点未记录而失败。本地未运行，由 GitHub Actions 执行。
- 未验证：iPhone与Android真机手感。iOS需确认打断惯性的触摸在到顶后持续送出移动事件；若接不住，下一步评估iOS系统回弹方案。
- 发布：随 v1.2.17 推送 tag 触发 `release.yml`；自 v1.2.16 起无数据库或迁移改动，`SILL_DATABASE_VERIFIED_COMMIT` 指向该 tag 提交。按用户要求未监控运行结果，部署状态以该次 Actions 回执为准。
