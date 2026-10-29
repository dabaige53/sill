# 代码规范

更新：2026-10-29。通用开发与优化要求见根目录 [AGENTS.md](../../AGENTS.md)，本文维护语言、结构、命名与数据等工程细则；当前工具与检查入口以项目配置和[测试操作说明](../implementation/testing.md)为准。

本规范适用于 Web、Mac、iOS、服务端和 `contracts/`。部署授权、产物交付与上线验收按[部署规范](deployment.md)执行。各端 README（`apps/web/`、`apps/apple/`、`server/`、`contracts/`）只写本端的补充规则，不重复本文。

## 1. 语言

| 语言 | 用于 |
| --- | --- |
| TypeScript | Web、服务端、`contracts/`、构建与检查脚本、测试 |
| Swift | Mac 与 iOS |
| SQL | Supabase 迁移 |

- 不引入其他语言。需要引入时先写 ADR。
- TypeScript 使用 ES 模块。Node 版本按 `package.json` 的 engines 要求，直接运行 `.ts`；Web 使用 React 与 TSX，由 Vite 和官方 React 插件构建；CI 运行 `tsc --noEmit`。
- Mac 与 iOS 的界面与数据层用 Swift 实现，不随包运行 Node 或其他服务进程。Mac 唯一的 WebView 例外是视频区域的官方嵌入播放器；其他界面仍原生，见 [ADR 0061](../adr/0061-in-app-media-playback-and-pr-cards.md)。

## 2. 结构与依赖

- 目录结构见 [文件管理规范](file-management.md#2-顶层目录)。
- `apps/*` 和 `server/*` 只引用 `contracts/` 与 `design-system/`。各端之间互不引用；服务端不引用客户端代码。
- Apple 端共享代码放 `SillKit/`。只有一端用到的代码才放 `macOS/` 或 `iOS/`。
- 新增模块前，先确定它属于哪一端、哪一层。不能确定时，不放进共享层。

## 3. 命名

- 代码标识符、文件名和代码注释使用英文。用户可见文字放在文案文件中（见第 6 节）。
- 新增业务概念使用 [GLOSSARY](../../GLOSSARY.md) 中的名称：卡片写作 `Card`，来源写作 `sources`。已有对外字段和工具名（如 `contents`、`item.patch`）按兼容约定保留，不因统一称呼改名。
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

- 修改或审查动画、滚动、抽屉和手势时，按[动效开发与排查](motion-development.md)核对真实入口、参考差异、输入与运动归属、状态保持和验收证据。
- 颜色、间距、圆角、字号和动效只引用共享设计变量生成的 CSS 变量或 Swift 常量，不在代码中直接写数值。设计变量源文件按类别放在 `design-system/tokens/*.json`，生成兼容文件 `tokens.json`。
- 用户可见文字按职责放在 `design-system/copy/zh-Hans/*.json`，生成供各端读取的 `design-system/copy/zh-Hans.json`。key 使用英文点分格式，例如 `card.type.article`。运行 `npm run contracts:generate` 更新生成文件，`contracts:check` 检查是否过期。
- Web 端在构建时读取文案文件。Apple 端在构建时生成 String Catalog，并通过生成的常量引用，key 写错时编译失败。
- 测试检查 `card.type.*` 正好对应 GLOSSARY 中的卡片类型，来源类型同样检查。
- 当前只提供简体中文。增加语言时新增同结构的文件，不修改 key。

## 7. 平台差异

- 交互可以按平台不同；同一张卡片的数据含义、状态和写入规则在三端相同。
- [功能矩阵](../implementation/feature-matrix.md)记录每项能力在 Web、Mac、iOS、云端的状态：已实现、设计中、不支持。改变能力状态的 PR 同时更新矩阵，并在 PR 的 Evidence 中写明改了哪一格。
- 功能矩阵只写当前状态，不写计划版本。

## 8. 秘密与配置

- 秘密只放在宿主或 MCP 的安全配置、不提交的 `.env`、部署平台 secret 或系统钥匙串中。
- 秘密不写入代码、卡片、日志、错误信息、模型上下文和浏览器持久化存储。
- 外部工具与内容来源遵循 [PRODUCT.md](PRODUCT.md) 的产品边界。
- 配置示例只写变量名和非秘密的默认值。

## 9. 测试

- 测试按端放在 `tests/web/`、`tests/apple/`、`tests/server/`、`tests/contracts/`；跨端流程放 `tests/e2e/`。Apple 端也可以把单元测试放在 Swift Package 的测试 target 中，由 `swift test` 运行。
- 修改契约时，必须同时更新合法与非法样例，并通过每一端的契约测试。
- 修改写入逻辑时，必须覆盖版本冲突和结果未知两种情况。
- 修改界面时，按 [测试与验证](test.md) 选择获准的检查；未获授权的界面验证标为未验证。证据保存位置见文件管理规范第 5 节。
- 测试只使用合成数据，不读取真实卡片、真实账号或秘密。
- 删除代码时，同时删除对应测试。

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

## 12. 构建与版本

- 产品版本只写在根目录 `package.json`。Info.plist、MCP 服务版本和插件包版本由构建脚本写入。
- Apple 构建号由构建脚本自动生成，只增不减。
- 契约版本写在 `contracts/` 中，只随接口变化升级。
- 构建产物放在 `dist/<端>/`。构建只生成本地文件，不代表安装、发布或线上验收。

## 13. 提交与 PR

- PR 正文使用 [PR 模板](../../.github/pull_request_template.md)，按 Summary、Evidence、Merge Danger 填写；只把实际运行过的检查写为通过。
- 一个 PR 只做一类改动。移动文件、修改行为和整体格式化分开提交。
- 迁移按端分批；每批按 [测试与验证](test.md) 选择直接受影响的检查，不默认运行完整测试。
