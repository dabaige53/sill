# 三端代码的顶层结构

2026-10-16，已确认，代码迁移尚未执行；同日修订：旧代码由移入 `legacy/` 改为删除。仓库按三端加共享层组织：`apps/web/` 放浏览器端，`apps/apple/` 放 iOS 与 Mac，`server/local/` 与 `server/cloud/` 放服务，`contracts/` 放数据结构、接口、MCP tools 与合成数据，`design-system/` 的 tokens 是视觉数值唯一来源。依赖方向固定：各端与服务只引用 `contracts/` 和 `design-system/`，各端之间互不引用。原因：现在同一种卡片在服务端、Web 端和 Mac 端各定义一次，接口约定放在 `docs/examples/` 下当作示例；增加 iOS 后会变成四份。

## Considered Options

- 不再构建的旧代码移入 `legacy/` 保留：未采用。保留就要决定是否保留它的依赖，搜索结果会混入旧代码，格式化、类型检查与文件检查都要为它设排除规则。改为删除，见下文。
- iOS 与 Mac 分成 `apps/ios/` 和 `apps/macos/`：两端都用 SwiftUI，数据模型、接口客户端和 tokens 会重复。未采用。改为 `apps/apple/` 中一个 Swift Package，`SillKit` 放两端共享代码，`macOS/` 与 `iOS/` 只放平台专属部分。

## Consequences

- Mac 版现在依赖随包 Node 本地服务，iOS 无法采用这种方式。Apple 端数据层改为 Swift 原生实现，见 ADR 0027。
- 文件结构与文档不按产品版本号划分。版本范围由 GitHub milestones 管理，实际发生的事写入 `docs/records/`。
- 没有现行入口使用的旧代码（`server/` 旧入口及其模块、`web/` 宿主页面、WASM 脚本功能等）及只测试它们的测试直接删除。删除前在最后一次可运行的提交上打 tag `legacy-final`，并在 `docs/records/<日期>-legacy-removal/` 记录删除的功能、文件、对应的归档文档和取回方法。保留的测试按端分到 `tests/web/`、`tests/apple/`、`tests/server/`、`tests/contracts/`、`tests/e2e/`。
- 迁移按端分批，每端一个 PR，并运行完整测试；各端 README 只写本端补充规则，通用规则在 `docs/agents/code-standards.md`。
