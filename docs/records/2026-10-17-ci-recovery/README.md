# 产品审查后的 CI 回归修正

日期：2026-10-17。接续 [产品审查](../2026-10-17-product-review/README.md)，范围为 PR #30 的远端回归阻塞项。截图与产品改进保持原记录的范围；此处单独保留后续验证事实。

## 首次远端检查

首次提交 `2862d775f0176e4e1295590e73b8e1c5219936d7` 的 GitHub Actions 显示：

| 检查 | 结果与证据 |
| --- | --- |
| [Sill integration](https://github.com/dabaige53/sill/actions/runs/38989982657) | 通过，含 Node、本地插件构建、本地页面与无障碍回归 |
| [Verify Sill](https://github.com/dabaige53/sill/actions/runs/38989982733) | macOS 构建与自动测试通过；Web 密度 6/6 通过，材质回归在触摸取消场景失败，后续主浏览器步骤未执行 |
| [Sill authenticated data](https://github.com/dabaige53/sill/actions/runs/38989982676) | 服务端、Postgres、云端构建、云端页面和严格 MCP App 宿主回归通过；欢迎页登录等待失败，后续 OAuth 浏览器步骤未执行 |
| [Offline MCP consent policy](https://github.com/dabaige53/sill/actions/runs/38989982671) | 通过 |

## 定位与处理

### 触摸取消的事件交付

Chromium 151 的 CDP `touchCancel` 指令回执可以先于 DOM 事件交付返回，旧测试立即读取到上一帧的拖动状态。测试现在在发送取消前注册一次性的 `window` 冒泡监听，等当前抽屉的原生可信 `touchcancel` 经过产品监听器后，再执行原有精确状态断言与存储不变断言。

这只同步事件交付，没有轮询等待产品状态变好、放宽预期或添加固定延迟。取消后仍要求抽屉保持打开、拖动类消失、位移与遮罩变量清空。产品手势源码未改动。本地 Chromium 153 的完整动效回归为 12/12，手势单元回归为 7/7；Chromium 151 的验收由新提交的 CI 执行。

### 欢迎页的过期接口与导航夹具

原欢迎页脚本只模拟 `/api/v1/contents`，但当前与基线 `a6f3a01` 都通过 `/api/v1/workspace` 读取登录后的工作区。未模拟请求被静态服务错误地以 `200 text/html` 回应，因此两版本都在等待登录完成时超时。分别运行两版本复现了相同请求链与失败。

夹具改用当前工作区快照及有限的状态操作，并校验 owner、幂等键和操作类型；未模拟 API 不再得到 HTML 成功响应。导航检查跟随当前“设置 › 添加”，明确确认来源入口不存在，保留录入焦点、键盘、隐私与冷却检查。登出流程确认未保存草稿，再验证晚到的工作区响应不能复活已退出账号的内容；403/503 后增加成功重试检查。

### 手机欢迎页的真实横向溢出

修正夹具后，当前与基线均在原 390×844 视口检查失败。欢迎操作区在手机上仍横排：账号密码按钮约 152px、间距 12px、登录表单 320px，共 484px，撑大布局视口并裁切控件。这是产品布局问题，不能用更宽的测试预期处理。

修复仅在既有 `max-width: 600px` 规则中，将包含登录表单的 `.welcome-actions` 改为纵向排列，增加三行 CSS，保持原页面和表单结构。修后 390px 页面的 `scrollWidth` 为 390，输入框范围为 x=35 至 355。320px 也保持精确视口，密码登录入口、表单、邮箱输入和发送按钮均完整落在屏幕内。

| 场景 | 证据 |
| --- | --- |
| 修前，配置 390×844，内容撑大布局视口并裁切表单 | [before-phone-welcome.png](before-phone-welcome.png) |
| 修后，390×844 | [after-phone-welcome.png](after-phone-welcome.png) |
| 修后，320×844 | [after-phone-welcome-320.png](after-phone-welcome-320.png) |

三张截图均为本地合成数据；修前诊断和修后正式流程的自动隐藏导航时点不同，对比结论仅针对登录操作区与视口边界。

## 定向验证

| 检查 | 结果 |
| --- | --- |
| `npm run test:motion-material` | 12/12 通过，包括等待真实触摸取消事件后的原状态与存储断言 |
| `node --test tests/web/gestures.test.ts` | 7/7 通过 |
| `npm run test:cloud-welcome` | 桌面 1440×1000 与手机 390×844 两套完整流程通过；包含额外的 320px 登录区边界检查 |
| `npm run test:oauth-browser` | 桌面与 iPhone 两套同意、拒绝、撤销、焦点与会话保留流程通过，使用合成身份提供方 |
| `npm run build:cloud`、`npm run typecheck`、`npm run files:check` | 通过 |
| 修改文件的 Biome 检查、`git diff --check` | 通过；没有 lint 错误，仍有原有警告 |

晚回包检查先确认退出后工具条仍显示加载中，再释放被暂停的响应，等待 `loadCloud()` 的 `finally` 清除加载状态，随后断言卡片、Store 内容与已登录状态均为空。源码核对确认退出与信息流重绘不会提前清除该状态，因此此等待覆盖了响应处理，未以固定延迟代替完成信号。

本地指定 Chromium 和字体路径；欢迎页录屏复用环境内已有的 ffmpeg，没有修改仓库依赖。这轮唯一产品源码改动是欢迎页的三行窄屏 CSS，其余为回归脚本及本记录。新提交的远端检查结果在 PR #30 的检查和描述中更新，不回写已经完成的前一份审查记录。

## 验证边界

本地浏览器为 Chromium 153；首次 CI 使用 Playwright 自带的 Chromium 151.0.7922.34。不能把本地结果称作同版本复现，更新后的 151 结果以 PR 的 CI 检查为准。macOS CI 构建和自动测试通过，仍不代替 Apple 真机的视觉、触摸与性能验收。
