# 内容密度、动效材质与 Agent 交接审查

日期：2026-10-17。范围：Web 本地页面与云端 MCP App。最终 PR 基于 #29 的 `6bb4f0938e2227fc80f55ac90254e791036c1e2f`。截图与改前测试使用 `a6f3a0193579b2cee9021fddedf275ab3b90c5cc`；两者仅有七份文档变更，产品源码相同。工作期间从早期 `7489f6e` 跟进到包含导航胶囊与配套文档的最新提交，保留 ADR 0035 的居中四格导航、手机页面切换、添加入口及内置 AI 说明页。本记录不是发布或真实外部执行证明。

## 判断与问题

Sill 的卡片与控制层已经有清楚的分工。这轮重点是让卡片内容可信、下一步可见，以及让动画和助手交接在失败或中断后仍可继续。

| 方面 | 改前的具体问题 | 影响 | 本轮处理 |
| --- | --- | --- | --- |
| 内容保真 | 所有 digest 都用工作区最近七天的阅读/收藏/完成统计替换原摘要，详情也走统计特例 | 统计本身来自本地数据，但与卡片标题和助手写入的结论、范围不一定相符 | 展示原 `summary / points`，缺少两者时用首段正文作预览；详情保留全文，删除状态更新时的全局摘要重绘 |
| 信息密度 | 列数按最小宽度塞满；前三个任务即使已经完成也占满预览 | 中等桌面卡片偏窄，接下来要做的事可能被折叠 | 按理想宽度选列，最多五列；未完成优先，数量仍按完整任务计算 |
| 阅读完整性 | 要点和任务的单行截断作用于详情 | 打开后仍看不全长中文或连续英文 | 截断只作用于卡面；详情允许换行 |
| 键盘连续性 | 自动收起的工具条用 `visibility:hidden`，单靠 focusin 不能让真实 Tab 到达；任务重排和分页重绘可能移动或丢失正在操作的控制 | 控件存在但键盘找不到，或下一次空格激活了另一动作 | Tab 捕获阶段先唤回；卡内保留正在操作的任务顺序，离开后再排序；加载下一批卡片后按同一卡片与动作恢复焦点，不滚回原位置 |
| 动效中断 | 多处没有 touchcancel 清理；抽屉开场、关闭及导航延时回调缺少完整取消 | 残留位移、遮罩或操作条；旧回调影响新面板 | 分别清理手势、rAF、timer；过时操作用面板或导航状态挡住；取消不提交完成或刷新 |
| 材质可读性 | 减少透明度只覆盖部分 `.glass`；菜单自有滤镜和遮罩仍可能模糊，增强对比缺少一致边界 | 同一偏好在不同表面表现不同 | 系统/应用/无模糊支持使用一致实色回退；当前导航镜片仍有可辨认状态 |
| 末尾动作 | 底部渐隐与留白不检查实际工具条 | 无工具条的组件变体仍预留遮罩，后续末尾动作容易被遮 | 将渐隐与空间限定为实际有操作条的预览，单独验证无工具条组件变体 |
| Agent 使用 | 内容编辑交给助手，但详情缺少明确交接；宿主里仍直接开浏览器窗口 | 用户需自己搬运上下文；外链不确定时可能错误反馈 | 协商后使用 SDK 消息与导航；独立页复制引用；复制失败提供可选文本 |
| 失败后继续 | 照片翻页会替换弹层内容，连同其中唯一的错误提示节点一起移除 | 后续复制或导航失败会失去反馈，无法继续恢复 | 翻页保留同一个提示节点；真实验证失败、翻页、再次失败仍可选择当前卡片引用 |
| 保存恢复 | `invalid_request`、`cursor_expired` 未映射，可能被当成 503 | 明确拒绝被误判为未知写入，草稿继续编辑受阻 | 分别映射 400、410；真正未知的写入仍保留原请求与幂等条件 |

## 设计取舍

内容卡保持实色，玻璃用于导航与轻操作。Apple 对 Liquid Glass 的说明强调它处于内容之上的功能层，按使用场景选择材质并响应可访问性设置；并不要求给所有内容加大模糊。这里是受其启发的 Web 实现，没有使用或复刻原生 Liquid Glass 的折射与系统合成能力。

| 密度 | 最小 / 理想 / 最大列宽 | 摘要预览 |
| --- | --- | --- |
| 紧凑 | 240 / 280 / 320 px | 2 行 |
| 标准 | 280 / 340 / 380 px | 3 行 |
| 宽松 | 340 / 400 / 440 px | 3 行 |

单列占满手机可用宽度。五列上限、具体列宽与 70ms 减少动态过渡是本项目的设计决定，不是 Apple 的硬性数值要求。已读继续使用卡片颜色与既有可访问名称，遵守 ADR 0030。

Agent 交接只传当前卡片的有限引用。云端先按当前账号重读单卡，消息中不含整个工作区、正文或凭据；结果未知不自动重发。已发送只说明宿主接收，卡片修改仍由助手经 MCP 按用户要求完成。AI 导航格继续保留“内置助手尚未开放”的原有方向；本轮不引入内置模型、Webhook 或执行器。

## 前后证据

截图来自相同的九张合成卡片、固定时间 `2026-10-17T09:00:00Z`，没有生产账号或私人卡片。改前来自上述基线独立工作区；改后来自本 PR。本地 Chromium 153，桌面 1320×900，手机 390×844。

