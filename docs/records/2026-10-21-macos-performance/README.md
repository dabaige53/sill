# Mac 性能工作流验证

日期：2026-10-21。状态：本地实施与验证，未部署。

## 范围

人工追踪、后台资源采样、Apple OSSignposter、XCTest 数据层基准、独立 XCUITest 工程、Instruments CLI 录制与离线报告。操作入口与参数见 [性能指南](../../agents/macos-performance.md)。

## 已获得的证据

- 性能报告解析的三项 Node 测试通过，覆盖加权 CPU、缺失指标、未完成区间、损坏尾行、P95 样本下限和 XCTest 有符号内存变化的原始单位。
- 后台计时器最初继承主线程隔离，非 UI 测试捕获崩溃；将计时器安装移至非隔离方法后，38 项 Swift Testing 测试通过。
- 独立 Xcode UI 测试工程构建通过。
- 首次真实 UI 运行由系统授权阻止，Xcode 报告“认证已取消／System authentication is running”，未执行场景。失败结果保留在 `/private/tmp/sill-performance-validation-1021/tests.xcresult`，不计为性能通过。

## 后续验证与范围调整

- XCTest Release 后台搜索基准两项通过，分别使用 300／3000 张合成卡片，每项 10 次迭代，一轮包含四个搜索条件。原始指标提取见 [benchmark.json](benchmark.json)。单次结果用于建立观测，不作为稳定性能承诺。
- 最终追踪专项两项 Swift 测试通过；类型检查、文件管理检查、设计 build/check 通过。设计构建仍有已有 React key 警告。
- Time Profiler 附加录制返回 0，归档可导出约 1.4 MB 的 time-profile XML，证明确有采样。对应目录为 `/private/tmp/sill-performance-validation-1021-v4/`。该轮 UI 场景失败，不能作为界面性能通过。
- 打开 Xcode 后复跑已能进入 XCUITest 场景，首次系统认证错误未再出现；未修改 DevToolsSecurity 或全局安全策略。
- 实际联调修复配置路径传递、沙盒通知与就绪文件写权限问题。后续复跑被 Xcode 文件窗口和 Codex Computer Use 浮层打断，已停止。原生 UI 三个场景尚未完成端到端验证。
- 用户澄清要后台自动化后，默认 `npm run perf:macos` 改为无窗口 XCTest 基准；UI 自动化改为显式 `ui` 模式，不继续启动。人工 App 追踪保留。
- 只生成本地产物，不部署，不发布线上设计；不运行浏览器测试。


默认后台入口复验通过：`npm run perf:macos -- --output /private/tmp/sill-background-default-1021` 返回 0，两项 XCTest 场景完成，提取 12 组官方指标；本次未启动 UI 自动化。
