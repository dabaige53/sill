# 代码规范

更新：2026-10-19。目录与语言迁移已完成，批次与验收边界见 [文件管理规范](file-management.md#9-迁移进度)。动态界面仍有显式 `any`，类型检查尚未使用 strict；Biome 默认规则保留警告，不把零错误说成零警告。

本规范适用于 Web、Mac、iOS、服务端和 `contracts/`。各端 README（`apps/web/`、`apps/apple/`、`server/`、`contracts/`）只写本端的补充规则，不重复本文。决策依据见 ADR [0023](../adr/0023-three-clients-repo-layout.md) 至 [0027](../adr/0027-native-apple-data-layer.md)。

## 1. 语言

| 语言 | 用于 |
| --- | --- |
| TypeScript | Web、服务端、`contracts/`、构建与检查脚本、测试 |
| Swift | Mac 与 iOS |
| SQL | Supabase 迁移 |

- 不引入其他语言。需要引入时先写 ADR。
- TypeScript 使用 ES 模块。Node 24 直接运行 `.ts`；Web 使用 React 与 TSX，由 Vite 和官方 React 插件构建；CI 运行 `tsc --noEmit`。
- Mac 与 iOS 完全原生：界面与数据层都用 Swift 实现，不使用 WebView，不随包运行 Node 或其他服务进程。

## 2. 结构与依赖

- 目录结构见 [文件管理规范](file-management.md#1-顶层目录)。
- `apps/*` 和 `server/*` 只引用 `contracts/` 与 `design-system/`。各端之间互不引用；服务端不引用客户端代码。
- Apple 端共享代码放 `SillKit/`。只有一端用到的代码才放 `macOS/` 或 `iOS/`。
- 新增模块前，先确定它属于哪一端、哪一层。不能确定时，不放进共享层。
- 不保留不再使用的代码、注释掉的代码和未接入的入口。不再使用就删除，需要时从 git 历史取回。

## 3. 命名

- 代码标识符、文件名和代码注释使用英文。用户可见文字放在文案文件中（见第 6 节）。
- 业务概念使用 [GLOSSARY](../../GLOSSARY.md) 中的名称：卡片写作 `Card`，来源写作 `sources`，不使用 `Item`、`Content`、`AI 整理` 等已弃用的说法。
- TypeScript：普通模块用 `kebab-case.ts`，React 组件用 `kebab-case.tsx`；类型和类用 `PascalCase`；函数和变量用 `camelCase`；常量对象也用 `camelCase`，不使用全局变量。
- Swift：一个主要类型一个文件，文件名与类型名相同，使用 `UpperCamelCase`。
- 测试文件与被测文件同名：`card-store.ts` 对应 `card-store.test.ts`；`CardStore.swift` 对应 `CardStoreTests.swift`。
- SQL 迁移：`supabase/migrations/YYYYMMDDHHMMSS_topic.sql`，名称中不写产品版本号。

## 4. 数据契约

- 卡片结构、接口和 MCP tools 只在 `contracts/` 中用 zod 定义一次。服务端直接引用；Web 端引用类型、导出的 JSON Schema 和不含 zod 的纯规则，不打包 zod。
- 脚本把 zod 定义导出为 JSON Schema 并提交。CI 检查导出结果与定义一致。Apple 端在构建时用 swift-openapi-generator 生成类型，生成代码不提交。
- 每个契约标明「已实现」或「设计中」。客户端只依赖已实现的契约。
- `contracts/` 提供合法样例和非法样例。每一端的契约测试必须接受全部合法样例、拒绝全部非法样例，并在解析后写回时保持合法样例不变。
- 无法导出为 JSON Schema 的业务规则（例如日程结束时间晚于开始时间），在每个会写入数据的端都要实现，并用非法样例覆盖。
- 宽容读取：不认识的字段原样保留并在写回时带上；不认识的卡片类型显示为通用卡片。不因为未知内容报错或丢数据。
- 契约只做向后兼容的新增。不兼容的修改先写 ADR，再升契约主版本号。

## 5. 写入、冲突与错误

- 每次写入都带读取时的版本号。版本冲突时不覆盖新内容，不自动重试；保留用户输入，提示刷新后合并。
- 写入结果未知时（例如超时或回执丢失），先查询结果，再决定是否重试；重试使用同一个幂等键和同一份请求内容。
- 本地状态只表示本地已记录。没有真实回执时，不显示外部已完成、已连接或已同步。
- 服务端返回错误码，不返回界面文字。各端按错误码在文案文件中取提示语。

## 6. 设计 tokens 与文案

- 颜色、间距、圆角、字号和动效只引用 `design-system/tokens.json` 生成的 CSS 变量或 Swift 常量，不在代码中直接写数值。
- 用户可见文字只放在 `design-system/copy/zh-Hans.json`。key 使用英文点分格式，例如 `card.type.article`。
- Web 端在构建时读取文案文件。Apple 端在构建时生成 String Catalog，并通过生成的常量引用，key 写错时编译失败。
- 测试检查 `card.type.*` 正好对应 GLOSSARY 中的 11 种卡片类型，来源类型同样检查。
- 当前只提供简体中文。增加语言时新增同结构的文件，不修改 key。

## 7. 平台差异

- 交互可以按平台不同；同一张卡片的数据含义、状态和写入规则在三端相同。
- 功能矩阵 `docs/product/feature-matrix.md`记录每项能力在 Web、Mac、iOS、云端的状态：已实现、设计中、不支持。改变能力状态的 PR 同时更新矩阵，并在 PR 的 Evidence 中写明改了哪一格。
- 功能矩阵只写当前状态，不写计划版本。

## 8. 秘密与配置

- 秘密只放在宿主或 MCP 的安全配置、不提交的 `.env`、部署平台 secret 或系统钥匙串中。
- 秘密不写入代码、卡片、日志、错误信息、模型上下文和浏览器持久化存储。
- 不为单个按钮新建第三方直连接口，不写来源同步或导入程序。外部工作交给外部助手；内置助手只通过 Composio 连接器调用外部工具（[ADR 0033](../adr/0033-ai-writes-composio-only.md)）。
- 配置示例只写变量名和非秘密的默认值。

## 9. 测试

- 测试按端放在 `tests/web/`、`tests/apple/`、`tests/server/`、`tests/contracts/`；跨端流程放 `tests/e2e/`。Apple 端也可以把单元测试放在 Swift Package 的测试 target 中，由 `swift test` 运行。
- 修改契约时，必须同时更新合法与非法样例，并通过每一端的契约测试。
- 修改写入逻辑时，必须覆盖版本冲突和结果未知两种情况。
- 修改界面时，按影响范围运行浏览器测试或 Apple 端界面检查，并保留必要证据（见文件管理规范第 5 节）。
- 测试只使用合成数据，不读取真实卡片、真实账号或秘密。
- 测试跟着被测代码走：代码删除时，测试一起删除。

## 10. 格式与检查

| 范围 | 工具 |
| --- | --- |
| TypeScript、CSS、JSON | Biome |
| Swift | swift format |

- 只使用工具的默认风格，每行最多 100 个字符，不做个性化配置。
- `npm run format` 改写文件；`npm run lint` 只检查。CI 运行 lint 与类型检查，不通过不能合并。
- 生成文件、`dist/` 和发布快照不参与格式化。
- 整体格式化单独提交，并把提交号写入 `.git-blame-ignore-revs`。

## 11. 依赖

- 依赖写确切版本，并提交锁文件：npm 用 `package-lock.json`，Swift 用 `Package.resolved`。不手改锁文件。
- 新增依赖时，在 PR 中写明用途、为什么不能用现有依赖解决、维护状态和许可证。
- 优先使用平台自带能力和已有依赖。

## 12. 构建与版本

- 产品版本只写在根目录 `package.json`。Info.plist、MCP 服务版本和插件包版本由构建脚本写入。
- Apple 构建号由构建脚本自动生成，只增不减。
- 契约版本写在 `contracts/` 中，只随接口变化升级。
- 构建产物放在 `dist/<端>/`。构建只生成本地文件，不代表安装、发布或线上验收。

## 13. 提交与 PR

- PR 正文使用 [PR 模板](../../.github/pull_request_template.md)，按 Summary、Evidence、Merge Danger 填写；只把实际运行过的检查写为通过。
- 一个 PR 只做一类改动。移动文件、修改行为和整体格式化分开提交。
- 迁移按端分批，每批运行完整测试。
