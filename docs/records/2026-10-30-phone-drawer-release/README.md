# 手机抽屉绘制修复与 1.2.19 发布

日期：2026-10-30。状态：已合并并发布，健康与匿名访问检查通过；iPhone 动画和原宿主页面未作生产界面验收。

## 范围

- 用户明确要求合并修复并发布新版本，产品版本由 1.2.18 升至 1.2.19。
- 沿用现有云端 Web/PWA、MCP 页面和 Worker 身份；Tag 发布流程同时生成 Mac arm64 内部测试包，不安装到本机，不更新插件技能包，不执行数据库迁移。
- 修改手机抽屉的背景绘制边界、退出圆角和正文绘制层；保留布局、内容、滚动位置、节点、动效时长与手势阈值。诊断与处理见[抽屉逐帧记录](../2026-10-29-card-state-flash-release/diagnosis-phone-drawer.md)。
- 工作区已有 `.agents/skills/` 删除和 `.gitignore` 修改不属于本次发布，不提交或覆盖。

## 候选检查

- 源码修复 `706081ee`、测试适配 `c421f56c` 已推送至 `codex/fix-phone-drawer-paint`。
- 修复分支的[集成检查](https://github.com/dabaige53/sill/actions/runs/41010190863)、[云端数据与浏览器检查](https://github.com/dabaige53/sill/actions/runs/41010190806)、[授权检查](https://github.com/dabaige53/sill/actions/runs/41010190727)通过。最终合并及 Tag 的检查另行记录，不用旧运行替代新版本证据。
- 本地只做文件、差异和格式等轻量检查；程序测试、Web 与 Mac 构建由 GitHub Actions 执行，不使用本地重建产物。
- iPhone/PWA 尚未逐帧复录验收；自动检查不表示原录屏中的所有白帧已在设备上消除。

## 数据兼容与回退基准

- 发布前重新读取线上部署，仍为 `v1.2.18`，源码 `9b541537085150a5789e298d3e57bf5e5ba15e6c`。
- 现有部署 `b9afecaa-f751-4fa1-88aa-cc0b0db04eeb`，Worker 版本 `e0b631e0-b100-4a17-867a-df32fd504298`，流量 100%。发布后以前者为回退基准，回退前再核对当前部署。
- 与线上源码相比，`server/`、`contracts/` 和 `supabase/` 无改动，数据结构、解析与保存逻辑不变，沿用既有存量卡片兼容性。通过现有 Supabase 连接重新读取迁移清单，共 18 项，末项为 `20261029130036 workspace_conditional_read`，与上一版本一致；未读取个人卡片正文或执行写入。
- 数据库检查回执变量已设置并重新读取为正式发布提交 `9494b6e545c720c64708ac6d14e0125e5b1f7869`。

## 发布结果

- [PR #82](https://github.com/dabaige53/sill/pull/82) 已于 2026-10-30 15:08:07（北京时间）合并，正式源码为 `9494b6e545c720c64708ac6d14e0125e5b1f7869`，标签 `v1.2.19`。修正后 PR 的 Web 检查 `41017357343`、主分支 Web 检查 `41018219970` 及其他主分支检查全部通过。
- [正式发布运行 41018716804](https://github.com/dabaige53/sill/actions/runs/41018716804)九项工作全部成功：版本、集成、Swift、授权、云端数据、Web 浏览器、云端打包、Mac 打包、发布。使用同次云端产物部署，没有本地重建。
- [GitHub Release v1.2.19](https://github.com/dabaige53/sill/releases/tag/v1.2.19)于 2026-10-30 15:27:24（北京时间）创建，包含 `app.html`、`worker.mjs`、`deployment.json` 和 Mac arm64 内部测试 DMG。沿用内部包的 prerelease 标记；未更新插件技能包。
- Cloudflare Worker `sill-web-preview` 的部署为 `35c37146-d95a-48be-9514-b41c269248e8`，版本 `277348ba-c7e0-4b24-bfb1-3495a3327cab`，流量 100%。通过现有平台连接独立重新读取，完整版本注解匹配标签与源码；发布附件的部署回执状态为 `verified`。
- 发布后独立请求：`/api/v1/health` 返回 HTTP 200、`status=ready`；匿名 `/auth/session` 返回 HTTP 401；PWA manifest 返回 HTTP 200、`application/manifest+json`。
- Mac 回执确认版本、arm64 架构和源码一致，磁盘映像、应用签名、Applications 链接和 Finder 布局检查通过。使用临时签名，未经公证；未安装到本机、未验收真实窗口。
- iPhone/PWA 动画尚未同版本逐帧复录，生产原宿主页面未另行进行界面验收。源码修复、自动检查、实际部署与设备体验分别记录，不将本次发布称为白帧问题已获真机验收。

## 合并前浏览器回归

- [PR #82](https://github.com/dabaige53/sill/pull/82) 首轮[Web 检查 41015411025](https://github.com/dabaige53/sill/actions/runs/41015411025)中，新增的滚动背景视口、卡片位置和关闭后恢复场景通过；取消、正文与把手下拉、滚轮阅读场景也通过。
- PWA 场景在打开约 100ms 后关闭，用宿主侧 1000ms 超时等待原生 dialog 关闭，发生超时；工作流的失败截图已显示主页，没有仍打开的详情，未证明产品持续卡住。测试原先用固定等待猜测入场阶段，对 CI 调度敏感。
- `drawer-browser-detail-gestures.ts` 改为在页面首个绘制帧读取真实入场动画，确认仍在运行、尚未结束、没有放大按钮，并在同一帧关闭；退出使用已有的 dialog 隐藏条件。保留中途关闭与最终关闭断言，不增加产品延时或修改产品代码。名义关闭时序继续由合成时钟测试验证，浏览器不再要求两个进程的墙钟时间一致。
- 修正测试后，PR、主分支和正式标签的全部必需检查通过，记录见发布结果。
