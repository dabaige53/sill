# Markdown 正文修复与两端接入

2026-10-22。本轮在 `/Users/w/code/sill-markdown` 的 `contract/markdown-body` 工作，未部署、未修改线上数据库、未发布设计、未合并到 main。

## 基准与变更

- 开始时工作区干净。获取远端后，基准为 `origin/main` 的 `344a01a`；将原 WIP `1dcd8a9` rebase 为 `10fc021`。保留 main 的 ADR 0062、D16 和发布记录，补入 ADR 0063 与原 D17。
- Web 核心失败的主要原因是测试直接注入旧正文数组，绕过读取转换；更新这些运行状态样例，旧数据兼容测试仍保留。摘要卡断言改为卡面摘要，列表留在详情正文。
- 修复代码块不参与搜索和卡面回退文字的问题。无卡面摘要时，正文首块纯文本用作回退，不改变已保存内容。
- macOS 使用 `swift-markdown` 0.9.0 与 cmark-gfm 解析，按既有字体和间距绘制标题、段落、列表、引用、代码、表格与链接。原始 HTML 按文字显示；图片只显示替代文字；链接只接受 http、https、mailto。
- macOS 详情优先显示正文，没有正文才显示纯文本摘要；移除独立要点组件。速记、云端空正文和重复检查改用字符串。旧草稿替换正文时删除旧 points，避免重复叠加。
- 更新 ADR 0063 与本地字段说明。`design-init.sh build` 生成了 settings/content.html 与 components/bundle.css 的 Markdown 样式副本；未手改设计规则或画板。
- `tests/e2e/local-browser.ts` 与 `preview-media.css` 只修正格式，不改变行为；本轮没有执行前者。

## 本轮检查

| 检查 | 结果与范围 |
| --- | --- |
| `npm run test:core` | 285/285；Node/JSDOM，正常退出 |
| `npm run test:contracts` | 53/53 |
| `npm run test:server` | 110/110；隔离 PGlite、HTTP、MCP，不连接生产 |
| `npm run test:macos` | 43 项 SillKit 数据/解析测试、61 项桌面状态测试和应用严格验签通过 |
| `npm run build:macos` | 发布配置编译、本地应用打包、临时签名与严格验签通过；未安装、未启动 |
| `npm run build`、`check`、`typecheck` | 通过 |
| `npm run lint` | 通过；保留仓库既有 warning/info，不当作零警告 |
| `sh scripts/design-init.sh build`、`check` | 通过；生成过程仍有 React key 警告 |
| `npm run files:check`、`git diff --check` | 通过 |

新增 `tests/web/markdown-local.test.ts` 用随机本机端口和 `/private/tmp` 合成数据，执行真实 `POST /api/local/operations`、`GET /api/local/state`，交给 Web 的 `LocalSync.adopt` 和实际 React 组件，验证预览、阅读页、摘要回退、搜索及重读后的正文保真。它不是浏览器视觉测试。

首次核心检查因旧会话测试数据导致进程未退出，已结束对应进程；因此不沿用交接中的“28 项”作为本轮计数。首次 Mac 打包在沙盒内 iconutil 报 Invalid Iconset，本机权限下同一命令成功。后台编译仍有既有 ReaderScroll 捕获引用警告。

## 集成与未验证项

- UI 工作线负责 `docs/product/ui-alignment.md`。将本分支的旧 D17 更新为以下内容；实测状态保留“未验证”：

| 编号 | 行为 | 依据 | Web 桌面 | 手机 Web | Mac | 实测 | 说明 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D17 | 详情只显示一个 Markdown 正文；无正文时显示纯文本卡面摘要；不渲染 HTML、不加载图片，链接只放行 http、https、mailto | [ADR 0063](../../adr/0063-markdown-body.md) | 基准 | 已接入 | 已接入 | 未验证 | Web 使用 markdown-it；Mac 使用 swift-markdown。后台解析、构建和本地 API 数据路径通过；浏览器与 Mac 真实窗口未验证 |

- 合入 UI 工作线后重新运行设计 build/check，重新生成设计副本，不用本分支的旧设计输入覆盖 UI 工作线的新输入。设计未发布到线上。
- 建议类型、why 保留；全屏正文最大宽度不作决定。PR 字段、媒体播放规则、十三类卡片重建未开展。
- 未运行浏览器视觉、完整 e2e、Mac 窗口自动化、真实宿主、真实 Postgres 或生产数据库验证。云端迁移仍需另行确认及发布前验证。

## 提交状态

本轮修复已暂存，尚未形成新提交。提交被全局 PreToolUse 文件大小钩子阻止：单个文件上限 20,000 bytes，检查同时列出本轮修改的 WorkspaceTests、CardBodies、search-state，以及未修改的设计历史、手册和对账文件。没有修改钩子、绕过检查，或扩大范围拆分这些文件。原 Markdown WIP 已完成 rebase；远端分支未推送更新。集成时应先处理该提交规则，再保存与推送修复。
