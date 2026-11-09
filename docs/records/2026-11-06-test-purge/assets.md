# 测试附属物与入口

证据行号对应基准 `9bc97021757889ff041fcc5ec96b4f94b11bcd3b`。

| 文件:行号 | 资产 | 处置 | D 规则 | 理由 |
| --- | --- | --- | --- | --- |
| tests/e2e/search-browser.ts:72 | phone | DELETE | D12 | 保留用例与注册入口均无引用；删除孤儿辅助函数或测试数据。 |
| tests/e2e/search-browser.ts:76 | touch | DELETE | D12 | 保留用例与注册入口均无引用；删除孤儿辅助函数或测试数据。 |
| tests/web/agent-handoff.test.ts:26 | key | DELETE | D12 | 保留用例与注册入口均无引用；删除孤儿辅助函数或测试数据。 |
| tests/web/ai-conversation.test.ts:25 | withResult | DELETE | D12 | 保留用例与注册入口均无引用；删除孤儿辅助函数或测试数据。 |
| tests/web/ai-conversation.test.ts:143 | sessions | DELETE | D12 | 保留用例与注册入口均无引用；删除孤儿辅助函数或测试数据。 |
| tests/web/ai-conversation.test.ts:17 | session | DELETE | D12 | 保留用例与注册入口均无引用；删除孤儿辅助函数或测试数据。 |
| tests/web/ai-conversation.test.ts:16 | now | DELETE | D12 | 保留用例与注册入口均无引用；删除孤儿辅助函数或测试数据。 |
| tests/web/local-launch.test.ts:10 | bundle | DELETE | D12 | 保留用例与注册入口均无引用；删除孤儿辅助函数或测试数据。 |
| tests/web/pwa-launch-motion.test.ts:11 | root | DELETE | D12 | 保留用例与注册入口均无引用；删除孤儿辅助函数或测试数据。 |
| apps/apple/DesktopTests/AIConversationTests.swift:8 | session | DELETE | D12 | 相关会话用例全部删除；保留的折叠行为不调用该辅助函数。 |
| tests/apple/PerformanceHarness.xcodeproj/project.pbxproj:13 | project.pbxproj | DELETE | D12 | 只服务已删除的 PerformanceUITests；UI 性能入口一并移除。 |
| tests/apple/PerformanceHarness.xcodeproj/xcshareddata/xcschemes/SillPerformance.xcscheme:3 | SillPerformance.xcscheme | DELETE | D12 | 只服务已删除的 PerformanceUITests；UI 性能入口一并移除。 |
| tests/apple/recording-signal.c:8 | recording-signal.c | DELETE | D12 | 只服务已删除的 PerformanceUITests；UI 性能入口一并移除。 |
| apps/apple/DesktopTests/PerformanceBenchmarks.swift:1 | entire file | DELETE | D13 | 全部用例已判 DELETE；删除剩余 setup、teardown、导入和专用数据。 |
| tests/apple/PerformanceUITests.swift:1 | entire file | DELETE | D13 | 全部用例已判 DELETE；删除剩余 setup、teardown、导入和专用数据。 |
| tests/e2e/cloud-recovery-browser.ts:1 | entire file | DELETE | D13 | 全部用例已判 DELETE；删除剩余 setup、teardown、导入和专用数据。 |
| tests/server/supabase-rpc.test.ts:1 | entire file | DELETE | D13 | 全部用例已判 DELETE；删除剩余 setup、teardown、导入和专用数据。 |
| tests/server/supabase-snapshots.test.ts:1 | entire file | DELETE | D13 | 全部用例已判 DELETE；删除剩余 setup、teardown、导入和专用数据。 |
| tests/web/cloud-session-view.test.ts:1 | entire file | DELETE | D13 | 全部用例已判 DELETE；删除剩余 setup、teardown、导入和专用数据。 |
| tests/web/markdown-local.test.ts:1 | entire file | DELETE | D13 | 全部用例已判 DELETE；删除剩余 setup、teardown、导入和专用数据。 |
| tests/web/phone-text-scale.test.ts:1 | entire file | DELETE | D13 | 全部用例已判 DELETE；删除剩余 setup、teardown、导入和专用数据。 |

## 保留的共享资产

