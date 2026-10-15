# Sill for macOS

SwiftUI + AppKit 原生卡片桌面，不使用 WebView。当前连接独立本地数据，不连接云端账号或第三方来源。

## 构建与运行

需要 Apple Silicon Mac、Xcode/Swift 6 和 Node 24+，先运行 `npm ci` 安装仓库已有依赖。

```sh
node scripts/build-macos.mjs
open dist/macos/Sill.app
```

打包包含 Node、本地服务和现有 zod，不下载新依赖。Node 必须是官方独立发行版；Homebrew 动态链接版本会被明确拒绝。可使用 `SILL_NODE=/path/to/standalone/node node scripts/build-macos.mjs`，或直接用独立 Node 执行脚本。产物为 arm64、macOS 14+，仅本机 ad-hoc 签名，没有公证或 Developer ID 签名。

## 操作与数据

- `⌘N` 创建笔记，`⌘F` 打开搜索和收藏/稍后读范围，`⌘R` 刷新本地数据。
- 点击卡片查看正文。右键菜单提供编辑笔记、收藏、稍后读、本地阅读状态、删除；删除前确认。
- 编辑器 `⌘S` 保存，Esc 在有修改时请求放弃确认，未修改时直接关闭。每次编辑立即排入后台串行队列写入草稿，保存与退出时等待写入完成；重新打开应用可恢复。
- 所有写入携带读取时的版本号。冲突不会覆盖新内容，也不会自动重试；草稿保留，提示复制、刷新后合并。
- 数据位于 `~/Library/Application Support/Sill/cards.json`，草稿为同目录 `draft.json`。不读取或覆盖项目 `.sill` 数据。
- 同一数据文件由随包 Swift 启动器持有系统内核独占锁；第二个进程会拒绝启动，崩溃后由系统自动释放锁。锁文件保留本身不代表数据被占用。
- 应用退出后停止随包服务；启动时选择随机本机端口。没有采集、外部执行或自动云同步。
- 修改笔记时保留原卡片完整 JSON，只改标题和正文。现有服务严格校验结构，不接受 schema 以外字段；应用不导入或丢弃未知字段来绕过校验。

## 可重复检查

```sh
node native/macos/smoke.mjs
dist/macos/Sill.app/Contents/MacOS/Sill --self-test
codesign --verify --deep --strict dist/macos/Sill.app
```

前者通过随包 Node 启动真实 HTTP 服务，临时数据覆盖第二实例拒绝、进程崩溃后锁释放、CRUD、状态、重启、409 和原字段保留。后者运行实际 Swift Workspace，临时数据覆盖创建编辑删除、未改正文的原段落边界、版本冲突、草稿写盘和恢复。两者都清理各自临时数据，不改用户桌面。

视觉和辅助功能验收需在真实 macOS 桌面执行：窗口缩放、键盘操作、VoiceOver、深浅色与系统减少动态效果。自动模型检查不能代替这些验收。

视觉验收可用独立目录启动，不写默认桌面：

```sh
dist/macos/Sill.app/Contents/MacOS/Sill --data-directory /tmp/sill-visual-check
```

本地服务退出后保留已有卡片和草稿，重试会重新打开同一数据文件；服务仍运行时只重新读取，不无故创建进程。重复启动共用同一任务，过期读取不能回退较新的版本。Swift 自测覆盖这些恢复与并发场景。

写入响应丢失后仅做一次只读核对，完整卡片与提交内容一致才确认保存；核对不可用或内容不同则保留草稿，不重新发出写入。Swift 自测使用真实 HTTP 故障注入覆盖已落地但响应丢失、核对前并发更改、核对读取不可用。搜索可从系统 Edit 菜单使用 ⌘F；编辑器未改动时 Esc 直接关闭，有改动才确认放弃。
