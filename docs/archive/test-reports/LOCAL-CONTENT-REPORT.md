# F02 本地内容验证记录

不再适用：旧阶段的说明或测试报告，仅供历史查阅，不代表当前默认产品能力。

验证日期：2026-10-11。Node.js 24，隔离 SQLite 数据库，真实 MCP stdio / HTTP，云端 Chromium。

## 结果

- `npm run check`：通过 JavaScript、内联脚本、插件清单与连接器配置检查。
- `npm test`：22 项核心检查及 26 项后端/协议/页面测试通过，其中新增 8 组本地内容测试。
- `npm run test:content-browser`：通过，无页面异常。
- `npm run test:settings-browser`：通过。
- `npm run test:live-browser`：通过；旧浏览器备注采用显式载入后保存的路径。

新增后端测试覆盖严格字段/类型校验、持久化、事务失败回滚、版本冲突及无操作更新、载荷绑定幂等创建、上游正文/来源保持不变、保留命名空间、HTTP 认证/同源保护、真实 MCP 与 HTTP 同一合同及原有工具兼容。

真实浏览器覆盖服务器备注优先且旧状态不隐式上传、显式载入旧备注、备注与笔记冲突、刷新保留草稿、MCP 修改同步到已打开网页、保存期间继续输入及关闭重开、创建已提交但响应丢失后修改草稿并刷新重试、无重复创建、空标题修正后保存，以及 390px 窄屏。

独立审查发现的延迟响应清除新草稿及输入校验后无法恢复问题已修复；审查者再次执行实际适配器测试，未发现剩余阻断问题。

## 可重现截图

运行浏览器测试后生成以下本地验收图（测试产物不纳入 Git）：

- `tests/artifacts/local-content-feed.png`：本地笔记与来源卡片共存。
- `tests/artifacts/source-safe-annotation.png`：来源标签只读，个人备注与标签独立。
- `tests/artifacts/local-note-editor.png`：桌面笔记编辑。
- `tests/artifacts/local-note-editor-mobile.png`：390px 窄屏编辑，无横向溢出。

本轮没有修改共享设计源码、样式或生成页面，未重复运行完整离线产品与 Storybook 套件；此前集成基线已通过对应检查，本轮 CI 保留它们。尚未部署或连接真实外部账户。
