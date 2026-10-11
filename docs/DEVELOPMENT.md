# 开发与续接

## 本轮范围（V0.2）

从 `7029e18` 的独立构建页面恢复 15 个共享 JavaScript 源文件、CSS 和页面壳，新增纯函数信息流策略模块。三个 HTML 入口由同一套源文件生成，继续支持离线打开；没有重新选择 UI 框架或改变产品视觉方向。

新增能力：

- 提醒延后十分钟、忽略、完成、恢复和撤销；提醒状态与已读、收藏、标签、备注分离。
- 已延后、已忽略、提醒已完成的按需筛选；三种排序及解释文案仅出现在筛选浮层。
- 到期提醒先进入玻璃入口旁的待查看计数。用户点击后才更新信息流；同一事件复用原卡片，不生成重复卡片。
- 默认重要优先：到期提醒、会前 15 分钟日程、截止前 30 分钟待办优先，其余稳定保留原顺序。未读优先和时间排序可替换它。
- 本地存储 v1 → v2 兼容迁移；保留原有阅读、任务、标签与备注，保存演示时钟、刷新新增卡片与排序偏好。
- 基于发生时间去重，同一卡片提醒有 60 秒冷却；已结束日程和已完成待办不会进入到期队列。

上述时间阈值是这轮本地原型的可调整实现基线，不是已确定的生产推送策略。没有请求系统通知权限；页面关闭不运行后台提醒，再打开时检查尚未确认的到期事项。

## 架构

- `src/styles/main.css`：现有设计变量、布局、玻璃与响应式样式。
- `src/atoms/`：图标、按钮、进度环及转义。
- `src/data/`：演示卡片、内嵌图片、研究来源、本地状态。
- `src/cards/templates.js`：业务卡片模板。
- `src/interactions/`：玻璃面板、布局、拖拽、动效。
- `src/services/feed-policy.js`：无 DOM 的排序、到期条件、去重和状态可见性策略。
- `src/services/ai.js`：明确标注的本地 AI 演示。
- `src/views/`：信息流控制器、组件实验室和研究视图。
- `src/shell.html` / `scripts/modules.json`：入口壳与共享模块依赖顺序。

源文件有独立职责，构建时按 manifest 合并到一个 IIFE；它们暂未改写为 ES module import/export。这是保留无需服务器打开 HTML 的渐进工程化，不是完整组件框架迁移。

## 本地运行

直接打开 `index.html`。推荐在测试持久化时使用固定本地 HTTP 来源：

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

浏览器访问 `http://127.0.0.1:8000/index.html`。不同浏览器对 `file://` 的 localStorage 支持存在差异，演示会在不可用时退回本次会话状态。

## 构建与检查

```sh
python3 scripts/build.py
python3 tests/verify.py
```

核心检查仅需要 Python 3 和 Node.js 22+，不需要 npm 安装。`--check` 会拒绝源文件与生成页面不一致；请修改 `src/`，再重新构建三个入口。

浏览器回归需要 Playwright 和 Chromium：

```sh
npm install --ignore-scripts --no-audit --no-fund
npx playwright install chromium
npm run test:browser
```

可用 `CHROMIUM_PATH` 指定已安装的 Chromium。浏览器测试启动随机端口的 localhost 服务，使用隔离上下文的真实 localStorage，通过虚拟时钟验证到期行为，并将结果与截图写入 `tests/artifacts/`。该目录不提交源代码仓库。

GitHub Actions 在 PR 中执行核心和浏览器回归。未运行或受环境阻碍的浏览器检查不能算通过。

## 下一阶段

1. 根据实际浏览器结果验收移动端、读屏与键盘完整路径；真实 Safari / iPhone 仍需设备检查。
2. 明确第一个真实数据源、权限与账号隔离、后端部署环境和 AI 提供方，再进入 OAuth / 同步 / 模型 API 开发。
3. 生产排序需要可解释的权重和时间窗口；当前实现只使用本地演示卡片。

禁止因工程化而恢复侧栏、常驻顶栏、筛选标签栏或默认按钮文案。产品原始需求仍以 `PRODUCT-REQUIREMENTS.md` 和 `INTERACTION-SPEC.md` 为准。
