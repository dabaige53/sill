# 服务端

更新：2026-10-16。现行运行代码，通用规则见 [代码规范](../docs/guides/code-standards.md)。

- `local/index.ts`：只绑定 loopback 的 HTTP 服务；数据在项目 `.sill/local/`，不读取 Mac 应用数据。
- `local/repository.ts`：版本检查、批量操作和原子替换。
- `cloud/worker.ts`：云端入口；沿用用户 JWT、scope、工具和资源所有权限制。
- 卡片与操作定义统一位于 `contracts/`；本地与云端互不引用客户端或彼此实现。

本地启动：`npm run build && npm start`。云端构建：`npm run build:cloud`。构建不读取秘密、不部署。秘密由宿主或部署环境提供，不能进入卡片和前端包。

未知字段保留；读取旧来源仅转换内存副本。真实用户数据迁移不属于构建步骤。
