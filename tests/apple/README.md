# Apple 检查

从仓库根目录运行 node tests/apple/run.ts。测试实现随 Swift Package 放在 apps/apple/Tests/，由 swift test 执行。命令仅创建临时合成数据，不读取真实桌面，不启动 GUI。首次运行需要下载 Package.resolved 中锁定的 Swift 依赖。

macOS 界面层正在重建（见 [Apple 说明](../../apps/apple/README.md)），目前只测试 SillKit 数据层；node scripts/build-macos.ts 在重建完成前直接报错退出。真实桌面与 iOS 设备检查不包含在自动测试中。
