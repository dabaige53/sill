# Sill Apple

更新：2026-10-20。

一个 Swift Package。`SillKit` 提供卡片校验、本地存储与云端客户端，`iOS/` 只有共享数据层。macOS 界面层已删除，正在重建；当前仓库没有可运行的 Mac 应用。

## macOS 界面层状态

2026-10-20 删除 `macOS/` 界面代码与 `DesktopTests/`。原因：

- 每次写入都会让整个信息流重新绘制。全局写入状态和整份卡片状态由所有卡片共同读取，打开卡片和阅读计时都会触发整屏重绘，点击与阅读出现卡顿。
- 顶栏使用系统窗口工具栏，没有按 Web 定稿实现；打开阅读时隐藏工具栏，导致整窗重排。
- 卡片在视图中逐项读取 JSON 字段，界面状态集中在一个对象里，逐处修补无法得到干净的结构。

删除前的完整代码保存在提交 `c81bb44`，包括按 Web 对齐的设计变量用法、`NativeMotion`、`NativeShadow` 等动效工具。需要参考时用 `git show c81bb44:apps/apple/macOS/<文件名>` 读取。对齐记录见 [macOS 对齐记录](../../docs/records/2026-10-20-macos-web-alignment/README.md)。

重建以 Web 实现和设计手册为准，信息结构、功能与文案与 Web 一致。新版本完成前，`npm run build:macos` 会直接报错退出。

## 数据层

- 云端使用既有密码登录、会话、工作区与原子批量接口。会话 Cookie 保存在系统钥匙串，密码不持久保存；固定可信 HTTPS 服务，不自动跟随重定向，不使用 service-role 凭据。
- 邮件登录的 `client=macos` PKCE 回调（`sill://auth/callback`）需要随新应用包重新注册；这条链路还需要服务端发布并核对 Supabase redirect 配置。
- 卡片写入携带读取时的版本；标签与备注保留打开时的编辑基准，冲突时保留输入。批量操作整批保存。请求结果未知时先读取确认，不重发写请求。待核对请求只在当前进程保留，不是持久执行队列。
- 来源字段只记录出处，不接入来源，不同步外部内容。

## 本地数据兼容

旧数据 `~/Library/Application Support/Sill/` 保持原样，不自动上传。

本地 cards.json 保留 revision/state 结构、未知字段与旧来源迁移。每次写入在文件锁内读取并检查版本，再原子替换；会话持有独占锁，两个进程不能同时编辑同一工作区。锁文件存在不表示正在占用。

## 构建与检查

需要 Apple Silicon Mac、支持 Swift 6 的 Xcode 和 Node 24+。

```sh
node tests/apple/run.ts
```

测试使用临时目录与模拟 HTTP 响应，不访问真实卡片或账号。

类型、文案、图标和设计变量（`AppleMetrics`、`AppleColors`）在构建时由 `Plugins/CardGenerator` 从 `contracts/` 与 `design-system/` 生成。`macOS/` 目录存在时，生成器会检查其中的文案键，失效引用会阻止构建。新增设计值必须回到设计系统维护。
