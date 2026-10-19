# PWA 名称提示补入本地画板

日期：2026-10-18。工作包 U1，更新原 [PR #49](https://github.com/dabaige53/sill/pull/49)，不新增工作包 PR。原实施与前后截图见 [PWA 触控检查](../2026-10-18-pwa-touch/README.md)。本次未修改产品代码、组件包、图标或线上资产记录。Mac 未改。

## 补充内容

本地 [37 号画板](../../../design-system/boards/CardDetail.dc.html) 保留原有 11 张定稿图片，新增 6 张实际页面截图：320px 左端与右端长按、320/390px 键盘名称、320px 深色键盘名称、1440px 桌面键盘名称。截图使用隔离合成卡片，由既有 PWA 专项生成；真实 Tab 和触摸事件均由浏览器执行。

画板规则补明：键盘聚焦立即显示名称；两端提示向屏内展开；减少动态效果时只淡入淡出。这些规则已在 U1 手册中确定，本次没有新增设计选择。原有卡片和胶囊布局不变。

画板内容实际高度为 4331.77px，预览高度由 2980 调整为 4370，同时更新 `index.html` 和 `canvas.json`。宽度、画布位置及其他画板不变，与相邻画板没有重叠。

| 证据 | 内容 |
| --- | --- |
| [补充前](before.jpg) / [补充后](after.jpg) | 本地 37 号画板完整渲染 |
| [新增区域](name-tips.jpg) | 五张手机截图与一张桌面截图 |
| [名称边界](tooltip-metrics.json) | 左右端提示、键盘焦点及显示样式的实际测量 |
| [检查与图片哈希](verification.json) | 新增图片路径、SHA-256、尺寸和检查结果 |

## 检查与边界

从 U1 源码 `9989a5c` 合入基础分支的仓库模式约束，得到 `6362ac0`。该提交后的 `npm test` 通过：共享约定 36、Web 169、服务端 91，失败 0；PWA 专项 10/10 通过。使用本机预装 Chromium，没有下载浏览器。

通过 localhost 渲染画板，17 张图片全部载入；页面错误、损坏图片和外部请求均为 0。原始测量见 [补充前](before-render.json) / [补充后](after-render.json)。重新运行组件和图标生成脚本，69 个图标及组件包没有变化。证据文件均小于 2 MB，不含真实账号、浏览器存储或凭据。最新提交检查与 CI 以 PR 为准。

本次先补充仓库模式约束，再更新本地画板。没有访问或发布 claude.ai Artifact，没有使用 Mobbin 或其他 claude.ai 独有工具；`design-system/design-system.json` 未改。原记录中的线上手册操作是工具限制前的历史，不代表本次访问或同步线上。

线上未同步：`design-system/boards/CardDetail.dc.html`、`design-system/boards/index.html`、`design-system/boards/canvas.json`、`design-system/boards/card-detail/u1-*.png`。原 U1 的 `design-system/components/bundle.css` 也仍未同步，由用户另行处理。

真机未检查：iPhone 主屏幕冷启动、Safari 系统长按菜单、安全区、横竖屏和搜索键盘。品牌 PNG、192/512 和 maskable 资产仍留到 U2 确认。生产未部署，Mac、iOS 原生代码未改。
