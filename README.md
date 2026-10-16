# Sill · 窗台

Sill 是 agent 驱动的个人卡片工作台。卡片展示内容与真实状态，让用户表达阅读、完成等意图；外部动作由 agent 通过宿主已有 MCP 或经核验的开源 MCP 执行，不为每个按钮新增第三方直连接口。

当前本地 Web 和 CLI 共用本地 JSON；macOS 原生应用使用独立本地工作区。云端已有鉴权网页、卡片 API 和内容 MCP。各路径不能混为一谈，见 [功能矩阵](docs/product/feature-matrix.md)。

目标是向已配置外部助手发送 Webhook，再由外部助手调用 Sill MCP 写回结果。不做内置助手；Webhook 端到端执行尚未验收。交接材料不表示新增 API 已实现，不代表已批准实施或部署。旧版本地原型的整卡并发覆盖、虚假连接成功两个 P1 尚未修复；云端冲突保护不能代替它们的验收。

## 启动

需要 Node.js 24+。Mac 构建另需支持 Swift 6 的 Xcode 工具链；不需要 Python。

```sh
npm ci
npm run build
npm start
```

打开 [本地卡片页面](http://127.0.0.1:4318/#feed)。服务只监听本机。数据保存在 `.sill/local/cards.json`，不要将它提交到 Git。Mac 数据和云端账号数据独立，不会自动上传。

## AI 操作

```sh
node scripts/sill.ts list
node scripts/sill.ts get <卡片ID>
node scripts/sill.ts capabilities
node scripts/sill.ts apply --file /tmp/operations.json
```

替换已有卡片前先读取完整内容，保留其他字段，并携带读取到的 `expectedRevision`。没有真实回执时，本地打勾、刷新或来源状态不表示外部完成。完整协议见 [本地操作](docs/guides/local-operations.md)。

## 开发与文档

- [文档目录](docs/README.md)：现行规则、设计决策、历史记录与归档的唯一导航。
- [文件管理规范](docs/guides/file-management.md)与[代码规范](docs/guides/code-standards.md)：目录、命名、迁移和验证要求。
- [脚本目录](scripts/README.md)与[测试目录](tests/README.md)：构建输入、输出和检查命令。
- [设计约束](DESIGN.md)、[设计系统](design-system/README.md)与[Mac 原生应用](apps/apple/README.md)：改界面前先读，组件与平台说明。

`npm test` 检查当前本地实现；`npm run files:check` 检查目录与文档。构建只产生本地文件，不表示安装、发布或线上验收。
