# Apple 检查

从仓库根目录运行 node tests/apple/run.ts。测试实现随 Swift Package 放在 apps/apple/Tests/（SillKit 数据层）、apps/apple/DesktopTests/（macOS 桌面状态）和 apps/apple/MobileTests/（iOS 状态），由 swift test 执行。命令仅创建临时合成数据，不读取真实桌面，不启动 GUI。首次运行需要下载 Package.resolved 中锁定的 Swift 依赖。

桌面测试用内存中的模拟工作区，不读写真实数据，不打开窗口。`npm run test:macos` 在测试后校验 `dist/macos/Sill.app` 的签名，需要先运行 `npm run build:macos`。真实窗口中的视觉、动效与 iOS 设备检查不包含在自动测试中，见 [Apple 说明](../../apps/apple/README.md)。

`npm run build:ios` 在 Mac 上通过 Xcode 为真实 iPhone 编译，不启动应用。`npm run test:ios -- --unit --device <UDID>` 在 iOS 运行同一批 `MobileTests/`，检查平台编译、链接与行为；`npm run test:ios -- --ui --device <UDID>` 运行 `apps/apple/iOSUITests/` 的阅读和设置流程，使用内存合成数据，需当前任务授权。省略选择参数会运行两类测试。使用 `--device <UDID>` 指定已连接的真实 iPhone；报告保存在 `tests/artifacts/ios-*.xcresult`。

`.github/workflows/ios.yml` 显式使用 `--simulator` 完成远端模拟器构建与原生单测，界面测试不纳入默认 CI；`.github/workflows/macos.yml` 通过 `node tests/apple/run.ts` 运行全部 Apple 后台测试。iOS 单测只链接 `SillMobile` 产品，通过它使用 `SillKit`，避免测试包重复链接共享类型。新增 `MobileTests/*.swift` 时，同时加入 Xcode 工程；Node 工程检查会验证清单。远端工作流实际执行前，不能将配置完成写成编译通过。Linux 可运行 `node --test tests/apple/ios-project.test.ts` 检查打包文件和路径，不替代 Swift 编译。

## 性能

Apple 脚本默认使用 2 个编译任务并降低调度优先级；`SILL_BUILD_JOBS=1` 可进一步减少并发。日常状态检查优先使用 Swift Package，不启动模拟器；iOS 平台和界面检查使用真实 iPhone。本地不安装或启动模拟器；CI 的模拟器入口需显式选择。

`npm run perf:macos` 默认执行后台基准，等同于 `npm run perf:macos -- benchmark`。使用 Xcode 工具链的 XCTest 运行 Release 非 UI 基准。`npm run perf:macos -- ui` 使用独立的 [PerformanceHarness.xcodeproj](PerformanceHarness.xcodeproj/project.pbxproj) 与 [PerformanceUITests.swift](PerformanceUITests.swift) 进行真实原生 UI 操作，并附加官方 Instruments。需要当前任务授权和系统 Developer Tools 权限；不纳入默认测试。输出位于新建的 `/private/tmp` 目录。

[完整操作与指标口径](../../docs/guides/macos-performance.md)。报告解析测试：`npm run test:performance-report`，也纳入默认 `npm test`；只运行 Node，不需要 Xcode 或 UI 权限。

`recording-signal.c` 使用系统 notify 与 dispatch 接收 Instruments 就绪通知，向沙盒内测试进程提供文件信号；由性能脚本用 Xcode clang 编译。未就绪不开始测量。

后台基准目前覆盖搜索、分栏切换、卡片开关与全屏指令、滚动位置处理及分页、设置开关，共八项；每项十次测量。每轮工作量与未覆盖的实际绘制阶段见性能指南。
