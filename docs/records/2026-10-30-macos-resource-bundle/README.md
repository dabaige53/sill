# Mac 启动崩溃与共享头像压缩

## 问题与状态

2026-10-30。已修复源码，待 GitHub Actions 构建和安装包启动验证。

## 环境与触发

- 用户日志：Sill 1.2.19（1793345175），Apple Silicon，macOS 27.2。
- 入口：`/Applications/Sill.app`。启动约两秒后，信息流加载封面时崩溃。
- 预期：打开云端工作区并显示卡片。实际：主线程触发 `EXC_BREAKPOINT (SIGTRAP)`。

## 定位依据

- 崩溃调用链：`CoverImage → Cover.image → NSBundle.module → _assertionFailure`。
- 本机安装包的 `Contents/Resources/Sill_Sill.bundle` 存在，包含封面和头像 PNG，不是漏打包。
- 安装的可执行文件包含 `could not load resource bundle` 和 GitHub runner 上的资源包绝对路径。
- `swift build` 生成的访问器查找应用根目录或构建目录；打包脚本将资源放在 macOS 标准的 `Contents/Resources`，两者不一致。[SwiftPM 实现](https://github.com/swiftlang/swift-package-manager/blob/main/Sources/Build/BuildDescription/SwiftModuleBuildDescription.swift)。
- 封面和头像原来都直接访问 `Bundle.module`，因此两处都受影响。Web 不使用 SwiftPM，不受这次崩溃影响。

## 处理情况

- 新增 `AppResources.bundle`，优先定位应用内的 `Sill_Sill.bundle`；未打包的 SwiftPM 测试仍沿用 `.module`。封面与头像统一使用这一入口。
- 保留标准资源目录，不改生成的访问器，不直接修改已安装应用或用户数据。
- `build-macos.ts` 在签名前复制应用到仓库外临时目录，编译同一份资源入口和生成访问器作为无窗口检查程序，确认实际读取的资源包在应用内，并解码全部源 PNG。不能依赖构建目录的资源包通过检查；失败会阻止构建成功。
- 共享头像源图从 1254 × 1254 缩到 160 × 160，PNG 从 1,641,306 字节降至 28,251 字节，减少约 98.3%。保留原构图和 PNG 格式，不改界面显示尺寸。原图没有透明通道，压缩后仍没有透明通道。
- 通过 `design-system/scripts/export-data.ts` 更新 Mac 头像产物；Web 继续直接引用同一源图。

## 验证与后续

- 已检查压缩图内容、像素尺寸、文件体积及头像产物同步。
- `npm run files:check`、`git diff --check` 通过；本次 Swift 文件的 `swift format lint --strict` 通过。
- `build-macos.ts` 的 Biome 检查通过，保留原有文案生成代码的一处 `noExplicitAny` 警告，本次没有新增警告。
- 未在本地运行完整测试、Mac 构建、应用窗口或真实账号操作。
- GitHub Actions 需要执行更新后的 `build:macos`，通过资源读取、PNG 解码和签名检查；新包仍需实际启动验收。当前已安装的 1.2.19 未被替换。
