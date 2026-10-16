# TypeScript 构建与检查配置

2026-10-16，已确认并实施。依据 ADR 0023、0026 与本次全量清理授权。

根 `tsconfig.json` 管理 Web、服务端、脚本和测试的类型检查。迁移后的动态界面保留显式动态类型，未声称已开启全仓 strict。接口与卡片类型由 zod 推导，浏览器只导入类型和不含 zod 的纯规则。

根 `index.html` 改为不提交的 `dist/web/index.html`，与云端产物分开。原因：它是构建产物，不再需要在每次源码变更后重复提交。旧文件可从 `legacy-final` 取回。`npm run build`、本地服务、测试与 CI 使用新路径。

Python 构建和检查改为 TypeScript；设计 tokens 的配置源文件为 `design-system/tokens.json`，不再在生成脚本复制一份数值。Swift 生成文件与缓存不提交。已发布快照和 SQL 迁移保留原样。

依赖确切版本见 package-lock.json。新增 TypeScript（Apache-2.0）与 Node 类型（MIT）用于静态检查；Ajv 与 ajv-formats（MIT）代替 Python JSON Schema 检查；Biome（MIT/Apache-2.0）用于统一格式。均为开发依赖，不增加第三方直连能力。
