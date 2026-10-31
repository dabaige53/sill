# 正文图片与原文入口

## 问题与状态

2026-10-31，Issue #83。源码修复及相关合成回归通过，两端编译通过；完整工作流仍因基线已有失败而未通过，设备体验未确认，未合并或发布。

## 环境与触发

以 `b2adee7f` 创建独立 worktree，原目录已有及后续修改不参与本次提交。文章正文包含 `段落 A → Markdown 图片 → 段落 B` 时，Web 和 Mac 原来只显示说明文字。原文链接仅写在正文时，底部入口无法使用。

## 定位依据

- Web `atoms/markdown.ts` 的 image 渲染规则主动返回替代文字；Swift `MarkdownBody` 也主动丢弃 Image 目的地址。这是 ADR 0063 的原决定，不是 Markdown 图片 URL 被截断。
- 原文按钮有实现，但依赖结构化 `url`。独立网页用 `window.open` 且启用 noopener，空返回值不能证明打开失败；旧按钮流程没有可供浏览器直接使用的原生链接。
- 未读取真实 Readwise 卡片，不能认定具体卡片均已补齐原文 URL；宿主是否允许打开链接仍由宿主能力和返回结果决定。

## 处理情况

- 两端保留正文 HTTPS 图片位置、参数、说明文字和重复图片；不修改封面字段或正文数据。
- Web 图片懒加载、加载与失败提示、键盘和点击大图，原生模态关闭后恢复图片焦点并保留正文节点与滚动。
- Mac 解析保留图片地址，段落中的图片拆为原位内容块；正文懒布局配合 AsyncImage，使用原生 sheet 查看大图。
- 独立网页原文入口改为原生链接；插件仍调用现有操作和宿主错误提示。缺失或非法链接禁用，Mac 同样过滤不支持的协议。
- 同步阅读规范、ADR、功能矩阵和导入技能说明。未执行真实导入、数据补录、迁移或部署。

## 验证与后续

- 新增合成回归覆盖图文顺序、重复图片、URL 参数、安全协议、加载失败、查看与关闭大图时正文节点和滚动保持，以及独立网页与宿主链接路径。
- 本地文案与设计产物已生成，修改文件格式检查无错误，文件管理与差异检查通过。没有本地运行程序测试或发布构建。
- 未进行本地浏览器自动化、Safari/PWA 真机、Mac 窗口或真实宿主验收。真实卡片 URL 检查和剩余 Readwise 导入另行确认范围，Issue 暂不关闭。

### GitHub Actions：源码 `bae2c860`

- [集成检查 41153927863](https://github.com/dabaige53/sill/actions/runs/41153927863)：Web 构建、类型检查与 52 项契约检查通过。Web 核心 493 项中 488 项通过；新增图片顺序、协议、加载失败、大图节点及滚动保持、原文入口回归通过。
- 剩余 5 项失败分别是媒体预览写状态、完成后排序、刷新布局测量，以及两项桌面搜索排序。在同一基线 `b2adee7f` 的[main 检查 41062608683](https://github.com/dabaige53/sill/actions/runs/41062608683)中，这 5 项已按相同原因失败（487 项中 482 项通过）。本轮不修改这些无关实现或放宽断言。
- [Mac 检查 41153969763](https://github.com/dabaige53/sill/actions/runs/41153969763)：Apple 格式检查、全部源码编译及 MarkdownBodyTests 通过。159 项中 158 项通过，唯一失败为 `FeedTests.completionKeepsOrderUntilExplicitRefresh`。同基线的[main 检查 41062608669](https://github.com/dabaige53/sill/actions/runs/41062608669)同样失败（158 项中 157 项通过，实际卡片顺序一致）。
- [云端检查 41153927892](https://github.com/dabaige53/sill/actions/runs/41153927892)：两项浏览器创建检查失败于 `cloud-browser.ts:180` 与 `cloud-app-browser.ts:178`，同基线的[main 检查 41062608947](https://github.com/dabaige53/sill/actions/runs/41062608947)同样失败；不是本次图片或链接修复引入。后续浏览器步骤未执行，不能标成通过。
- [授权检查 41153927861](https://github.com/dabaige53/sill/actions/runs/41153927861)通过。没有执行部署或真实账号写入。
