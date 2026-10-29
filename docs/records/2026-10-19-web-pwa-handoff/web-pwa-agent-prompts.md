# Web 与 PWA 接手提示词

更新：2026-10-19。

当前范围、工作方式与状态以[交接入口](web-pwa-ui-handoff.md)为准。本文件保留原交接正文。

## 7. 提示词

下面三段可以直接交给接手的 agent。按需替换方括号里的内容。

### 7.1 界面与 PWA（U1–U6）

```text
你在 Sill 仓库（dabaige53/sill）工作。先完整阅读 docs/guides/web-pwa-ui-handoff.md，再按其中「开工前必读」的顺序读 AGENTS.md、DESIGN.md、design-system/README.md、ADR 0032、0036、0037 和两份 2026-10-18 讨论记录。

任务：完成交接文档中的工作包 [U1]（只做这一个）。
- U1 不需要新的设计决定：直接实现，补测试，截 390、320、1440 宽的改前改后图。
- 如果做的是 U2–U6 中标「需用户确认」的项：先截现状，找 3–6 个公开产品参考，出 2–3 个方案的效果图（真实页面叠临时样式截图），一次讨论一个问题，等我选定后再更新仓库 ADR、手册和组件说明，最后改代码及本地画板。
约束：遵守交接文档第 5 节「不做的事」；不使用任何 claude.ai 独有的工具（线上 Design System、设计画布、claude.ai 连接器、Artifact），设计只改仓库内文件，线上未同步的内容写进 Merge Danger；所有文案进 design-system/copy/zh-Hans.json；不改 Mac、iOS 原生代码。
交付：新分支，运行 npm run files:check、npm test 和相关浏览器测试，按 pr.md 和 PR 模板写 PR（Summary / Evidence / Merge Danger）。待完成的检查不写成通过；真机没测就写「未检查」。
```

### 7.2 代码优化（C1–C6）

```text
你在 Sill 仓库（dabaige53/sill）工作。先完整阅读 docs/guides/web-pwa-ui-handoff.md、AGENTS.md、docs/agent/code-standards.md、docs/agent/file-management.md 和 tests/README.md。

任务：完成交接文档中的工作包 [C1]（只做这一个）。目标是行为不变的代码优化，不改界面设计。
- C1：逐个找出列出的浏览器测试失败的根因并修复。先在基础提交上复现，再修，再证明同一测试通过。不跳过、不禁用、不放宽断言。
- C2–C5：先确认测试覆盖，再小步移动；移动和改写分开提交；每次提交后运行 npm test 和相关浏览器测试；改前改后截图对比，界面不能变化。
- C6：在有 Docker 的环境运行 npm run test:supabase:postgres，并为 hiddenActions 补用例。
约束：不改 window.__app 的公开接口（除非同步改测试并说明）；不引入新语言或新依赖（需要时先写 ADR）；不改 Mac、iOS 原生代码。
交付：新分支，按 pr.md 和 PR 模板写 PR。写清楚哪些失败在基础提交上就存在、哪些是本次修复的；警告数量按实际写，不说「零警告」。
```

### 7.3 验收与真机检查

```text
你在 Sill 仓库（dabaige53/sill）工作，只做验收，不改产品代码。先阅读 docs/guides/web-pwa-ui-handoff.md 第 6 节、apps/web/README.md「添加到 iPhone／iPad 主屏幕」一节、ADR 0036 和 ADR 0037。

任务：对 [PR 编号或分支] 做验收。
1. 运行 npm run files:check、npm test，以及 tests/README.md 中与手机主页、卡片详情相关的浏览器测试；记录通过数和失败项，并在基础提交上复跑失败项，判断是否本次引入。
2. 在本地页面截 390、320、1440 宽的主页、各类卡片详情（邮件、文章、视频、日程、提醒、待办）、长按名称、设置「卡片操作」、深色模式，与 design-system/boards/ 里的 36、37 号画板（MobileHome.dc.html、CardDetail.dc.html）逐项对照。
3. 列出与 ADR 0036、0037 和设计手册不一致的地方，每条写：位置、期望、实际、截图。
4. 真机项目（主屏幕冷启动、安全区、长按、键盘）如果没有设备，写「未检查」。
交付：把结果写成 docs/records/<日期>-<主题>/README.md 加截图，按 pr.md 写 PR；不修改实现代码。
```

### 7.4 goal 模式（交给一个长时间自主运行的 agent）

这段把 U1–U6、C1–C6 和验收串成一个目标。agent 会自己排顺序、开分支和写 PR，只在需要用户做设计决定时停下。

