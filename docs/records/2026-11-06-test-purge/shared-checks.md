# 共享检查与执行器

这些辅助项由场景调用，不计入独立用例数。行号同样对应删除前基准。

| 文件:行号 | 用例名 | 处置(DELETE/REWRITE/KEEP) | 命中 D 规则 | type | protects | 理由 |
| --- | --- | --- | --- | --- | --- | --- |
| tests/e2e/browser.ts:61 | 场景统一异常与外部请求检查 | KEEP | — | integration | prevent page errors or unexpected external requests from being reported as passing | 每个调用场景执行后检查页面异常和被拦截请求。 |
| tests/e2e/cloud-operations-browser.ts:131 | 详情稳定与多选操作调用 | KEEP | — | integration | Keep remote updates and selection | 调用的独立断言位于 helpers；不在本批文件范围内重复展开。 |
| tests/e2e/cloud-recovery-browser.ts:108 | 恢复场景共享隐私检查 | DELETE | D12 | — | — | 若删除本文件全部三个调用场景，共享执行器与该断言没有调用者；随文件一起删除。 |
| tests/e2e/drawer-browser.ts:112 | 抽屉场景共享执行器 | KEEP | — | integration | prevent page errors or unexpected external requests from passing silently | 第 150 至 152 行在每个子场景后检查浏览器异常和外部请求；执行器及测试数据由两个子模块共用。 |
| tests/e2e/material-density-browser.ts:30 | 密度场景共享执行器 | KEEP | — | integration | prevent page errors or unexpected external requests from passing silently | 每个 run 调用共用隔离页面、测试数据及异常检查。 |
| tests/e2e/material-density-browser.ts:119 | 卡片布局共享断言 | KEEP | — | behavior | prevent cards from overlapping or overflowing the viewport | 由桌面、紧凑和手机场景调用，不单独删除。 |
| tests/e2e/motion-material-browser.ts:102 | 动效场景共享执行器 | KEEP | — | integration | prevent page errors or unexpected external requests from passing silently | 执行器被两个子模块共用，并统一检查页面异常及外部请求。 |
| tests/e2e/navigation-recovery-browser.ts:15 | 导航恢复共享执行器 | KEEP | — | integration | prevent failed fixture writes or browser errors from passing silently | 第 33、42 行分别检查测试数据写入和页面异常；两个子模块共用。 |
| tests/e2e/search-browser.ts:95 | 搜索场景共享执行器 | KEEP | — | integration | prevent page errors or unexpected external requests from passing silently | 两个宽度共用隔离测试数据和异常检查。 |
| tests/e2e/selection-browser.ts:54 | 选择状态和数据共享断言 | KEEP | — | behavior | prevent cancelled selection gestures from changing cards or losing selection | unchanged 被多个子场景调用；第 57 行调用次数仅作辅助，不能替代实际数据断言。 |
| tests/e2e/selection-browser.ts:59 | 拖动目标准备 | KEEP | — | integration | prevent gesture scenarios from using a missing or invisible target | point 检查测试前提并由后续辅助函数共用。 |
| tests/e2e/selection-browser.ts:72 | 长按并开始拖动 | REWRITE | D9 | integration | prevent gesture scenarios from proceeding before selection and drag are active | 第 80 行固定等待；beginLift 被两个子模块共用，改写时保留接口。 |
| tests/e2e/selection-browser.ts:104 | 拖动副本的内容与交互隔离 | REWRITE | D6 | behavior | prevent drag previews from exposing duplicate interactive controls or incorrect card content | 保留内容一致、不可交互和对辅助技术隐藏；第 107 至 113 行要求具体 DOM clone 层级，属于实现细节。 |
| tests/e2e/selection-browser.ts:147 | 多选场景共享执行器 | KEEP | — | integration | prevent browser errors or external requests from passing silently | 执行器被两个子模块共用；第 200 至 201 行统一检查页面异常和外部请求。 |
| tests/e2e/stack-browser.ts:20 | 卡片堆场景共享执行器 | REWRITE | D9 | integration | prevent stack scenarios from running before the deck is ready | 第 36 行固定等待 400ms；应等待堆叠稳定。第 38 行页面异常检查保留。 |
