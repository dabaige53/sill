# CI 运行说明

更新：2026-11-02。说明 GitHub Actions 的检查入口、环境与编排。测试范围见[测试目录](../../tests/README.md)，发布与部署见[发布操作手册](operations/release-runbook.md)。

## 检查入口

CI Hook 指 [package.json](../../package.json) 中的 npm 检查命令，不是本地 Git hook。工作流调用这些入口；检查参数和文件清单在入口中维护。已有的 `test:*`、`build:*` 命令继续使用，不另写一套实现。

| 任务 | 命令 | 用途 |
| --- | --- | --- |
| Web 格式与规则 | `npm run ci:lint` 或 `npm run ci:format` | 只检查，不改写文件；Apple 使用 `npm run lint:apple` |
| TypeScript 类型 | `npm run ci:typecheck` | 调用现有类型检查 |
| 指定 Node 测试 | `npm run ci:test -- tests/web/card.test.ts` | 参数直接交给 Node test runner；CI 全量检查仍使用 `npm test` 的明确清单 |
| Web 构建 | `npm run ci:build` | 调用现有构建 |
| 静态检查集合 | `npm run ci:quick` | 文件、Web lint 与类型检查；检查完整范围，不自动选择变更文件 |
| Web 验证 | `npm run ci:verify:web` | Web lint、构建、再次构建比较产物 |
| Web 浏览器回归 | `npm run ci:test:web-browser -- <group>` | motion、navigation、layout 三组共 12 个入口；省略 group 执行全部。组内完整执行，有任一失败即返回失败 |
| 共享卡片专项 | `npm run ci:verify:card-content` | 契约、Web lint、类型、构建及指定卡片测试；Mac 手动运行的可选步骤 |
| Swift 后台测试 | `npm run ci:test:apple` | 调用现有 Apple 测试脚本，支持追加 Swift test 参数 |
| 离线授权策略 | `npm run ci:test:consent` | 不安装依赖的独立快速检查；与服务端测试有意重叠 |
| 发布版本 | `npm run ci:release:version` | 检查运行 tag 与产品版本一致 |

入口不安装依赖。GitHub Actions 负责完整测试、浏览器回归、Web 构建和 Mac 打包。本地调用这些入口仍按[测试规范](../agent/test.md)取得对应授权；`ci:quick` 不是默认执行许可，也未安装 pre-push hook。

## 工作流与触发

| 工作流 | Job | 触发 | 检查入口 | 超时 |
| --- | --- | --- | --- | --- |
| `verify.yml` | `verify`、`browser (motion/navigation/layout)` | main push、PR、复用调用 | 静态验证与三个浏览器组并行；各组构建后执行 `ci:test:web-browser` | 各 10 分钟 |
| `test.yml` | `test` | main push、PR、复用调用 | `npm test`、`plugin:build`、`test:local-browser` | 12 分钟 |
| `supabase.yml` | `boundary` | main push、PR、复用调用 | `test:supabase:postgres`、`build:cloud`，以及云端、宿主、操作、欢迎页、OAuth 浏览器入口 | 20 分钟 |
| `consent-policy.yml` | `policy` | main push、PR、复用调用 | `ci:test:consent` | 2 分钟 |
| `macos.yml` | `macos` | 匹配路径的 main push/PR、手动、复用调用 | `lint:apple`、`ci:test:apple`；手动可选 `ci:verify:card-content` | 30 分钟 |
| `macos-package.yml` | `package` | 手动、复用调用 | `build:macos`、`package:macos` | 30 分钟 |
| `release.yml` | `version`、复用检查、打包、`publish` | `v*` tag push、手动选择版本 tag | 版本检查 → 五类检查 → 云端与 Mac 打包 → 发布 | version 5、cloud-package 10、publish 10 分钟；复用任务沿用各自限制 |

Mac 路径清单在 [macos.yml](../../.github/workflows/macos.yml) 维护，包含共享 setup 与 Swift 缓存 action。它不是全量运行入口；发布通过复用调用执行 Mac 检查。

本项目不配置分支保护或必需检查汇总 Job。各检查仍保留非零失败退出，发布仍等待五类检查全部通过后才打包。Job id 和工作流名称保持稳定。

## 环境准备

所有 Job 在 checkout 后使用 [.github/actions/setup/action.yml](../../.github/actions/setup/action.yml)。输入为 `node-version`、`cache`、`cache-write` 和 `install`。`install` 支持 `standard`（`npm ci`）、`ignore-scripts`（保留禁止生命周期脚本、关闭 audit/fund 的参数）、`none`（只准备 Node）。

