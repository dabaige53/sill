# 仓库只用 TypeScript、Swift、SQL

2026-10-16，已确认，尚未实施。Web、服务端、`contracts/`、构建与检查脚本、测试使用 TypeScript 和 ES 模块；Apple 两端使用 Swift；Supabase 迁移使用 SQL。Node 24 直接运行 `.ts`，Web 打包沿用 esbuild，CI 增加 `tsc --noEmit` 类型检查；取消 `scripts/modules.json` 的全局脚本拼接。当前代码中的 Python（构建、契约检查、`tests/verify.py`、设计系统的 tokens 与组件脚本）改写为 TypeScript；`server/wasm-runner.py` 与 `requirements-sandbox.txt` 随旧 WASM 功能删除（见 ADR 0023）。原因：现在 JS 靠拼接顺序共享全局变量，依赖关系不可见；Python 分散在五类用途中，CI 需要额外安装环境。

## Considered Options

- 服务端改用 Go 以提升性能：未采用。用户能感受到的性能取决于浏览器渲染、SwiftUI 原生渲染和 Mac 安装包体积（122 MB 中 115 MB 是随包 Node）；服务端处理的数据量很小，耗时主要在磁盘、网络和 Supabase。云端运行在 Cloudflare Workers，只原生支持 JS 和 WASM。引入 Go 会增加第四种语言，并使 ADR 0024 退回到多端生成代码。Mac 包体积问题由 ADR 0027 解决。
- 保留 JavaScript，只改 ES 模块：契约类型无法在编辑和 CI 阶段检查。

## Consequences

- 以下情况出现时重新评估 Go：离开 Workers 改为自建服务器，并且出现大量计算，例如对十几万张卡片建立全文索引，或大量助手并发调用。
- 新增依赖只有 `typescript`（开发依赖）。
