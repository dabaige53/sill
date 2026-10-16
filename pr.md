## Summary

完成六批仓库清理：文档归位、共享卡片定义、删除旧宿主与直连、TypeScript ES modules、Apple 原生存储、统一版本与文案。产品版本由根 package.json 注入各候选包；不新增业务 API 或部署。

```text
apps/web/          本地与云端共用 Web 界面
apps/apple/        SillKit、macOS、iOS 入口与 Swift 测试
server/local/      loopback 服务与项目内 JSON
server/cloud/      既有鉴权、API、MCP
contracts/         zod、导出 Schema、三端共享样例、设计材料
design-system/     tokens 与简体中文文案
scripts/、tests/   TypeScript 构建和分端检查
docs/             现行规则、决策、记录与归档
```

## Evidence

- **Before:** 分散卡片定义、顶层来源字段、按顺序拼接的 JS、Python 构建、Mac 随包 Node。**After:** 单一 zod 定义与导出检查、内存来源迁移、ES modules、TypeScript 构建、原生锁与原子文件存储。真实用户数据未读取或改写。
- **Before:** 旧合法来源会在新上限下拒绝打开。**After:** 保留 300 字发件人、11 个合并来源与显式空发件人，TS/Swift 共用 5 组样例；独立复核通过。
- **After:** `npm test` 通过：36 项共享约定、52 项 Web、78 项服务端；`build:cloud`、`build:release`、`plugin:build`、`build:macos` 通过。`test:macos` 的 18 项 Swift 测试与严格验签通过；Mac 包约 3.7 MB，不含 Node。115 项 Web 输出在文案提取前后逐字节一致。
- **After:** 格式化单独提交 `9e4430f`，列入 `.git-blame-ignore-revs`；`npm run lint`、类型、Schema、文件与差异检查通过。Biome 默认规则零错误，保留 1812 条警告，主要是动态界面的显式 `any`；不声称全仓 strict。Swift 设计客户端的 Card 返回类型和 JSON 字段映射已通过编译检查。
- **Not run:** 浏览器/桌面 GUI、iOS 设备或生产验收；本机没有 Docker，未运行容器 Postgres 专项。CI 变更尚未在远程执行。
- **Dependencies:** 固定 TypeScript、Node 类型、Biome、Ajv/ajv-formats 开发工具，用途和许可证见 ADR 0029。Swift 使用官方 OpenAPI generator/runtime 1.9.0（Apache-2.0）：前者从共享定义生成类型，避免手写重复定义；后者提供生成类型需要的运行能力。本机 Swift 6.4 编译和测试通过，版本由锁文件固定。ext-apps 是现行 cloud bridge 依赖，未按旧交接误删。

## Merge Danger

**Door:** two-way。源码可按本地分批提交回退，旧实现可从 `legacy-final` 取回；代码回退不等于恢复后续用户主动保存的数据。没有远程 PR、推送、数据库变更、安装或发布。

**Blast Radius:** 全仓库。文件路径、开发命令、旧来源读写和 Apple 包结构变化；外部工具名、scope、URL 与资源所有权规则保持兼容。两个既有 P1（正常在线整卡并发覆盖、虚假连接成功）仍开放。Apple 与云端不自动同步。
