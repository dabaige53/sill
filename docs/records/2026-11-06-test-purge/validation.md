# 验证范围与结果

所有测试使用现有合成数据。没有运行全量测试、浏览器或 CI。

## Node 局部测试

命令为 `node --import tsx --test` 加以下 31 个具名文件；264 项通过，0 失败、0 跳过、0 取消。选择依据是实际删除或裁剪用例、辅助注册引用，以及修改后的 `test:supabase` 配置范围。

- `tests/web/ai-conversation.test.ts`
- `tests/web/app-display.test.ts`
- `tests/web/card-metadata.test.ts`
- `tests/web/card.test.ts`
- `tests/web/chrome.test.ts`
- `tests/web/cloud-card.test.ts`
- `tests/web/copy.test.ts`
- `tests/web/core.test.ts`
- `tests/web/reading-feedback.test.ts`
- `tests/web/search-navigation.test.ts`
- `tests/web/stage-four-motion.test.ts`
- `tests/web/visibility-motion.test.ts`
- `tests/web/selection.test.ts`
- `tests/web/pwa-launch-motion.test.ts`
- `tests/web/detail-motion-performance.test.ts`
- `tests/web/gestures.test.ts`
- `tests/server/local-sync.test.ts`
- `tests/server/login-page.test.ts`
- `tests/web/local-launch.test.ts`
- `tests/web/nested-navigation.test.ts`
- `tests/web/react-renderer.test.ts`
- `tests/web/detail-motion.test.ts`
- `tests/web/gesture-rebound.test.ts`
- `tests/web/gesture-refresh.test.ts`
- `tests/server/supabase-preparation.test.ts`
- `tests/server/supabase-boundary.test.ts`
- `tests/server/supabase-jwt.test.ts`
- `tests/server/supabase-http.test.ts`
- `tests/server/supabase-http-session.test.ts`
- `tests/server/supabase-http-worker.test.ts`
- `tests/server/supabase-mcp.test.ts`

补充 `node --import tsx --test tests/web/agent-handoff.test.ts`：5 项通过。该文件清理了未用辅助数据，原 31 文件名单未包含它。

## Swift 局部测试

`node tests/apple/run.ts --filter 'SillDesktopTests\.(AIConversationTests|DesktopInteractionTests|MotionFlowTests|SelectionTests|WorkspaceTests)'`：5 个套件、47 项通过，0 失败。编译测试 target 后只执行指定套件，没有运行 XCTest 性能或 UI 测试。

## 独立检查

- `node scripts/check-contracts.ts`：11 项 HTTP 设计、10 项 MCP 映射、11 个合成响应通过。
- `node scripts/check.ts`：现有构建产物的图片地址检查通过；未重新构建页面。
- `npm run files:check`：通过。
- `git diff --check`：通过。
- 解析修改后的 TypeScript 与全部测试相对导入：通过，无缺失引用。
- 逐定义检查标记：673 / 673；浏览器场景与独立脚本检查另外逐项比对，保留用例共 875 / 875。

## 类型引用检查

范围为本次修改的 TypeScript 文件及其 import 依赖；使用仓库 tsconfig，并显式包含现有 `contracts/environment.d.ts`。

首次失败有两类原因：临时配置未包含图片模块和 Window 全局声明；辅助代码清理误移除只在类型位置使用的 `AgentScope`、`Card`、`Locator`。修正仅涉及测试 import 与临时检查配置，未修改业务代码或恢复用例。复跑类型检查退出码 0，无错误。

## 未执行范围

- 仅新增标记、未改变测试内容的其他用例不重复执行。
- `tests/web/home-screen.test.ts` 会执行 Web 与 MCP App 构建，本轮未运行。
- 浏览器、完整 e2e、Postgres Docker 集成、其他 Swift 套件、Mac 窗口和真机体验未运行。
- Web 与安装包构建、CI、生产服务和部署未运行。

完整临时日志位于 `/private/tmp/sill-test-purge/`。本记录中的通过结果只对应上述范围。
