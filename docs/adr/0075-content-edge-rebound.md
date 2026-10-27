# 正文边缘回位的速度与参数

日期：2026-10-27。状态：已接受，当前Web桌面原生回弹手感已获用户确认；PWA自定义回位已实施、观感待确认。

用户指定[dabaige53/ui-lab](https://github.com/dabaige53/ui-lab)作为后续动画参考，并提醒其中有良好的下滑回弹示例。用户随后反馈详情和主页都未出现原生回弹，并要求继续配置。本轮扩到Web桌面首页和普通详情的原生边缘反馈，保留既有UI；读完上推完成、手机自定义位移与抽屉关闭规则保持。

用户明确参考[ui-lab网站](https://lab.xevrion.dev/)整页边缘回弹。Web桌面大于650px时html／body改为auto，首页wheel监听改为passive，只观察刷新意图并更新圆环，不阻止滚动、不平移main；拉够后仍在估计释放时请求刷新。圆环进度的64阈值为参考曲线换算，不能等同浏览器原生内容的实际位移。鼠标拖动和手机沿用原自定义刷新。宽度跨过650px后取消当前输入、重新绑定监听。

Web桌面普通详情不再绑定自定义边缘输入；无push-ring时sheet-scroll／reader-scroll采用overflow-y: scroll和overscroll-behavior-y: contain，保持局部滚动容器并阻止背景滚动。有读完上推圆环时仍为none并沿用完成手势。PWA根html／body保留none与下述自定义回位；不复制参考页布局，不加模拟空白制造滚动。

原生效果、阻力与回位时机由浏览器及系统处理，不承诺固定时长或所有浏览器有相同回弹。contain保留局部边缘效果的依据见[MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overscroll-behavior)。代码检查不能代替用户触控板确认。

用户已确认当前Web主页及普通详情的手感「就是这样的感觉」，要求保存Git提交。此次确认不扩到PWA真机、安装模式、Mac或原生iOS。

初版参考[stacked-drawer.tsx](https://github.com/dabaige53/ui-lab/blob/main/src/lab/components/stacked-drawer.tsx)的释放弹簧380／38／1。用户复核反馈「回弹有点慢」后改为600／48／1，但仍反馈偏慢，不能视为通过；约快20%仅为参数推算。当前该motion.contentReboundSpring只用于手机普通正文，restSpeed 2、restDelta 0.5对应其[spring-playground.tsx](https://github.com/dabaige53/ui-lab/blob/main/src/lab/components/spring-playground.tsx)。原motion.edgeSpring继续服务其他手势，不整体替换。

手机自定义释放速度采用现有100ms窗口采样，过期速度归零；修正此前长按停住后仍使用最后一次增量速度的问题。采样函数从Gestures抽到共享输入模块，首页刷新等既有调用保持原算法和参数。手机正文保持±750px/s上限、0.008秒最小采样间隔和原160／0.15阻力，回位中重抓从当前绘制位置接续。

手机自定义回位仅运动正文内部层，视口、卡片、按钮和工具栏位置不变；有读完圆环时交给已存在的完成流程，不叠加普通回弹。手机wheel保留现有衰减释放及40ms判断，触摸用真实释放；Web普通详情已移除此段自定义释放路径。

Mac新参数未同步，原生iOS界面缺失；PWA整体Vaul方案仍为后续工作。只借鉴参数、速度和衔接，不复制参考页面、抽屉结构、背景缩放或新交互。设计未发布到线上，代码检查不代替观感验收。
