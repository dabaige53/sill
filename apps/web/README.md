# 浏览器端

更新：2026-10-16。现行运行代码；通用规则见 [代码规范](../../docs/guides/code-standards.md)。

`index.ts` 启动本地界面，`cloud-entry.ts` 启动云端界面。两者共用同一套卡片、状态与交互模块；模块通过 ES imports 连接，不再按文件顺序拼接全局变量。

`npm run build` 用 esbuild 生成 `dist/web/index.html`，`npm start` 提供本地页面。`npm run build:cloud` 生成 `dist/cloud/`。产物不提交到 Git，不手工修改。

卡片类型从 `contracts/` 导入。浏览器根据导出的 JSON Schema 检查写入，复用纯数据转换与业务规则，不打包 zod。未知卡片类型采用通用卡片；未知字段保持不变。

来源设置的本地状态不是外部连接回执。线上整卡覆盖与虚假连接成功两个 P1 不因本次迁移关闭。浏览器视觉及辅助功能验收需单独执行。
