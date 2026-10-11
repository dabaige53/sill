# F06 验证记录

日期：2026-10-11。基于 F05 `a79c861b4599b2e7acc8747c0c71fe6c32afa970`，范围仅为宿主协助来源导入、持久归因与可追溯展示。

## 后端与协议

- `npm run check`：语法、配置和插件校验通过。
- `npm test`：22项核心/构建检查，93项后端/协议测试通过。
- 新增15项服务测试、9项真实MCP/HTTP协议测试：三提供方、完整范围身份、精确重试、CAS冲突、批次回滚、元数据审计、源版本/读取时间、原文与模型摘要分离、部分内容补全、来源链接校验、UUID规范身份、冻结引用、Calendar计时/全天日期及原有连接器兼容。
- HTTP新增POST /api/ingest复用相同服务；认证、同源、未知字段和409冲突均覆盖。MCP仍为33个工具，保留原名称。
- 保留来源仅为host-notion/host-google-calendar/host-linear，旧host-source等普通来源保持原合同，不获得宿主归因。回归发现的过宽前缀限制已修正。

## 浏览器与设计

真实 Chromium运行合成宿主工具结果→MCP/HTTP→SQLite→内嵌App。核对三类来源卡片、原文/摘要标签、范围/上游ID/时间、直接来源链接、重复与冲突、重新挂载、选中引用、UTF-8大小限制及390px展示。

宿主支持openLinks时，用户明确点击通过标准App.openLink发送准确链接；不支持时显示手动复制提示，无自动浏览器回退。所有链接/来源HTML均作为数据处理。

宿主iframe调整视口会在下一次响应式绘制应用媒体样式。测试保留即时文档无横向溢出，等待iframe视口与动画稳定后，严格检查预览和归因区域左右边界及宽度；未使用容差掩盖溢出。

新宿主来源浏览器10组检查通过（含全天日程新增断言），pageErrors/networkAttempts/externalCalls均为空。既有AI、conversation、live、content、settings、host模拟器、离线产品及Storybook八个套件也全部通过。共享事件模板只在带归因的卡片上显示来源头；五个HTML入口均由源码重新生成。

- 离线产品：21组浏览器场景通过。
- Storybook：构建通过，94个Story和11组浏览器场景通过。
- 本轮新证据：tests/artifacts/provenance-browser.json；provenance-feed.png、provenance-notion-detail.png、provenance-original-reader.png、provenance-summary-reader.png、provenance-detail-mobile.png。

## 复核与边界

独立复核发现并修复：Notion登录/重定向页误当记录链接、仅摘要到原文的同版本补全受阻、选中引用静默截断范围/链接、Calendar卡片未显示来源、缺失时段导致无效日期、空原文误标为未导入，以及归因标签覆盖全天日程日期的问题。全天日期与结束日不含语义已在feed/detail浏览器断言中验证。测试覆盖相应路径。

所有提供方结果与账户范围均为合成测试数据。没有实际用户应用读取、OAuth配置、真实令牌、外部写入、付费模型调用或实际宿主安装；模拟器通过不等于真实账号授权验收。
