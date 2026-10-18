# AppController 职责拆分（C2）

日期：2026-10-18。

C2 已实施，提交 [PR #51](https://github.com/dabaige53/sill/pull/51)。`views/app.ts` 从 3314 行减为 2716 行。设置、详情和动作处理移到各自模块；原有 103 个公开方法、参数和默认值保持不变。界面、卡片写入行为与外部授权边界不变，Mac 未改。

## 模块与边界

```text
views/app.ts                    状态、点击与选择、原有公开方法入口
views/settings-controller.ts    偏好保存与设置重绘
views/preview-controller.ts     详情打开、阅读绑定入口、尺寸观察与关闭圆钮定位
views/actions/index.ts         只按原动作名称分发
views/actions/navigation.ts    导航、搜索筛选与叠放
views/actions/cards.ts         卡片状态、备注、标签与归档
views/actions/selection.ts     多选和批量操作
views/actions/settings.ts      设置动作与本地数据操作
views/actions/external.ts      外链、助手交接与日历下载
views/actions/media-reminders.ts 提醒、照片、媒体与播客
views/actions/feedback.ts      刷新、同步恢复、提示与撤销
views/actions/types.ts         复用公开入口的参数约定
```

交接文档所说的动作 `switch` 实际位于 `action()`。`click()` 原本处理点击与选择，再调用 `action()`；这个关系保持不变。

78 个动作名称对应原来的 72 段处理逻辑。别名继续共用处理函数。查表前检查字符串类型和自有属性，保持未知名称、`constructor`、`toString`、包装字符串等输入不执行任何操作。

## 移动与整理分开

| 提交 | 内容 | 提交后的 Node 检查 | 提交后的浏览器检查 |
| --- | --- | --- | --- |
| `ebf49ff` | 先补 9 项保护测试，产品代码未改 | 36 / 178 / 92 | 基础 23/23 |
| `9b0761f` | 原样移动设置保存与重绘 | 36 / 178 / 92 | 无障碍 13/13 |
| `316e09a` | 原样移动详情打开与定位 | 36 / 178 / 92 | 抽屉 11/11 |
| `01c5518` | 原样移动完整动作 switch | 36 / 178 / 92 | 基础 23/23、云端宿主 1/1 |
| `8c24604` | 独立整理为 7 组查表处理 | 36 / 178 / 92 | 基础 23/23、云端宿主 1/1、云端工作台 1/1 |

三组 Node 数字依次为共享约定、Web、服务端；失败和跳过均为 0。相关浏览器专项去重后为 49 项。云端浏览器检查前均重建云端页面。最终证据文档提交后的复跑与 CI 结果以 PR 为准。

## 不变性证据

先保存基础提交的源码，在本机用 TypeScript 语法树逐项比较。结果见 [source-comparison.json](source-comparison.json)：

- 103 个公开方法名称、顺序、参数和默认值不变；构造函数、访问器和字段不变。
- 97 个未移动方法的语句不变。
- 设置与详情的 5 个方法体不变；动作原样移动时，第 6 个方法体也保持不变。
- 查表整理后的 72 段处理逻辑逐段匹配原分支。只有退出 switch 的 `break` 改为退出处理函数的 `return`，函数末尾使用隐式返回；字符串值保持一致。
- 预览模板、文案、设计变量与全部 6 个样式文件的 SHA-256 不变。

语法树核对证明代码结构与字面值对应，不代替运行时检查。新增测试验证设置重绘后的焦点与滚动、动作开关、刷新和提醒路由、外链返回时的账号边界，以及尺寸变化后的关闭按钮定位。现有浏览器回归验证真实页面上的行为。本次没有界面改动，因此不新增视觉前后截图。

## 检查与限制

`npm run files:check`、`npm run lint:web` 通过。Web 单独执行 `npx biome lint apps/web` 为 0 错误、906 警告、30 条提示；不表示零警告。文案仍为 826 个键，其中哈希键 601 个、panels 哈希键 110 个；图标仍为 69 个。

各阶段命令摘要见 [verification.txt](verification.txt)。真机未检查，生产未部署。C6 记录的本机会话过期流程偶发超时仍待定位；本次 C2 的查表提交本机相关检查均通过，未修改、跳过或放宽已有断言。

#45–#47 尚未合并，PR base 仍为 `claude/web-pwa-ui-handoff`，保留 C1、U1、C6 依赖。U1 的线上组件 CSS 与 37 号画板截图同步仍待完成，见 [U1 记录](../2026-10-18-pwa-touch/README.md)。C2 没有设计改动，不新增线上设计差异。
