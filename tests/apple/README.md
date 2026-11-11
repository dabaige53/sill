# Apple 检查



`build:macos` 在签名前复制应用到 `/private/tmp`，将副本的入口替换为无窗口资源检查程序。检查程序与产品编译同一份 `AppResources` 和 SwiftPM 生成的资源访问器，确认资源来自应用的 `Contents/Resources`，并解码全部打包 PNG。检查不读取账号数据；失败会阻止构建成功。此检查由 GitHub Actions 的 Mac 构建执行，不代替真实窗口启动验收。

## 性能报告与人工追踪

报告解析测试：`npm run test:performance-report`，只运行 Node，不需要 Xcode 或 UI 权限。`npm run perf:macos -- manual --pid <Sill PID>` 录制指定进程，`npm run perf:macos -- report <会话目录>` 生成离线报告。

[完整操作与指标口径](../../docs/implementation/operations/macos-performance.md)。
