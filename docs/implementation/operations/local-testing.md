# Web 与 Mac 本地测试

更新：2026-10-28。用于开发检查和用户试用。云端生产发布与真实账号验收单独按[发布流程](release-runbook.md)执行。

## 数据隔离

- 每轮在 `/private/tmp` 新建测试目录，Web 与 Mac 各用一个子目录，各自保存 `cards.json`。两端使用相同演示样例，但不共享文件，不同步修改。
- 不读取项目 `.sill/local/`、Mac 既有用户目录或云端账号数据；不登录生产账号，不调用生产写入接口，不部署或清空生产数据。
- Mac 必须带 `--data-directory` 启动；无参数启动默认进入云端模式。出现登录页说明入口不对，先停止该轮测试并核对启动参数。
- Web 必须连接本轮 localhost 服务。浏览器存储按地址隔离，每轮使用新端口。
- 外部图片、链接和官方视频播放器可能联网；这与卡片工作区的数据同步不同。基础验收不依赖这些外部资源。

## 1. 构建与自动检查

在仓库根目录运行。先记录当前提交和未提交修改；已有本轮相同源码的通过结果可以复用。

```sh
npm test
npm run build:macos
npm run test:macos
npm run lint:apple
```

`npm test` 包含 Web 构建与核心、约定、服务端测试；Swift 测试使用临时数据和模拟 HTTP。macOS 系统工具受沙盒限制时申请沙盒外执行，不因此修改产品代码。

## 2. 创建两份独立样例

```sh
TEST_ROOT=$(mktemp -d /private/tmp/sill-local-test.XXXXXX)
node scripts/macos-demo-data.ts "$TEST_ROOT/web"
node scripts/macos-demo-data.ts "$TEST_ROOT/mac"
```

记录 `TEST_ROOT` 实际路径，后续命令在同一终端运行；其他终端使用记录中的绝对路径。样例生成器拒绝覆盖已有文件。重测保留该目录；重置时新建目录，不覆盖用户测试结果。

## 3. 启动 Web

```sh
SILL_TEST_WEB_FILE="$TEST_ROOT/web/cards.json" node --input-type=module -e '
import { startLocal } from "./server/local/index.ts";
const server = await startLocal({ port: 0, file: process.env.SILL_TEST_WEB_FILE });
console.log(`http://127.0.0.1:${server.address().port}/#feed`);
'
```

保持进程运行，将打印的地址交给用户并在应用内浏览器打开。检查 `/health` 返回 `mode: local`，`/api/local/state` 返回本轮样例，页面显示卡片且没有登录入口或运行错误。不要用默认 `npm start` 代替此命令，默认入口会使用项目已有数据。

## 4. 启动 Mac

另开终端，将下面的数据路径换成本轮记录的绝对路径：

```sh
open -n -a "$PWD/dist/macos/Sill.app" --args --data-directory /private/tmp/sill-local-test.XXXXXX/mac
```

助手执行 `open` 时申请沙盒外运行。`-n` 新开实例，避免已有云端实例吞掉参数。确认新窗口直接显示演示卡片，设置的数据位置与本轮 Mac 目录一致。保留用户已有实例，不自动退出或替换已安装应用。

## 5. 两端分别验收

| 场景 | 操作 | 通过标准 |
| --- | --- | --- |
| 首次打开 | 打开信息流、卡片详情、返回 | 有样例卡片；不要求登录；无空白或异常 |
| 阅读与状态 | 阅读、收藏、稍后读、勾选任务 | 状态正确更新，其他卡片不变 |
| 轻量编辑 | 改标签和备注 | 保存成功，正文不被覆盖 |
| 搜索与归档 | 搜索、筛选、归档、恢复 | 结果正确，恢复后内容仍在 |
| 批量操作 | 选择多张卡片，收藏或改标签 | 只修改选中卡片 |
| 外观 | 切换浅深色，缩放窗口；Web 检查手机宽度 | 内容可读，主要按钮可用，无横向溢出 |
| 持久保存 | 关闭并重开本轮窗口/页面 | 本端刚才的修改仍在 |
| 数据隔离 | 只在 Web 修改一张卡，再查看 Mac；反向再做一次 | 另一端不发生相同修改，两份文件分别更新 |

未知写入、并发冲突和失败恢复先由自动测试覆盖；需要真实交互复现时只用本轮测试数据。不要为演示清空用户数据。浏览器和 Mac 窗口操作按[测试授权](../../agent/test.md)执行。

## 6. 交付与停止

记录源码版本、未提交修改、两端数据路径、Web 地址、Mac 包路径、实际执行的检查和结果。分别标明“构建通过”“自动测试通过”“窗口验收通过”；未执行项写明未验证。

用户试用期间保持服务与本地 Mac 实例可用。用户要求结束时只停止本轮进程；保留测试数据供复查。云端部署、数据库迁移和生产账号登录不属于本地测试完成条件。
