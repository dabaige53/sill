# 文档分层与源码复核

2026-10-29。按用户确认的四层结构整理文档；用户随后授权自主完成归类、复核代码并清理重复与历史叙述。分层决定见 [ADR 0088](../../adr/0088-documentation-layers.md)。

## 处理结果

- 前三层保留 33 份文件：`agent/` 项目准则 11、`specs/` 产品与设计规范 5、`implementation/` 实现说明 17。第二层使用通用的 specs 名称，原 reference 目录整体迁移；每项规则在所属正文维护。
- development.md 改为部署规范，与代码规范分开。产品正文归 PRODUCT.md；根目录 DESIGN.md、pr.md 链接壳移除。
- 路线图和 Webhook 方案进入 plans；早期 ADR 集合并入 adr；旧检查、交接、发布与设计探索进入对应 records。
- 12 份已废止功能说明不再作为文档副本保留，Git 保存历史。独有决策、旧测试报告和事件附件保留。
- docs 总目录只列当前正文与按需入口；ADR、事件各自维护索引。迁移涉及的导航、脚本和生成定义同步更新。

## 源码复核

修正文档中的播客播放、照片背景、手机资讯目录、手动记录入口、备份工具发现和邮件登录条件。Mac 顶栏、菜单、AI 栏与刷新已接入的能力移除旧缺失结论；会议码、长标签、PR 统计及文件卡面差异保留。

源码检查没有验证当前线上版本、宿主连接或真实窗口效果。既有业务代码修改属于其他任务，本次未改变产品行为。

## 原始材料

以下仅承接混合文档中的独有历史或准备内容，不是规范全文备份：

- [迁移前第四层盘点](fourth-layer-inventory.md)
- [既有目录迁移记录](migration-history.md)
- [插件连接与验收历史](plugin-history.md)
- [跨端实施与检查历史](ui-history.md)
- [卡片检查与补修历史](card-history.md)
- [外部执行方案与技术候选](agent-plan-context.md)

## 调试问题

[设计预览检查失败](diagnosis-design-preview.md)：记录两份组件预览过期的现象、已知依据和后续定位入口。

## 验证

- `npm run files:check`、`git diff --check` 通过。
- `node design-system/scripts/export-data.ts --check`、`node scripts/export-design.ts --check` 通过；生成定义仅同步文档路径。
- 迁移与精简产生的失效章节引用已修正；现行文档链接可解析。
- `node design-system/scripts/check.ts` 仍报告 FeedCard、CheckItem 组件预览过期，未将该项写为通过。本次未重建产品预览。
- 未执行浏览器、e2e、Mac 窗口验收或部署。
