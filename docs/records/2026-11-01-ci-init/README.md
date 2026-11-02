# CI 初始化

日期：2026-11-01；续办：2026-11-02。状态：全部配置阶段均已通过五类远端检查；Swift debug/release 与 Mac npm 缓存保存、精确命中、后台测试和 DMG 验证均通过。实现与工作分支验证完成，主分支缓存及长期统计待合并后验证。

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

重新从原始基线 `4eebfd1f` 生成审计清单，与缓存阶段比较为 21 → 19，接受五个旧 npm 浏览器入口到新执行脚本的映射后 PASS。展开原 npm 别名后，12 个实际脚本与新分组集合完全一致；未放宽失败退出条件。

## 并行实测

`628845f3` 的五类检查全部成功：[Web](https://github.com/dabaige53/sill/actions/runs/41379728232)、[集成](https://github.com/dabaige53/sill/actions/runs/41379728219)、[数据](https://github.com/dabaige53/sill/actions/runs/41379728347)、[Mac](https://github.com/dabaige53/sill/actions/runs/41379728216)、[授权策略](https://github.com/dabaige53/sill/actions/runs/41379728215)。

从 Web 运行下载的三组 JSON/JUnit 共包含 12 个成功入口，没有重复或遗漏。入口内部断言数量不由该报告统计。

| 组 | 入口数量 | 浏览器执行合计 | Job 总耗时 |
| --- | --- | --- | --- |
| motion | 2 | 112.4 秒 | 150 秒 |
| navigation | 4 | 91.5 秒 | 124 秒 |
| layout | 6 | 114.9 秒 | 175 秒 |

串行成功基线 `6fbe9ae2` 的 Web 工作流等待 398 秒，并行阶段为 179 秒；包含五类检查的提交级等待从 398 秒降至 287 秒，最后完成的检查从 Web 变为 Mac。两侧各一个成功首次 PR 样本，只说明本次趋势，不作为稳定 P50/P95 结论。初始化期间包含失败及不完整检查集的混合样本不用于证明提速。

## 缓存验证

`6e536074` 接入 npm 与 Swift 缓存。缓存元数据采集显示旧缓存总量约 10.32 GiB，其中 PR 缓存约 1.60 GiB；未删除已有缓存或调整仓库额度。新配置停止普通 PR 写入，旧条目仍受 GitHub 淘汰策略管理。

恢复与保存的 key 传递按 [actions/cache 官方策略](https://github.com/actions/cache/blob/main/caching-strategies.md)核对，并检查了项目所用 [v4 restore 元数据](https://github.com/actions/cache/blob/v4/restore/action.yml)。不为本次缓存改动同时升级所有 Action 主版本。

缓存阶段五类首次 PR 检查全部成功：[Web](https://github.com/dabaige53/sill/actions/runs/41380244807)、[集成](https://github.com/dabaige53/sill/actions/runs/41380244818)、[数据](https://github.com/dabaige53/sill/actions/runs/41380244833)、[Mac](https://github.com/dabaige53/sill/actions/runs/41380244873)、[授权策略](https://github.com/dabaige53/sill/actions/runs/41380244856)。Web 报告再次确认 12 个唯一成功入口。提交级等待 213 秒，其中 Web 161 秒、Mac 213 秒；这是冷缓存首次 PR，不能把时间变化全部归因于缓存。

同一提交在工作分支手动运行，检查冷缓存保存与热缓存恢复：

| 范围 | 冷运行 | 热运行 | Job 耗时：冷 → 热 | 结果 |
| --- | --- | --- | --- | --- |
| Swift debug、Node 24 npm | [41380252325](https://github.com/dabaige53/sill/actions/runs/41380252325) | [41380832059](https://github.com/dabaige53/sill/actions/runs/41380832059) | 352 → 177 秒 | 两次成功；npm 与 Swift 精确命中，后台测试照常执行 |
| Swift release、Node 26 npm | [41380256266](https://github.com/dabaige53/sill/actions/runs/41380256266) | [41380964087](https://github.com/dabaige53/sill/actions/runs/41380964087) | 463 → 231 秒 | 两次成功；npm 与 Swift 精确命中，DMG 构建及验证照常执行 |

debug 缓存约 728 MB，恢复 Action 用时 13 秒；release 缓存约 601 MB。Node 24/26 npm 下载缓存各约 127 MB。元数据确认新缓存只有工作分支条目，没有新增 PR 条目，也没有主分支条目。每对运行属于不同冷热条件，各一个样本，不证明长期稳定收益。

## 待验证

主分支新缓存与 Linux npm 精确命中需要合并后建立和验证；工作分支手动缓存不代表主分支已具备缓存。尚无足够同类成功样本报告稳定 P50/P95 或长期缓存容量变化。遵循项目检查通过后停止的规则，不为凑样本重复运行完整回归。

未在本地运行完整测试、构建或界面自动化，未安装 actionlint 或本地 Git hook。未合并、修改分支保护、删除缓存或部署产品。Actions 仍提示现有 v4 Action 的 Node 20 运行时弃用；本轮没有改变这些 Action 的主版本。

## 文档分流续办（2026-11-02）

用户补充要求：纯文档改动不执行完整 CI。此前只有 Mac 的路径过滤，没有统一的文档分流；先前“实施已完成”的范围未包含此项。

新增 `ci.yml` 作为 PR/main 唯一自动入口，先执行无 npm 安装的分流自检与文件检查，再复用原五类检查。发布仍直接调用完整检查。产品技能正文不按普通文档跳过；混合 PR 看整个 PR 差异，未知文件或无法读取差异时不跳过。

静态覆盖比较 19 → 19，PASS，无阻断或警告。新测试使用临时 Git 仓库，检查文档提交、含代码的多提交范围、PR 共同祖先、源码移入文档、未知文件与全量入口。真实代码分支运行和纯文档分流运行待推送验证。
