# hiddenActions 云端迁移验证（C6）

日期：2026-10-18。

现有 Postgres 测试只加载基础数据、授权和会话 SQL，没有加载卡片操作隐藏偏好的迁移。本次补齐实际迁移顺序，并通过公开 RPC 验证偏好保存。已提交 [PR #50](https://github.com/dabaige53/sill/pull/50) 审阅。迁移 SQL、产品代码和界面均未修改，Mac 未改。

## 覆盖范围

两种数据库运行同一组断言：本机 PGlite，以及 CI 的隔离 Postgres 17.11 容器。容器不开放宿主端口、不挂载本机数据、不连接云端账号。

1. 加载 rich cards、workspace operations 后，`hiddenActions` 写入被拒绝，工作台不变。
2. 执行 `20261018060000_sill_hidden_card_actions.sql` 后，旧偏好增加默认值 `hiddenActions: []`，已有内容与版本不变。
3. 用 `public.sill_apply_operations` 保存全部 9 个允许值，公开读取返回同样的值；相同请求重放不重复写入。
4. 未列出的动作、错误的字段类型、数字成员、超过 9 项的数组均被拒绝。每次先加入阅读时间写入，再加入非法偏好；失败后阅读时间、偏好、版本和回执均不改变。
5. 保存空数组后恢复全部动作显示，其他偏好保留。

测试夹具同步加载该迁移，让云端 HTTP 与浏览器回归使用当前偏好默认值。回归代码见 `tests/server/helpers/hidden-actions-migration.ts`；PGlite 入口为 `cloud-workspace.test.ts`，Postgres 入口为 `supabase-postgres.ts`。

## 检查结果

| 检查 | 结果 | 限制 |
| --- | --- | --- |
| `npm test` | 通过：共享约定 36、Web 169、服务端 92；失败和跳过均为 0 | 合成数据 |
| `node --test tests/server/cloud-workspace.test.ts` | 4/4 通过 | PGlite，不代替实际 Postgres |
| `npm run test:cloud-operations` | 1/1 通过 | 预装 Chromium；桌面及手机模拟 |
| `npm run files:check` | 通过 | 文件归属与引用检查 |
| 本机 `npm run test:supabase:postgres` | 未执行 | 本机没有 Docker |
| CI `npm run test:supabase:postgres` | 11/11 通过（含主测试及 10 个子用例）；失败与跳过均为 0 | 固定 Postgres 17.11 镜像 |
| 真机、生产数据库与迁移部署 | 未执行 | 本次仅验证隔离数据库 |

实际 Postgres 证据：[CI run 39117720532](https://github.com/dabaige53/sill/actions/runs/39117720532/job/117646795896)，源码提交 `609744f`；`hiddenActions` 子用例通过，日志记录引擎为 PostgreSQL 17.11。此提交的 7 个 CI 检查全绿；追加证据文档后的最新 CI 以 PR 为准。

审阅后的命令摘要见 [verification.txt](verification.txt)。界面没有改动，因此没有新增前后截图。Web lint、文案键和图标沿用 U1：0 错误、902 警告；826 个文案键（601 个哈希键，其中 panels 110 个），69 个图标。

## 部署与依赖

部署顺序仍是先迁移、后发布网页。本次没有部署，也不表示线上数据库已具备该字段。

分支包含 C1、U1 的已验证依赖；PR base 仍为 `claude/web-pwa-ui-handoff`。#45–#47 尚未合并。U1 的线上组件 CSS 与 37 号画板截图同步仍待完成，详见 [U1 记录](../2026-10-18-pwa-touch/README.md)。