| 资产 | 保留引用 |
|---|---|
| `gesture-fixture.ts` | `gestures.test.ts:4`及保留的手势用例。 |
| `visibility-motion-fixture.ts` | `motion-sheet.test.ts:3`。 |
| `motion-fixture.ts` | `phone-drawer.test.ts:28`及多个共享 fixture。 |
| `react-browser-fixture.ts` | `reading-feedback.test.ts:8`、`chrome.test.ts:5`。 |
| `search-state-fixture.ts` | `search-navigation.test.ts:5`、`search-desktop.test.ts:5`。 |
| `chrome-fixture.ts` | `chrome.test.ts:4`。 |
| `app-fixture.ts` | `app.test.ts:5`。 |
| `boundary-fixture.ts` | `rich-card.test.ts:6`及云端测试。 |
| `cloud-fixture.ts` | `cloud-workspace.test.ts:294`、`cloud-operations-browser.ts:6`。 |
| `signed-auth.ts` | `cloud-app-browser.ts:12`、`supabase-jwt.test.ts:5`。 |
| `oauth-fixture.ts` | `oauth-browser.ts:6`、`oauth-shared-applications.test.ts:4`。 |
| `cloud-ui.ts` | `cloud-welcome-browser.ts:7`、`cloud-app-browser.ts:11`。 |
| `hidden-actions-migration.ts` | `cloud-workspace.test.ts:408`、`supabase-postgres-permissions.ts:307`。 |
| `skill-examples.ts` | `rich-card.test.ts:171`、`mcp-guidance.test.ts:22`。 |
| `cloud-selection-operations.ts`、`cloud-stable-detail.ts` | 均由保留的 `cloud-operations-browser.ts:131`调用。 |
| `material-density-fixture.ts` | `material-density-browser.ts:7`及其他浏览器入口。 |
| `pwa-stress-fixture.ts` | `pwa-stress-preview.ts:4`提供人工压力预览，不能仅按自动测试判定删除。 |
| `WorkspaceTestSupport.swift` | `FeedTests.swift:10`使用共享合成后端和数据。 |
| `FileFaultController.swift` | `UnknownWriteTests.swift:22`使用。 |
| `SillStoreProbe.swift` | `Package.swift:28`声明 target，`CardStoreTests.swift:26`使用。 |
| `card-fixtures.ts`、`contracts/fixtures.json`、`contracts/media-fixtures.json` | `card.test.ts:7`使用合并数据；`CardTests.swift:41`也读取两份 JSON。 |
| `contracts/design/fixtures.json` | `check-contracts.ts:11`读取，`export-design.ts:144`也使用；不是仅由某个待删测试拥有。 |
| `performance-report.ts` | `performance-report.test.ts:3`和保留的 report 功能使用。 |


无 `*.snap` 或 `__snapshots__`。产品 Snapshot 模型与数据库快照测试不是快照文件。已删除的未用导入共 22 组；删除后检查全部测试 TS 顶层绑定及嵌套辅助函数，未留无引用辅助定义。Swift 私有辅助声明同步检查。

## 注册与配置

- `package.json`：删除 `test:cloud-recovery`；从 `test:supabase` 移除已删除的旧 RPC 与快照测试。通配符入口继续发现其余文件。
- `scripts/performance-macos.ts`：删除 benchmark 和 ui 分支，保留必须显式选择的 manual/report；未指定模式会返回用法错误。
- `.github/workflows/ci.yml`、`test.yml`、`verify.yml`、`supabase.yml`、`consent-policy.yml`、`macos.yml`、`macos-package.yml`、`release.yml` 全部核对，无已删测试的直接调用，无须改写。
- `scripts/ci-browser.ts` 不引用被删恢复脚本。CI 的 cloud-recovery 产物目录仍被 cloud-welcome 使用，保留。
- `apps/apple/Package.swift` 与 `tests/apple/run.ts` 按目录注册仍有用例的 target，保留。
- `tsconfig.json`、`biome.json`、三个已跟踪 `.gitignore` 无失效的逐文件测试路径，保留。没有 pytest、Jest、Vitest 专用配置。
- `tests/web/selection.test.ts`、`tests/server/oauth-consent.test.ts` 为注册入口；子模块用例已纳入清单。Postgres 父子用例均逐条计入。
- 两个独立检查脚本的全部断言纳入处置表；保留 `check-contracts.ts` 的 CLI 样例导出和 schema 检查。
- 同步修正现行测试、脚本和性能操作文档。历史记录、发布快照、第三方依赖、用户数据与产品源码未改。