```text
# 目标
把 Sill 的 Web 本地页面和云端 PWA 做到「界面与代码都完整」：完成 docs/guides/web-pwa-ui-handoff.md 中的全部工作包（U1–U6、C1–C6），每个工作包都以一个通过检查、证据齐全的 PR 结束。需要用户做设计决定的地方，准备好选项后停下来问，不替用户决定。

# 仓库与起点
- 仓库：dabaige53/sill。
- 先检查 #45、#46、#47 是否已合并到 main。已合并：从 main 开新分支。未合并：从 claude/web-pwa-ui-handoff 开新分支，PR 的 base 设为它，并在 PR 里写明依赖。
- 每个工作包一个分支、一个 PR，分支名 claude/<工作包编号>-<主题>，例如 claude/u1-pwa-touch。

# 开工前必读（读完再动手，不跳读）
1. docs/guides/web-pwa-ui-handoff.md（全文，这是任务清单和边界）
2. AGENTS.md
3. DESIGN.md 和 design-system/README.md（「手机主页」「预览与叠放」「图标」「底部导航与反馈」「动效」）
4. docs/adr/0032、0035、0036、0037
5. docs/records/2026-10-18-phone-home-x-density/README.md 和 docs/records/2026-10-18-card-detail-capsule/README.md
6. docs/agent/code-standards.md、docs/agent/file-management.md、tests/README.md、pr.md、.github/pull_request_template.md
读完后，用 10 行以内向我复述：已完成什么、你准备的执行顺序、哪些项需要我确认。然后直接开始，不等我回复（除非你发现文档和代码有冲突）。

# 执行顺序
1. C1 修复已知失败的浏览器测试（先有可靠的测试，后面的改动才有保护）
2. U1 PWA 触控与外壳
3. C6 云端迁移验证（没有 Docker 就跳过，并在最终报告写「未执行」）
4. C2 拆分 AppController → C3 模板与文案键 → C4 样式 → C5 类型
5. U4、U5 中不需要确认的核对项
6. 需要我确认的设计项：U2 图标统一、U3 导航胶囊图标、U4.1/U4.5、U5 桌面分栏标签、U6 搜索 / AI / 设置 / 深色

# 设计决定的停点（必须遵守）
凡交接文档标「需用户确认」的项：
1. 截现状（真实页面，390 / 320 / 1440，按需深色）。
2. 找 3–6 个成熟产品的公开参考，每个附可访问的链接；必要时请用户提供截图。我偏好 X 和 Apple 系的质感，不要重新提交接文档第 5 节列出的已否决方案。
3. 在真实页面上叠临时样式截图，做 2–3 个方案的效果图，并排对比，标出推荐和理由。
4. 一次只问一个问题，把图和选项发给我，然后停下等回复。等待期间可以继续做其他不需要确认的工作包，但不要动这一项的代码。
5. 我选定后：写仓库 ADR（编号接最大值）→ 改设计手册和组件说明 → 改代码 → 生成组件包和图标 → 更新本地画板、index.html 与 canvas.json（截图来自实际页面）→ 写讨论记录 docs/records/<日期>-<主题>/ → 在 Merge Danger 列线上未同步文件。

# 代码优化的规则
- 行为和界面都不变。移动和改写分两次提交。
- 改前先确认测试覆盖；没有覆盖就先补测试。
- 每次提交后运行 npm test 和相关浏览器测试；整理样式时截 390、320、1440 的主页、详情、设置，改前改后逐张对比，有差异就撤回或说明。
- 浏览器测试失败时先在基础提交上复跑，判断是不是本次引入。不跳过、不禁用、不放宽断言，不用空提交触发 CI。
- 不改 window.__app 的公开接口；确需改时同步改测试并在 PR 说明。

# 不可违反的约束
- 交接文档第 5 节「不做的事」全部适用。
- 不使用任何 claude.ai 独有的工具：不读取、不发布线上 Design System 和设计画布（claude.ai Artifact），不调用 claude.ai 连接器（包括 Mobbin 连接器），不创建 Artifact。按 AGENTS.md 的仓库内规则：先改仓库里的原则和规范，再改实现；design-system/design-system.json 的线上资产记录不改。每个改了设计的 PR 在 Merge Danger 列出线上未同步的文件。
- 所有用户可见文字放 design-system/copy/zh-Hans.json；文档用 80% ASD-STE100 风格的简体中文。
- 不改 Mac、iOS 原生代码；改到同一功能时在 PR 里写「Mac 未改」。
- 不提交 token、真实账号内容、浏览器存储；单个证据文件不超过 2 MB。
- 环境已预装 Chromium 时用它，不重复下载浏览器。

# 每个 PR 的完成标准
- npm run files:check 和 npm test 通过（写出三组测试的通过数）。
- 相关浏览器测试结果；失败项注明是否在基础提交上同样失败。
- 界面改动有改前、改后截图；真机没测就写「未检查」。
- 按 pr.md 和 PR 模板写 Summary / Evidence / Merge Danger，待完成的检查不写成通过。
- 交接文档中对应工作包的状态和数字（失败测试、警告数、文案键数、图标数）同步更新。
- PR 开出后跟进 CI：红了就修到绿；不是本 PR 引起的失败，在 PR 里写一条说明。

# 汇报
- 每完成一个 PR，用 3–5 行告诉我：做了什么、PR 链接、检查结果、遗留问题。
- 遇到停点，按上面的格式发图和选项，然后停下。
- 全部完成后给一份总报告：每个工作包的 PR 链接与状态、仍需我决定的事项、没有执行的检查（例如真机、Postgres）及原因。

# 结束条件
U1–U6、C1–C6 都有已合并或待审的 PR，或者明确记录了「等用户确认」「环境不具备」的原因；交接文档已更新到最新状态。
```
