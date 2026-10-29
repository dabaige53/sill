# 设计系统维护

更新：2026-10-29。本文说明设计材料的位置、生成和发布方法；设计工作的要求见[DESIGN.md](../specs/DESIGN.md)。

## 目录

| 路径 | 职责 |
| --- | --- |
| `design-system/handbook/` | 视觉与交互规则 |
| `design-system/tokens/`、`copy/zh-Hans/` | 设计变量与文案源文件；同名汇总 JSON 由脚本生成 |
| `design-system/components/` | 组件说明和从产品代码生成的预览、渲染包 |
| `design-system/assets/Icons/` | 共用图标 SVG |
| `design-system/boards/` | 现行画板、canvas.json 和目录页 |
| `design-system/history/` | 设计探索与被替代画板，仅供历史查阅 |
| `design-system/marks.json` | 设计编号对应的规则、变量、ADR、画板与实现 |
| `design-system/published.json` | 上次设计发布的文件指纹 |

组件脚本全局名为 `Sill`（`window.Sill`）。组件、图标包与预览从产品实现生成，不手改产物。样式顺序以 `apps/web/styles/styles.json` 为准，源码位置通过设计编号查询，不在文档复制整份文件清单。

## 画板

运行 `npm run boards`，通过 http://127.0.0.1:4310/ 查看目录。画板脚本需通过 HTTP 读取资源，不能直接双击 HTML。目录页展示现行画板；历史画板按文件名访问，归属见[历史画板索引](../../design-system/history/README.md)。

只有现行画板作为设计依据。关键实现使用 `@design <编号>`，新增编号登记到 marks.json。画板与产品不一致时，按已确认设计修正对应一方；历史截图不当作当前验收。

## 命令

在仓库根目录运行 `npm run design -- <命令>`：

| 命令 | 用途 |
| --- | --- |
| `status` | 比较仓库与上次设计发布 |
| `trace <编号或变量名>` | 查询规则、变量、ADR、画板和实现 |
| `build` | 生成变量、组件包、图标、预览与画板目录 |
| `check` | 检查设计印记、变量、画板、生成预览和文档规范 |
| `retire <画板>` | 将被替代画板移入历史并整理画布 |
| `stage [说明]` | 生成、检查并准备设计发布文件 |
| `record <DS版本> <画布版本> [ADR]` | 发布成功后记录版本与文件指纹 |

设计源文件变化时运行对应生成与检查。产品构建、组件预览与浏览器体验分别验证，范围按[测试规范](../agent/test.md)确定。

## 发布

仓库是设计材料来源；[Design System](https://claude.ai/artifact/8zZhgYs53aRF6Rbk5GtuBb) 与[设计画布](https://claude.ai/artifact/487W43yaF9D3Kno8c3ej6b)是发布副本。若线上有直接修改，先通过具备能力的 Claude Code 环境执行“同步设计”拉回仓库。

1. 改变设计变量或多处手册、画板时，记录决定及影响范围；设计版本使用发布日期。
2. 更新受影响源文件与现行画板；替代画板用 retire 处理，并在历史索引记录去向。
3. 具备线上发布能力的环境执行 stage、“发布设计”，成功后执行 record。记录追加到[设计变更日志](../records/design-changelog.md)。
4. 当前环境无法发布时，完成本地生成与检查，在交付或 PR 中写明待发布范围。

交付前检查源文件与生成产物是否一致。已发布内容须有版本记录，未发布或未验收的内容须列明范围。
