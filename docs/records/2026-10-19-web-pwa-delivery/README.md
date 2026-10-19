# Web/PWA 交付与发布检查

2026-10-19。Web/PWA 1.2.6 已于北京时间 11:17 发布。用户要求结束尚未调整的页面，检查通过后发布线上。保留 AI、设置整体、深色和阅读顶部现状；已确认的搜索分行继续完成。见 ADR 0045。只发布 Web/PWA；Mac/iOS 原生未改，线上 Design System 与画布不操作。

## 工作包

每个包保留原分支和 PR，当前均为待审。U5 最终提交 b6e8879 的 7 项 CI 全绿；其余先前完成的包已绿。U6 发布来源 4237cb6 的 7 项 CI 全绿，版本已发布；迁移编号及验收证据补录提交的最终检查以 PR 为准。#45/#46/#47 仍未合并，包 PR 的 base 保持 claude/web-pwa-ui-handoff；本轮不合并 PR。

| 包 | PR | 结果 |
| --- | --- | --- |
| U1 | [#49](https://github.com/dabaige53/sill/pull/49) | 触控、键盘名称、提示边界与深色外壳；原安装资产保留 |
| U2 | [#57](https://github.com/dabaige53/sill/pull/57) | 用户选择保留全部 69 个原图标 |
| U3 | [#58](https://github.com/dabaige53/sill/pull/58) | 用户选择保留现状镜片 |
| U4 | [#55](https://github.com/dabaige53/sill/pull/55) | 加入时优先忽略提醒、照片通用胶囊、名称下方类型示例 |
| U5 | [#56](https://github.com/dabaige53/sill/pull/56) | 左上紧凑分栏与跨屏核对，手机四组零像素差异 |
| U6 | [#59](https://github.com/dabaige53/sill/pull/59) | 搜索按条件分行；其余未调整页面按用户结束指令保留 |
| C1 | [#48](https://github.com/dabaige53/sill/pull/48) | 浏览器回归和云端首次保存状态初始化 |
| C2 | [#51](https://github.com/dabaige53/sill/pull/51) | 拆分 AppController，公开接口不变 |
| C3 | [#52](https://github.com/dabaige53/sill/pull/52) | 拆分预览和 110 个语义文案键 |
| C4 | [#53](https://github.com/dabaige53/sill/pull/53) | 样式移动、变量和优先级整理 |
| C5 | [#54](https://github.com/dabaige53/sill/pull/54) | Web 三模块显式 any 清零 |
| C6 | [#50](https://github.com/dabaige53/sill/pull/50) | 真实 Postgres CI 11/11；本机无 Docker 未执行 |

## 检查与限制

搜索实现 3df9cd6：npm test 三组 36 / 198 / 92，失败 0，含 files:check；分行浏览器 7/7、原搜索 2/2、无障碍 13/13。Web lint 0 错误、514 警告、30 提示；文案 834 键（哈希 491、panels 哈希 0）、图标 69。详见搜索记录；最终交付提交按 PR Evidence 另记。

没有未决定的 UI 项：AI 去除关闭按钮候选未实施，其余未调整页面按用户指令保留，不把现状说成重做。真机、Safari、Mac 原生视觉未检查，缺少设备/实际环境；本机没有 Docker，Postgres 本机未执行，C6 使用真实 PostgreSQL 17.11 CI 验证。没有新增外部来源、助手或迁移逻辑。发布核对发现线上缺少 C6 已验证的偏好兼容迁移，因此先应用两项函数更新再发布，不改卡片数据。

线上未同步文件逐项以各 PR Merge Danger 为准。此处收集路径清单，文件名以当前仓库实际文件为准。设计手册、ADR、组件规范和本地画板只在仓库维护；发布 Web/PWA 不等于同步这些设计资产。

完整路径见 [线上 Design System 未同步清单](online-unsynced.txt)，共 97 个仓库文件。此清单不表示它们均属于线上可上传格式；发布 Web/PWA 只更新应用代码，不处理设计文档和画布同步。

本轮准备发布产品 1.2.6，区分旧线上资源缓存。仅根 package.json 和 lockfile 的产品版本改变，Mac/iOS 未构建或发布。生产发布前已记录当前 Worker 版本并保留回退路径；全部 CI 和兼容迁移验证通过后切换流量。

## 发布结果

- [线上 Web/PWA](https://sill-web-preview.scs1213-temp-email.workers.dev/)，产品 1.2.6；来源 `4237cb6554c725b11395589192b28d1e6c85cb08`，发布来源 [七项 CI 全绿](release-source-ci.json)。12 个包保留待审 PR，未合并到 main。
- Worker version `944b6b86-4343-442f-9baf-6b5ee73f23aa`，deployment `a738285c-aa95-4ada-a150-8a36511056b7`，回读确认 100% 流量。七项原绑定逐项一致，认证、路由和权限配置未改；[发布元数据](release.json) 记录哈希与旧版本。
- [线上页面逐字节等于本地产物](html-check.json)，SHA-256 `77e33fc0cd48c93c0276898224eb87e50de31044b16472d7682eb950ab682702`。Worker SHA-256 `1be05f04e8c7835aa08525e8a7db9be171deb91b59ce6e26a4dcf672d8f0cab3`。
- [只读冒烟检查](production-smoke.json)：页面、health、授权发现、manifest 和图标成功；未登录 workspace 和 MCP 为 401。没有读取或写入账号内容。
- [线上浏览器六组](production-browser.json)：320/390/1440、浅色与深色登录页通过，无页面异常、外部请求或横向溢出，未登录且卡片为 0。截图在本目录 online-*.jpg；这些不代替真实账号、真机或 Safari 验收。

## 既有兼容迁移

现网原来不支持 hiddenActions。按 C6 部署顺序应用既有 SQL，平台实际迁移为 `20261019031622_sill_hidden_card_actions`。仓库将原 `20261018060000_sill_hidden_card_actions.sql` 仅重命名到实际编号，更新执行引用；SQL 逐字节不变，SHA-256 `9818a65037483f546f11672f8462379c7eb400d62852d60babc427c180dc758e`。历史记录保留原时点文件名。[更新引用后的工作区与迁移测试 4/4](migration-reference-check.log) 通过。

[线上 PostgreSQL 17.11 检查](database-checks.json)：默认空数组、九个合法动作、四组非法值拒绝、旧偏好接受均通过。两个函数仍是 security invoker、空 search_path，anon 无 private schema 使用权。只执行函数和合成参数，没有读取、重写或删除卡片、账号或偏好行。

安全检查没有新增问题。迁移前后均有一项既有提示：[泄露密码保护未启用](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)，见 [前后检查](security-advisors.json)。本轮保持认证配置，不把此项写为已修复。

回退应用可使用旧 Worker version `9691932c-4aef-4cff-a281-7dfb80f93c70`；执行前先核对是否已有后续发布。保留兼容迁移，避免撤掉新偏好校验；旧页面仍能使用原偏好。线上 Design System 未同步，未发布插件或 Mac/iOS。
