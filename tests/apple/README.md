# Apple 检查

从仓库根目录运行 node tests/apple/run.ts。测试实现随 Swift Package 放在 apps/apple/Tests/（SillKit 数据层）和 apps/apple/DesktopTests/（macOS 桌面状态），由 swift test 执行。命令仅创建临时合成数据，不读取真实桌面，不启动 GUI。首次运行需要下载 Package.resolved 中锁定的 Swift 依赖。

桌面测试用内存中的模拟工作区，不读写真实数据，不打开窗口。`npm run test:macos` 在测试后校验 `dist/macos/Sill.app` 的签名，需要先运行 `npm run build:macos`。真实窗口中的视觉、动效与 iOS 设备检查不包含在自动测试中，见 [Apple 说明](../../apps/apple/README.md)。

`build:macos` 在签名前复制应用到 `/private/tmp`，将副本的入口替换为无窗口资源检查程序。检查程序与产品编译同一份 `AppResources` 和 SwiftPM 生成的资源访问器，确认资源来自应用的 `Contents/Resources`，并解码全部打包 PNG。检查不读取账号数据；失败会阻止构建成功。此检查由 GitHub Actions 的 Mac 构建执行，不代替真实窗口启动验收。

## 性能

`npm run perf:macos` 运行后台基准；`npm run perf:macos -- ui` 使用独立的 [PerformanceHarness.xcodeproj](PerformanceHarness.xcodeproj/project.pbxproj) 与 [PerformanceUITests.swift](PerformanceUITests.swift) 进行真实原生 UI 操作，并附加官方 Instruments。需要当前任务授权和系统 Developer Tools 权限；不纳入默认测试。输出位于新建的 `/private/tmp` 目录。

[完整操作与指标口径](../../docs/implementation/operations/macos-performance.md)。报告解析测试：`npm run test:performance-report`，也纳入默认 `npm test`；只运行 Node，不需要 Xcode 或 UI 权限。

`recording-signal.c` 使用系统 notify 与 dispatch 接收 Instruments 就绪通知，向沙盒内测试进程提供文件信号；由性能脚本用 Xcode clang 编译。未就绪不开始测量。

后台基准目前覆盖搜索、分栏切换、卡片开关与全屏指令、滚动位置处理及分页、设置开关，共八项；每项十次测量。每轮工作量与未覆盖的实际绘制阶段见性能指南。
