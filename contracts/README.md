# 跨端数据约定

更新：2026-10-16。现行约定版本为 `card.ts` 中的 `contractVersion`。来源字段改为 `sources`，因此从 2.0.0 起；产品版本独立管理。

- `card.ts`：已实现的本地卡片结构和旧来源字段的纯内存转换；保留未知字段、未知卡片类型，不修改原输入。
- `local.ts`：已实现的本地状态和批量操作。
- `cloud.ts`：已实现的云端写入与 MCP 输入；外部 `/contents` 路径、工具名与权限名保持兼容，不因内部改名破坏宿主。
- `schema.json`：从 zod 导出的本地卡片 JSON Schema，提交到 Git；`npm run contracts:check` 检查是否过期。
- `migration-fixtures.json`：两端共用的旧来源迁移边界；保留 300 字发件人、10+1 个来源、显式空发件人与未知字段。
- `fixtures.json`：合法与非法合成样例；每个写入端都必须执行同一批样例。
- `design/`：从原 `docs/examples/v1/` 迁入的接口设计材料。类型名改为 Card，不表示未实现的接口已上线。

JSON Schema 不能表达日程起止顺序、待办 ID 唯一等规则。业务校验在 TypeScript 和 Swift 中执行，不能仅用结构检查代替。

构建不会读取或改写 `.sill/` 或用户的 Mac 数据。旧来源只在读取副本中转换；后续用户保存才写入新结构。邮件发件人保留在 `sender`，不会成为来源。
