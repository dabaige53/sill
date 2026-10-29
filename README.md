# Sill · 窗台

Sill 是由 AI 助手整理内容的个人卡片工作台。用户在 Web、PWA 或 Mac 中阅读内容、查看待办与日程、完成轻操作。产品范围见 [PRODUCT.md](docs/agent/PRODUCT.md)，当前各端支持见[功能矩阵](docs/implementation/feature-matrix.md)，后续方向见[roadmap](docs/plans/roadmap.md)。

## 启动

Node.js 版本按 `package.json` 的 `engines` 要求。Mac 构建另需 Xcode 工具链，见 [Apple 应用说明](apps/apple/README.md)。

```sh
npm ci
npm run build
npm start
```

打开[本地卡片页面](http://127.0.0.1:4318/#feed)。服务只监听本机，数据保存在 `.sill/local/cards.json`。它与 Mac 本地测试数据、云端账号数据分别存储。

开发 Web 界面时，在本地服务运行后另开终端执行 `npm run dev`，访问 http://localhost:5173。Web 使用 React、TypeScript 和 Vite，Mac 使用 SwiftUI；Web 构建输出供本地网页、云端网页和 MCP 宿主使用。

## AI 操作

本地 CLI 的读取、能力查询与批量写入方法见[本地操作](docs/implementation/operations/local-operations.md)。云端工具、权限和限制见[Agent 与 MCP](docs/implementation/agent-mcp.md)。

## 开发与文档

- [Changelog](docs/records/CHANGELOG.md)：版本变化与未发布调整。
- [LICENSE](docs/LICENSE)：Copyright (c) 2026 wuwenyuan，保留所有权利，暂不开放授权。
- [文档目录](docs/README.md)：项目准则、设计规范、实现说明及按需查阅的任务材料。
- [脚本目录](scripts/README.md)与[测试目录](tests/README.md)：构建输入、输出和检查入口。
- [设计系统](design-system/README.md)：手册、变量、组件与画板。
- [发布操作手册](docs/implementation/operations/release-runbook.md)：准备候选、部署与验收步骤。
