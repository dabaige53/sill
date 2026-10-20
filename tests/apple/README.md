# Apple 检查

从仓库根目录运行 node tests/apple/run.ts。测试实现随 Swift Package 放在 apps/apple/Tests/（SillKit 数据层）和 apps/apple/DesktopTests/（macOS 桌面状态），由 swift test 执行。命令仅创建临时合成数据，不读取真实桌面，不启动 GUI。首次运行需要下载 Package.resolved 中锁定的 Swift 依赖。

桌面测试用内存中的模拟工作区，不读写真实数据，不打开窗口。`npm run test:macos` 在测试后校验 `dist/macos/Sill.app` 的签名，需要先运行 `npm run build:macos`。真实窗口中的视觉、动效与 iOS 设备检查不包含在自动测试中，见 [Apple 说明](../../apps/apple/README.md)。
