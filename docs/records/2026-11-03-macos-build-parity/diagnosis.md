# Mac 线上包与本地包外观、性能不一致

## 问题与状态

已修复待验证（2026-11-03）。用户反馈 GitHub Actions 打出的 1.2.32 DMG 与本地构建的 App 顶部玻璃不同，部分页面有性能问题。

## 环境与触发

本机 macOS 27.2。线上包：`/Applications/Sill.app` 1.2.32，来自正式流程 `41593058066`。本地包：`dist/macos/Sill.app` 1.2.30，2026-11-03 13:11 由 `npm run build:macos` 生成。两者部署目标均为 macOS 14.0。

## 定位依据

| 项 | 线上包 | 本地包 |
| --- | --- | --- |
| 构建机 | `macos-26` runner，Xcode 26.6（17F113），Swift 6.3.3 | 本机 Xcode 27.2（27B52），Swift 6.4.2，SwiftPM 新构建系统（`.build/manifest.pif`、XCBuildData） |
| 可执行文件记录的 SDK（`LC_BUILD_VERSION`） | 26.5 | 14.0 |
| 链接器版本 | 1267.0 | 27106.1 |
| 签名 | 固定自签证书 | 临时签名 |
| 代码版本 | 1.2.32 | 1.2.30 及当时工作区 |

- 系统按可执行文件记录的 SDK 决定外观：记录 26 及以上的 App 使用 Liquid Glass 新外观与渲染；低于 26 的按旧外观兼容运行。线上包因此启用新玻璃，本地包没有。
- Mac 源码在 macOS 26 及以上使用 `glassEffect(.regular.interactive)`、`GlassEffectContainer`、`safeAreaBar` 与 `scrollEdgeEffectHidden`（`Design/Shadow.swift`、`Shell/DesktopView.swift`）。`#available` 按运行系统判断，两个包走同一分支；实际绘制方式随链接 SDK 不同，线上包的玻璃是真实实时渲染，开销更大。
- 本地链接命令传入 `-sdk MacOSX27.2.sdk -target arm64-apple-macos14.0`，产物却记录 SDK 14.0；直接用 `swiftc` 链接同样参数记录 27.2。新构建系统为何写入 14.0 尚未确认。
- 两个包的代码版本不同（1.2.30 与 1.2.32），部分差异也可能来自代码。

## 处理情况

用户确认以本地旧外观为准。Mac 测试与打包工作流改用 `xcode-27` 镜像并选用 `/Applications/Xcode_27.2.app`（镜像中为 27.2 RC 27B48，本机为 27B52）；`build-macos.ts` 生成的 Info.plist 增加 `UIDesignRequiresCompatibility`，打包工作流检查该项。设计手册与发布手册同步。

## 验证与后续

已核对两个包的 `LC_BUILD_VERSION`、签名、版本和 CI 日志中的 Xcode 版本；查看录屏截帧，未做 Instruments 性能追踪或窗口自动化。待新包发布后核对其 `LC_BUILD_VERSION` 与 Info.plist，并由用户在同一台 Mac 对比顶栏外观与滚动流畅度。
