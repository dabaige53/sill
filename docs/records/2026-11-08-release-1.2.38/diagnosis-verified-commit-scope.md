# 发布核对变量设到仓库级不生效

## 问题与状态

状态：已验证。最近检查：2026-11-08。

## 环境与触发

- 入口：`release.yml` 的 publish 任务，运行在 `production` environment，执行 `scripts/deploy-release.ts`。
- 触发：只更新仓库级 `SILL_DATABASE_VERIFIED_COMMIT`，再运行发布流程。
- 预期：部署。实际：`Database migration and stored-card compatibility have not been verified for this commit`。

## 定位依据

- 已证实：`production` 环境有同名变量，优先于仓库级变量。1.2.38 第 2 轮日志中的值是环境里的 `15ec991c…`，仓库级当时已是 `1edf92dd…`。
- 观察：1.2.37 的流程 `42374642239` 报同样的错，日志中的值也是 `15ec991c…`。

## 处理情况

- 用户把环境级变量设为 `1edf92dd…`，然后只重跑 publish。
- 发布手册写明该变量在 `production` 环境。
- 本次误改的仓库级变量原值为 `d7e33b6f14d7210d3e0d4e8637164b10f6f4ea2f`，发布时不生效。

## 验证与后续

第 3 轮部署成功，回执 `verified`。失败的两轮都停在部署前，线上未受影响。
