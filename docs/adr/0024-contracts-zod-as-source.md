# contracts 中的 zod 定义是契约唯一来源


## Considered Options

- 以 JSON Schema 为来源，各端用工具生成代码：需要维护多套生成工具，每次修改都要重新生成并提交。
- 各端手写模型，用契约测试兜底：每端各维护一份模型，一致性只靠测试发现。
- zod 定义留在服务端：Web 端改用 TypeScript 后也需要卡片类型，按依赖方向不能引用 `server/`。

## Consequences

- 服务端现有三处卡片 zod 定义：本地服务 `server/local-state.mjs`、云端 `server/cloud/schemas.mjs`、旧入口使用的 `server/schemas.mjs`。前两处合并后移入 `contracts/`，并改用 `zod/v4` 引用（同一依赖包 3.25.76，已验证可以导出 JSON Schema）；旧定义随旧代码删除（见 ADR 0023）。
- `refine()` 等自定义规则无法导出为 JSON Schema。Apple 端在本地直接写入数据，不经过服务端（见 ADR 0027），所以这些规则不能只放在服务端：`contracts/` 同时提供合法样例和非法样例，每一端的契约测试都必须接受全部合法样例、拒绝全部非法样例。
- `contracts/` 中的每个契约标明「已实现」或「设计中」。现有 `contracts/design/openapi.json` 属于设计中，迁移时把 `Content` 改名为 `Card`。
- 2026-10-16 修订：来源位置由「服务端 zod」改为「`contracts/` 中的 zod」，原因是 ADR 0026 确定 Web 端使用 TypeScript。
