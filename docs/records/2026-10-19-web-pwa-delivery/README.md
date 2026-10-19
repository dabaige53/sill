# Web/PWA 交付与发布检查

2026-10-19。用户要求结束尚未调整的页面，检查通过后发布线上。保留 AI、设置整体、深色和阅读顶部现状；已确认的搜索分行继续完成。见 ADR 0045。只发布 Web/PWA；Mac/iOS 原生未改，线上 Design System 与画布不操作。

## 工作包

每个包保留原分支和 PR，当前均为待审。U5 最终提交 b6e8879 的 7 项 CI 全绿；其余先前完成的包已绿。U6 最新交付提交的检查与发布结果以 PR 和后续发布记录为准，不把待完成项记为通过。#45/#46/#47 仍未合并，包 PR 的 base 保持 claude/web-pwa-ui-handoff；本轮不合并 PR。

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

没有未决定的 UI 项：AI 去除关闭按钮候选未实施，其余未调整页面按用户指令保留，不把现状说成重做。真机、Safari、Mac 原生视觉未检查，缺少设备/实际环境；本机没有 Docker，Postgres 本机未执行，C6 使用真实 PostgreSQL 17.11 CI 验证。没有新增外部来源、助手或数据库迁移。

线上未同步文件逐项以各 PR Merge Danger 为准。此处收集路径清单，文件名以当前仓库实际文件为准。设计手册、ADR、组件规范和本地画板只在仓库维护；发布 Web/PWA 不等于同步这些设计资产。

完整路径见 [线上 Design System 未同步清单](online-unsynced.txt)，共 96 个仓库文件。此清单不表示它们均属于线上可上传格式；发布 Web/PWA 只更新应用代码，不处理设计文档和画布同步。

本轮准备发布产品 1.2.6，区分旧线上资源缓存。仅根 package.json 和 lockfile 的产品版本改变，Mac/iOS 未构建或发布。生产发布前记录当前 Worker 版本并保留回退路径，检查通过后才切换流量。
