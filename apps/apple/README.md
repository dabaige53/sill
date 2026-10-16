# Sill Apple

更新：2026-10-16。

一个 Swift Package。SillKit 提供 Mac 与 iOS 共用的卡片、约定校验和本地文件存储；macOS 放 SwiftUI 桌面，iOS 目前只有共享数据层入口，没有经过 iOS 界面或设备验收。

## 本端补充规则

- 卡片 Codable 类型在构建时由官方 swift-openapi-generator 从 ../../contracts/apple-openapi.json 生成，不提交生成代码。JSON Schema 校验与无法导出的业务规则一起执行。未知类型按通用卡片展示，未知字段写回保留。
- cards.json 保留旧的 revision/state 文件结构；draft.json 保留旧草稿结构。读取时只在内存中迁移来源，不自动改写已有文件。
- 每次卡片写入在内核文件锁内重新读取并检查 expectedRevision，再原子替换文件。冲突不覆盖、不自动重试。提交后结果未知时只读核对一次，完整卡片相同才清除草稿。
- 桌面会话持有独占文件锁，第二个应用不能同时编辑同一草稿。锁由系统在进程退出或崩溃后释放。锁文件存在不表示已占用。
- 草稿使用串行队列。保存、恢复、放弃和应用退出均等待已排队写入。编辑未改动的正文时保留原段落边界。
- 文案来自 ../../design-system/copy/zh-Hans.json；构建生成有类型的 Copy 常量和 String Catalog，不提交生成结果。
- Swift 依赖使用确切版本并提交 Package.resolved。首次构建会下载依赖；之后构建按锁文件解析，不更新依赖。
- 不运行 HTTP 服务、Node 或后台子进程；不连接云端账号、第三方来源或外部助手。

## 构建与检查

需要 Apple Silicon Mac、Xcode/Swift 6 和 Node 24+。Node 只用于仓库构建，不进入应用包。

从仓库根目录运行：

```sh
node tests/apple/run.ts
node scripts/build-macos.ts
codesign --verify --deep --strict dist/macos/Sill.app
```

构建读取根 package.json 产品版本，并生成递增构建号。产物只在 dist/macos/Sill.app；仅本机 ad-hoc 签名，没有安装、公证或发布。

原生单元测试也可直接使用 swift test --package-path apps/apple。受限运行环境使用 tests/apple/run.ts，它把 SwiftPM 缓存放在包内，并关闭无法嵌套的构建沙箱。

测试仅使用临时目录中的合成卡片。覆盖全部约定样例、未知字段、来源迁移、原段落、原子替换故障、版本冲突、跨实例与跨进程锁、崩溃后恢复，以及未知写入结果核对。

## 桌面行为

⌘N 新建笔记；⌘F 搜索并按全部、收藏、稍后读筛选；⌘R 刷新。卡片提供阅读、编辑笔记、收藏、稍后读、阅读状态和删除确认。⌘S 保存编辑；Esc 在有修改时先请求放弃确认。重新打开应用可恢复已有草稿。

默认数据目录是 ~/Library/Application Support/Sill/。不读取项目 .sill 数据。测试或获授权的桌面检查可传 --data-directory /tmp/sill-visual-check；自动测试不打开默认目录。

本批次只完成模型、文件故障测试、本地构建和签名检查。窗口缩放、VoiceOver、深浅色和系统减少动态效果仍须在获授权的真实桌面检查；构建成功不表示这些项目已验收。
