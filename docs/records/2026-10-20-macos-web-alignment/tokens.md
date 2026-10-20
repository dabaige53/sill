# Apple 设计变量增量

只在仓库内修改。源文件为 `design-system/tokens/foundation.json`，已导出 `design-system/tokens.json`；CardGenerator 在构建时重新生成 AppleMetrics 与 AppleColors。Web CSS 没有修改。阴影使用 Web CSS 的数值；SwiftUI 高斯 radius 取 CSS blur 的一半，避免深色阴影扩大。

| AppleMetrics | 值 | 对应 Web 依据 |
| --- | --- | --- |
| motionLens | 0（原为 0.3） | Web tokens.css / motion.md；Swift 时间单位为秒 |
| space2 | 2 | Web tokens.css 同名 space 变量 |
| space30 | 30 | Web tokens.css 同名 space 变量 |
| space44 | 44 | Web tokens.css 同名 space 变量 |
| space64 | 64 | Web tokens.css 同名 space 变量 |
| sheetRadius | 28 | Web overlays.css / tokens.css：28、94%、76、92%、0.5 |
| motionPress | 0.12 | Web tokens.css / motion.md；Swift 时间单位为秒 |
| motionPressScale | 0.97 | Web tokens.css / motion.md；Swift 时间单位为秒 |
| motionHover | 0.16 | Web tokens.css / motion.md；Swift 时间单位为秒 |
| motionMenuOpen | 0.18 | Web tokens.css / motion.md；Swift 时间单位为秒 |
| motionMenuClose | 0.12 | Web tokens.css / motion.md；Swift 时间单位为秒 |
| motionMenuScale | 0.95 | Web tokens.css / motion.md；Swift 时间单位为秒 |
| motionMenuY | 4 | Web tokens.css / motion.md；Swift 时间单位为秒 |
| motionLayout | 0.22 | Web tokens.css / motion.md；Swift 时间单位为秒 |
| motionFast | 0.14 | Web tokens.css / motion.md；Swift 时间单位为秒 |
| motionRead | 0.22 | Web tokens.css / motion.md；Swift 时间单位为秒 |
| motionState | 0.22 | Web tokens.css / motion.md；Swift 时间单位为秒 |
| motionStagger | 0.03 | Web tokens.css / motion.md；Swift 时间单位为秒 |
| motionFirstCount | 10 | Web tokens.css / motion.md；Swift 时间单位为秒 |
| motionContextY | 4 | Web tokens.css / motion.md；Swift 时间单位为秒 |
| motionSwitch | 0.12 | Web tokens.css / motion.md；Swift 时间单位为秒 |
| motionSheet | 0.26 | Web tokens.css / motion.md；Swift 时间单位为秒 |
| easeX1 | 0.23 | Web tokens.css：ease / ease-sheet |
| easeY1 | 1 | Web tokens.css：ease / ease-sheet |
| easeX2 | 0.32 | Web tokens.css：ease / ease-sheet |
| easeY2 | 1 | Web tokens.css：ease / ease-sheet |
| easeSheetX1 | 0.32 | Web tokens.css：ease / ease-sheet |
| easeSheetY1 | 0.72 | Web tokens.css：ease / ease-sheet |
| easeSheetX2 | 0 | Web tokens.css：ease / ease-sheet |
| easeSheetY2 | 1 | Web tokens.css：ease / ease-sheet |
| springMass | 1 | motion.md 和 tokens.json motion.spring |
| springStiffness | 600 | motion.md 和 tokens.json motion.spring |
| springDamping | 45 | motion.md 和 tokens.json motion.spring |
| loadingDelay | 0.3 | Web tokens.css / motion.md；Swift 时间单位为秒 |
| gestureDismissDistance | 110 | motion.md；gesture-preview.ts：14px 边缘、120ms 输入停止；手册关闭阈值 |
| gestureFlickDistance | 40 | motion.md；gesture-preview.ts：14px 边缘、120ms 输入停止；手册关闭阈值 |
| gestureFlickSpeed | 0.5 | motion.md；gesture-preview.ts：14px 边缘、120ms 输入停止；手册关闭阈值 |
| gestureVelocityWindow | 0.1 | motion.md；gesture-preview.ts：14px 边缘、120ms 输入停止；手册关闭阈值 |
| gestureWheelRest | 0.12 | motion.md；gesture-preview.ts：14px 边缘、120ms 输入停止；手册关闭阈值 |
| gestureFinishDistance | 120 | Web gesture-preview.ts：120px、460ms、0.35 倍位移、30px 显现 |
| gestureFinishHold | 0.46 | Web gesture-preview.ts：120px、460ms、0.35 倍位移、30px 显现 |
| gestureFinishTravel | 0.35 | Web gesture-preview.ts：120px、460ms、0.35 倍位移、30px 显现 |
| gestureFinishReveal | 30 | Web gesture-preview.ts：120px、460ms、0.35 倍位移、30px 显现 |
| gestureEdgeLimit | 14 | motion.md；gesture-preview.ts：14px 边缘、120ms 输入停止；手册关闭阈值 |
| gestureRefreshDistance | 48 | Web gesture-pull.ts：48px、0.75 倍跟手、1s 归位 |
| gestureRefreshRelease | 1 | Web gesture-pull.ts：48px、0.75 倍跟手、1s 归位 |
| tooltipDelay | 0.5 | motion.md / interaction.md：500ms 首次，800ms 连续提示 |
| toastUndoDuration | 5.5 | interaction.md：5.5s / 3.2s |
| toastDuration | 3.2 | interaction.md：5.5s / 3.2s |
| cardTitleTracking | -0.02 | Web cards.css：-0.02em / 1.35，-0.01em / 1.55 |
| cardTitleLeading | 1.35 | Web cards.css：-0.02em / 1.35，-0.01em / 1.55 |
| quoteTracking | -0.01 | Web cards.css：-0.02em / 1.35，-0.01em / 1.55 |
| quoteLeading | 1.55 | Web cards.css：-0.02em / 1.35，-0.01em / 1.55 |
| lineWidth | 1 | Web cards.css：1px 描边、2px 选中/焦点、4px 外扩 |
| selectionLineWidth | 2 | Web cards.css：1px 描边、2px 选中/焦点、4px 外扩 |
| focusOutset | 4 | Web cards.css：1px 描边、2px 选中/焦点、4px 外扩 |
| taskDotSize | 20 | Web cards.css：20 / 1.5，22 / 1.8 |
| taskDotLine | 1.5 | Web cards.css：20 / 1.5，22 / 1.8 |
| reminderDotSize | 22 | Web cards.css：20 / 1.5，22 / 1.8 |
| reminderDotLine | 1.8 | Web cards.css：20 / 1.5，22 / 1.8 |
| readerButtonLine | 0.5 | Web overlays.css / tokens.css：28、94%、76、92%、0.5 |
| shadowCardNearY | 1 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowCardNearBlur | 2 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowCardNearOpacity | 0.025 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowCardFarY | 4 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowCardFarBlur | 16 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowCardFarOpacity | 0.035 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowCardDarkOpacity | 0.3 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowHoverNearY | 2 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowHoverNearBlur | 5 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowHoverNearOpacity | 0.04 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowHoverFarY | 10 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowHoverFarBlur | 24 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowHoverFarOpacity | 0.07 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowHoverDarkY | 6 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowHoverDarkBlur | 20 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowHoverDarkOpacity | 0.45 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowSheetNearY | 2 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowSheetNearBlur | 8 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowSheetNearOpacity | 0.04 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowSheetFarY | 30 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowSheetFarBlur | 90 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowSheetFarOpacity | 0.18 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowSheetDarkOpacity | 0.6 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowFloatNearY | 1 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowFloatNearBlur | 2 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowFloatNearOpacity | 0.05 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowFloatFarY | 6 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowFloatFarBlur | 18 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowFloatFarOpacity | 0.07 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowFloatDarkOpacity | 0.3 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowGlassNearY | 2 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowGlassNearBlur | 6 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowGlassNearOpacity | 0.05 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowGlassFarY | 12 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowGlassFarBlur | 32 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowGlassFarOpacity | 0.09 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowGlassDarkNearY | 1 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowGlassDarkNearBlur | 2 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowGlassDarkNearOpacity | 0.3 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowGlassDarkFarY | 10 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowGlassDarkFarBlur | 30 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowGlassDarkFarOpacity | 0.36 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowMoreY | 2 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowMoreBlur | 8 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| shadowMoreOpacity | 0.08 | Web tokens.css 的 shadow / shadow-hover / shadow-sheet / shadow-float / shadow-glass；more 阴影来自 cards.css |
| searchWidth | 280 | web-interaction.md：280 / 360 / 480，40，220 |
| searchTaggedWidth | 360 | web-interaction.md：280 / 360 / 480，40，220 |
| searchFocusedWidth | 480 | web-interaction.md：280 / 360 / 480，40，220 |
| searchHeight | 40 | web-interaction.md：280 / 360 / 480，40，220 |
| scopeMenuWidth | 220 | web-interaction.md：280 / 360 / 480，40，220 |
| gestureRefreshTravel | 0.75 | Web gesture-pull.ts：48px、0.75 倍跟手、1s 归位 |
| tooltipGrace | 0.8 | motion.md / interaction.md：500ms 首次，800ms 连续提示 |
| sheetPeekWidth | 0.94 | Web overlays.css / tokens.css：28、94%、76、92%、0.5 |
| headerEdgeHeight | 76 | Web overlays.css / tokens.css：28、94%、76、92%、0.5 |
| headerEdgeOpacity | 0.92 | Web overlays.css / tokens.css：28、94%、76、92%、0.5 |

| AppleColors | 浅色 / 深色 | Web 角色 |
| --- | --- | --- |
| lineCard | #00000014 / #ffffff14 | line-card：黑/白 8% |
| lineHover | #00000024 / #ffffff29 | line-hover：黑 14% / 白 16% |
| lineRead | #0000000a / #ffffff0a | line-read：黑/白 4% |
| accentSoft | #edf4ff / #16283f | accent-soft |
| fixedWhite | #ffffff / #ffffff | fixed-white |
| fixedWhite72 | #ffffffb8 / #ffffffb8 | fixed-white-72：72% |
| fixedPodcast | #f4ede4 / #2a2622 | fixed-podcast-light / fixed-podcast-dark |
| fixedPodcastCoverStart | #d9cbbb / #d9cbbb | fixed-podcast-cover-start |
| fixedPodcastCoverMid | #efe6db / #efe6db | fixed-podcast-cover-mid |
| fixedPodcastCoverEnd | #cdbcaa / #cdbcaa | fixed-podcast-cover-end |
| floatShadow | #101828 / #000000 | shadow-float / shadow-glass 的 RGB 基色 |