| 范围 | Node | npm 缓存 | 安装模式 |
| --- | --- | --- | --- |
| Web 验证与浏览器组 | 24 | 有，只读 | ignore-scripts |
| 集成检查 | 26 | 有 | standard |
| 数据与云端检查 | 24 | 有 | standard |
| Mac 验证 | 24 | 有 | ignore-scripts |
| 离线授权策略 | 24 | 无 | none |
| Mac 打包 | 26 | 有 | ignore-scripts |
| 云端发布构建 | 26 | 有 | standard |
| 发布版本与部署 | 26 | 无 | none |

Node 26 用于集成检查，以保留现有 PGlite 运行环境。Node 版本和安装模式由调用方显式指定。npm 仅缓存下载内容目录 `_cacache`，key 绑定系统、架构、实际 Node/npm 版本和锁文件；仅精确匹配，命中后仍执行 npm ci。不缓存 node_modules、日志、凭据或整个工作区。

npm 默认只读。Linux Node 24 由数据检查负责写入，Node 26 由集成检查负责写入；Mac 检查与打包分别写入对应 Node 版本。写入还要求默认分支或手动运行，普通 PR 不保存缓存。

## Swift 缓存

Mac 检查与打包使用共享 [Swift 缓存 Action](../../.github/actions/swift-cache/action.yml)，debug 与 release 分开。key 绑定系统、架构、Xcode/Swift 工具链、Apple 源码和资源、contracts、design-system、assets、package.json、构建及测试脚本和缓存 Action；源码输入排除 `.build` 与 `.swiftpm`。仅精确匹配，不从不同构建输入恢复编译产物。

缓存保存 `apps/apple/.build`，排除 config、security、构建号计数和生成的 String Catalog。恢复和保存使用构建前计算的同一个 key。缓存命中不跳过格式检查、Swift 测试、构建或 DMG 验证。

Swift 仅在检查通过、未精确命中且属于默认分支或手动运行时保存。主分支 Mac 检查建立 debug 缓存；主分支手动 DMG 构建可建立 release 缓存。工作分支手动运行只验证该分支的保存与恢复，不表示主分支缓存已经建立。合并、主分支运行和发布仍遵守各自授权边界。

Linux 使用 `ubuntu-latest`，Mac 使用 `macos-26`，均为 GitHub 标准托管 Runner。各工作流默认只有 `contents: read`，发布 Job 单独保留 `contents: write`。

## 并发与失败

五类 PR 检查按工作流与 PR 编号分组，新推送取消旧运行。其他事件按调用工作流和提交 SHA 分组，不主动取消正在执行的运行。组名包含被调用工作流的固定前缀和调用方名称，避免发布中的复用任务互相取消，或与独立检查共用分组。

发布沿用 `sill-release` 分组和 `cancel-in-progress: false`。这一设置不等于无限排队，也不构成人工上线审批。

Web 浏览器分组在 [ci-browser.ts](../../scripts/ci-browser.ts) 维护；`--list` 只输出分组。矩阵关闭 fail-fast，各组独立 Runner，组内保留全部入口执行后的统一失败结果。各组独立上传截图、耗时 JSON 和按脚本入口计数的 JUnit，不把入口数当作内部断言数量。云端浏览器步骤保留构建和 Chromium 安装成功后继续检查的条件。Swift 测试保留未取消即继续运行的条件。其他步骤沿用 GitHub Actions 的前序成功条件。

## 触发与构建去重

工作分支通过 PR 检查，push 检查限定 main；未开 PR 的工作分支不自动运行。发布复用入口保持不变。

`plugin:build` 只包装清单、skills 和宿主配置，包装脚本不读取 Web 产物。集成检查仍由 `npm test` 构建并验证 Web，不再为插件包装重复构建。Web 二次构建一致性检查保留。

## 维护与验证

新增检查先维护 package.json 入口，再接入相应工作流，并更新本文。修改编排时比较前后的检查命令、事件、条件、测试文件与失败退出方式；自动审计不能展开的汇总入口需要逐项核对。

本地先做差异和文件检查，交付前执行 `npm run files:check`。推送和真实 Actions 验证另行取得授权；没有远端运行结果时，不宣称 CI 已通过或已有提速收益。运行耗时和当次验证结果保存到事件记录，不持续追加到本说明。