| 场景 | Before | After |
| --- | --- | --- |
| 桌面浅色 | [before-desktop-light.png](before-desktop-light.png) | [after-desktop-light.png](after-desktop-light.png) |
| 桌面深色 | [before-desktop-dark.png](before-desktop-dark.png) | [after-desktop-dark.png](after-desktop-dark.png) |
| 手机信息流 | [before-phone-feed.png](before-phone-feed.png) | [after-phone-feed.png](after-phone-feed.png) |
| 手机摘要详情 | [before-phone-detail.png](before-phone-detail.png) | [after-phone-detail.png](after-phone-detail.png) |

改前实测：1320px 视口的 1240px 内容区排四列；任务前三项全部为已完成项，两个未完成项被藏在“另有 2 项”之后；摘要被替换为工作区统计。改后对应检查验证三列、未完成项优先与摘要原文。比较脚本只采集改前观测，不将新回归断言在基线上的缺失写成“通过”。

补充证据：[手机长摘要末尾动作](after-phone-detail-end.png)、[桌面手动复制引用](agent-reference-desktop.png)、[手机手动复制引用](agent-reference-mobile.png)、[照片翻页后的失败恢复](agent-photo-recovery.png)。长摘要在 320px 和 390px 滚动到末尾后，交接按钮位于浮动工具条上方且可实际命中。引用与提示都可关闭，原卡片保留。

## 验证

环境为 Node 24.19.0 / Chromium 153.0.8010.0，所有浏览器数据均为隔离合成数据。运行结果汇总见 [verification.json](verification.json)。

| 命令 | 结果与覆盖 |
| --- | --- |
| `npm run lint:web` | 通过；零错误，仍有仓库 lint 警告，不代表无警告 |
| `npm test` | 236 项通过：36 contracts、110 web、90 server；包含文件规则、生成物、构建与类型检查 |
| `node scripts/verify.ts` | 通过；生成页面一致性与 19 项重复核心检查，不计入额外独立用例 |
| `npm run test:browser` | 21/21 通过；选择条几何在同一帧、动画完成后测量，避免把移动过程当成静态布局错误 |
| `npm run test:material-density` | 6/6 通过；桌面三列、紧凑模式五列上限、320/390px 完整详情与末尾动作、连续键盘任务、42 张卡片的真实滚动分页 |
| `npm run test:motion-material` | 12/12 通过；真实 Tab、减少透明度/动态效果、增强对比、无 blur 分支、触摸取消、过时关闭回调、引用滚动和照片详情 |
| `npm run test:accessibility` | 13/13 通过；320/390/768/1440px、明暗主题、四种页面状态共 32 次 axe 扫描零违规；另含键盘添加、离线与冲突恢复、短窗口保存 |
| `npm run test:local-browser` | 通过；本地页面与 agent 操作共用持久化状态 |
| `npm run build:cloud` + `npm run test:cloud-app-browser` | 通过；严格 iframe 宿主、1280/390px、消息与外链能力、未知回执不重发、复制失败恢复，以及照片失败后翻页再失败 |

改前独立工作区的 `npm test` 为 210 项通过，主浏览器为 21/21 通过。旧无障碍脚本为 11/13：两项分别等待已经移除的来源和导入入口；本轮改为当前设置开关与键盘添加流程，并保留原有任务焦点、方向键、快捷键和恢复检查，未恢复被 ADR 移除的功能。

新增密度与材质浏览器回归已接入 `verify.yml`，宿主回归沿用 authenticated-data 工作流。以上是本地执行结果；远端 CI 结果以 PR 检查为准。

## 边界与后续

- 这轮没有修改生产卡片、数据库结构、授权范围、插件发布或站点部署。PR 应先审查后再发布。
- SDK 宿主以严格 iframe sandbox 模拟验证。未向用户真实对话发送消息；生产宿主支持情况须以实际能力协商为准。
- 无 blur 的回退在现代 Chromium 内强制对应 CSS 分支演练，不等于测试过每种旧浏览器。Safari 与 Apple 真机未验收。
- macOS 独立本地工作区、原生布局与云端同步未改动；iOS 仍不是已完成客户端。本轮 Web 结果不代替原生端验证。
- 根据 `DESIGN.md` 中本次在 Codex/仓库内处理的授权，本轮规则和组件包只同步仓库；claude.ai 线上画布尚未包含这轮改进。
- 导航 AI 格暂不可执行、记一笔需经“设置 › 添加”，是 ADR 0035 已确认的取舍。可在后续内置助手上线时重新评估入口价值；本轮保留新方向。

## 依据

- [Apple · Meet Liquid Glass, WWDC25](https://developer.apple.com/videos/play/wwdc2025/219/)
- [Apple · Get to know the new design system, WWDC25](https://developer.apple.com/videos/play/wwdc2025/356/)
- [Apple HIG · Motion](https://developer.apple.com/design/human-interface-guidelines/motion)
- [Apple HIG · Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- 仓库 `AGENTS.md`、`DESIGN.md`、`design-system/README.md`、ADR 0030/0033/0035；本地安装的 `@modelcontextprotocol/ext-apps@1.7.5` 公共 SDK 定义。
