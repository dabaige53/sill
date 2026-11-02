# CI 初始化

日期：2026-11-01；续办：2026-11-02。状态：初始化、触发去重和旧断言修正已通过五类远端检查；浏览器并行已推送验证，缓存接入已完成静态检查，真实验证待完成。

## 范围

- 将工作流内的 Web 验证、浏览器集合、共享卡片专项、Swift 测试、授权策略及版本检查接入 package.json。已有 npm 检查入口继续复用。
- 新增共享 setup action，保留各 Job 的 Node 24/26、npm 安装参数和缓存开关。
- 为五类 PR 检查增加旧运行取消；补齐任务超时。Mac 路径清单加入共享 setup action。
- 运行说明维护在 [CI.md](../../implementation/CI.md)。不配置分支保护或必需检查，不修改测试、生产审批和发布先检查后打包的顺序。

## 基线

源码基线为 `4eebfd1fb38821da1199528a4e869b64e270ddda`。审查时远端 main 为 `bb62c23b4569d820c39c98e37d0cd6960adb00a1`，与当前工作分支不同。

此前本轮审查采集了 2026-10-27 至 2026-10-31 的 100 次 PR 工作流运行，只计首次尝试并排除取消运行。按提交分组后，19 个提交包含五类检查，等待时间 P50 为 340 秒、P95 约 659 秒。样本包含失败提交及历史配置，不作为本次改动的提速结果。

最近成功 PR 的 [Web 检查](https://github.com/dabaige53/sill/actions/runs/41177799167)共 337 秒，浏览器回归占 305 秒。后续优先测量并拆分浏览器编排，再处理 Swift 缓存和重复构建；每批分别验证。

## 静态验证

- workflow_audit.py 已生成前后清单。该工具把 workflow_call 映射为调用事件，不能代替 YAML 的实际事件与条件核对。
- compare.py coverage 在接受五个旧浏览器任务名称到汇总入口的映射后通过，无阻断或警告。脚本分类数从 21 变为 18，不代表实际检查数量减少。
- 对照 Git 基线逐条验证：12 个浏览器命令、顺序、失败状态累积和最终退出完全一致；Web 验证及共享卡片专项命令一致。所有新增 ci:* 命令通过 shell 语法检查。
- 手工核对共享 setup 的安装模式、缓存开关、Node 版本，以及工作流的 Job id、条件、权限和发布依赖。Mac 的工具链信息输出移到依赖安装之后。
- git diff --check 与 npm run files:check 通过。

临时原始数据保存在 `/private/tmp/sill-ci-audit-20261101` 和 `/private/tmp/sill-ci-init-20261101`，未提交原始日志、未新增仓库顶层临时目录。

## 初始化验证与后续优化

用户随后授权继续全部步骤。改动在 `codex/ci-tuning`，对应 [PR #93](https://github.com/dabaige53/sill/pull/93)，基于 `codex/card-content-consistency`；未合并或上线。

旧卡片断言已单独提交修正，依据与结果见[卡片内容一致性记录](../2026-10-31-card-content-consistency/README.md)。提交 `6fbe9ae2` 的五类检查全部成功：[Web](https://github.com/dabaige53/sill/actions/runs/41376777708)、[集成](https://github.com/dabaige53/sill/actions/runs/41376777923)、[数据](https://github.com/dabaige53/sill/actions/runs/41376777723)、[Mac](https://github.com/dabaige53/sill/actions/runs/41376777833)、[授权策略](https://github.com/dabaige53/sill/actions/runs/41376777710)。

触发去重仅保留 main push 与 PR 检查，插件包装不再重复构建 Web。`628845f3` 将原 12 个浏览器入口分成 motion、navigation、layout 三组，使用独立 Runner，保留全部入口和失败状态；2026-11-02 续办时已推送。

缓存接入采用 npm 下载缓存与 Swift 精确输入缓存。普通 PR 只读；指定任务在默认分支或手动运行时保存。Swift 恢复后仍执行完整测试或打包，成功后才保存，并沿用恢复时计算的 key。原任务临时草稿已不存在，本次依据源码补全，不覆盖其他文件。

缓存改动前后 `compare.py coverage` 为 19 → 19，PASS，无阻断或警告。项目明确不配置必需检查，未传入分支保护检查清单。`npm run files:check` 与 `git diff --check` 通过。本次临时审计数据位于 `/private/tmp/sill-ci-20261102`。

## 待验证

浏览器并行及缓存的真实运行、缓存命中和耗时数据待补。主分支缓存需要合并后建立；工作分支手动缓存不代表主分支已具备缓存。未在本地运行完整测试、构建或界面自动化，未安装 actionlint 或本地 Git hook。
